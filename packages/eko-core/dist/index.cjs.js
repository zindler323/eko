'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var buffer = require('buffer');

const config = {
    name: "Eko",
    platform: "mac",
    maxReactNum: 500,
    maxTokens: 16000,
    compressThreshold: 80,
    largeTextLength: 5000,
    fileTextMaxLength: 20000,
    maxDialogueImgFileNum: 1,
};

var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 4] = "FATAL";
    LogLevel[LogLevel["OFF"] = 5] = "OFF";
})(LogLevel || (LogLevel = {}));
class ConsoleTransport {
    log(level, message) {
        const methods = {
            [LogLevel.DEBUG]: console.debug,
            [LogLevel.INFO]: console.info,
            [LogLevel.WARN]: console.warn,
            [LogLevel.ERROR]: console.error,
            [LogLevel.FATAL]: console.error,
            [LogLevel.OFF]: () => { }
        };
        const method = methods[level] || console.log;
        method(message);
    }
}
class Logger {
    constructor(options = {}) {
        this.level = options.level ?? LogLevel.INFO;
        this.prefix = options.prefix ?? '';
        this.dateFormat = options.dateFormat ?? true;
        this.transports = options.transport ?? [new ConsoleTransport()];
    }
    setLevel(level) {
        this.level = level;
        return this;
    }
    setPrefix(prefix) {
        this.prefix = prefix;
        return this;
    }
    addTransport(transport) {
        this.transports.push(transport);
        return this;
    }
    formatMessage(level, message) {
        const levelNames = {
            [LogLevel.DEBUG]: 'DEBUG',
            [LogLevel.INFO]: 'INFO',
            [LogLevel.WARN]: 'WARN',
            [LogLevel.ERROR]: 'ERROR',
            [LogLevel.FATAL]: 'FATAL',
            [LogLevel.OFF]: 'OFF'
        };
        let formattedMessage = '';
        if (this.dateFormat) {
            formattedMessage += `[${new Date().toLocaleString()}] `;
        }
        formattedMessage += `[${levelNames[level] || 'UNKNOWN'}] `;
        if (this.prefix) {
            formattedMessage += `[${this.prefix}] `;
        }
        formattedMessage += message;
        return formattedMessage;
    }
    log(level, message, ...args) {
        if (level < this.level) {
            return;
        }
        let finalMessage;
        if (message instanceof Error) {
            finalMessage = `${message.message}\n${message.stack}`;
        }
        else {
            finalMessage = message;
        }
        if (args.length > 0) {
            finalMessage += ' ' + args.map(arg => {
                if (arg == null || arg == undefined) {
                    return arg + '';
                }
                else if (arg instanceof Error || (arg.stack && arg.message)) {
                    return `${arg.message}\n${arg.stack}`;
                }
                else if (typeof arg === 'object') {
                    return JSON.stringify(arg);
                }
                return String(arg);
            }).join(' ');
        }
        const formattedMessage = this.formatMessage(level, finalMessage);
        this.transports.forEach(transport => {
            transport.log(level, formattedMessage);
        });
    }
    isEnableDebug() {
        return this.level <= LogLevel.DEBUG;
    }
    debug(message, ...args) {
        this.log(LogLevel.DEBUG, message, ...args);
    }
    isEnableInfo() {
        return this.level <= LogLevel.INFO;
    }
    info(message, ...args) {
        this.log(LogLevel.INFO, message, ...args);
    }
    warn(message, ...args) {
        this.log(LogLevel.WARN, message, ...args);
    }
    error(message, ...args) {
        this.log(LogLevel.ERROR, message, ...args);
    }
    fatal(message, ...args) {
        this.log(LogLevel.FATAL, message, ...args);
    }
    createChild(name, options = {}) {
        const childPrefix = this.prefix ? `${this.prefix}.${name}` : name;
        return new Logger({
            level: options.level || this.level,
            prefix: childPrefix,
            dateFormat: options.dateFormat !== undefined ? options.dateFormat : this.dateFormat,
            transport: options.transport || this.transports
        });
    }
}
const Log = new Logger();

function sleep(time) {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
}
function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
function call_timeout(fun, timeout, error_callback) {
    return new Promise(async (resolve, reject) => {
        let timer = setTimeout(() => {
            reject(new Error("Timeout"));
            error_callback && error_callback("Timeout");
        }, timeout);
        try {
            const result = await fun();
            clearTimeout(timer);
            resolve(result);
        }
        catch (e) {
            clearTimeout(timer);
            reject(e);
            error_callback && error_callback(e + "");
        }
    });
}
function convertToolSchema(tool) {
    if ("function" in tool) {
        return {
            type: "function",
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
        };
    }
    else if ("input_schema" in tool) {
        return {
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
        };
    }
    else if ("inputSchema" in tool) {
        return {
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        };
    }
    else {
        return {
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        };
    }
}
function toImage(imageData) {
    let image = null;
    if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
        image = new URL(imageData);
    }
    else {
        if (imageData.startsWith("data:image/")) {
            imageData = imageData.substring(imageData.indexOf(",") + 1);
        }
        // @ts-ignore
        if (typeof Buffer != "undefined") {
            // @ts-ignore
            const buffer = Buffer.from(imageData, "base64");
            image = new Uint8Array(buffer);
        }
        else {
            const binaryString = atob(imageData);
            image = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                image[i] = binaryString.charCodeAt(i);
            }
        }
    }
    return image;
}
function mergeTools(tools1, tools2) {
    let tools = [];
    let toolMap2 = tools2.reduce((map, tool) => {
        map[tool.name] = tool;
        return map;
    }, {});
    let names = [];
    for (let i = 0; i < tools1.length; i++) {
        let tool1 = tools1[i];
        let tool2 = toolMap2[tool1.name];
        if (tool2) {
            tools.push(tool2);
            delete toolMap2[tool1.name];
        }
        else {
            tools.push(tool1);
        }
    }
    for (let i = 0; i < tools2.length; i++) {
        let tool2 = tools2[i];
        if (toolMap2[tool2.name] && names.indexOf(tool2.name) === -1) {
            tools.push(tool2);
            names.push(tool2.name);
        }
    }
    return tools;
}
function mergeAgents(agents1, agents2) {
    let tools = [];
    let toolMap2 = agents2.reduce((map, tool) => {
        map[tool.Name] = tool;
        return map;
    }, {});
    for (let i = 0; i < agents1.length; i++) {
        let tool1 = agents1[i];
        let tool2 = toolMap2[tool1.Name];
        if (tool2) {
            tools.push(tool2);
            delete toolMap2[tool1.Name];
        }
        else {
            tools.push(tool1);
        }
    }
    for (let i = 0; i < agents2.length; i++) {
        let tool2 = agents2[i];
        if (toolMap2[tool2.Name]) {
            tools.push(tool2);
        }
    }
    return tools;
}
function sub(str, maxLength, appendPoint = true) {
    if (!str) {
        return "";
    }
    if (str.length > maxLength) {
        return str.substring(0, maxLength) + (appendPoint ? "..." : "");
    }
    return str;
}
function fixXmlTag(code) {
    if (code.indexOf('&') > -1) {
        code = code.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;');
    }
    function fixDoubleChar(code) {
        const stack = [];
        for (let i = 0; i < code.length; i++) {
            let s = code[i];
            if (s === "<") {
                stack.push(">");
            }
            else if (s === ">") {
                stack.pop();
            }
            else if (s === '"') {
                if (stack[stack.length - 1] === '"') {
                    stack.pop();
                }
                else {
                    stack.push('"');
                }
            }
        }
        const missingParts = [];
        while (stack.length > 0) {
            missingParts.push(stack.pop());
        }
        return code + missingParts.join("");
    }
    let eIdx = code.lastIndexOf(" ");
    let endStr = eIdx > -1 ? code.substring(eIdx + 1) : "";
    if (code.endsWith("=")) {
        code += '""';
    }
    else if (endStr == "name" ||
        endStr == "input" ||
        endStr == "output" ||
        endStr == "items" ||
        endStr == "event" ||
        endStr == "loop") {
        let idx1 = code.lastIndexOf(">");
        let idx2 = code.lastIndexOf("<");
        if (idx1 < idx2 && code.lastIndexOf(" ") > idx2) {
            code += '=""';
        }
    }
    code = fixDoubleChar(code);
    const stack = [];
    function isSelfClosing(tag) {
        return tag.endsWith("/>");
    }
    for (let i = 0; i < code.length; i++) {
        let s = code[i];
        if (s === "<") {
            const isEndTag = code[i + 1] === "/";
            let endIndex = code.indexOf(">", i);
            let tagContent = code.slice(i, endIndex + 1);
            if (isSelfClosing(tagContent)) ;
            else if (isEndTag) {
                stack.pop();
            }
            else {
                stack.push(tagContent);
            }
            if (endIndex == -1) {
                break;
            }
            i = endIndex;
        }
    }
    const missingParts = [];
    while (stack.length > 0) {
        const top = stack.pop();
        if (top.startsWith("<")) {
            let arr = top.match(/<(\w+)/);
            const tagName = arr[1];
            missingParts.push(`</${tagName}>`);
        }
        else {
            missingParts.push(top);
        }
    }
    let completedCode = code + missingParts.join("");
    return completedCode;
}

class Context {
    constructor(taskId, config, agents, chain) {
        this.paused = false;
        this.conversation = [];
        this.taskId = taskId;
        this.config = config;
        this.agents = agents;
        this.chain = chain;
        this.variables = new Map();
        this.controller = new AbortController();
    }
    async checkAborted() {
        // this.controller.signal.throwIfAborted();
        if (this.controller.signal.aborted) {
            const error = new Error("Operation was interrupted");
            error.name = "AbortError";
            throw error;
        }
        while (this.paused) {
            await sleep(500);
            if (this.controller.signal.aborted) {
                const error = new Error("Operation was interrupted");
                error.name = "AbortError";
                throw error;
            }
        }
    }
}
class AgentContext {
    constructor(context, agent, agentChain) {
        this.context = context;
        this.agent = agent;
        this.agentChain = agentChain;
        this.variables = new Map();
        this.consecutiveErrorNum = 0;
    }
}

// src/errors/ai-sdk-error.ts
var marker$1 = "vercel.ai.error";
var symbol$1 = Symbol.for(marker$1);
var _a$1;
var _AISDKError$1 = class _AISDKError extends Error {
  /**
   * Creates an AI SDK Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.name - The name of the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */
  constructor({
    name: name14,
    message,
    cause
  }) {
    super(message);
    this[_a$1] = true;
    this.name = name14;
    this.cause = cause;
  }
  /**
   * Checks if the given error is an AI SDK Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is an AI SDK Error, false otherwise.
   */
  static isInstance(error) {
    return _AISDKError.hasMarker(error, marker$1);
  }
  static hasMarker(error, marker15) {
    const markerSymbol = Symbol.for(marker15);
    return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
  }
};
_a$1 = symbol$1;
var AISDKError$1 = _AISDKError$1;

// src/errors/api-call-error.ts
var name$1 = "AI_APICallError";
var marker2$1 = `vercel.ai.error.${name$1}`;
var symbol2$1 = Symbol.for(marker2$1);
var _a2$1;
var APICallError$1 = class APICallError extends AISDKError$1 {
  constructor({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseHeaders,
    responseBody,
    cause,
    isRetryable = statusCode != null && (statusCode === 408 || // request timeout
    statusCode === 409 || // conflict
    statusCode === 429 || // too many requests
    statusCode >= 500),
    // server error
    data
  }) {
    super({ name: name$1, message, cause });
    this[_a2$1] = true;
    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseHeaders = responseHeaders;
    this.responseBody = responseBody;
    this.isRetryable = isRetryable;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker2$1);
  }
};
_a2$1 = symbol2$1;

// src/errors/empty-response-body-error.ts
var name2$1 = "AI_EmptyResponseBodyError";
var marker3$1 = `vercel.ai.error.${name2$1}`;
var symbol3$1 = Symbol.for(marker3$1);
var _a3$1;
var EmptyResponseBodyError$1 = class EmptyResponseBodyError extends AISDKError$1 {
  // used in isInstance
  constructor({ message = "Empty response body" } = {}) {
    super({ name: name2$1, message });
    this[_a3$1] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker3$1);
  }
};
_a3$1 = symbol3$1;

// src/errors/get-error-message.ts
function getErrorMessage$1(error) {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}

// src/errors/invalid-argument-error.ts
var name3$1 = "AI_InvalidArgumentError";
var marker4$1 = `vercel.ai.error.${name3$1}`;
var symbol4$1 = Symbol.for(marker4$1);
var _a4$1;
var InvalidArgumentError$1 = class InvalidArgumentError extends AISDKError$1 {
  constructor({
    message,
    cause,
    argument
  }) {
    super({ name: name3$1, message, cause });
    this[_a4$1] = true;
    this.argument = argument;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker4$1);
  }
};
_a4$1 = symbol4$1;

// src/errors/invalid-prompt-error.ts
var name4$1 = "AI_InvalidPromptError";
var marker5$1 = `vercel.ai.error.${name4$1}`;
var symbol5$1 = Symbol.for(marker5$1);
var _a5$1;
var InvalidPromptError$1 = class InvalidPromptError extends AISDKError$1 {
  constructor({
    prompt,
    message,
    cause
  }) {
    super({ name: name4$1, message: `Invalid prompt: ${message}`, cause });
    this[_a5$1] = true;
    this.prompt = prompt;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker5$1);
  }
};
_a5$1 = symbol5$1;

// src/errors/invalid-response-data-error.ts
var name5$1 = "AI_InvalidResponseDataError";
var marker6$1 = `vercel.ai.error.${name5$1}`;
var symbol6$1 = Symbol.for(marker6$1);
var _a6$1;
var InvalidResponseDataError$1 = class InvalidResponseDataError extends AISDKError$1 {
  constructor({
    data,
    message = `Invalid response data: ${JSON.stringify(data)}.`
  }) {
    super({ name: name5$1, message });
    this[_a6$1] = true;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker6$1);
  }
};
_a6$1 = symbol6$1;

// src/errors/json-parse-error.ts
var name6$1 = "AI_JSONParseError";
var marker7$1 = `vercel.ai.error.${name6$1}`;
var symbol7$1 = Symbol.for(marker7$1);
var _a7$1;
var JSONParseError$1 = class JSONParseError extends AISDKError$1 {
  constructor({ text, cause }) {
    super({
      name: name6$1,
      message: `JSON parsing failed: Text: ${text}.
Error message: ${getErrorMessage$1(cause)}`,
      cause
    });
    this[_a7$1] = true;
    this.text = text;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker7$1);
  }
};
_a7$1 = symbol7$1;

// src/errors/load-api-key-error.ts
var name7$1 = "AI_LoadAPIKeyError";
var marker8$1 = `vercel.ai.error.${name7$1}`;
var symbol8$1 = Symbol.for(marker8$1);
var _a8$1;
var LoadAPIKeyError$1 = class LoadAPIKeyError extends AISDKError$1 {
  // used in isInstance
  constructor({ message }) {
    super({ name: name7$1, message });
    this[_a8$1] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker8$1);
  }
};
_a8$1 = symbol8$1;

// src/errors/load-setting-error.ts
var name8 = "AI_LoadSettingError";
var marker9 = `vercel.ai.error.${name8}`;
var symbol9 = Symbol.for(marker9);
var _a9;
var LoadSettingError = class extends AISDKError$1 {
  // used in isInstance
  constructor({ message }) {
    super({ name: name8, message });
    this[_a9] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker9);
  }
};
_a9 = symbol9;

// src/errors/no-such-model-error.ts
var name10 = "AI_NoSuchModelError";
var marker11 = `vercel.ai.error.${name10}`;
var symbol11 = Symbol.for(marker11);
var _a11;
var NoSuchModelError = class extends AISDKError$1 {
  constructor({
    errorName = name10,
    modelId,
    modelType,
    message = `No such ${modelType}: ${modelId}`
  }) {
    super({ name: errorName, message });
    this[_a11] = true;
    this.modelId = modelId;
    this.modelType = modelType;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker11);
  }
};
_a11 = symbol11;

// src/errors/too-many-embedding-values-for-call-error.ts
var name11 = "AI_TooManyEmbeddingValuesForCallError";
var marker12 = `vercel.ai.error.${name11}`;
var symbol12 = Symbol.for(marker12);
var _a12;
var TooManyEmbeddingValuesForCallError = class extends AISDKError$1 {
  constructor(options) {
    super({
      name: name11,
      message: `Too many values for a single embedding call. The ${options.provider} model "${options.modelId}" can only embed up to ${options.maxEmbeddingsPerCall} values per call, but ${options.values.length} values were provided.`
    });
    this[_a12] = true;
    this.provider = options.provider;
    this.modelId = options.modelId;
    this.maxEmbeddingsPerCall = options.maxEmbeddingsPerCall;
    this.values = options.values;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker12);
  }
};
_a12 = symbol12;

// src/errors/type-validation-error.ts
var name12$1 = "AI_TypeValidationError";
var marker13$1 = `vercel.ai.error.${name12$1}`;
var symbol13$1 = Symbol.for(marker13$1);
var _a13$1;
var _TypeValidationError$1 = class _TypeValidationError extends AISDKError$1 {
  constructor({ value, cause }) {
    super({
      name: name12$1,
      message: `Type validation failed: Value: ${JSON.stringify(value)}.
Error message: ${getErrorMessage$1(cause)}`,
      cause
    });
    this[_a13$1] = true;
    this.value = value;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker13$1);
  }
  /**
   * Wraps an error into a TypeValidationError.
   * If the cause is already a TypeValidationError with the same value, it returns the cause.
   * Otherwise, it creates a new TypeValidationError.
   *
   * @param {Object} params - The parameters for wrapping the error.
   * @param {unknown} params.value - The value that failed validation.
   * @param {unknown} params.cause - The original error or cause of the validation failure.
   * @returns {TypeValidationError} A TypeValidationError instance.
   */
  static wrap({
    value,
    cause
  }) {
    return _TypeValidationError.isInstance(cause) && cause.value === value ? cause : new _TypeValidationError({ value, cause });
  }
};
_a13$1 = symbol13$1;
var TypeValidationError$1 = _TypeValidationError$1;

// src/errors/unsupported-functionality-error.ts
var name13$1 = "AI_UnsupportedFunctionalityError";
var marker14$1 = `vercel.ai.error.${name13$1}`;
var symbol14$1 = Symbol.for(marker14$1);
var _a14$1;
var UnsupportedFunctionalityError$1 = class UnsupportedFunctionalityError extends AISDKError$1 {
  constructor({
    functionality,
    message = `'${functionality}' functionality not supported.`
  }) {
    super({ name: name13$1, message });
    this[_a14$1] = true;
    this.functionality = functionality;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker14$1);
  }
};
_a14$1 = symbol14$1;

let customAlphabet = (alphabet, defaultSize = 21) => {
  return (size = defaultSize) => {
    let id = '';
    let i = size | 0;
    while (i--) {
      id += alphabet[(Math.random() * alphabet.length) | 0];
    }
    return id
  }
};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var secureJsonParse = {exports: {}};

var hasRequiredSecureJsonParse;

function requireSecureJsonParse () {
	if (hasRequiredSecureJsonParse) return secureJsonParse.exports;
	hasRequiredSecureJsonParse = 1;

	const hasBuffer = typeof Buffer !== 'undefined';
	const suspectProtoRx = /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
	const suspectConstructorRx = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;

	function _parse (text, reviver, options) {
	  // Normalize arguments
	  if (options == null) {
	    if (reviver !== null && typeof reviver === 'object') {
	      options = reviver;
	      reviver = undefined;
	    }
	  }

	  if (hasBuffer && Buffer.isBuffer(text)) {
	    text = text.toString();
	  }

	  // BOM checker
	  if (text && text.charCodeAt(0) === 0xFEFF) {
	    text = text.slice(1);
	  }

	  // Parse normally, allowing exceptions
	  const obj = JSON.parse(text, reviver);

	  // Ignore null and non-objects
	  if (obj === null || typeof obj !== 'object') {
	    return obj
	  }

	  const protoAction = (options && options.protoAction) || 'error';
	  const constructorAction = (options && options.constructorAction) || 'error';

	  // options: 'error' (default) / 'remove' / 'ignore'
	  if (protoAction === 'ignore' && constructorAction === 'ignore') {
	    return obj
	  }

	  if (protoAction !== 'ignore' && constructorAction !== 'ignore') {
	    if (suspectProtoRx.test(text) === false && suspectConstructorRx.test(text) === false) {
	      return obj
	    }
	  } else if (protoAction !== 'ignore' && constructorAction === 'ignore') {
	    if (suspectProtoRx.test(text) === false) {
	      return obj
	    }
	  } else {
	    if (suspectConstructorRx.test(text) === false) {
	      return obj
	    }
	  }

	  // Scan result for proto keys
	  return filter(obj, { protoAction, constructorAction, safe: options && options.safe })
	}

	function filter (obj, { protoAction = 'error', constructorAction = 'error', safe } = {}) {
	  let next = [obj];

	  while (next.length) {
	    const nodes = next;
	    next = [];

	    for (const node of nodes) {
	      if (protoAction !== 'ignore' && Object.prototype.hasOwnProperty.call(node, '__proto__')) { // Avoid calling node.hasOwnProperty directly
	        if (safe === true) {
	          return null
	        } else if (protoAction === 'error') {
	          throw new SyntaxError('Object contains forbidden prototype property')
	        }

	        delete node.__proto__; // eslint-disable-line no-proto
	      }

	      if (constructorAction !== 'ignore' &&
	          Object.prototype.hasOwnProperty.call(node, 'constructor') &&
	          Object.prototype.hasOwnProperty.call(node.constructor, 'prototype')) { // Avoid calling node.hasOwnProperty directly
	        if (safe === true) {
	          return null
	        } else if (constructorAction === 'error') {
	          throw new SyntaxError('Object contains forbidden prototype property')
	        }

	        delete node.constructor;
	      }

	      for (const key in node) {
	        const value = node[key];
	        if (value && typeof value === 'object') {
	          next.push(value);
	        }
	      }
	    }
	  }
	  return obj
	}

	function parse (text, reviver, options) {
	  const stackTraceLimit = Error.stackTraceLimit;
	  Error.stackTraceLimit = 0;
	  try {
	    return _parse(text, reviver, options)
	  } finally {
	    Error.stackTraceLimit = stackTraceLimit;
	  }
	}

	function safeParse (text, reviver) {
	  const stackTraceLimit = Error.stackTraceLimit;
	  Error.stackTraceLimit = 0;
	  try {
	    return _parse(text, reviver, { safe: true })
	  } catch (_e) {
	    return null
	  } finally {
	    Error.stackTraceLimit = stackTraceLimit;
	  }
	}

	secureJsonParse.exports = parse;
	secureJsonParse.exports.default = parse;
	secureJsonParse.exports.parse = parse;
	secureJsonParse.exports.safeParse = safeParse;
	secureJsonParse.exports.scan = filter;
	return secureJsonParse.exports;
}

var secureJsonParseExports = requireSecureJsonParse();
var SecureJSON = /*@__PURE__*/getDefaultExportFromCjs(secureJsonParseExports);

// src/combine-headers.ts
function combineHeaders$1(...headers) {
  return headers.reduce(
    (combinedHeaders, currentHeaders) => ({
      ...combinedHeaders,
      ...currentHeaders != null ? currentHeaders : {}
    }),
    {}
  );
}

// src/event-source-parser-stream.ts
function createEventSourceParserStream() {
  let buffer = "";
  let event = void 0;
  let data = [];
  let lastEventId = void 0;
  let retry = void 0;
  function parseLine(line, controller) {
    if (line === "") {
      dispatchEvent(controller);
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      handleField(line, "");
      return;
    }
    const field = line.slice(0, colonIndex);
    const valueStart = colonIndex + 1;
    const value = valueStart < line.length && line[valueStart] === " " ? line.slice(valueStart + 1) : line.slice(valueStart);
    handleField(field, value);
  }
  function dispatchEvent(controller) {
    if (data.length > 0) {
      controller.enqueue({
        event,
        data: data.join("\n"),
        id: lastEventId,
        retry
      });
      data = [];
      event = void 0;
      retry = void 0;
    }
  }
  function handleField(field, value) {
    switch (field) {
      case "event":
        event = value;
        break;
      case "data":
        data.push(value);
        break;
      case "id":
        lastEventId = value;
        break;
      case "retry":
        const parsedRetry = parseInt(value, 10);
        if (!isNaN(parsedRetry)) {
          retry = parsedRetry;
        }
        break;
    }
  }
  return new TransformStream({
    transform(chunk, controller) {
      const { lines, incompleteLine } = splitLines$1(buffer, chunk);
      buffer = incompleteLine;
      for (let i = 0; i < lines.length; i++) {
        parseLine(lines[i], controller);
      }
    },
    flush(controller) {
      parseLine(buffer, controller);
      dispatchEvent(controller);
    }
  });
}
function splitLines$1(buffer, chunk) {
  const lines = [];
  let currentLine = buffer;
  for (let i = 0; i < chunk.length; ) {
    const char = chunk[i++];
    if (char === "\n") {
      lines.push(currentLine);
      currentLine = "";
    } else if (char === "\r") {
      lines.push(currentLine);
      currentLine = "";
      if (chunk[i] === "\n") {
        i++;
      }
    } else {
      currentLine += char;
    }
  }
  return { lines, incompleteLine: currentLine };
}

// src/extract-response-headers.ts
function extractResponseHeaders$1(response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}
var createIdGenerator$1 = ({
  prefix,
  size: defaultSize = 16,
  alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  separator = "-"
} = {}) => {
  const generator = customAlphabet(alphabet, defaultSize);
  if (prefix == null) {
    return generator;
  }
  if (alphabet.includes(separator)) {
    throw new InvalidArgumentError$1({
      argument: "separator",
      message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`
    });
  }
  return (size) => `${prefix}${separator}${generator(size)}`;
};
var generateId$1 = createIdGenerator$1();

// src/remove-undefined-entries.ts
function removeUndefinedEntries$1(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([_key, value]) => value != null)
  );
}

// src/is-abort-error.ts
function isAbortError$1(error) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
function loadApiKey$1({
  apiKey,
  environmentVariableName,
  apiKeyParameterName = "apiKey",
  description
}) {
  if (typeof apiKey === "string") {
    return apiKey;
  }
  if (apiKey != null) {
    throw new LoadAPIKeyError$1({
      message: `${description} API key must be a string.`
    });
  }
  if (typeof process === "undefined") {
    throw new LoadAPIKeyError$1({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables is not supported in this environment.`
    });
  }
  apiKey = process.env[environmentVariableName];
  if (apiKey == null) {
    throw new LoadAPIKeyError$1({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.`
    });
  }
  if (typeof apiKey !== "string") {
    throw new LoadAPIKeyError$1({
      message: `${description} API key must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
    });
  }
  return apiKey;
}

// src/load-optional-setting.ts
function loadOptionalSetting({
  settingValue,
  environmentVariableName
}) {
  if (typeof settingValue === "string") {
    return settingValue;
  }
  if (settingValue != null || typeof process === "undefined") {
    return void 0;
  }
  settingValue = process.env[environmentVariableName];
  if (settingValue == null || typeof settingValue !== "string") {
    return void 0;
  }
  return settingValue;
}
function loadSetting({
  settingValue,
  environmentVariableName,
  settingName,
  description
}) {
  if (typeof settingValue === "string") {
    return settingValue;
  }
  if (settingValue != null) {
    throw new LoadSettingError({
      message: `${description} setting must be a string.`
    });
  }
  if (typeof process === "undefined") {
    throw new LoadSettingError({
      message: `${description} setting is missing. Pass it using the '${settingName}' parameter. Environment variables is not supported in this environment.`
    });
  }
  settingValue = process.env[environmentVariableName];
  if (settingValue == null) {
    throw new LoadSettingError({
      message: `${description} setting is missing. Pass it using the '${settingName}' parameter or the ${environmentVariableName} environment variable.`
    });
  }
  if (typeof settingValue !== "string") {
    throw new LoadSettingError({
      message: `${description} setting must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
    });
  }
  return settingValue;
}

// src/validator.ts
var validatorSymbol$1 = Symbol.for("vercel.ai.validator");
function validator$1(validate) {
  return { [validatorSymbol$1]: true, validate };
}
function isValidator$1(value) {
  return typeof value === "object" && value !== null && validatorSymbol$1 in value && value[validatorSymbol$1] === true && "validate" in value;
}
function asValidator$1(value) {
  return isValidator$1(value) ? value : zodValidator$1(value);
}
function zodValidator$1(zodSchema) {
  return validator$1((value) => {
    const result = zodSchema.safeParse(value);
    return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
  });
}

// src/validate-types.ts
function validateTypes$1({
  value,
  schema: inputSchema
}) {
  const result = safeValidateTypes$1({ value, schema: inputSchema });
  if (!result.success) {
    throw TypeValidationError$1.wrap({ value, cause: result.error });
  }
  return result.value;
}
function safeValidateTypes$1({
  value,
  schema
}) {
  const validator2 = asValidator$1(schema);
  try {
    if (validator2.validate == null) {
      return { success: true, value };
    }
    const result = validator2.validate(value);
    if (result.success) {
      return result;
    }
    return {
      success: false,
      error: TypeValidationError$1.wrap({ value, cause: result.error })
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError$1.wrap({ value, cause: error })
    };
  }
}

// src/parse-json.ts
function parseJSON$1({
  text,
  schema
}) {
  try {
    const value = SecureJSON.parse(text);
    if (schema == null) {
      return value;
    }
    return validateTypes$1({ value, schema });
  } catch (error) {
    if (JSONParseError$1.isInstance(error) || TypeValidationError$1.isInstance(error)) {
      throw error;
    }
    throw new JSONParseError$1({ text, cause: error });
  }
}
function safeParseJSON$1({
  text,
  schema
}) {
  try {
    const value = SecureJSON.parse(text);
    if (schema == null) {
      return { success: true, value, rawValue: value };
    }
    const validationResult = safeValidateTypes$1({ value, schema });
    return validationResult.success ? { ...validationResult, rawValue: value } : validationResult;
  } catch (error) {
    return {
      success: false,
      error: JSONParseError$1.isInstance(error) ? error : new JSONParseError$1({ text, cause: error })
    };
  }
}
function isParsableJson$1(input) {
  try {
    SecureJSON.parse(input);
    return true;
  } catch (e) {
    return false;
  }
}
function parseProviderOptions({
  provider,
  providerOptions,
  schema
}) {
  if ((providerOptions == null ? void 0 : providerOptions[provider]) == null) {
    return void 0;
  }
  const parsedProviderOptions = safeValidateTypes$1({
    value: providerOptions[provider],
    schema
  });
  if (!parsedProviderOptions.success) {
    throw new InvalidArgumentError$1({
      argument: "providerOptions",
      message: `invalid ${provider} provider options`,
      cause: parsedProviderOptions.error
    });
  }
  return parsedProviderOptions.value;
}
var getOriginalFetch2$1 = () => globalThis.fetch;
var postJsonToApi$1 = async ({
  url,
  headers,
  body,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch
}) => postToApi$1({
  url,
  headers: {
    "Content-Type": "application/json",
    ...headers
  },
  body: {
    content: JSON.stringify(body),
    values: body
  },
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch
});
var postFormDataToApi = async ({
  url,
  headers,
  formData,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch
}) => postToApi$1({
  url,
  headers,
  body: {
    content: formData,
    values: Object.fromEntries(formData.entries())
  },
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch
});
var postToApi$1 = async ({
  url,
  headers = {},
  body,
  successfulResponseHandler,
  failedResponseHandler,
  abortSignal,
  fetch = getOriginalFetch2$1()
}) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: removeUndefinedEntries$1(headers),
      body: body.content,
      signal: abortSignal
    });
    const responseHeaders = extractResponseHeaders$1(response);
    if (!response.ok) {
      let errorInformation;
      try {
        errorInformation = await failedResponseHandler({
          response,
          url,
          requestBodyValues: body.values
        });
      } catch (error) {
        if (isAbortError$1(error) || APICallError$1.isInstance(error)) {
          throw error;
        }
        throw new APICallError$1({
          message: "Failed to process error response",
          cause: error,
          statusCode: response.status,
          url,
          responseHeaders,
          requestBodyValues: body.values
        });
      }
      throw errorInformation.value;
    }
    try {
      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues: body.values
      });
    } catch (error) {
      if (error instanceof Error) {
        if (isAbortError$1(error) || APICallError$1.isInstance(error)) {
          throw error;
        }
      }
      throw new APICallError$1({
        message: "Failed to process successful response",
        cause: error,
        statusCode: response.status,
        url,
        responseHeaders,
        requestBodyValues: body.values
      });
    }
  } catch (error) {
    if (isAbortError$1(error)) {
      throw error;
    }
    if (error instanceof TypeError && error.message === "fetch failed") {
      const cause = error.cause;
      if (cause != null) {
        throw new APICallError$1({
          message: `Cannot connect to API: ${cause.message}`,
          cause,
          url,
          requestBodyValues: body.values,
          isRetryable: true
          // retry when network error
        });
      }
    }
    throw error;
  }
};

// src/resolve.ts
async function resolve(value) {
  if (typeof value === "function") {
    value = value();
  }
  return Promise.resolve(value);
}
var createJsonErrorResponseHandler$1 = ({
  errorSchema,
  errorToMessage,
  isRetryable
}) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await response.text();
  const responseHeaders = extractResponseHeaders$1(response);
  if (responseBody.trim() === "") {
    return {
      responseHeaders,
      value: new APICallError$1({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
  try {
    const parsedError = parseJSON$1({
      text: responseBody,
      schema: errorSchema
    });
    return {
      responseHeaders,
      value: new APICallError$1({
        message: errorToMessage(parsedError),
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        data: parsedError,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response, parsedError)
      })
    };
  } catch (parseError) {
    return {
      responseHeaders,
      value: new APICallError$1({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
};
var createEventSourceResponseHandler$1 = (chunkSchema) => async ({ response }) => {
  const responseHeaders = extractResponseHeaders$1(response);
  if (response.body == null) {
    throw new EmptyResponseBodyError$1({});
  }
  return {
    responseHeaders,
    value: response.body.pipeThrough(new TextDecoderStream()).pipeThrough(createEventSourceParserStream()).pipeThrough(
      new TransformStream({
        transform({ data }, controller) {
          if (data === "[DONE]") {
            return;
          }
          controller.enqueue(
            safeParseJSON$1({
              text: data,
              schema: chunkSchema
            })
          );
        }
      })
    )
  };
};
var createJsonResponseHandler$1 = (responseSchema) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await response.text();
  const parsedResult = safeParseJSON$1({
    text: responseBody,
    schema: responseSchema
  });
  const responseHeaders = extractResponseHeaders$1(response);
  if (!parsedResult.success) {
    throw new APICallError$1({
      message: "Invalid JSON response",
      cause: parsedResult.error,
      statusCode: response.status,
      responseHeaders,
      responseBody,
      url,
      requestBodyValues
    });
  }
  return {
    responseHeaders,
    value: parsedResult.value,
    rawValue: parsedResult.rawValue
  };
};
var createBinaryResponseHandler = () => async ({ response, url, requestBodyValues }) => {
  const responseHeaders = extractResponseHeaders$1(response);
  if (!response.body) {
    throw new APICallError$1({
      message: "Response body is empty",
      url,
      requestBodyValues,
      statusCode: response.status,
      responseHeaders,
      responseBody: void 0
    });
  }
  try {
    const buffer = await response.arrayBuffer();
    return {
      responseHeaders,
      value: new Uint8Array(buffer)
    };
  } catch (error) {
    throw new APICallError$1({
      message: "Failed to read response as array buffer",
      url,
      requestBodyValues,
      statusCode: response.status,
      responseHeaders,
      responseBody: void 0,
      cause: error
    });
  }
};

// src/uint8-utils.ts
var { btoa: btoa$1, atob: atob$1 } = globalThis;
function convertBase64ToUint8Array(base64String) {
  const base64Url = base64String.replace(/-/g, "+").replace(/_/g, "/");
  const latin1string = atob$1(base64Url);
  return Uint8Array.from(latin1string, (byte) => byte.codePointAt(0));
}
function convertUint8ArrayToBase64$1(array) {
  let latin1string = "";
  for (let i = 0; i < array.length; i++) {
    latin1string += String.fromCodePoint(array[i]);
  }
  return btoa$1(latin1string);
}

// src/without-trailing-slash.ts
function withoutTrailingSlash$1(url) {
  return url == null ? void 0 : url.replace(/\/$/, "");
}

var util;
(function (util) {
    util.assertEqual = (_) => { };
    function assertIs(_arg) { }
    util.assertIs = assertIs;
    function assertNever(_x) {
        throw new Error();
    }
    util.assertNever = assertNever;
    util.arrayToEnum = (items) => {
        const obj = {};
        for (const item of items) {
            obj[item] = item;
        }
        return obj;
    };
    util.getValidEnumValues = (obj) => {
        const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
        const filtered = {};
        for (const k of validKeys) {
            filtered[k] = obj[k];
        }
        return util.objectValues(filtered);
    };
    util.objectValues = (obj) => {
        return util.objectKeys(obj).map(function (e) {
            return obj[e];
        });
    };
    util.objectKeys = typeof Object.keys === "function" // eslint-disable-line ban/ban
        ? (obj) => Object.keys(obj) // eslint-disable-line ban/ban
        : (object) => {
            const keys = [];
            for (const key in object) {
                if (Object.prototype.hasOwnProperty.call(object, key)) {
                    keys.push(key);
                }
            }
            return keys;
        };
    util.find = (arr, checker) => {
        for (const item of arr) {
            if (checker(item))
                return item;
        }
        return undefined;
    };
    util.isInteger = typeof Number.isInteger === "function"
        ? (val) => Number.isInteger(val) // eslint-disable-line ban/ban
        : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
        return array.map((val) => (typeof val === "string" ? `'${val}'` : val)).join(separator);
    }
    util.joinValues = joinValues;
    util.jsonStringifyReplacer = (_, value) => {
        if (typeof value === "bigint") {
            return value.toString();
        }
        return value;
    };
})(util || (util = {}));
var objectUtil;
(function (objectUtil) {
    objectUtil.mergeShapes = (first, second) => {
        return {
            ...first,
            ...second, // second overwrites first
        };
    };
})(objectUtil || (objectUtil = {}));
const ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set",
]);
const getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
        case "undefined":
            return ZodParsedType.undefined;
        case "string":
            return ZodParsedType.string;
        case "number":
            return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
        case "boolean":
            return ZodParsedType.boolean;
        case "function":
            return ZodParsedType.function;
        case "bigint":
            return ZodParsedType.bigint;
        case "symbol":
            return ZodParsedType.symbol;
        case "object":
            if (Array.isArray(data)) {
                return ZodParsedType.array;
            }
            if (data === null) {
                return ZodParsedType.null;
            }
            if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
                return ZodParsedType.promise;
            }
            if (typeof Map !== "undefined" && data instanceof Map) {
                return ZodParsedType.map;
            }
            if (typeof Set !== "undefined" && data instanceof Set) {
                return ZodParsedType.set;
            }
            if (typeof Date !== "undefined" && data instanceof Date) {
                return ZodParsedType.date;
            }
            return ZodParsedType.object;
        default:
            return ZodParsedType.unknown;
    }
};

const ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite",
]);
class ZodError extends Error {
    get errors() {
        return this.issues;
    }
    constructor(issues) {
        super();
        this.issues = [];
        this.addIssue = (sub) => {
            this.issues = [...this.issues, sub];
        };
        this.addIssues = (subs = []) => {
            this.issues = [...this.issues, ...subs];
        };
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
            // eslint-disable-next-line ban/ban
            Object.setPrototypeOf(this, actualProto);
        }
        else {
            this.__proto__ = actualProto;
        }
        this.name = "ZodError";
        this.issues = issues;
    }
    format(_mapper) {
        const mapper = _mapper ||
            function (issue) {
                return issue.message;
            };
        const fieldErrors = { _errors: [] };
        const processError = (error) => {
            for (const issue of error.issues) {
                if (issue.code === "invalid_union") {
                    issue.unionErrors.map(processError);
                }
                else if (issue.code === "invalid_return_type") {
                    processError(issue.returnTypeError);
                }
                else if (issue.code === "invalid_arguments") {
                    processError(issue.argumentsError);
                }
                else if (issue.path.length === 0) {
                    fieldErrors._errors.push(mapper(issue));
                }
                else {
                    let curr = fieldErrors;
                    let i = 0;
                    while (i < issue.path.length) {
                        const el = issue.path[i];
                        const terminal = i === issue.path.length - 1;
                        if (!terminal) {
                            curr[el] = curr[el] || { _errors: [] };
                            // if (typeof el === "string") {
                            //   curr[el] = curr[el] || { _errors: [] };
                            // } else if (typeof el === "number") {
                            //   const errorArray: any = [];
                            //   errorArray._errors = [];
                            //   curr[el] = curr[el] || errorArray;
                            // }
                        }
                        else {
                            curr[el] = curr[el] || { _errors: [] };
                            curr[el]._errors.push(mapper(issue));
                        }
                        curr = curr[el];
                        i++;
                    }
                }
            }
        };
        processError(this);
        return fieldErrors;
    }
    static assert(value) {
        if (!(value instanceof ZodError)) {
            throw new Error(`Not a ZodError: ${value}`);
        }
    }
    toString() {
        return this.message;
    }
    get message() {
        return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
        return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
        const fieldErrors = {};
        const formErrors = [];
        for (const sub of this.issues) {
            if (sub.path.length > 0) {
                fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
                fieldErrors[sub.path[0]].push(mapper(sub));
            }
            else {
                formErrors.push(mapper(sub));
            }
        }
        return { formErrors, fieldErrors };
    }
    get formErrors() {
        return this.flatten();
    }
}
ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
};

const errorMap = (issue, _ctx) => {
    let message;
    switch (issue.code) {
        case ZodIssueCode.invalid_type:
            if (issue.received === ZodParsedType.undefined) {
                message = "Required";
            }
            else {
                message = `Expected ${issue.expected}, received ${issue.received}`;
            }
            break;
        case ZodIssueCode.invalid_literal:
            message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
            break;
        case ZodIssueCode.unrecognized_keys:
            message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
            break;
        case ZodIssueCode.invalid_union:
            message = `Invalid input`;
            break;
        case ZodIssueCode.invalid_union_discriminator:
            message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
            break;
        case ZodIssueCode.invalid_enum_value:
            message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
            break;
        case ZodIssueCode.invalid_arguments:
            message = `Invalid function arguments`;
            break;
        case ZodIssueCode.invalid_return_type:
            message = `Invalid function return type`;
            break;
        case ZodIssueCode.invalid_date:
            message = `Invalid date`;
            break;
        case ZodIssueCode.invalid_string:
            if (typeof issue.validation === "object") {
                if ("includes" in issue.validation) {
                    message = `Invalid input: must include "${issue.validation.includes}"`;
                    if (typeof issue.validation.position === "number") {
                        message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
                    }
                }
                else if ("startsWith" in issue.validation) {
                    message = `Invalid input: must start with "${issue.validation.startsWith}"`;
                }
                else if ("endsWith" in issue.validation) {
                    message = `Invalid input: must end with "${issue.validation.endsWith}"`;
                }
                else {
                    util.assertNever(issue.validation);
                }
            }
            else if (issue.validation !== "regex") {
                message = `Invalid ${issue.validation}`;
            }
            else {
                message = "Invalid";
            }
            break;
        case ZodIssueCode.too_small:
            if (issue.type === "array")
                message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
            else if (issue.type === "string")
                message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
            else if (issue.type === "number")
                message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
            else if (issue.type === "date")
                message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
            else
                message = "Invalid input";
            break;
        case ZodIssueCode.too_big:
            if (issue.type === "array")
                message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
            else if (issue.type === "string")
                message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
            else if (issue.type === "number")
                message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
            else if (issue.type === "bigint")
                message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
            else if (issue.type === "date")
                message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
            else
                message = "Invalid input";
            break;
        case ZodIssueCode.custom:
            message = `Invalid input`;
            break;
        case ZodIssueCode.invalid_intersection_types:
            message = `Intersection results could not be merged`;
            break;
        case ZodIssueCode.not_multiple_of:
            message = `Number must be a multiple of ${issue.multipleOf}`;
            break;
        case ZodIssueCode.not_finite:
            message = "Number must be finite";
            break;
        default:
            message = _ctx.defaultError;
            util.assertNever(issue);
    }
    return { message };
};

let overrideErrorMap = errorMap;
function getErrorMap() {
    return overrideErrorMap;
}

const makeIssue = (params) => {
    const { data, path, errorMaps, issueData } = params;
    const fullPath = [...path, ...(issueData.path || [])];
    const fullIssue = {
        ...issueData,
        path: fullPath,
    };
    if (issueData.message !== undefined) {
        return {
            ...issueData,
            path: fullPath,
            message: issueData.message,
        };
    }
    let errorMessage = "";
    const maps = errorMaps
        .filter((m) => !!m)
        .slice()
        .reverse();
    for (const map of maps) {
        errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
    }
    return {
        ...issueData,
        path: fullPath,
        message: errorMessage,
    };
};
function addIssueToContext(ctx, issueData) {
    const overrideMap = getErrorMap();
    const issue = makeIssue({
        issueData: issueData,
        data: ctx.data,
        path: ctx.path,
        errorMaps: [
            ctx.common.contextualErrorMap, // contextual error map is first priority
            ctx.schemaErrorMap, // then schema-bound map if available
            overrideMap, // then global override map
            overrideMap === errorMap ? undefined : errorMap, // then global default map
        ].filter((x) => !!x),
    });
    ctx.common.issues.push(issue);
}
class ParseStatus {
    constructor() {
        this.value = "valid";
    }
    dirty() {
        if (this.value === "valid")
            this.value = "dirty";
    }
    abort() {
        if (this.value !== "aborted")
            this.value = "aborted";
    }
    static mergeArray(status, results) {
        const arrayValue = [];
        for (const s of results) {
            if (s.status === "aborted")
                return INVALID;
            if (s.status === "dirty")
                status.dirty();
            arrayValue.push(s.value);
        }
        return { status: status.value, value: arrayValue };
    }
    static async mergeObjectAsync(status, pairs) {
        const syncPairs = [];
        for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
                key,
                value,
            });
        }
        return ParseStatus.mergeObjectSync(status, syncPairs);
    }
    static mergeObjectSync(status, pairs) {
        const finalObject = {};
        for (const pair of pairs) {
            const { key, value } = pair;
            if (key.status === "aborted")
                return INVALID;
            if (value.status === "aborted")
                return INVALID;
            if (key.status === "dirty")
                status.dirty();
            if (value.status === "dirty")
                status.dirty();
            if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
                finalObject[key.value] = value.value;
            }
        }
        return { status: status.value, value: finalObject };
    }
}
const INVALID = Object.freeze({
    status: "aborted",
});
const DIRTY = (value) => ({ status: "dirty", value });
const OK = (value) => ({ status: "valid", value });
const isAborted = (x) => x.status === "aborted";
const isDirty = (x) => x.status === "dirty";
const isValid = (x) => x.status === "valid";
const isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

var errorUtil;
(function (errorUtil) {
    errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    // biome-ignore lint:
    errorUtil.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

class ParseInputLazyPath {
    constructor(parent, value, path, key) {
        this._cachedPath = [];
        this.parent = parent;
        this.data = value;
        this._path = path;
        this._key = key;
    }
    get path() {
        if (!this._cachedPath.length) {
            if (Array.isArray(this._key)) {
                this._cachedPath.push(...this._path, ...this._key);
            }
            else {
                this._cachedPath.push(...this._path, this._key);
            }
        }
        return this._cachedPath;
    }
}
const handleResult = (ctx, result) => {
    if (isValid(result)) {
        return { success: true, data: result.value };
    }
    else {
        if (!ctx.common.issues.length) {
            throw new Error("Validation failed but no issues detected.");
        }
        return {
            success: false,
            get error() {
                if (this._error)
                    return this._error;
                const error = new ZodError(ctx.common.issues);
                this._error = error;
                return this._error;
            },
        };
    }
};
function processCreateParams(params) {
    if (!params)
        return {};
    const { errorMap, invalid_type_error, required_error, description } = params;
    if (errorMap && (invalid_type_error || required_error)) {
        throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
    }
    if (errorMap)
        return { errorMap: errorMap, description };
    const customMap = (iss, ctx) => {
        const { message } = params;
        if (iss.code === "invalid_enum_value") {
            return { message: message ?? ctx.defaultError };
        }
        if (typeof ctx.data === "undefined") {
            return { message: message ?? required_error ?? ctx.defaultError };
        }
        if (iss.code !== "invalid_type")
            return { message: ctx.defaultError };
        return { message: message ?? invalid_type_error ?? ctx.defaultError };
    };
    return { errorMap: customMap, description };
}
class ZodType {
    get description() {
        return this._def.description;
    }
    _getType(input) {
        return getParsedType(input.data);
    }
    _getOrReturnCtx(input, ctx) {
        return (ctx || {
            common: input.parent.common,
            data: input.data,
            parsedType: getParsedType(input.data),
            schemaErrorMap: this._def.errorMap,
            path: input.path,
            parent: input.parent,
        });
    }
    _processInputParams(input) {
        return {
            status: new ParseStatus(),
            ctx: {
                common: input.parent.common,
                data: input.data,
                parsedType: getParsedType(input.data),
                schemaErrorMap: this._def.errorMap,
                path: input.path,
                parent: input.parent,
            },
        };
    }
    _parseSync(input) {
        const result = this._parse(input);
        if (isAsync(result)) {
            throw new Error("Synchronous parse encountered promise.");
        }
        return result;
    }
    _parseAsync(input) {
        const result = this._parse(input);
        return Promise.resolve(result);
    }
    parse(data, params) {
        const result = this.safeParse(data, params);
        if (result.success)
            return result.data;
        throw result.error;
    }
    safeParse(data, params) {
        const ctx = {
            common: {
                issues: [],
                async: params?.async ?? false,
                contextualErrorMap: params?.errorMap,
            },
            path: params?.path || [],
            schemaErrorMap: this._def.errorMap,
            parent: null,
            data,
            parsedType: getParsedType(data),
        };
        const result = this._parseSync({ data, path: ctx.path, parent: ctx });
        return handleResult(ctx, result);
    }
    "~validate"(data) {
        const ctx = {
            common: {
                issues: [],
                async: !!this["~standard"].async,
            },
            path: [],
            schemaErrorMap: this._def.errorMap,
            parent: null,
            data,
            parsedType: getParsedType(data),
        };
        if (!this["~standard"].async) {
            try {
                const result = this._parseSync({ data, path: [], parent: ctx });
                return isValid(result)
                    ? {
                        value: result.value,
                    }
                    : {
                        issues: ctx.common.issues,
                    };
            }
            catch (err) {
                if (err?.message?.toLowerCase()?.includes("encountered")) {
                    this["~standard"].async = true;
                }
                ctx.common = {
                    issues: [],
                    async: true,
                };
            }
        }
        return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result)
            ? {
                value: result.value,
            }
            : {
                issues: ctx.common.issues,
            });
    }
    async parseAsync(data, params) {
        const result = await this.safeParseAsync(data, params);
        if (result.success)
            return result.data;
        throw result.error;
    }
    async safeParseAsync(data, params) {
        const ctx = {
            common: {
                issues: [],
                contextualErrorMap: params?.errorMap,
                async: true,
            },
            path: params?.path || [],
            schemaErrorMap: this._def.errorMap,
            parent: null,
            data,
            parsedType: getParsedType(data),
        };
        const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
        const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
        return handleResult(ctx, result);
    }
    refine(check, message) {
        const getIssueProperties = (val) => {
            if (typeof message === "string" || typeof message === "undefined") {
                return { message };
            }
            else if (typeof message === "function") {
                return message(val);
            }
            else {
                return message;
            }
        };
        return this._refinement((val, ctx) => {
            const result = check(val);
            const setError = () => ctx.addIssue({
                code: ZodIssueCode.custom,
                ...getIssueProperties(val),
            });
            if (typeof Promise !== "undefined" && result instanceof Promise) {
                return result.then((data) => {
                    if (!data) {
                        setError();
                        return false;
                    }
                    else {
                        return true;
                    }
                });
            }
            if (!result) {
                setError();
                return false;
            }
            else {
                return true;
            }
        });
    }
    refinement(check, refinementData) {
        return this._refinement((val, ctx) => {
            if (!check(val)) {
                ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
                return false;
            }
            else {
                return true;
            }
        });
    }
    _refinement(refinement) {
        return new ZodEffects({
            schema: this,
            typeName: ZodFirstPartyTypeKind.ZodEffects,
            effect: { type: "refinement", refinement },
        });
    }
    superRefine(refinement) {
        return this._refinement(refinement);
    }
    constructor(def) {
        /** Alias of safeParseAsync */
        this.spa = this.safeParseAsync;
        this._def = def;
        this.parse = this.parse.bind(this);
        this.safeParse = this.safeParse.bind(this);
        this.parseAsync = this.parseAsync.bind(this);
        this.safeParseAsync = this.safeParseAsync.bind(this);
        this.spa = this.spa.bind(this);
        this.refine = this.refine.bind(this);
        this.refinement = this.refinement.bind(this);
        this.superRefine = this.superRefine.bind(this);
        this.optional = this.optional.bind(this);
        this.nullable = this.nullable.bind(this);
        this.nullish = this.nullish.bind(this);
        this.array = this.array.bind(this);
        this.promise = this.promise.bind(this);
        this.or = this.or.bind(this);
        this.and = this.and.bind(this);
        this.transform = this.transform.bind(this);
        this.brand = this.brand.bind(this);
        this.default = this.default.bind(this);
        this.catch = this.catch.bind(this);
        this.describe = this.describe.bind(this);
        this.pipe = this.pipe.bind(this);
        this.readonly = this.readonly.bind(this);
        this.isNullable = this.isNullable.bind(this);
        this.isOptional = this.isOptional.bind(this);
        this["~standard"] = {
            version: 1,
            vendor: "zod",
            validate: (data) => this["~validate"](data),
        };
    }
    optional() {
        return ZodOptional.create(this, this._def);
    }
    nullable() {
        return ZodNullable.create(this, this._def);
    }
    nullish() {
        return this.nullable().optional();
    }
    array() {
        return ZodArray.create(this);
    }
    promise() {
        return ZodPromise.create(this, this._def);
    }
    or(option) {
        return ZodUnion.create([this, option], this._def);
    }
    and(incoming) {
        return ZodIntersection.create(this, incoming, this._def);
    }
    transform(transform) {
        return new ZodEffects({
            ...processCreateParams(this._def),
            schema: this,
            typeName: ZodFirstPartyTypeKind.ZodEffects,
            effect: { type: "transform", transform },
        });
    }
    default(def) {
        const defaultValueFunc = typeof def === "function" ? def : () => def;
        return new ZodDefault({
            ...processCreateParams(this._def),
            innerType: this,
            defaultValue: defaultValueFunc,
            typeName: ZodFirstPartyTypeKind.ZodDefault,
        });
    }
    brand() {
        return new ZodBranded({
            typeName: ZodFirstPartyTypeKind.ZodBranded,
            type: this,
            ...processCreateParams(this._def),
        });
    }
    catch(def) {
        const catchValueFunc = typeof def === "function" ? def : () => def;
        return new ZodCatch({
            ...processCreateParams(this._def),
            innerType: this,
            catchValue: catchValueFunc,
            typeName: ZodFirstPartyTypeKind.ZodCatch,
        });
    }
    describe(description) {
        const This = this.constructor;
        return new This({
            ...this._def,
            description,
        });
    }
    pipe(target) {
        return ZodPipeline.create(this, target);
    }
    readonly() {
        return ZodReadonly.create(this);
    }
    isOptional() {
        return this.safeParse(undefined).success;
    }
    isNullable() {
        return this.safeParse(null).success;
    }
}
const cuidRegex = /^c[^\s-]{8,}$/i;
const cuid2Regex = /^[0-9a-z]+$/;
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
// const uuidRegex =
//   /^([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}|00000000-0000-0000-0000-000000000000)$/i;
const uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
const nanoidRegex = /^[a-z0-9_-]{21}$/i;
const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
const durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
// from https://stackoverflow.com/a/46181/1550155
// old version: too slow, didn't support unicode
// const emailRegex = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i;
//old email regex
// const emailRegex = /^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@((?!-)([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{1,})[^-<>()[\].,;:\s@"]$/i;
// eslint-disable-next-line
// const emailRegex =
//   /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\])|(\[IPv6:(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))\])|([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])*(\.[A-Za-z]{2,})+))$/;
// const emailRegex =
//   /^[a-zA-Z0-9\.\!\#\$\%\&\'\*\+\/\=\?\^\_\`\{\|\}\~\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
// const emailRegex =
//   /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
const emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
// const emailRegex =
//   /^[a-z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9\-]+)*$/i;
// from https://thekevinscott.com/emojis-in-javascript/#writing-a-regular-expression
const _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
let emojiRegex;
// faster, simpler, safer
const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
// const ipv6Regex =
// /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/;
const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
const ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
// https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
// https://base64.guru/standards/base64url
const base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
// simple
// const dateRegexSource = `\\d{4}-\\d{2}-\\d{2}`;
// no leap year validation
// const dateRegexSource = `\\d{4}-((0[13578]|10|12)-31|(0[13-9]|1[0-2])-30|(0[1-9]|1[0-2])-(0[1-9]|1\\d|2\\d))`;
// with leap year validation
const dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
    let secondsRegexSource = `[0-5]\\d`;
    if (args.precision) {
        secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
    }
    else if (args.precision == null) {
        secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
    }
    const secondsQuantifier = args.precision ? "+" : "?"; // require seconds if precision is nonzero
    return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
    return new RegExp(`^${timeRegexSource(args)}$`);
}
// Adapted from https://stackoverflow.com/a/3143231
function datetimeRegex(args) {
    let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
    const opts = [];
    opts.push(args.local ? `Z?` : `Z`);
    if (args.offset)
        opts.push(`([+-]\\d{2}:?\\d{2})`);
    regex = `${regex}(${opts.join("|")})`;
    return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
    if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
        return true;
    }
    if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
        return true;
    }
    return false;
}
function isValidJWT(jwt, alg) {
    if (!jwtRegex.test(jwt))
        return false;
    try {
        const [header] = jwt.split(".");
        // Convert base64url to base64
        const base64 = header
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(header.length + ((4 - (header.length % 4)) % 4), "=");
        const decoded = JSON.parse(atob(base64));
        if (typeof decoded !== "object" || decoded === null)
            return false;
        if ("typ" in decoded && decoded?.typ !== "JWT")
            return false;
        if (!decoded.alg)
            return false;
        if (alg && decoded.alg !== alg)
            return false;
        return true;
    }
    catch {
        return false;
    }
}
function isValidCidr(ip, version) {
    if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
        return true;
    }
    if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
        return true;
    }
    return false;
}
class ZodString extends ZodType {
    _parse(input) {
        if (this._def.coerce) {
            input.data = String(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.string) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.string,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const status = new ParseStatus();
        let ctx = undefined;
        for (const check of this._def.checks) {
            if (check.kind === "min") {
                if (input.data.length < check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        minimum: check.value,
                        type: "string",
                        inclusive: true,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                if (input.data.length > check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        maximum: check.value,
                        type: "string",
                        inclusive: true,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "length") {
                const tooBig = input.data.length > check.value;
                const tooSmall = input.data.length < check.value;
                if (tooBig || tooSmall) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    if (tooBig) {
                        addIssueToContext(ctx, {
                            code: ZodIssueCode.too_big,
                            maximum: check.value,
                            type: "string",
                            inclusive: true,
                            exact: true,
                            message: check.message,
                        });
                    }
                    else if (tooSmall) {
                        addIssueToContext(ctx, {
                            code: ZodIssueCode.too_small,
                            minimum: check.value,
                            type: "string",
                            inclusive: true,
                            exact: true,
                            message: check.message,
                        });
                    }
                    status.dirty();
                }
            }
            else if (check.kind === "email") {
                if (!emailRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "email",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "emoji") {
                if (!emojiRegex) {
                    emojiRegex = new RegExp(_emojiRegex, "u");
                }
                if (!emojiRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "emoji",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "uuid") {
                if (!uuidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "uuid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "nanoid") {
                if (!nanoidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "nanoid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "cuid") {
                if (!cuidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "cuid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "cuid2") {
                if (!cuid2Regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "cuid2",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "ulid") {
                if (!ulidRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "ulid",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "url") {
                try {
                    new URL(input.data);
                }
                catch {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "url",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "regex") {
                check.regex.lastIndex = 0;
                const testResult = check.regex.test(input.data);
                if (!testResult) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "regex",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "trim") {
                input.data = input.data.trim();
            }
            else if (check.kind === "includes") {
                if (!input.data.includes(check.value, check.position)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: { includes: check.value, position: check.position },
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "toLowerCase") {
                input.data = input.data.toLowerCase();
            }
            else if (check.kind === "toUpperCase") {
                input.data = input.data.toUpperCase();
            }
            else if (check.kind === "startsWith") {
                if (!input.data.startsWith(check.value)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: { startsWith: check.value },
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "endsWith") {
                if (!input.data.endsWith(check.value)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: { endsWith: check.value },
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "datetime") {
                const regex = datetimeRegex(check);
                if (!regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: "datetime",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "date") {
                const regex = dateRegex;
                if (!regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: "date",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "time") {
                const regex = timeRegex(check);
                if (!regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_string,
                        validation: "time",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "duration") {
                if (!durationRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "duration",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "ip") {
                if (!isValidIP(input.data, check.version)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "ip",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "jwt") {
                if (!isValidJWT(input.data, check.alg)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "jwt",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "cidr") {
                if (!isValidCidr(input.data, check.version)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "cidr",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "base64") {
                if (!base64Regex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "base64",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "base64url") {
                if (!base64urlRegex.test(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        validation: "base64url",
                        code: ZodIssueCode.invalid_string,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
        return this.refinement((data) => regex.test(data), {
            validation,
            code: ZodIssueCode.invalid_string,
            ...errorUtil.errToObj(message),
        });
    }
    _addCheck(check) {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    email(message) {
        return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
        return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
        return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
        return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
        return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
        return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
        return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
        return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
        return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    base64url(message) {
        // base64url encoding is a modification of base64 that can safely be used in URLs and filenames
        return this._addCheck({
            kind: "base64url",
            ...errorUtil.errToObj(message),
        });
    }
    jwt(options) {
        return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
    }
    ip(options) {
        return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    cidr(options) {
        return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
        if (typeof options === "string") {
            return this._addCheck({
                kind: "datetime",
                precision: null,
                offset: false,
                local: false,
                message: options,
            });
        }
        return this._addCheck({
            kind: "datetime",
            precision: typeof options?.precision === "undefined" ? null : options?.precision,
            offset: options?.offset ?? false,
            local: options?.local ?? false,
            ...errorUtil.errToObj(options?.message),
        });
    }
    date(message) {
        return this._addCheck({ kind: "date", message });
    }
    time(options) {
        if (typeof options === "string") {
            return this._addCheck({
                kind: "time",
                precision: null,
                message: options,
            });
        }
        return this._addCheck({
            kind: "time",
            precision: typeof options?.precision === "undefined" ? null : options?.precision,
            ...errorUtil.errToObj(options?.message),
        });
    }
    duration(message) {
        return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
        return this._addCheck({
            kind: "regex",
            regex: regex,
            ...errorUtil.errToObj(message),
        });
    }
    includes(value, options) {
        return this._addCheck({
            kind: "includes",
            value: value,
            position: options?.position,
            ...errorUtil.errToObj(options?.message),
        });
    }
    startsWith(value, message) {
        return this._addCheck({
            kind: "startsWith",
            value: value,
            ...errorUtil.errToObj(message),
        });
    }
    endsWith(value, message) {
        return this._addCheck({
            kind: "endsWith",
            value: value,
            ...errorUtil.errToObj(message),
        });
    }
    min(minLength, message) {
        return this._addCheck({
            kind: "min",
            value: minLength,
            ...errorUtil.errToObj(message),
        });
    }
    max(maxLength, message) {
        return this._addCheck({
            kind: "max",
            value: maxLength,
            ...errorUtil.errToObj(message),
        });
    }
    length(len, message) {
        return this._addCheck({
            kind: "length",
            value: len,
            ...errorUtil.errToObj(message),
        });
    }
    /**
     * Equivalent to `.min(1)`
     */
    nonempty(message) {
        return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, { kind: "trim" }],
        });
    }
    toLowerCase() {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, { kind: "toLowerCase" }],
        });
    }
    toUpperCase() {
        return new ZodString({
            ...this._def,
            checks: [...this._def.checks, { kind: "toUpperCase" }],
        });
    }
    get isDatetime() {
        return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
        return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
        return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
        return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
        return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
        return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
        return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
        return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
        return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
        return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
        return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
        return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isCIDR() {
        return !!this._def.checks.find((ch) => ch.kind === "cidr");
    }
    get isBase64() {
        return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get isBase64url() {
        // base64url encoding is a modification of base64 that can safely be used in URLs and filenames
        return !!this._def.checks.find((ch) => ch.kind === "base64url");
    }
    get minLength() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min;
    }
    get maxLength() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max;
    }
}
ZodString.create = (params) => {
    return new ZodString({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodString,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params),
    });
};
// https://stackoverflow.com/questions/3966484/why-does-modulus-operator-return-fractional-number-in-javascript/31711034#31711034
function floatSafeRemainder(val, step) {
    const valDecCount = (val.toString().split(".")[1] || "").length;
    const stepDecCount = (step.toString().split(".")[1] || "").length;
    const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
    const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
    const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
    return (valInt % stepInt) / 10 ** decCount;
}
class ZodNumber extends ZodType {
    constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
        this.step = this.multipleOf;
    }
    _parse(input) {
        if (this._def.coerce) {
            input.data = Number(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.number) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.number,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        let ctx = undefined;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
            if (check.kind === "int") {
                if (!util.isInteger(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.invalid_type,
                        expected: "integer",
                        received: "float",
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "min") {
                const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
                if (tooSmall) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        minimum: check.value,
                        type: "number",
                        inclusive: check.inclusive,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
                if (tooBig) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        maximum: check.value,
                        type: "number",
                        inclusive: check.inclusive,
                        exact: false,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "multipleOf") {
                if (floatSafeRemainder(input.data, check.value) !== 0) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.not_multiple_of,
                        multipleOf: check.value,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "finite") {
                if (!Number.isFinite(input.data)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.not_finite,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return { status: status.value, value: input.data };
    }
    gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
        return new ZodNumber({
            ...this._def,
            checks: [
                ...this._def.checks,
                {
                    kind,
                    value,
                    inclusive,
                    message: errorUtil.toString(message),
                },
            ],
        });
    }
    _addCheck(check) {
        return new ZodNumber({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    int(message) {
        return this._addCheck({
            kind: "int",
            message: errorUtil.toString(message),
        });
    }
    positive(message) {
        return this._addCheck({
            kind: "min",
            value: 0,
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    negative(message) {
        return this._addCheck({
            kind: "max",
            value: 0,
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    nonpositive(message) {
        return this._addCheck({
            kind: "max",
            value: 0,
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    nonnegative(message) {
        return this._addCheck({
            kind: "min",
            value: 0,
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    multipleOf(value, message) {
        return this._addCheck({
            kind: "multipleOf",
            value: value,
            message: errorUtil.toString(message),
        });
    }
    finite(message) {
        return this._addCheck({
            kind: "finite",
            message: errorUtil.toString(message),
        });
    }
    safe(message) {
        return this._addCheck({
            kind: "min",
            inclusive: true,
            value: Number.MIN_SAFE_INTEGER,
            message: errorUtil.toString(message),
        })._addCheck({
            kind: "max",
            inclusive: true,
            value: Number.MAX_SAFE_INTEGER,
            message: errorUtil.toString(message),
        });
    }
    get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min;
    }
    get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max;
    }
    get isInt() {
        return !!this._def.checks.find((ch) => ch.kind === "int" || (ch.kind === "multipleOf" && util.isInteger(ch.value)));
    }
    get isFinite() {
        let max = null;
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
                return true;
            }
            else if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
            else if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return Number.isFinite(min) && Number.isFinite(max);
    }
}
ZodNumber.create = (params) => {
    return new ZodNumber({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodNumber,
        coerce: params?.coerce || false,
        ...processCreateParams(params),
    });
};
class ZodBigInt extends ZodType {
    constructor() {
        super(...arguments);
        this.min = this.gte;
        this.max = this.lte;
    }
    _parse(input) {
        if (this._def.coerce) {
            try {
                input.data = BigInt(input.data);
            }
            catch {
                return this._getInvalidInput(input);
            }
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.bigint) {
            return this._getInvalidInput(input);
        }
        let ctx = undefined;
        const status = new ParseStatus();
        for (const check of this._def.checks) {
            if (check.kind === "min") {
                const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
                if (tooSmall) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        type: "bigint",
                        minimum: check.value,
                        inclusive: check.inclusive,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
                if (tooBig) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        type: "bigint",
                        maximum: check.value,
                        inclusive: check.inclusive,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "multipleOf") {
                if (input.data % check.value !== BigInt(0)) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.not_multiple_of,
                        multipleOf: check.value,
                        message: check.message,
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return { status: status.value, value: input.data };
    }
    _getInvalidInput(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.bigint,
            received: ctx.parsedType,
        });
        return INVALID;
    }
    gte(value, message) {
        return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
        return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
        return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
        return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
        return new ZodBigInt({
            ...this._def,
            checks: [
                ...this._def.checks,
                {
                    kind,
                    value,
                    inclusive,
                    message: errorUtil.toString(message),
                },
            ],
        });
    }
    _addCheck(check) {
        return new ZodBigInt({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    positive(message) {
        return this._addCheck({
            kind: "min",
            value: BigInt(0),
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    negative(message) {
        return this._addCheck({
            kind: "max",
            value: BigInt(0),
            inclusive: false,
            message: errorUtil.toString(message),
        });
    }
    nonpositive(message) {
        return this._addCheck({
            kind: "max",
            value: BigInt(0),
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    nonnegative(message) {
        return this._addCheck({
            kind: "min",
            value: BigInt(0),
            inclusive: true,
            message: errorUtil.toString(message),
        });
    }
    multipleOf(value, message) {
        return this._addCheck({
            kind: "multipleOf",
            value,
            message: errorUtil.toString(message),
        });
    }
    get minValue() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min;
    }
    get maxValue() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max;
    }
}
ZodBigInt.create = (params) => {
    return new ZodBigInt({
        checks: [],
        typeName: ZodFirstPartyTypeKind.ZodBigInt,
        coerce: params?.coerce ?? false,
        ...processCreateParams(params),
    });
};
class ZodBoolean extends ZodType {
    _parse(input) {
        if (this._def.coerce) {
            input.data = Boolean(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.boolean) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.boolean,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodBoolean.create = (params) => {
    return new ZodBoolean({
        typeName: ZodFirstPartyTypeKind.ZodBoolean,
        coerce: params?.coerce || false,
        ...processCreateParams(params),
    });
};
class ZodDate extends ZodType {
    _parse(input) {
        if (this._def.coerce) {
            input.data = new Date(input.data);
        }
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.date) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.date,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        if (Number.isNaN(input.data.getTime())) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_date,
            });
            return INVALID;
        }
        const status = new ParseStatus();
        let ctx = undefined;
        for (const check of this._def.checks) {
            if (check.kind === "min") {
                if (input.data.getTime() < check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_small,
                        message: check.message,
                        inclusive: true,
                        exact: false,
                        minimum: check.value,
                        type: "date",
                    });
                    status.dirty();
                }
            }
            else if (check.kind === "max") {
                if (input.data.getTime() > check.value) {
                    ctx = this._getOrReturnCtx(input, ctx);
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.too_big,
                        message: check.message,
                        inclusive: true,
                        exact: false,
                        maximum: check.value,
                        type: "date",
                    });
                    status.dirty();
                }
            }
            else {
                util.assertNever(check);
            }
        }
        return {
            status: status.value,
            value: new Date(input.data.getTime()),
        };
    }
    _addCheck(check) {
        return new ZodDate({
            ...this._def,
            checks: [...this._def.checks, check],
        });
    }
    min(minDate, message) {
        return this._addCheck({
            kind: "min",
            value: minDate.getTime(),
            message: errorUtil.toString(message),
        });
    }
    max(maxDate, message) {
        return this._addCheck({
            kind: "max",
            value: maxDate.getTime(),
            message: errorUtil.toString(message),
        });
    }
    get minDate() {
        let min = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "min") {
                if (min === null || ch.value > min)
                    min = ch.value;
            }
        }
        return min != null ? new Date(min) : null;
    }
    get maxDate() {
        let max = null;
        for (const ch of this._def.checks) {
            if (ch.kind === "max") {
                if (max === null || ch.value < max)
                    max = ch.value;
            }
        }
        return max != null ? new Date(max) : null;
    }
}
ZodDate.create = (params) => {
    return new ZodDate({
        checks: [],
        coerce: params?.coerce || false,
        typeName: ZodFirstPartyTypeKind.ZodDate,
        ...processCreateParams(params),
    });
};
class ZodSymbol extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.symbol) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.symbol,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodSymbol.create = (params) => {
    return new ZodSymbol({
        typeName: ZodFirstPartyTypeKind.ZodSymbol,
        ...processCreateParams(params),
    });
};
class ZodUndefined extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.undefined,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodUndefined.create = (params) => {
    return new ZodUndefined({
        typeName: ZodFirstPartyTypeKind.ZodUndefined,
        ...processCreateParams(params),
    });
};
class ZodNull extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.null) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.null,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodNull.create = (params) => {
    return new ZodNull({
        typeName: ZodFirstPartyTypeKind.ZodNull,
        ...processCreateParams(params),
    });
};
class ZodAny extends ZodType {
    constructor() {
        super(...arguments);
        // to prevent instances of other classes from extending ZodAny. this causes issues with catchall in ZodObject.
        this._any = true;
    }
    _parse(input) {
        return OK(input.data);
    }
}
ZodAny.create = (params) => {
    return new ZodAny({
        typeName: ZodFirstPartyTypeKind.ZodAny,
        ...processCreateParams(params),
    });
};
class ZodUnknown extends ZodType {
    constructor() {
        super(...arguments);
        // required
        this._unknown = true;
    }
    _parse(input) {
        return OK(input.data);
    }
}
ZodUnknown.create = (params) => {
    return new ZodUnknown({
        typeName: ZodFirstPartyTypeKind.ZodUnknown,
        ...processCreateParams(params),
    });
};
class ZodNever extends ZodType {
    _parse(input) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: ZodParsedType.never,
            received: ctx.parsedType,
        });
        return INVALID;
    }
}
ZodNever.create = (params) => {
    return new ZodNever({
        typeName: ZodFirstPartyTypeKind.ZodNever,
        ...processCreateParams(params),
    });
};
class ZodVoid extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.undefined) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.void,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return OK(input.data);
    }
}
ZodVoid.create = (params) => {
    return new ZodVoid({
        typeName: ZodFirstPartyTypeKind.ZodVoid,
        ...processCreateParams(params),
    });
};
class ZodArray extends ZodType {
    _parse(input) {
        const { ctx, status } = this._processInputParams(input);
        const def = this._def;
        if (ctx.parsedType !== ZodParsedType.array) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.array,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        if (def.exactLength !== null) {
            const tooBig = ctx.data.length > def.exactLength.value;
            const tooSmall = ctx.data.length < def.exactLength.value;
            if (tooBig || tooSmall) {
                addIssueToContext(ctx, {
                    code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
                    minimum: (tooSmall ? def.exactLength.value : undefined),
                    maximum: (tooBig ? def.exactLength.value : undefined),
                    type: "array",
                    inclusive: true,
                    exact: true,
                    message: def.exactLength.message,
                });
                status.dirty();
            }
        }
        if (def.minLength !== null) {
            if (ctx.data.length < def.minLength.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_small,
                    minimum: def.minLength.value,
                    type: "array",
                    inclusive: true,
                    exact: false,
                    message: def.minLength.message,
                });
                status.dirty();
            }
        }
        if (def.maxLength !== null) {
            if (ctx.data.length > def.maxLength.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_big,
                    maximum: def.maxLength.value,
                    type: "array",
                    inclusive: true,
                    exact: false,
                    message: def.maxLength.message,
                });
                status.dirty();
            }
        }
        if (ctx.common.async) {
            return Promise.all([...ctx.data].map((item, i) => {
                return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
            })).then((result) => {
                return ParseStatus.mergeArray(status, result);
            });
        }
        const result = [...ctx.data].map((item, i) => {
            return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        });
        return ParseStatus.mergeArray(status, result);
    }
    get element() {
        return this._def.type;
    }
    min(minLength, message) {
        return new ZodArray({
            ...this._def,
            minLength: { value: minLength, message: errorUtil.toString(message) },
        });
    }
    max(maxLength, message) {
        return new ZodArray({
            ...this._def,
            maxLength: { value: maxLength, message: errorUtil.toString(message) },
        });
    }
    length(len, message) {
        return new ZodArray({
            ...this._def,
            exactLength: { value: len, message: errorUtil.toString(message) },
        });
    }
    nonempty(message) {
        return this.min(1, message);
    }
}
ZodArray.create = (schema, params) => {
    return new ZodArray({
        type: schema,
        minLength: null,
        maxLength: null,
        exactLength: null,
        typeName: ZodFirstPartyTypeKind.ZodArray,
        ...processCreateParams(params),
    });
};
function deepPartialify(schema) {
    if (schema instanceof ZodObject) {
        const newShape = {};
        for (const key in schema.shape) {
            const fieldSchema = schema.shape[key];
            newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
        }
        return new ZodObject({
            ...schema._def,
            shape: () => newShape,
        });
    }
    else if (schema instanceof ZodArray) {
        return new ZodArray({
            ...schema._def,
            type: deepPartialify(schema.element),
        });
    }
    else if (schema instanceof ZodOptional) {
        return ZodOptional.create(deepPartialify(schema.unwrap()));
    }
    else if (schema instanceof ZodNullable) {
        return ZodNullable.create(deepPartialify(schema.unwrap()));
    }
    else if (schema instanceof ZodTuple) {
        return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
    }
    else {
        return schema;
    }
}
class ZodObject extends ZodType {
    constructor() {
        super(...arguments);
        this._cached = null;
        /**
         * @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
         * If you want to pass through unknown properties, use `.passthrough()` instead.
         */
        this.nonstrict = this.passthrough;
        // extend<
        //   Augmentation extends ZodRawShape,
        //   NewOutput extends util.flatten<{
        //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
        //       ? Augmentation[k]["_output"]
        //       : k extends keyof Output
        //       ? Output[k]
        //       : never;
        //   }>,
        //   NewInput extends util.flatten<{
        //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
        //       ? Augmentation[k]["_input"]
        //       : k extends keyof Input
        //       ? Input[k]
        //       : never;
        //   }>
        // >(
        //   augmentation: Augmentation
        // ): ZodObject<
        //   extendShape<T, Augmentation>,
        //   UnknownKeys,
        //   Catchall,
        //   NewOutput,
        //   NewInput
        // > {
        //   return new ZodObject({
        //     ...this._def,
        //     shape: () => ({
        //       ...this._def.shape(),
        //       ...augmentation,
        //     }),
        //   }) as any;
        // }
        /**
         * @deprecated Use `.extend` instead
         *  */
        this.augment = this.extend;
    }
    _getCached() {
        if (this._cached !== null)
            return this._cached;
        const shape = this._def.shape();
        const keys = util.objectKeys(shape);
        this._cached = { shape, keys };
        return this._cached;
    }
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.object) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.object,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const { status, ctx } = this._processInputParams(input);
        const { shape, keys: shapeKeys } = this._getCached();
        const extraKeys = [];
        if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
            for (const key in ctx.data) {
                if (!shapeKeys.includes(key)) {
                    extraKeys.push(key);
                }
            }
        }
        const pairs = [];
        for (const key of shapeKeys) {
            const keyValidator = shape[key];
            const value = ctx.data[key];
            pairs.push({
                key: { status: "valid", value: key },
                value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
                alwaysSet: key in ctx.data,
            });
        }
        if (this._def.catchall instanceof ZodNever) {
            const unknownKeys = this._def.unknownKeys;
            if (unknownKeys === "passthrough") {
                for (const key of extraKeys) {
                    pairs.push({
                        key: { status: "valid", value: key },
                        value: { status: "valid", value: ctx.data[key] },
                    });
                }
            }
            else if (unknownKeys === "strict") {
                if (extraKeys.length > 0) {
                    addIssueToContext(ctx, {
                        code: ZodIssueCode.unrecognized_keys,
                        keys: extraKeys,
                    });
                    status.dirty();
                }
            }
            else if (unknownKeys === "strip") ;
            else {
                throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
            }
        }
        else {
            // run catchall validation
            const catchall = this._def.catchall;
            for (const key of extraKeys) {
                const value = ctx.data[key];
                pairs.push({
                    key: { status: "valid", value: key },
                    value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key) //, ctx.child(key), value, getParsedType(value)
                    ),
                    alwaysSet: key in ctx.data,
                });
            }
        }
        if (ctx.common.async) {
            return Promise.resolve()
                .then(async () => {
                const syncPairs = [];
                for (const pair of pairs) {
                    const key = await pair.key;
                    const value = await pair.value;
                    syncPairs.push({
                        key,
                        value,
                        alwaysSet: pair.alwaysSet,
                    });
                }
                return syncPairs;
            })
                .then((syncPairs) => {
                return ParseStatus.mergeObjectSync(status, syncPairs);
            });
        }
        else {
            return ParseStatus.mergeObjectSync(status, pairs);
        }
    }
    get shape() {
        return this._def.shape();
    }
    strict(message) {
        errorUtil.errToObj;
        return new ZodObject({
            ...this._def,
            unknownKeys: "strict",
            ...(message !== undefined
                ? {
                    errorMap: (issue, ctx) => {
                        const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
                        if (issue.code === "unrecognized_keys")
                            return {
                                message: errorUtil.errToObj(message).message ?? defaultError,
                            };
                        return {
                            message: defaultError,
                        };
                    },
                }
                : {}),
        });
    }
    strip() {
        return new ZodObject({
            ...this._def,
            unknownKeys: "strip",
        });
    }
    passthrough() {
        return new ZodObject({
            ...this._def,
            unknownKeys: "passthrough",
        });
    }
    // const AugmentFactory =
    //   <Def extends ZodObjectDef>(def: Def) =>
    //   <Augmentation extends ZodRawShape>(
    //     augmentation: Augmentation
    //   ): ZodObject<
    //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
    //     Def["unknownKeys"],
    //     Def["catchall"]
    //   > => {
    //     return new ZodObject({
    //       ...def,
    //       shape: () => ({
    //         ...def.shape(),
    //         ...augmentation,
    //       }),
    //     }) as any;
    //   };
    extend(augmentation) {
        return new ZodObject({
            ...this._def,
            shape: () => ({
                ...this._def.shape(),
                ...augmentation,
            }),
        });
    }
    /**
     * Prior to zod@1.0.12 there was a bug in the
     * inferred type of merged objects. Please
     * upgrade if you are experiencing issues.
     */
    merge(merging) {
        const merged = new ZodObject({
            unknownKeys: merging._def.unknownKeys,
            catchall: merging._def.catchall,
            shape: () => ({
                ...this._def.shape(),
                ...merging._def.shape(),
            }),
            typeName: ZodFirstPartyTypeKind.ZodObject,
        });
        return merged;
    }
    // merge<
    //   Incoming extends AnyZodObject,
    //   Augmentation extends Incoming["shape"],
    //   NewOutput extends {
    //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
    //       ? Augmentation[k]["_output"]
    //       : k extends keyof Output
    //       ? Output[k]
    //       : never;
    //   },
    //   NewInput extends {
    //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
    //       ? Augmentation[k]["_input"]
    //       : k extends keyof Input
    //       ? Input[k]
    //       : never;
    //   }
    // >(
    //   merging: Incoming
    // ): ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"],
    //   NewOutput,
    //   NewInput
    // > {
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    setKey(key, schema) {
        return this.augment({ [key]: schema });
    }
    // merge<Incoming extends AnyZodObject>(
    //   merging: Incoming
    // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
    // ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"]
    // > {
    //   // const mergedShape = objectUtil.mergeShapes(
    //   //   this._def.shape(),
    //   //   merging._def.shape()
    //   // );
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    catchall(index) {
        return new ZodObject({
            ...this._def,
            catchall: index,
        });
    }
    pick(mask) {
        const shape = {};
        for (const key of util.objectKeys(mask)) {
            if (mask[key] && this.shape[key]) {
                shape[key] = this.shape[key];
            }
        }
        return new ZodObject({
            ...this._def,
            shape: () => shape,
        });
    }
    omit(mask) {
        const shape = {};
        for (const key of util.objectKeys(this.shape)) {
            if (!mask[key]) {
                shape[key] = this.shape[key];
            }
        }
        return new ZodObject({
            ...this._def,
            shape: () => shape,
        });
    }
    /**
     * @deprecated
     */
    deepPartial() {
        return deepPartialify(this);
    }
    partial(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
            const fieldSchema = this.shape[key];
            if (mask && !mask[key]) {
                newShape[key] = fieldSchema;
            }
            else {
                newShape[key] = fieldSchema.optional();
            }
        }
        return new ZodObject({
            ...this._def,
            shape: () => newShape,
        });
    }
    required(mask) {
        const newShape = {};
        for (const key of util.objectKeys(this.shape)) {
            if (mask && !mask[key]) {
                newShape[key] = this.shape[key];
            }
            else {
                const fieldSchema = this.shape[key];
                let newField = fieldSchema;
                while (newField instanceof ZodOptional) {
                    newField = newField._def.innerType;
                }
                newShape[key] = newField;
            }
        }
        return new ZodObject({
            ...this._def,
            shape: () => newShape,
        });
    }
    keyof() {
        return createZodEnum(util.objectKeys(this.shape));
    }
}
ZodObject.create = (shape, params) => {
    return new ZodObject({
        shape: () => shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params),
    });
};
ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
        shape: () => shape,
        unknownKeys: "strict",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params),
    });
};
ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
        shape,
        unknownKeys: "strip",
        catchall: ZodNever.create(),
        typeName: ZodFirstPartyTypeKind.ZodObject,
        ...processCreateParams(params),
    });
};
class ZodUnion extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        const options = this._def.options;
        function handleResults(results) {
            // return first issue-free validation if it exists
            for (const result of results) {
                if (result.result.status === "valid") {
                    return result.result;
                }
            }
            for (const result of results) {
                if (result.result.status === "dirty") {
                    // add issues from dirty option
                    ctx.common.issues.push(...result.ctx.common.issues);
                    return result.result;
                }
            }
            // return invalid
            const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_union,
                unionErrors,
            });
            return INVALID;
        }
        if (ctx.common.async) {
            return Promise.all(options.map(async (option) => {
                const childCtx = {
                    ...ctx,
                    common: {
                        ...ctx.common,
                        issues: [],
                    },
                    parent: null,
                };
                return {
                    result: await option._parseAsync({
                        data: ctx.data,
                        path: ctx.path,
                        parent: childCtx,
                    }),
                    ctx: childCtx,
                };
            })).then(handleResults);
        }
        else {
            let dirty = undefined;
            const issues = [];
            for (const option of options) {
                const childCtx = {
                    ...ctx,
                    common: {
                        ...ctx.common,
                        issues: [],
                    },
                    parent: null,
                };
                const result = option._parseSync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: childCtx,
                });
                if (result.status === "valid") {
                    return result;
                }
                else if (result.status === "dirty" && !dirty) {
                    dirty = { result, ctx: childCtx };
                }
                if (childCtx.common.issues.length) {
                    issues.push(childCtx.common.issues);
                }
            }
            if (dirty) {
                ctx.common.issues.push(...dirty.ctx.common.issues);
                return dirty.result;
            }
            const unionErrors = issues.map((issues) => new ZodError(issues));
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_union,
                unionErrors,
            });
            return INVALID;
        }
    }
    get options() {
        return this._def.options;
    }
}
ZodUnion.create = (types, params) => {
    return new ZodUnion({
        options: types,
        typeName: ZodFirstPartyTypeKind.ZodUnion,
        ...processCreateParams(params),
    });
};
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
//////////                                 //////////
//////////      ZodDiscriminatedUnion      //////////
//////////                                 //////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
const getDiscriminator = (type) => {
    if (type instanceof ZodLazy) {
        return getDiscriminator(type.schema);
    }
    else if (type instanceof ZodEffects) {
        return getDiscriminator(type.innerType());
    }
    else if (type instanceof ZodLiteral) {
        return [type.value];
    }
    else if (type instanceof ZodEnum) {
        return type.options;
    }
    else if (type instanceof ZodNativeEnum) {
        // eslint-disable-next-line ban/ban
        return util.objectValues(type.enum);
    }
    else if (type instanceof ZodDefault) {
        return getDiscriminator(type._def.innerType);
    }
    else if (type instanceof ZodUndefined) {
        return [undefined];
    }
    else if (type instanceof ZodNull) {
        return [null];
    }
    else if (type instanceof ZodOptional) {
        return [undefined, ...getDiscriminator(type.unwrap())];
    }
    else if (type instanceof ZodNullable) {
        return [null, ...getDiscriminator(type.unwrap())];
    }
    else if (type instanceof ZodBranded) {
        return getDiscriminator(type.unwrap());
    }
    else if (type instanceof ZodReadonly) {
        return getDiscriminator(type.unwrap());
    }
    else if (type instanceof ZodCatch) {
        return getDiscriminator(type._def.innerType);
    }
    else {
        return [];
    }
};
class ZodDiscriminatedUnion extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.object,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const discriminator = this.discriminator;
        const discriminatorValue = ctx.data[discriminator];
        const option = this.optionsMap.get(discriminatorValue);
        if (!option) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_union_discriminator,
                options: Array.from(this.optionsMap.keys()),
                path: [discriminator],
            });
            return INVALID;
        }
        if (ctx.common.async) {
            return option._parseAsync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            });
        }
        else {
            return option._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            });
        }
    }
    get discriminator() {
        return this._def.discriminator;
    }
    get options() {
        return this._def.options;
    }
    get optionsMap() {
        return this._def.optionsMap;
    }
    /**
     * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
     * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
     * have a different value for each object in the union.
     * @param discriminator the name of the discriminator property
     * @param types an array of object schemas
     * @param params
     */
    static create(discriminator, options, params) {
        // Get all the valid discriminator values
        const optionsMap = new Map();
        // try {
        for (const type of options) {
            const discriminatorValues = getDiscriminator(type.shape[discriminator]);
            if (!discriminatorValues.length) {
                throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
            }
            for (const value of discriminatorValues) {
                if (optionsMap.has(value)) {
                    throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
                }
                optionsMap.set(value, type);
            }
        }
        return new ZodDiscriminatedUnion({
            typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
            discriminator,
            options,
            optionsMap,
            ...processCreateParams(params),
        });
    }
}
function mergeValues(a, b) {
    const aType = getParsedType(a);
    const bType = getParsedType(b);
    if (a === b) {
        return { valid: true, data: a };
    }
    else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
        const bKeys = util.objectKeys(b);
        const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
        const newObj = { ...a, ...b };
        for (const key of sharedKeys) {
            const sharedValue = mergeValues(a[key], b[key]);
            if (!sharedValue.valid) {
                return { valid: false };
            }
            newObj[key] = sharedValue.data;
        }
        return { valid: true, data: newObj };
    }
    else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
        if (a.length !== b.length) {
            return { valid: false };
        }
        const newArray = [];
        for (let index = 0; index < a.length; index++) {
            const itemA = a[index];
            const itemB = b[index];
            const sharedValue = mergeValues(itemA, itemB);
            if (!sharedValue.valid) {
                return { valid: false };
            }
            newArray.push(sharedValue.data);
        }
        return { valid: true, data: newArray };
    }
    else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
        return { valid: true, data: a };
    }
    else {
        return { valid: false };
    }
}
class ZodIntersection extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const handleParsed = (parsedLeft, parsedRight) => {
            if (isAborted(parsedLeft) || isAborted(parsedRight)) {
                return INVALID;
            }
            const merged = mergeValues(parsedLeft.value, parsedRight.value);
            if (!merged.valid) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.invalid_intersection_types,
                });
                return INVALID;
            }
            if (isDirty(parsedLeft) || isDirty(parsedRight)) {
                status.dirty();
            }
            return { status: status.value, value: merged.data };
        };
        if (ctx.common.async) {
            return Promise.all([
                this._def.left._parseAsync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                }),
                this._def.right._parseAsync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                }),
            ]).then(([left, right]) => handleParsed(left, right));
        }
        else {
            return handleParsed(this._def.left._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            }), this._def.right._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            }));
        }
    }
}
ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
        left: left,
        right: right,
        typeName: ZodFirstPartyTypeKind.ZodIntersection,
        ...processCreateParams(params),
    });
};
// type ZodTupleItems = [ZodTypeAny, ...ZodTypeAny[]];
class ZodTuple extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.array) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.array,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        if (ctx.data.length < this._def.items.length) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: this._def.items.length,
                inclusive: true,
                exact: false,
                type: "array",
            });
            return INVALID;
        }
        const rest = this._def.rest;
        if (!rest && ctx.data.length > this._def.items.length) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: this._def.items.length,
                inclusive: true,
                exact: false,
                type: "array",
            });
            status.dirty();
        }
        const items = [...ctx.data]
            .map((item, itemIndex) => {
            const schema = this._def.items[itemIndex] || this._def.rest;
            if (!schema)
                return null;
            return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
        })
            .filter((x) => !!x); // filter nulls
        if (ctx.common.async) {
            return Promise.all(items).then((results) => {
                return ParseStatus.mergeArray(status, results);
            });
        }
        else {
            return ParseStatus.mergeArray(status, items);
        }
    }
    get items() {
        return this._def.items;
    }
    rest(rest) {
        return new ZodTuple({
            ...this._def,
            rest,
        });
    }
}
ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
        throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
        items: schemas,
        typeName: ZodFirstPartyTypeKind.ZodTuple,
        rest: null,
        ...processCreateParams(params),
    });
};
class ZodRecord extends ZodType {
    get keySchema() {
        return this._def.keyType;
    }
    get valueSchema() {
        return this._def.valueType;
    }
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.object) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.object,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const pairs = [];
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        for (const key in ctx.data) {
            pairs.push({
                key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
                value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
                alwaysSet: key in ctx.data,
            });
        }
        if (ctx.common.async) {
            return ParseStatus.mergeObjectAsync(status, pairs);
        }
        else {
            return ParseStatus.mergeObjectSync(status, pairs);
        }
    }
    get element() {
        return this._def.valueType;
    }
    static create(first, second, third) {
        if (second instanceof ZodType) {
            return new ZodRecord({
                keyType: first,
                valueType: second,
                typeName: ZodFirstPartyTypeKind.ZodRecord,
                ...processCreateParams(third),
            });
        }
        return new ZodRecord({
            keyType: ZodString.create(),
            valueType: first,
            typeName: ZodFirstPartyTypeKind.ZodRecord,
            ...processCreateParams(second),
        });
    }
}
class ZodMap extends ZodType {
    get keySchema() {
        return this._def.keyType;
    }
    get valueSchema() {
        return this._def.valueType;
    }
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.map) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.map,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const keyType = this._def.keyType;
        const valueType = this._def.valueType;
        const pairs = [...ctx.data.entries()].map(([key, value], index) => {
            return {
                key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
                value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"])),
            };
        });
        if (ctx.common.async) {
            const finalMap = new Map();
            return Promise.resolve().then(async () => {
                for (const pair of pairs) {
                    const key = await pair.key;
                    const value = await pair.value;
                    if (key.status === "aborted" || value.status === "aborted") {
                        return INVALID;
                    }
                    if (key.status === "dirty" || value.status === "dirty") {
                        status.dirty();
                    }
                    finalMap.set(key.value, value.value);
                }
                return { status: status.value, value: finalMap };
            });
        }
        else {
            const finalMap = new Map();
            for (const pair of pairs) {
                const key = pair.key;
                const value = pair.value;
                if (key.status === "aborted" || value.status === "aborted") {
                    return INVALID;
                }
                if (key.status === "dirty" || value.status === "dirty") {
                    status.dirty();
                }
                finalMap.set(key.value, value.value);
            }
            return { status: status.value, value: finalMap };
        }
    }
}
ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
        valueType,
        keyType,
        typeName: ZodFirstPartyTypeKind.ZodMap,
        ...processCreateParams(params),
    });
};
class ZodSet extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.set) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.set,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const def = this._def;
        if (def.minSize !== null) {
            if (ctx.data.size < def.minSize.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_small,
                    minimum: def.minSize.value,
                    type: "set",
                    inclusive: true,
                    exact: false,
                    message: def.minSize.message,
                });
                status.dirty();
            }
        }
        if (def.maxSize !== null) {
            if (ctx.data.size > def.maxSize.value) {
                addIssueToContext(ctx, {
                    code: ZodIssueCode.too_big,
                    maximum: def.maxSize.value,
                    type: "set",
                    inclusive: true,
                    exact: false,
                    message: def.maxSize.message,
                });
                status.dirty();
            }
        }
        const valueType = this._def.valueType;
        function finalizeSet(elements) {
            const parsedSet = new Set();
            for (const element of elements) {
                if (element.status === "aborted")
                    return INVALID;
                if (element.status === "dirty")
                    status.dirty();
                parsedSet.add(element.value);
            }
            return { status: status.value, value: parsedSet };
        }
        const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
        if (ctx.common.async) {
            return Promise.all(elements).then((elements) => finalizeSet(elements));
        }
        else {
            return finalizeSet(elements);
        }
    }
    min(minSize, message) {
        return new ZodSet({
            ...this._def,
            minSize: { value: minSize, message: errorUtil.toString(message) },
        });
    }
    max(maxSize, message) {
        return new ZodSet({
            ...this._def,
            maxSize: { value: maxSize, message: errorUtil.toString(message) },
        });
    }
    size(size, message) {
        return this.min(size, message).max(size, message);
    }
    nonempty(message) {
        return this.min(1, message);
    }
}
ZodSet.create = (valueType, params) => {
    return new ZodSet({
        valueType,
        minSize: null,
        maxSize: null,
        typeName: ZodFirstPartyTypeKind.ZodSet,
        ...processCreateParams(params),
    });
};
class ZodLazy extends ZodType {
    get schema() {
        return this._def.getter();
    }
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        const lazySchema = this._def.getter();
        return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
}
ZodLazy.create = (getter, params) => {
    return new ZodLazy({
        getter: getter,
        typeName: ZodFirstPartyTypeKind.ZodLazy,
        ...processCreateParams(params),
    });
};
class ZodLiteral extends ZodType {
    _parse(input) {
        if (input.data !== this._def.value) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                received: ctx.data,
                code: ZodIssueCode.invalid_literal,
                expected: this._def.value,
            });
            return INVALID;
        }
        return { status: "valid", value: input.data };
    }
    get value() {
        return this._def.value;
    }
}
ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
        value: value,
        typeName: ZodFirstPartyTypeKind.ZodLiteral,
        ...processCreateParams(params),
    });
};
function createZodEnum(values, params) {
    return new ZodEnum({
        values,
        typeName: ZodFirstPartyTypeKind.ZodEnum,
        ...processCreateParams(params),
    });
}
class ZodEnum extends ZodType {
    _parse(input) {
        if (typeof input.data !== "string") {
            const ctx = this._getOrReturnCtx(input);
            const expectedValues = this._def.values;
            addIssueToContext(ctx, {
                expected: util.joinValues(expectedValues),
                received: ctx.parsedType,
                code: ZodIssueCode.invalid_type,
            });
            return INVALID;
        }
        if (!this._cache) {
            this._cache = new Set(this._def.values);
        }
        if (!this._cache.has(input.data)) {
            const ctx = this._getOrReturnCtx(input);
            const expectedValues = this._def.values;
            addIssueToContext(ctx, {
                received: ctx.data,
                code: ZodIssueCode.invalid_enum_value,
                options: expectedValues,
            });
            return INVALID;
        }
        return OK(input.data);
    }
    get options() {
        return this._def.values;
    }
    get enum() {
        const enumValues = {};
        for (const val of this._def.values) {
            enumValues[val] = val;
        }
        return enumValues;
    }
    get Values() {
        const enumValues = {};
        for (const val of this._def.values) {
            enumValues[val] = val;
        }
        return enumValues;
    }
    get Enum() {
        const enumValues = {};
        for (const val of this._def.values) {
            enumValues[val] = val;
        }
        return enumValues;
    }
    extract(values, newDef = this._def) {
        return ZodEnum.create(values, {
            ...this._def,
            ...newDef,
        });
    }
    exclude(values, newDef = this._def) {
        return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
            ...this._def,
            ...newDef,
        });
    }
}
ZodEnum.create = createZodEnum;
class ZodNativeEnum extends ZodType {
    _parse(input) {
        const nativeEnumValues = util.getValidEnumValues(this._def.values);
        const ctx = this._getOrReturnCtx(input);
        if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
            const expectedValues = util.objectValues(nativeEnumValues);
            addIssueToContext(ctx, {
                expected: util.joinValues(expectedValues),
                received: ctx.parsedType,
                code: ZodIssueCode.invalid_type,
            });
            return INVALID;
        }
        if (!this._cache) {
            this._cache = new Set(util.getValidEnumValues(this._def.values));
        }
        if (!this._cache.has(input.data)) {
            const expectedValues = util.objectValues(nativeEnumValues);
            addIssueToContext(ctx, {
                received: ctx.data,
                code: ZodIssueCode.invalid_enum_value,
                options: expectedValues,
            });
            return INVALID;
        }
        return OK(input.data);
    }
    get enum() {
        return this._def.values;
    }
}
ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
        values: values,
        typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
        ...processCreateParams(params),
    });
};
class ZodPromise extends ZodType {
    unwrap() {
        return this._def.type;
    }
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.promise,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
        return OK(promisified.then((data) => {
            return this._def.type.parseAsync(data, {
                path: ctx.path,
                errorMap: ctx.common.contextualErrorMap,
            });
        }));
    }
}
ZodPromise.create = (schema, params) => {
    return new ZodPromise({
        type: schema,
        typeName: ZodFirstPartyTypeKind.ZodPromise,
        ...processCreateParams(params),
    });
};
class ZodEffects extends ZodType {
    innerType() {
        return this._def.schema;
    }
    sourceType() {
        return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects
            ? this._def.schema.sourceType()
            : this._def.schema;
    }
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        const effect = this._def.effect || null;
        const checkCtx = {
            addIssue: (arg) => {
                addIssueToContext(ctx, arg);
                if (arg.fatal) {
                    status.abort();
                }
                else {
                    status.dirty();
                }
            },
            get path() {
                return ctx.path;
            },
        };
        checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
        if (effect.type === "preprocess") {
            const processed = effect.transform(ctx.data, checkCtx);
            if (ctx.common.async) {
                return Promise.resolve(processed).then(async (processed) => {
                    if (status.value === "aborted")
                        return INVALID;
                    const result = await this._def.schema._parseAsync({
                        data: processed,
                        path: ctx.path,
                        parent: ctx,
                    });
                    if (result.status === "aborted")
                        return INVALID;
                    if (result.status === "dirty")
                        return DIRTY(result.value);
                    if (status.value === "dirty")
                        return DIRTY(result.value);
                    return result;
                });
            }
            else {
                if (status.value === "aborted")
                    return INVALID;
                const result = this._def.schema._parseSync({
                    data: processed,
                    path: ctx.path,
                    parent: ctx,
                });
                if (result.status === "aborted")
                    return INVALID;
                if (result.status === "dirty")
                    return DIRTY(result.value);
                if (status.value === "dirty")
                    return DIRTY(result.value);
                return result;
            }
        }
        if (effect.type === "refinement") {
            const executeRefinement = (acc) => {
                const result = effect.refinement(acc, checkCtx);
                if (ctx.common.async) {
                    return Promise.resolve(result);
                }
                if (result instanceof Promise) {
                    throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
                }
                return acc;
            };
            if (ctx.common.async === false) {
                const inner = this._def.schema._parseSync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                });
                if (inner.status === "aborted")
                    return INVALID;
                if (inner.status === "dirty")
                    status.dirty();
                // return value is ignored
                executeRefinement(inner.value);
                return { status: status.value, value: inner.value };
            }
            else {
                return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
                    if (inner.status === "aborted")
                        return INVALID;
                    if (inner.status === "dirty")
                        status.dirty();
                    return executeRefinement(inner.value).then(() => {
                        return { status: status.value, value: inner.value };
                    });
                });
            }
        }
        if (effect.type === "transform") {
            if (ctx.common.async === false) {
                const base = this._def.schema._parseSync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                });
                if (!isValid(base))
                    return INVALID;
                const result = effect.transform(base.value, checkCtx);
                if (result instanceof Promise) {
                    throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
                }
                return { status: status.value, value: result };
            }
            else {
                return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
                    if (!isValid(base))
                        return INVALID;
                    return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
                        status: status.value,
                        value: result,
                    }));
                });
            }
        }
        util.assertNever(effect);
    }
}
ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
        schema,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect,
        ...processCreateParams(params),
    });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
        schema,
        effect: { type: "preprocess", transform: preprocess },
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        ...processCreateParams(params),
    });
};
class ZodOptional extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.undefined) {
            return OK(undefined);
        }
        return this._def.innerType._parse(input);
    }
    unwrap() {
        return this._def.innerType;
    }
}
ZodOptional.create = (type, params) => {
    return new ZodOptional({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodOptional,
        ...processCreateParams(params),
    });
};
class ZodNullable extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType === ZodParsedType.null) {
            return OK(null);
        }
        return this._def.innerType._parse(input);
    }
    unwrap() {
        return this._def.innerType;
    }
}
ZodNullable.create = (type, params) => {
    return new ZodNullable({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodNullable,
        ...processCreateParams(params),
    });
};
class ZodDefault extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        let data = ctx.data;
        if (ctx.parsedType === ZodParsedType.undefined) {
            data = this._def.defaultValue();
        }
        return this._def.innerType._parse({
            data,
            path: ctx.path,
            parent: ctx,
        });
    }
    removeDefault() {
        return this._def.innerType;
    }
}
ZodDefault.create = (type, params) => {
    return new ZodDefault({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodDefault,
        defaultValue: typeof params.default === "function" ? params.default : () => params.default,
        ...processCreateParams(params),
    });
};
class ZodCatch extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        // newCtx is used to not collect issues from inner types in ctx
        const newCtx = {
            ...ctx,
            common: {
                ...ctx.common,
                issues: [],
            },
        };
        const result = this._def.innerType._parse({
            data: newCtx.data,
            path: newCtx.path,
            parent: {
                ...newCtx,
            },
        });
        if (isAsync(result)) {
            return result.then((result) => {
                return {
                    status: "valid",
                    value: result.status === "valid"
                        ? result.value
                        : this._def.catchValue({
                            get error() {
                                return new ZodError(newCtx.common.issues);
                            },
                            input: newCtx.data,
                        }),
                };
            });
        }
        else {
            return {
                status: "valid",
                value: result.status === "valid"
                    ? result.value
                    : this._def.catchValue({
                        get error() {
                            return new ZodError(newCtx.common.issues);
                        },
                        input: newCtx.data,
                    }),
            };
        }
    }
    removeCatch() {
        return this._def.innerType;
    }
}
ZodCatch.create = (type, params) => {
    return new ZodCatch({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodCatch,
        catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
        ...processCreateParams(params),
    });
};
class ZodNaN extends ZodType {
    _parse(input) {
        const parsedType = this._getType(input);
        if (parsedType !== ZodParsedType.nan) {
            const ctx = this._getOrReturnCtx(input);
            addIssueToContext(ctx, {
                code: ZodIssueCode.invalid_type,
                expected: ZodParsedType.nan,
                received: ctx.parsedType,
            });
            return INVALID;
        }
        return { status: "valid", value: input.data };
    }
}
ZodNaN.create = (params) => {
    return new ZodNaN({
        typeName: ZodFirstPartyTypeKind.ZodNaN,
        ...processCreateParams(params),
    });
};
class ZodBranded extends ZodType {
    _parse(input) {
        const { ctx } = this._processInputParams(input);
        const data = ctx.data;
        return this._def.type._parse({
            data,
            path: ctx.path,
            parent: ctx,
        });
    }
    unwrap() {
        return this._def.type;
    }
}
class ZodPipeline extends ZodType {
    _parse(input) {
        const { status, ctx } = this._processInputParams(input);
        if (ctx.common.async) {
            const handleAsync = async () => {
                const inResult = await this._def.in._parseAsync({
                    data: ctx.data,
                    path: ctx.path,
                    parent: ctx,
                });
                if (inResult.status === "aborted")
                    return INVALID;
                if (inResult.status === "dirty") {
                    status.dirty();
                    return DIRTY(inResult.value);
                }
                else {
                    return this._def.out._parseAsync({
                        data: inResult.value,
                        path: ctx.path,
                        parent: ctx,
                    });
                }
            };
            return handleAsync();
        }
        else {
            const inResult = this._def.in._parseSync({
                data: ctx.data,
                path: ctx.path,
                parent: ctx,
            });
            if (inResult.status === "aborted")
                return INVALID;
            if (inResult.status === "dirty") {
                status.dirty();
                return {
                    status: "dirty",
                    value: inResult.value,
                };
            }
            else {
                return this._def.out._parseSync({
                    data: inResult.value,
                    path: ctx.path,
                    parent: ctx,
                });
            }
        }
    }
    static create(a, b) {
        return new ZodPipeline({
            in: a,
            out: b,
            typeName: ZodFirstPartyTypeKind.ZodPipeline,
        });
    }
}
class ZodReadonly extends ZodType {
    _parse(input) {
        const result = this._def.innerType._parse(input);
        const freeze = (data) => {
            if (isValid(data)) {
                data.value = Object.freeze(data.value);
            }
            return data;
        };
        return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
    }
    unwrap() {
        return this._def.innerType;
    }
}
ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
        innerType: type,
        typeName: ZodFirstPartyTypeKind.ZodReadonly,
        ...processCreateParams(params),
    });
};
var ZodFirstPartyTypeKind;
(function (ZodFirstPartyTypeKind) {
    ZodFirstPartyTypeKind["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
const stringType = ZodString.create;
const numberType = ZodNumber.create;
const booleanType = ZodBoolean.create;
const anyType = ZodAny.create;
const unknownType = ZodUnknown.create;
ZodNever.create;
const arrayType = ZodArray.create;
const objectType = ZodObject.create;
const unionType = ZodUnion.create;
const discriminatedUnionType = ZodDiscriminatedUnion.create;
ZodIntersection.create;
const tupleType = ZodTuple.create;
const recordType = ZodRecord.create;
const literalType = ZodLiteral.create;
const enumType = ZodEnum.create;
ZodPromise.create;
ZodOptional.create;
ZodNullable.create;

// src/openai-provider.ts
function convertToOpenAIChatMessages({
  prompt,
  useLegacyFunctionCalling = false,
  systemMessageMode = "system"
}) {
  const messages = [];
  const warnings = [];
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        switch (systemMessageMode) {
          case "system": {
            messages.push({ role: "system", content });
            break;
          }
          case "developer": {
            messages.push({ role: "developer", content });
            break;
          }
          case "remove": {
            warnings.push({
              type: "other",
              message: "system messages are removed for this model"
            });
            break;
          }
          default: {
            const _exhaustiveCheck = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`
            );
          }
        }
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ role: "user", content: content[0].text });
          break;
        }
        messages.push({
          role: "user",
          content: content.map((part, index) => {
            var _a, _b, _c, _d;
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text };
              }
              case "image": {
                return {
                  type: "image_url",
                  image_url: {
                    url: part.image instanceof URL ? part.image.toString() : `data:${(_a = part.mimeType) != null ? _a : "image/jpeg"};base64,${convertUint8ArrayToBase64$1(part.image)}`,
                    // OpenAI specific extension: image detail
                    detail: (_c = (_b = part.providerMetadata) == null ? void 0 : _b.openai) == null ? void 0 : _c.imageDetail
                  }
                };
              }
              case "file": {
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError$1({
                    functionality: "'File content parts with URL data' functionality not supported."
                  });
                }
                switch (part.mimeType) {
                  case "audio/wav": {
                    return {
                      type: "input_audio",
                      input_audio: { data: part.data, format: "wav" }
                    };
                  }
                  case "audio/mp3":
                  case "audio/mpeg": {
                    return {
                      type: "input_audio",
                      input_audio: { data: part.data, format: "mp3" }
                    };
                  }
                  case "application/pdf": {
                    return {
                      type: "file",
                      file: {
                        filename: (_d = part.filename) != null ? _d : `part-${index}.pdf`,
                        file_data: `data:application/pdf;base64,${part.data}`
                      }
                    };
                  }
                  default: {
                    throw new UnsupportedFunctionalityError$1({
                      functionality: `File content part type ${part.mimeType} in user messages`
                    });
                  }
                }
              }
            }
          })
        });
        break;
      }
      case "assistant": {
        let text = "";
        const toolCalls = [];
        for (const part of content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args)
                }
              });
              break;
            }
          }
        }
        if (useLegacyFunctionCalling) {
          if (toolCalls.length > 1) {
            throw new UnsupportedFunctionalityError$1({
              functionality: "useLegacyFunctionCalling with multiple tool calls in one message"
            });
          }
          messages.push({
            role: "assistant",
            content: text,
            function_call: toolCalls.length > 0 ? toolCalls[0].function : void 0
          });
        } else {
          messages.push({
            role: "assistant",
            content: text,
            tool_calls: toolCalls.length > 0 ? toolCalls : void 0
          });
        }
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          if (useLegacyFunctionCalling) {
            messages.push({
              role: "function",
              name: toolResponse.toolName,
              content: JSON.stringify(toolResponse.result)
            });
          } else {
            messages.push({
              role: "tool",
              tool_call_id: toolResponse.toolCallId,
              content: JSON.stringify(toolResponse.result)
            });
          }
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return { messages, warnings };
}

// src/map-openai-chat-logprobs.ts
function mapOpenAIChatLogProbsOutput(logprobs) {
  var _a, _b;
  return (_b = (_a = logprobs == null ? void 0 : logprobs.content) == null ? void 0 : _a.map(({ token, logprob, top_logprobs }) => ({
    token,
    logprob,
    topLogprobs: top_logprobs ? top_logprobs.map(({ token: token2, logprob: logprob2 }) => ({
      token: token2,
      logprob: logprob2
    })) : []
  }))) != null ? _b : void 0;
}

// src/map-openai-finish-reason.ts
function mapOpenAIFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    case "function_call":
    case "tool_calls":
      return "tool-calls";
    default:
      return "unknown";
  }
}
var openaiErrorDataSchema = objectType({
  error: objectType({
    message: stringType(),
    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: stringType().nullish(),
    param: anyType().nullish(),
    code: unionType([stringType(), numberType()]).nullish()
  })
});
var openaiFailedResponseHandler = createJsonErrorResponseHandler$1({
  errorSchema: openaiErrorDataSchema,
  errorToMessage: (data) => data.error.message
});

// src/get-response-metadata.ts
function getResponseMetadata({
  id,
  model,
  created
}) {
  return {
    id: id != null ? id : void 0,
    modelId: model != null ? model : void 0,
    timestamp: created != null ? new Date(created * 1e3) : void 0
  };
}
function prepareTools$3({
  mode,
  useLegacyFunctionCalling = false,
  structuredOutputs
}) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  if (useLegacyFunctionCalling) {
    const openaiFunctions = [];
    for (const tool of tools) {
      if (tool.type === "provider-defined") {
        toolWarnings.push({ type: "unsupported-tool", tool });
      } else {
        openaiFunctions.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        });
      }
    }
    if (toolChoice == null) {
      return {
        functions: openaiFunctions,
        function_call: void 0,
        toolWarnings
      };
    }
    const type2 = toolChoice.type;
    switch (type2) {
      case "auto":
      case "none":
      case void 0:
        return {
          functions: openaiFunctions,
          function_call: void 0,
          toolWarnings
        };
      case "required":
        throw new UnsupportedFunctionalityError$1({
          functionality: "useLegacyFunctionCalling and toolChoice: required"
        });
      default:
        return {
          functions: openaiFunctions,
          function_call: { name: toolChoice.toolName },
          toolWarnings
        };
    }
  }
  const openaiTools2 = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      openaiTools2.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: structuredOutputs ? true : void 0
        }
      });
    }
  }
  if (toolChoice == null) {
    return { tools: openaiTools2, tool_choice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: openaiTools2, tool_choice: type, toolWarnings };
    case "tool":
      return {
        tools: openaiTools2,
        tool_choice: {
          type: "function",
          function: {
            name: toolChoice.toolName
          }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError$1({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}

// src/openai-chat-language-model.ts
var OpenAIChatLanguageModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get supportsStructuredOutputs() {
    var _a;
    return (_a = this.settings.structuredOutputs) != null ? _a : isReasoningModel(this.modelId);
  }
  get defaultObjectGenerationMode() {
    if (isAudioModel(this.modelId)) {
      return "tool";
    }
    return this.supportsStructuredOutputs ? "json" : "tool";
  }
  get provider() {
    return this.config.provider;
  }
  get supportsImageUrls() {
    return !this.settings.downloadImages;
  }
  getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    providerMetadata
  }) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const type = mode.type;
    const warnings = [];
    if (topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK"
      });
    }
    if ((responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && !this.supportsStructuredOutputs) {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format schema is only supported with structuredOutputs"
      });
    }
    const useLegacyFunctionCalling = this.settings.useLegacyFunctionCalling;
    if (useLegacyFunctionCalling && this.settings.parallelToolCalls === true) {
      throw new UnsupportedFunctionalityError$1({
        functionality: "useLegacyFunctionCalling with parallelToolCalls"
      });
    }
    if (useLegacyFunctionCalling && this.supportsStructuredOutputs) {
      throw new UnsupportedFunctionalityError$1({
        functionality: "structuredOutputs with useLegacyFunctionCalling"
      });
    }
    const { messages, warnings: messageWarnings } = convertToOpenAIChatMessages(
      {
        prompt,
        useLegacyFunctionCalling,
        systemMessageMode: getSystemMessageMode(this.modelId)
      }
    );
    warnings.push(...messageWarnings);
    const baseArgs = {
      // model id:
      model: this.modelId,
      // model specific settings:
      logit_bias: this.settings.logitBias,
      logprobs: this.settings.logprobs === true || typeof this.settings.logprobs === "number" ? true : void 0,
      top_logprobs: typeof this.settings.logprobs === "number" ? this.settings.logprobs : typeof this.settings.logprobs === "boolean" ? this.settings.logprobs ? 0 : void 0 : void 0,
      user: this.settings.user,
      parallel_tool_calls: this.settings.parallelToolCalls,
      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      response_format: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? this.supportsStructuredOutputs && responseFormat.schema != null ? {
        type: "json_schema",
        json_schema: {
          schema: responseFormat.schema,
          strict: true,
          name: (_a = responseFormat.name) != null ? _a : "response",
          description: responseFormat.description
        }
      } : { type: "json_object" } : void 0,
      stop: stopSequences,
      seed,
      // openai specific settings:
      // TODO remove in next major version; we auto-map maxTokens now
      max_completion_tokens: (_b = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _b.maxCompletionTokens,
      store: (_c = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _c.store,
      metadata: (_d = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _d.metadata,
      prediction: (_e = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _e.prediction,
      reasoning_effort: (_g = (_f = providerMetadata == null ? void 0 : providerMetadata.openai) == null ? void 0 : _f.reasoningEffort) != null ? _g : this.settings.reasoningEffort,
      // messages:
      messages
    };
    if (isReasoningModel(this.modelId)) {
      if (baseArgs.temperature != null) {
        baseArgs.temperature = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "temperature",
          details: "temperature is not supported for reasoning models"
        });
      }
      if (baseArgs.top_p != null) {
        baseArgs.top_p = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "topP",
          details: "topP is not supported for reasoning models"
        });
      }
      if (baseArgs.frequency_penalty != null) {
        baseArgs.frequency_penalty = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "frequencyPenalty",
          details: "frequencyPenalty is not supported for reasoning models"
        });
      }
      if (baseArgs.presence_penalty != null) {
        baseArgs.presence_penalty = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "presencePenalty",
          details: "presencePenalty is not supported for reasoning models"
        });
      }
      if (baseArgs.logit_bias != null) {
        baseArgs.logit_bias = void 0;
        warnings.push({
          type: "other",
          message: "logitBias is not supported for reasoning models"
        });
      }
      if (baseArgs.logprobs != null) {
        baseArgs.logprobs = void 0;
        warnings.push({
          type: "other",
          message: "logprobs is not supported for reasoning models"
        });
      }
      if (baseArgs.top_logprobs != null) {
        baseArgs.top_logprobs = void 0;
        warnings.push({
          type: "other",
          message: "topLogprobs is not supported for reasoning models"
        });
      }
      if (baseArgs.max_tokens != null) {
        if (baseArgs.max_completion_tokens == null) {
          baseArgs.max_completion_tokens = baseArgs.max_tokens;
        }
        baseArgs.max_tokens = void 0;
      }
    } else if (this.modelId.startsWith("gpt-4o-search-preview") || this.modelId.startsWith("gpt-4o-mini-search-preview")) {
      if (baseArgs.temperature != null) {
        baseArgs.temperature = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "temperature",
          details: "temperature is not supported for the search preview models and has been removed."
        });
      }
    }
    switch (type) {
      case "regular": {
        const { tools, tool_choice, functions, function_call, toolWarnings } = prepareTools$3({
          mode,
          useLegacyFunctionCalling,
          structuredOutputs: this.supportsStructuredOutputs
        });
        return {
          args: {
            ...baseArgs,
            tools,
            tool_choice,
            functions,
            function_call
          },
          warnings: [...warnings, ...toolWarnings]
        };
      }
      case "object-json": {
        return {
          args: {
            ...baseArgs,
            response_format: this.supportsStructuredOutputs && mode.schema != null ? {
              type: "json_schema",
              json_schema: {
                schema: mode.schema,
                strict: true,
                name: (_h = mode.name) != null ? _h : "response",
                description: mode.description
              }
            } : { type: "json_object" }
          },
          warnings
        };
      }
      case "object-tool": {
        return {
          args: useLegacyFunctionCalling ? {
            ...baseArgs,
            function_call: {
              name: mode.tool.name
            },
            functions: [
              {
                name: mode.tool.name,
                description: mode.tool.description,
                parameters: mode.tool.parameters
              }
            ]
          } : {
            ...baseArgs,
            tool_choice: {
              type: "function",
              function: { name: mode.tool.name }
            },
            tools: [
              {
                type: "function",
                function: {
                  name: mode.tool.name,
                  description: mode.tool.description,
                  parameters: mode.tool.parameters,
                  strict: this.supportsStructuredOutputs ? true : void 0
                }
              }
            ]
          },
          warnings
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const { args: body, warnings } = this.getArgs(options);
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi$1({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        openaiChatResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = body;
    const choice = response.choices[0];
    const completionTokenDetails = (_a = response.usage) == null ? void 0 : _a.completion_tokens_details;
    const promptTokenDetails = (_b = response.usage) == null ? void 0 : _b.prompt_tokens_details;
    const providerMetadata = { openai: {} };
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens) != null) {
      providerMetadata.openai.reasoningTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens;
    }
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens) != null) {
      providerMetadata.openai.acceptedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens;
    }
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens) != null) {
      providerMetadata.openai.rejectedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens;
    }
    if ((promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens) != null) {
      providerMetadata.openai.cachedPromptTokens = promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens;
    }
    return {
      text: (_c = choice.message.content) != null ? _c : void 0,
      toolCalls: this.settings.useLegacyFunctionCalling && choice.message.function_call ? [
        {
          toolCallType: "function",
          toolCallId: generateId$1(),
          toolName: choice.message.function_call.name,
          args: choice.message.function_call.arguments
        }
      ] : (_d = choice.message.tool_calls) == null ? void 0 : _d.map((toolCall) => {
        var _a2;
        return {
          toolCallType: "function",
          toolCallId: (_a2 = toolCall.id) != null ? _a2 : generateId$1(),
          toolName: toolCall.function.name,
          args: toolCall.function.arguments
        };
      }),
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      usage: {
        promptTokens: (_f = (_e = response.usage) == null ? void 0 : _e.prompt_tokens) != null ? _f : NaN,
        completionTokens: (_h = (_g = response.usage) == null ? void 0 : _g.completion_tokens) != null ? _h : NaN
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders, body: rawResponse },
      request: { body: JSON.stringify(body) },
      response: getResponseMetadata(response),
      warnings,
      logprobs: mapOpenAIChatLogProbsOutput(choice.logprobs),
      providerMetadata
    };
  }
  async doStream(options) {
    if (this.settings.simulateStreaming) {
      const result = await this.doGenerate(options);
      const simulatedStream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "response-metadata", ...result.response });
          if (result.text) {
            controller.enqueue({
              type: "text-delta",
              textDelta: result.text
            });
          }
          if (result.toolCalls) {
            for (const toolCall of result.toolCalls) {
              controller.enqueue({
                type: "tool-call-delta",
                toolCallType: "function",
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                argsTextDelta: toolCall.args
              });
              controller.enqueue({
                type: "tool-call",
                ...toolCall
              });
            }
          }
          controller.enqueue({
            type: "finish",
            finishReason: result.finishReason,
            usage: result.usage,
            logprobs: result.logprobs,
            providerMetadata: result.providerMetadata
          });
          controller.close();
        }
      });
      return {
        stream: simulatedStream,
        rawCall: result.rawCall,
        rawResponse: result.rawResponse,
        warnings: result.warnings
      };
    }
    const { args, warnings } = this.getArgs(options);
    const body = {
      ...args,
      stream: true,
      // only include stream_options when in strict compatibility mode:
      stream_options: this.config.compatibility === "strict" ? { include_usage: true } : void 0
    };
    const { responseHeaders, value: response } = await postJsonToApi$1({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler$1(
        openaiChatChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    const toolCalls = [];
    let finishReason = "unknown";
    let usage = {
      promptTokens: void 0,
      completionTokens: void 0
    };
    let logprobs;
    let isFirstChunk = true;
    const { useLegacyFunctionCalling } = this.settings;
    const providerMetadata = { openai: {} };
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: value.error });
              return;
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
            }
            if (value.usage != null) {
              const {
                prompt_tokens,
                completion_tokens,
                prompt_tokens_details,
                completion_tokens_details
              } = value.usage;
              usage = {
                promptTokens: prompt_tokens != null ? prompt_tokens : void 0,
                completionTokens: completion_tokens != null ? completion_tokens : void 0
              };
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens) != null) {
                providerMetadata.openai.reasoningTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens;
              }
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens) != null) {
                providerMetadata.openai.acceptedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens;
              }
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens) != null) {
                providerMetadata.openai.rejectedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens;
              }
              if ((prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens) != null) {
                providerMetadata.openai.cachedPromptTokens = prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens;
              }
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapOpenAIFinishReason(choice.finish_reason);
            }
            if ((choice == null ? void 0 : choice.delta) == null) {
              return;
            }
            const delta = choice.delta;
            if (delta.content != null) {
              controller.enqueue({
                type: "text-delta",
                textDelta: delta.content
              });
            }
            const mappedLogprobs = mapOpenAIChatLogProbsOutput(
              choice == null ? void 0 : choice.logprobs
            );
            if (mappedLogprobs == null ? void 0 : mappedLogprobs.length) {
              if (logprobs === void 0) logprobs = [];
              logprobs.push(...mappedLogprobs);
            }
            const mappedToolCalls = useLegacyFunctionCalling && delta.function_call != null ? [
              {
                type: "function",
                id: generateId$1(),
                function: delta.function_call,
                index: 0
              }
            ] : delta.tool_calls;
            if (mappedToolCalls != null) {
              for (const toolCallDelta of mappedToolCalls) {
                const index = toolCallDelta.index;
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== "function") {
                    throw new InvalidResponseDataError$1({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`
                    });
                  }
                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError$1({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    });
                  }
                  if (((_a = toolCallDelta.function) == null ? void 0 : _a.name) == null) {
                    throw new InvalidResponseDataError$1({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    });
                  }
                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: (_b = toolCallDelta.function.arguments) != null ? _b : ""
                    },
                    hasFinished: false
                  };
                  const toolCall2 = toolCalls[index];
                  if (((_c = toolCall2.function) == null ? void 0 : _c.name) != null && ((_d = toolCall2.function) == null ? void 0 : _d.arguments) != null) {
                    if (toolCall2.function.arguments.length > 0) {
                      controller.enqueue({
                        type: "tool-call-delta",
                        toolCallType: "function",
                        toolCallId: toolCall2.id,
                        toolName: toolCall2.function.name,
                        argsTextDelta: toolCall2.function.arguments
                      });
                    }
                    if (isParsableJson$1(toolCall2.function.arguments)) {
                      controller.enqueue({
                        type: "tool-call",
                        toolCallType: "function",
                        toolCallId: (_e = toolCall2.id) != null ? _e : generateId$1(),
                        toolName: toolCall2.function.name,
                        args: toolCall2.function.arguments
                      });
                      toolCall2.hasFinished = true;
                    }
                  }
                  continue;
                }
                const toolCall = toolCalls[index];
                if (toolCall.hasFinished) {
                  continue;
                }
                if (((_f = toolCallDelta.function) == null ? void 0 : _f.arguments) != null) {
                  toolCall.function.arguments += (_h = (_g = toolCallDelta.function) == null ? void 0 : _g.arguments) != null ? _h : "";
                }
                controller.enqueue({
                  type: "tool-call-delta",
                  toolCallType: "function",
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: (_i = toolCallDelta.function.arguments) != null ? _i : ""
                });
                if (((_j = toolCall.function) == null ? void 0 : _j.name) != null && ((_k = toolCall.function) == null ? void 0 : _k.arguments) != null && isParsableJson$1(toolCall.function.arguments)) {
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: (_l = toolCall.id) != null ? _l : generateId$1(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },
          flush(controller) {
            var _a, _b;
            controller.enqueue({
              type: "finish",
              finishReason,
              logprobs,
              usage: {
                promptTokens: (_a = usage.promptTokens) != null ? _a : NaN,
                completionTokens: (_b = usage.completionTokens) != null ? _b : NaN
              },
              ...providerMetadata != null ? { providerMetadata } : {}
            });
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      warnings
    };
  }
};
var openaiTokenUsageSchema = objectType({
  prompt_tokens: numberType().nullish(),
  completion_tokens: numberType().nullish(),
  prompt_tokens_details: objectType({
    cached_tokens: numberType().nullish()
  }).nullish(),
  completion_tokens_details: objectType({
    reasoning_tokens: numberType().nullish(),
    accepted_prediction_tokens: numberType().nullish(),
    rejected_prediction_tokens: numberType().nullish()
  }).nullish()
}).nullish();
var openaiChatResponseSchema = objectType({
  id: stringType().nullish(),
  created: numberType().nullish(),
  model: stringType().nullish(),
  choices: arrayType(
    objectType({
      message: objectType({
        role: literalType("assistant").nullish(),
        content: stringType().nullish(),
        function_call: objectType({
          arguments: stringType(),
          name: stringType()
        }).nullish(),
        tool_calls: arrayType(
          objectType({
            id: stringType().nullish(),
            type: literalType("function"),
            function: objectType({
              name: stringType(),
              arguments: stringType()
            })
          })
        ).nullish()
      }),
      index: numberType(),
      logprobs: objectType({
        content: arrayType(
          objectType({
            token: stringType(),
            logprob: numberType(),
            top_logprobs: arrayType(
              objectType({
                token: stringType(),
                logprob: numberType()
              })
            )
          })
        ).nullable()
      }).nullish(),
      finish_reason: stringType().nullish()
    })
  ),
  usage: openaiTokenUsageSchema
});
var openaiChatChunkSchema = unionType([
  objectType({
    id: stringType().nullish(),
    created: numberType().nullish(),
    model: stringType().nullish(),
    choices: arrayType(
      objectType({
        delta: objectType({
          role: enumType(["assistant"]).nullish(),
          content: stringType().nullish(),
          function_call: objectType({
            name: stringType().optional(),
            arguments: stringType().optional()
          }).nullish(),
          tool_calls: arrayType(
            objectType({
              index: numberType(),
              id: stringType().nullish(),
              type: literalType("function").nullish(),
              function: objectType({
                name: stringType().nullish(),
                arguments: stringType().nullish()
              })
            })
          ).nullish()
        }).nullish(),
        logprobs: objectType({
          content: arrayType(
            objectType({
              token: stringType(),
              logprob: numberType(),
              top_logprobs: arrayType(
                objectType({
                  token: stringType(),
                  logprob: numberType()
                })
              )
            })
          ).nullable()
        }).nullish(),
        finish_reason: stringType().nullish(),
        index: numberType()
      })
    ),
    usage: openaiTokenUsageSchema
  }),
  openaiErrorDataSchema
]);
function isReasoningModel(modelId) {
  return modelId.startsWith("o");
}
function isAudioModel(modelId) {
  return modelId.startsWith("gpt-4o-audio-preview");
}
function getSystemMessageMode(modelId) {
  var _a, _b;
  if (!isReasoningModel(modelId)) {
    return "system";
  }
  return (_b = (_a = reasoningModels[modelId]) == null ? void 0 : _a.systemMessageMode) != null ? _b : "developer";
}
var reasoningModels = {
  "o1-mini": {
    systemMessageMode: "remove"
  },
  "o1-mini-2024-09-12": {
    systemMessageMode: "remove"
  },
  "o1-preview": {
    systemMessageMode: "remove"
  },
  "o1-preview-2024-09-12": {
    systemMessageMode: "remove"
  },
  o3: {
    systemMessageMode: "developer"
  },
  "o3-2025-04-16": {
    systemMessageMode: "developer"
  },
  "o3-mini": {
    systemMessageMode: "developer"
  },
  "o3-mini-2025-01-31": {
    systemMessageMode: "developer"
  },
  "o4-mini": {
    systemMessageMode: "developer"
  },
  "o4-mini-2025-04-16": {
    systemMessageMode: "developer"
  }
};
function convertToOpenAICompletionPrompt({
  prompt,
  inputFormat,
  user = "user",
  assistant = "assistant"
}) {
  if (inputFormat === "prompt" && prompt.length === 1 && prompt[0].role === "user" && prompt[0].content.length === 1 && prompt[0].content[0].type === "text") {
    return { prompt: prompt[0].content[0].text };
  }
  let text = "";
  if (prompt[0].role === "system") {
    text += `${prompt[0].content}

`;
    prompt = prompt.slice(1);
  }
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        throw new InvalidPromptError$1({
          message: "Unexpected system message in prompt: ${content}",
          prompt
        });
      }
      case "user": {
        const userMessage = content.map((part) => {
          switch (part.type) {
            case "text": {
              return part.text;
            }
            case "image": {
              throw new UnsupportedFunctionalityError$1({
                functionality: "images"
              });
            }
          }
        }).join("");
        text += `${user}:
${userMessage}

`;
        break;
      }
      case "assistant": {
        const assistantMessage = content.map((part) => {
          switch (part.type) {
            case "text": {
              return part.text;
            }
            case "tool-call": {
              throw new UnsupportedFunctionalityError$1({
                functionality: "tool-call messages"
              });
            }
          }
        }).join("");
        text += `${assistant}:
${assistantMessage}

`;
        break;
      }
      case "tool": {
        throw new UnsupportedFunctionalityError$1({
          functionality: "tool messages"
        });
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  text += `${assistant}:
`;
  return {
    prompt: text,
    stopSequences: [`
${user}:`]
  };
}

// src/map-openai-completion-logprobs.ts
function mapOpenAICompletionLogProbs(logprobs) {
  return logprobs == null ? void 0 : logprobs.tokens.map((token, index) => ({
    token,
    logprob: logprobs.token_logprobs[index],
    topLogprobs: logprobs.top_logprobs ? Object.entries(logprobs.top_logprobs[index]).map(
      ([token2, logprob]) => ({
        token: token2,
        logprob
      })
    ) : []
  }));
}

// src/openai-completion-language-model.ts
var OpenAICompletionLanguageModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = void 0;
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  getArgs({
    mode,
    inputFormat,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences: userStopSequences,
    responseFormat,
    seed
  }) {
    var _a;
    const type = mode.type;
    const warnings = [];
    if (topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK"
      });
    }
    if (responseFormat != null && responseFormat.type !== "text") {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format is not supported."
      });
    }
    const { prompt: completionPrompt, stopSequences } = convertToOpenAICompletionPrompt({ prompt, inputFormat });
    const stop = [...stopSequences != null ? stopSequences : [], ...userStopSequences != null ? userStopSequences : []];
    const baseArgs = {
      // model id:
      model: this.modelId,
      // model specific settings:
      echo: this.settings.echo,
      logit_bias: this.settings.logitBias,
      logprobs: typeof this.settings.logprobs === "number" ? this.settings.logprobs : typeof this.settings.logprobs === "boolean" ? this.settings.logprobs ? 0 : void 0 : void 0,
      suffix: this.settings.suffix,
      user: this.settings.user,
      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      seed,
      // prompt:
      prompt: completionPrompt,
      // stop sequences:
      stop: stop.length > 0 ? stop : void 0
    };
    switch (type) {
      case "regular": {
        if ((_a = mode.tools) == null ? void 0 : _a.length) {
          throw new UnsupportedFunctionalityError$1({
            functionality: "tools"
          });
        }
        if (mode.toolChoice) {
          throw new UnsupportedFunctionalityError$1({
            functionality: "toolChoice"
          });
        }
        return { args: baseArgs, warnings };
      }
      case "object-json": {
        throw new UnsupportedFunctionalityError$1({
          functionality: "object-json mode"
        });
      }
      case "object-tool": {
        throw new UnsupportedFunctionalityError$1({
          functionality: "object-tool mode"
        });
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  async doGenerate(options) {
    const { args, warnings } = this.getArgs(options);
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi$1({
      url: this.config.url({
        path: "/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        openaiCompletionResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { prompt: rawPrompt, ...rawSettings } = args;
    const choice = response.choices[0];
    return {
      text: choice.text,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens
      },
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      logprobs: mapOpenAICompletionLogProbs(choice.logprobs),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders, body: rawResponse },
      response: getResponseMetadata(response),
      warnings,
      request: { body: JSON.stringify(args) }
    };
  }
  async doStream(options) {
    const { args, warnings } = this.getArgs(options);
    const body = {
      ...args,
      stream: true,
      // only include stream_options when in strict compatibility mode:
      stream_options: this.config.compatibility === "strict" ? { include_usage: true } : void 0
    };
    const { responseHeaders, value: response } = await postJsonToApi$1({
      url: this.config.url({
        path: "/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler$1(
        openaiCompletionChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { prompt: rawPrompt, ...rawSettings } = args;
    let finishReason = "unknown";
    let usage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN
    };
    let logprobs;
    let isFirstChunk = true;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: value.error });
              return;
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
            }
            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens
              };
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapOpenAIFinishReason(choice.finish_reason);
            }
            if ((choice == null ? void 0 : choice.text) != null) {
              controller.enqueue({
                type: "text-delta",
                textDelta: choice.text
              });
            }
            const mappedLogprobs = mapOpenAICompletionLogProbs(
              choice == null ? void 0 : choice.logprobs
            );
            if (mappedLogprobs == null ? void 0 : mappedLogprobs.length) {
              if (logprobs === void 0) logprobs = [];
              logprobs.push(...mappedLogprobs);
            }
          },
          flush(controller) {
            controller.enqueue({
              type: "finish",
              finishReason,
              logprobs,
              usage
            });
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body: JSON.stringify(body) }
    };
  }
};
var openaiCompletionResponseSchema = objectType({
  id: stringType().nullish(),
  created: numberType().nullish(),
  model: stringType().nullish(),
  choices: arrayType(
    objectType({
      text: stringType(),
      finish_reason: stringType(),
      logprobs: objectType({
        tokens: arrayType(stringType()),
        token_logprobs: arrayType(numberType()),
        top_logprobs: arrayType(recordType(stringType(), numberType())).nullable()
      }).nullish()
    })
  ),
  usage: objectType({
    prompt_tokens: numberType(),
    completion_tokens: numberType()
  })
});
var openaiCompletionChunkSchema = unionType([
  objectType({
    id: stringType().nullish(),
    created: numberType().nullish(),
    model: stringType().nullish(),
    choices: arrayType(
      objectType({
        text: stringType(),
        finish_reason: stringType().nullish(),
        index: numberType(),
        logprobs: objectType({
          tokens: arrayType(stringType()),
          token_logprobs: arrayType(numberType()),
          top_logprobs: arrayType(recordType(stringType(), numberType())).nullable()
        }).nullish()
      })
    ),
    usage: objectType({
      prompt_tokens: numberType(),
      completion_tokens: numberType()
    }).nullish()
  }),
  openaiErrorDataSchema
]);
var OpenAIEmbeddingModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  get maxEmbeddingsPerCall() {
    var _a;
    return (_a = this.settings.maxEmbeddingsPerCall) != null ? _a : 2048;
  }
  get supportsParallelCalls() {
    var _a;
    return (_a = this.settings.supportsParallelCalls) != null ? _a : true;
  }
  async doEmbed({
    values,
    headers,
    abortSignal
  }) {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values
      });
    }
    const { responseHeaders, value: response } = await postJsonToApi$1({
      url: this.config.url({
        path: "/embeddings",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), headers),
      body: {
        model: this.modelId,
        input: values,
        encoding_format: "float",
        dimensions: this.settings.dimensions,
        user: this.settings.user
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        openaiTextEmbeddingResponseSchema
      ),
      abortSignal,
      fetch: this.config.fetch
    });
    return {
      embeddings: response.data.map((item) => item.embedding),
      usage: response.usage ? { tokens: response.usage.prompt_tokens } : void 0,
      rawResponse: { headers: responseHeaders }
    };
  }
};
var openaiTextEmbeddingResponseSchema = objectType({
  data: arrayType(objectType({ embedding: arrayType(numberType()) })),
  usage: objectType({ prompt_tokens: numberType() }).nullish()
});

// src/openai-image-settings.ts
var modelMaxImagesPerCall$1 = {
  "dall-e-3": 1,
  "dall-e-2": 10,
  "gpt-image-1": 10
};
var hasDefaultResponseFormat = /* @__PURE__ */ new Set(["gpt-image-1"]);

// src/openai-image-model.ts
var OpenAIImageModel = class {
  constructor(modelId, settings, config) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.specificationVersion = "v1";
  }
  get maxImagesPerCall() {
    var _a, _b;
    return (_b = (_a = this.settings.maxImagesPerCall) != null ? _a : modelMaxImagesPerCall$1[this.modelId]) != null ? _b : 1;
  }
  get provider() {
    return this.config.provider;
  }
  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal
  }) {
    var _a, _b, _c, _d;
    const warnings = [];
    if (aspectRatio != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "aspectRatio",
        details: "This model does not support aspect ratio. Use `size` instead."
      });
    }
    if (seed != null) {
      warnings.push({ type: "unsupported-setting", setting: "seed" });
    }
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const { value: response, responseHeaders } = await postJsonToApi$1({
      url: this.config.url({
        path: "/images/generations",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), headers),
      body: {
        model: this.modelId,
        prompt,
        n,
        size,
        ...(_d = providerOptions.openai) != null ? _d : {},
        ...!hasDefaultResponseFormat.has(this.modelId) ? { response_format: "b64_json" } : {}
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        openaiImageResponseSchema
      ),
      abortSignal,
      fetch: this.config.fetch
    });
    return {
      images: response.data.map((item) => item.b64_json),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders
      }
    };
  }
};
var openaiImageResponseSchema = objectType({
  data: arrayType(objectType({ b64_json: stringType() }))
});
var openAIProviderOptionsSchema = objectType({
  include: arrayType(stringType()).nullish(),
  language: stringType().nullish(),
  prompt: stringType().nullish(),
  temperature: numberType().min(0).max(1).nullish().default(0),
  timestampGranularities: arrayType(enumType(["word", "segment"])).nullish().default(["segment"])
});
var languageMap = {
  afrikaans: "af",
  arabic: "ar",
  armenian: "hy",
  azerbaijani: "az",
  belarusian: "be",
  bosnian: "bs",
  bulgarian: "bg",
  catalan: "ca",
  chinese: "zh",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  finnish: "fi",
  french: "fr",
  galician: "gl",
  german: "de",
  greek: "el",
  hebrew: "he",
  hindi: "hi",
  hungarian: "hu",
  icelandic: "is",
  indonesian: "id",
  italian: "it",
  japanese: "ja",
  kannada: "kn",
  kazakh: "kk",
  korean: "ko",
  latvian: "lv",
  lithuanian: "lt",
  macedonian: "mk",
  malay: "ms",
  marathi: "mr",
  maori: "mi",
  nepali: "ne",
  norwegian: "no",
  persian: "fa",
  polish: "pl",
  portuguese: "pt",
  romanian: "ro",
  russian: "ru",
  serbian: "sr",
  slovak: "sk",
  slovenian: "sl",
  spanish: "es",
  swahili: "sw",
  swedish: "sv",
  tagalog: "tl",
  tamil: "ta",
  thai: "th",
  turkish: "tr",
  ukrainian: "uk",
  urdu: "ur",
  vietnamese: "vi",
  welsh: "cy"
};
var OpenAITranscriptionModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v1";
  }
  get provider() {
    return this.config.provider;
  }
  getArgs({
    audio,
    mediaType,
    providerOptions
  }) {
    var _a, _b, _c, _d, _e;
    const warnings = [];
    const openAIOptions = parseProviderOptions({
      provider: "openai",
      providerOptions,
      schema: openAIProviderOptionsSchema
    });
    const formData = new FormData();
    const blob = audio instanceof Uint8Array ? new Blob([audio]) : new Blob([convertBase64ToUint8Array(audio)]);
    formData.append("model", this.modelId);
    formData.append("file", new File([blob], "audio", { type: mediaType }));
    if (openAIOptions) {
      const transcriptionModelOptions = {
        include: (_a = openAIOptions.include) != null ? _a : void 0,
        language: (_b = openAIOptions.language) != null ? _b : void 0,
        prompt: (_c = openAIOptions.prompt) != null ? _c : void 0,
        temperature: (_d = openAIOptions.temperature) != null ? _d : void 0,
        timestamp_granularities: (_e = openAIOptions.timestampGranularities) != null ? _e : void 0
      };
      for (const key in transcriptionModelOptions) {
        const value = transcriptionModelOptions[key];
        if (value !== void 0) {
          formData.append(key, String(value));
        }
      }
    }
    return {
      formData,
      warnings
    };
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f;
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const { formData, warnings } = this.getArgs(options);
    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse
    } = await postFormDataToApi({
      url: this.config.url({
        path: "/audio/transcriptions",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        openaiTranscriptionResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const language = response.language != null && response.language in languageMap ? languageMap[response.language] : void 0;
    return {
      text: response.text,
      segments: (_e = (_d = response.words) == null ? void 0 : _d.map((word) => ({
        text: word.word,
        startSecond: word.start,
        endSecond: word.end
      }))) != null ? _e : [],
      language,
      durationInSeconds: (_f = response.duration) != null ? _f : void 0,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse
      }
    };
  }
};
var openaiTranscriptionResponseSchema = objectType({
  text: stringType(),
  language: stringType().nullish(),
  duration: numberType().nullish(),
  words: arrayType(
    objectType({
      word: stringType(),
      start: numberType(),
      end: numberType()
    })
  ).nullish()
});
function convertToOpenAIResponsesMessages({
  prompt,
  systemMessageMode
}) {
  const messages = [];
  const warnings = [];
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        switch (systemMessageMode) {
          case "system": {
            messages.push({ role: "system", content });
            break;
          }
          case "developer": {
            messages.push({ role: "developer", content });
            break;
          }
          case "remove": {
            warnings.push({
              type: "other",
              message: "system messages are removed for this model"
            });
            break;
          }
          default: {
            const _exhaustiveCheck = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`
            );
          }
        }
        break;
      }
      case "user": {
        messages.push({
          role: "user",
          content: content.map((part, index) => {
            var _a, _b, _c, _d;
            switch (part.type) {
              case "text": {
                return { type: "input_text", text: part.text };
              }
              case "image": {
                return {
                  type: "input_image",
                  image_url: part.image instanceof URL ? part.image.toString() : `data:${(_a = part.mimeType) != null ? _a : "image/jpeg"};base64,${convertUint8ArrayToBase64$1(part.image)}`,
                  // OpenAI specific extension: image detail
                  detail: (_c = (_b = part.providerMetadata) == null ? void 0 : _b.openai) == null ? void 0 : _c.imageDetail
                };
              }
              case "file": {
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError$1({
                    functionality: "File URLs in user messages"
                  });
                }
                switch (part.mimeType) {
                  case "application/pdf": {
                    return {
                      type: "input_file",
                      filename: (_d = part.filename) != null ? _d : `part-${index}.pdf`,
                      file_data: `data:application/pdf;base64,${part.data}`
                    };
                  }
                  default: {
                    throw new UnsupportedFunctionalityError$1({
                      functionality: "Only PDF files are supported in user messages"
                    });
                  }
                }
              }
            }
          })
        });
        break;
      }
      case "assistant": {
        for (const part of content) {
          switch (part.type) {
            case "text": {
              messages.push({
                role: "assistant",
                content: [{ type: "output_text", text: part.text }]
              });
              break;
            }
            case "tool-call": {
              messages.push({
                type: "function_call",
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.args)
              });
              break;
            }
          }
        }
        break;
      }
      case "tool": {
        for (const part of content) {
          messages.push({
            type: "function_call_output",
            call_id: part.toolCallId,
            output: JSON.stringify(part.result)
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return { messages, warnings };
}

// src/responses/map-openai-responses-finish-reason.ts
function mapOpenAIResponseFinishReason({
  finishReason,
  hasToolCalls
}) {
  switch (finishReason) {
    case void 0:
    case null:
      return hasToolCalls ? "tool-calls" : "stop";
    case "max_output_tokens":
      return "length";
    case "content_filter":
      return "content-filter";
    default:
      return hasToolCalls ? "tool-calls" : "unknown";
  }
}
function prepareResponsesTools({
  mode,
  strict
}) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  const openaiTools2 = [];
  for (const tool of tools) {
    switch (tool.type) {
      case "function":
        openaiTools2.push({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: strict ? true : void 0
        });
        break;
      case "provider-defined":
        switch (tool.id) {
          case "openai.web_search_preview":
            openaiTools2.push({
              type: "web_search_preview",
              search_context_size: tool.args.searchContextSize,
              user_location: tool.args.userLocation
            });
            break;
          default:
            toolWarnings.push({ type: "unsupported-tool", tool });
            break;
        }
        break;
      default:
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
    }
  }
  if (toolChoice == null) {
    return { tools: openaiTools2, tool_choice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: openaiTools2, tool_choice: type, toolWarnings };
    case "tool": {
      if (toolChoice.toolName === "web_search_preview") {
        return {
          tools: openaiTools2,
          tool_choice: {
            type: "web_search_preview"
          },
          toolWarnings
        };
      }
      return {
        tools: openaiTools2,
        tool_choice: {
          type: "function",
          name: toolChoice.toolName
        },
        toolWarnings
      };
    }
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError$1({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}

// src/responses/openai-responses-language-model.ts
var OpenAIResponsesLanguageModel = class {
  constructor(modelId, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = "json";
    this.supportsStructuredOutputs = true;
    this.modelId = modelId;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  getArgs({
    mode,
    maxTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    prompt,
    providerMetadata,
    responseFormat
  }) {
    var _a, _b, _c;
    const warnings = [];
    const modelConfig = getResponsesModelConfig(this.modelId);
    const type = mode.type;
    if (topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK"
      });
    }
    if (seed != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "seed"
      });
    }
    if (presencePenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "presencePenalty"
      });
    }
    if (frequencyPenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "frequencyPenalty"
      });
    }
    if (stopSequences != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "stopSequences"
      });
    }
    const { messages, warnings: messageWarnings } = convertToOpenAIResponsesMessages({
      prompt,
      systemMessageMode: modelConfig.systemMessageMode
    });
    warnings.push(...messageWarnings);
    const openaiOptions = parseProviderOptions({
      provider: "openai",
      providerOptions: providerMetadata,
      schema: openaiResponsesProviderOptionsSchema
    });
    const isStrict = (_a = openaiOptions == null ? void 0 : openaiOptions.strictSchemas) != null ? _a : true;
    const baseArgs = {
      model: this.modelId,
      input: messages,
      temperature,
      top_p: topP,
      max_output_tokens: maxTokens,
      ...(responseFormat == null ? void 0 : responseFormat.type) === "json" && {
        text: {
          format: responseFormat.schema != null ? {
            type: "json_schema",
            strict: isStrict,
            name: (_b = responseFormat.name) != null ? _b : "response",
            description: responseFormat.description,
            schema: responseFormat.schema
          } : { type: "json_object" }
        }
      },
      // provider options:
      metadata: openaiOptions == null ? void 0 : openaiOptions.metadata,
      parallel_tool_calls: openaiOptions == null ? void 0 : openaiOptions.parallelToolCalls,
      previous_response_id: openaiOptions == null ? void 0 : openaiOptions.previousResponseId,
      store: openaiOptions == null ? void 0 : openaiOptions.store,
      user: openaiOptions == null ? void 0 : openaiOptions.user,
      instructions: openaiOptions == null ? void 0 : openaiOptions.instructions,
      // model-specific settings:
      ...modelConfig.isReasoningModel && ((openaiOptions == null ? void 0 : openaiOptions.reasoningEffort) != null || (openaiOptions == null ? void 0 : openaiOptions.reasoningSummary) != null) && {
        reasoning: {
          ...(openaiOptions == null ? void 0 : openaiOptions.reasoningEffort) != null && {
            effort: openaiOptions.reasoningEffort
          },
          ...(openaiOptions == null ? void 0 : openaiOptions.reasoningSummary) != null && {
            summary: openaiOptions.reasoningSummary
          }
        }
      },
      ...modelConfig.requiredAutoTruncation && {
        truncation: "auto"
      }
    };
    if (modelConfig.isReasoningModel) {
      if (baseArgs.temperature != null) {
        baseArgs.temperature = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "temperature",
          details: "temperature is not supported for reasoning models"
        });
      }
      if (baseArgs.top_p != null) {
        baseArgs.top_p = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "topP",
          details: "topP is not supported for reasoning models"
        });
      }
    }
    switch (type) {
      case "regular": {
        const { tools, tool_choice, toolWarnings } = prepareResponsesTools({
          mode,
          strict: isStrict
          // TODO support provider options on tools
        });
        return {
          args: {
            ...baseArgs,
            tools,
            tool_choice
          },
          warnings: [...warnings, ...toolWarnings]
        };
      }
      case "object-json": {
        return {
          args: {
            ...baseArgs,
            text: {
              format: mode.schema != null ? {
                type: "json_schema",
                strict: isStrict,
                name: (_c = mode.name) != null ? _c : "response",
                description: mode.description,
                schema: mode.schema
              } : { type: "json_object" }
            }
          },
          warnings
        };
      }
      case "object-tool": {
        return {
          args: {
            ...baseArgs,
            tool_choice: { type: "function", name: mode.tool.name },
            tools: [
              {
                type: "function",
                name: mode.tool.name,
                description: mode.tool.description,
                parameters: mode.tool.parameters,
                strict: isStrict
              }
            ]
          },
          warnings
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g;
    const { args: body, warnings } = this.getArgs(options);
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi$1({
      url: this.config.url({
        path: "/responses",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      body,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        objectType({
          id: stringType(),
          created_at: numberType(),
          model: stringType(),
          output: arrayType(
            discriminatedUnionType("type", [
              objectType({
                type: literalType("message"),
                role: literalType("assistant"),
                content: arrayType(
                  objectType({
                    type: literalType("output_text"),
                    text: stringType(),
                    annotations: arrayType(
                      objectType({
                        type: literalType("url_citation"),
                        start_index: numberType(),
                        end_index: numberType(),
                        url: stringType(),
                        title: stringType()
                      })
                    )
                  })
                )
              }),
              objectType({
                type: literalType("function_call"),
                call_id: stringType(),
                name: stringType(),
                arguments: stringType()
              }),
              objectType({
                type: literalType("web_search_call")
              }),
              objectType({
                type: literalType("computer_call")
              }),
              objectType({
                type: literalType("reasoning"),
                summary: arrayType(
                  objectType({
                    type: literalType("summary_text"),
                    text: stringType()
                  })
                )
              })
            ])
          ),
          incomplete_details: objectType({ reason: stringType() }).nullable(),
          usage: usageSchema
        })
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const outputTextElements = response.output.filter((output) => output.type === "message").flatMap((output) => output.content).filter((content) => content.type === "output_text");
    const toolCalls = response.output.filter((output) => output.type === "function_call").map((output) => ({
      toolCallType: "function",
      toolCallId: output.call_id,
      toolName: output.name,
      args: output.arguments
    }));
    const reasoningSummary = (_b = (_a = response.output.find((item) => item.type === "reasoning")) == null ? void 0 : _a.summary) != null ? _b : null;
    return {
      text: outputTextElements.map((content) => content.text).join("\n"),
      sources: outputTextElements.flatMap(
        (content) => content.annotations.map((annotation) => {
          var _a2, _b2, _c2;
          return {
            sourceType: "url",
            id: (_c2 = (_b2 = (_a2 = this.config).generateId) == null ? void 0 : _b2.call(_a2)) != null ? _c2 : generateId$1(),
            url: annotation.url,
            title: annotation.title
          };
        })
      ),
      finishReason: mapOpenAIResponseFinishReason({
        finishReason: (_c = response.incomplete_details) == null ? void 0 : _c.reason,
        hasToolCalls: toolCalls.length > 0
      }),
      toolCalls: toolCalls.length > 0 ? toolCalls : void 0,
      reasoning: reasoningSummary ? reasoningSummary.map((summary) => ({
        type: "text",
        text: summary.text
      })) : void 0,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens
      },
      rawCall: {
        rawPrompt: void 0,
        rawSettings: {}
      },
      rawResponse: {
        headers: responseHeaders,
        body: rawResponse
      },
      request: {
        body: JSON.stringify(body)
      },
      response: {
        id: response.id,
        timestamp: new Date(response.created_at * 1e3),
        modelId: response.model
      },
      providerMetadata: {
        openai: {
          responseId: response.id,
          cachedPromptTokens: (_e = (_d = response.usage.input_tokens_details) == null ? void 0 : _d.cached_tokens) != null ? _e : null,
          reasoningTokens: (_g = (_f = response.usage.output_tokens_details) == null ? void 0 : _f.reasoning_tokens) != null ? _g : null
        }
      },
      warnings
    };
  }
  async doStream(options) {
    const { args: body, warnings } = this.getArgs(options);
    const { responseHeaders, value: response } = await postJsonToApi$1({
      url: this.config.url({
        path: "/responses",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      body: {
        ...body,
        stream: true
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler$1(
        openaiResponsesChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const self = this;
    let finishReason = "unknown";
    let promptTokens = NaN;
    let completionTokens = NaN;
    let cachedPromptTokens = null;
    let reasoningTokens = null;
    let responseId = null;
    const ongoingToolCalls = {};
    let hasToolCalls = false;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            if (isResponseOutputItemAddedChunk(value)) {
              if (value.item.type === "function_call") {
                ongoingToolCalls[value.output_index] = {
                  toolName: value.item.name,
                  toolCallId: value.item.call_id
                };
                controller.enqueue({
                  type: "tool-call-delta",
                  toolCallType: "function",
                  toolCallId: value.item.call_id,
                  toolName: value.item.name,
                  argsTextDelta: value.item.arguments
                });
              }
            } else if (isResponseFunctionCallArgumentsDeltaChunk(value)) {
              const toolCall = ongoingToolCalls[value.output_index];
              if (toolCall != null) {
                controller.enqueue({
                  type: "tool-call-delta",
                  toolCallType: "function",
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  argsTextDelta: value.delta
                });
              }
            } else if (isResponseCreatedChunk(value)) {
              responseId = value.response.id;
              controller.enqueue({
                type: "response-metadata",
                id: value.response.id,
                timestamp: new Date(value.response.created_at * 1e3),
                modelId: value.response.model
              });
            } else if (isTextDeltaChunk(value)) {
              controller.enqueue({
                type: "text-delta",
                textDelta: value.delta
              });
            } else if (isResponseReasoningSummaryTextDeltaChunk(value)) {
              controller.enqueue({
                type: "reasoning",
                textDelta: value.delta
              });
            } else if (isResponseOutputItemDoneChunk(value) && value.item.type === "function_call") {
              ongoingToolCalls[value.output_index] = void 0;
              hasToolCalls = true;
              controller.enqueue({
                type: "tool-call",
                toolCallType: "function",
                toolCallId: value.item.call_id,
                toolName: value.item.name,
                args: value.item.arguments
              });
            } else if (isResponseFinishedChunk(value)) {
              finishReason = mapOpenAIResponseFinishReason({
                finishReason: (_a = value.response.incomplete_details) == null ? void 0 : _a.reason,
                hasToolCalls
              });
              promptTokens = value.response.usage.input_tokens;
              completionTokens = value.response.usage.output_tokens;
              cachedPromptTokens = (_c = (_b = value.response.usage.input_tokens_details) == null ? void 0 : _b.cached_tokens) != null ? _c : cachedPromptTokens;
              reasoningTokens = (_e = (_d = value.response.usage.output_tokens_details) == null ? void 0 : _d.reasoning_tokens) != null ? _e : reasoningTokens;
            } else if (isResponseAnnotationAddedChunk(value)) {
              controller.enqueue({
                type: "source",
                source: {
                  sourceType: "url",
                  id: (_h = (_g = (_f = self.config).generateId) == null ? void 0 : _g.call(_f)) != null ? _h : generateId$1(),
                  url: value.annotation.url,
                  title: value.annotation.title
                }
              });
            }
          },
          flush(controller) {
            controller.enqueue({
              type: "finish",
              finishReason,
              usage: { promptTokens, completionTokens },
              ...(cachedPromptTokens != null || reasoningTokens != null) && {
                providerMetadata: {
                  openai: {
                    responseId,
                    cachedPromptTokens,
                    reasoningTokens
                  }
                }
              }
            });
          }
        })
      ),
      rawCall: {
        rawPrompt: void 0,
        rawSettings: {}
      },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      warnings
    };
  }
};
var usageSchema = objectType({
  input_tokens: numberType(),
  input_tokens_details: objectType({ cached_tokens: numberType().nullish() }).nullish(),
  output_tokens: numberType(),
  output_tokens_details: objectType({ reasoning_tokens: numberType().nullish() }).nullish()
});
var textDeltaChunkSchema = objectType({
  type: literalType("response.output_text.delta"),
  delta: stringType()
});
var responseFinishedChunkSchema = objectType({
  type: enumType(["response.completed", "response.incomplete"]),
  response: objectType({
    incomplete_details: objectType({ reason: stringType() }).nullish(),
    usage: usageSchema
  })
});
var responseCreatedChunkSchema = objectType({
  type: literalType("response.created"),
  response: objectType({
    id: stringType(),
    created_at: numberType(),
    model: stringType()
  })
});
var responseOutputItemDoneSchema = objectType({
  type: literalType("response.output_item.done"),
  output_index: numberType(),
  item: discriminatedUnionType("type", [
    objectType({
      type: literalType("message")
    }),
    objectType({
      type: literalType("function_call"),
      id: stringType(),
      call_id: stringType(),
      name: stringType(),
      arguments: stringType(),
      status: literalType("completed")
    })
  ])
});
var responseFunctionCallArgumentsDeltaSchema = objectType({
  type: literalType("response.function_call_arguments.delta"),
  item_id: stringType(),
  output_index: numberType(),
  delta: stringType()
});
var responseOutputItemAddedSchema = objectType({
  type: literalType("response.output_item.added"),
  output_index: numberType(),
  item: discriminatedUnionType("type", [
    objectType({
      type: literalType("message")
    }),
    objectType({
      type: literalType("function_call"),
      id: stringType(),
      call_id: stringType(),
      name: stringType(),
      arguments: stringType()
    })
  ])
});
var responseAnnotationAddedSchema = objectType({
  type: literalType("response.output_text.annotation.added"),
  annotation: objectType({
    type: literalType("url_citation"),
    url: stringType(),
    title: stringType()
  })
});
var responseReasoningSummaryTextDeltaSchema = objectType({
  type: literalType("response.reasoning_summary_text.delta"),
  item_id: stringType(),
  output_index: numberType(),
  summary_index: numberType(),
  delta: stringType()
});
var openaiResponsesChunkSchema = unionType([
  textDeltaChunkSchema,
  responseFinishedChunkSchema,
  responseCreatedChunkSchema,
  responseOutputItemDoneSchema,
  responseFunctionCallArgumentsDeltaSchema,
  responseOutputItemAddedSchema,
  responseAnnotationAddedSchema,
  responseReasoningSummaryTextDeltaSchema,
  objectType({ type: stringType() }).passthrough()
  // fallback for unknown chunks
]);
function isTextDeltaChunk(chunk) {
  return chunk.type === "response.output_text.delta";
}
function isResponseOutputItemDoneChunk(chunk) {
  return chunk.type === "response.output_item.done";
}
function isResponseFinishedChunk(chunk) {
  return chunk.type === "response.completed" || chunk.type === "response.incomplete";
}
function isResponseCreatedChunk(chunk) {
  return chunk.type === "response.created";
}
function isResponseFunctionCallArgumentsDeltaChunk(chunk) {
  return chunk.type === "response.function_call_arguments.delta";
}
function isResponseOutputItemAddedChunk(chunk) {
  return chunk.type === "response.output_item.added";
}
function isResponseAnnotationAddedChunk(chunk) {
  return chunk.type === "response.output_text.annotation.added";
}
function isResponseReasoningSummaryTextDeltaChunk(chunk) {
  return chunk.type === "response.reasoning_summary_text.delta";
}
function getResponsesModelConfig(modelId) {
  if (modelId.startsWith("o")) {
    if (modelId.startsWith("o1-mini") || modelId.startsWith("o1-preview")) {
      return {
        isReasoningModel: true,
        systemMessageMode: "remove",
        requiredAutoTruncation: false
      };
    }
    return {
      isReasoningModel: true,
      systemMessageMode: "developer",
      requiredAutoTruncation: false
    };
  }
  return {
    isReasoningModel: false,
    systemMessageMode: "system",
    requiredAutoTruncation: false
  };
}
var openaiResponsesProviderOptionsSchema = objectType({
  metadata: anyType().nullish(),
  parallelToolCalls: booleanType().nullish(),
  previousResponseId: stringType().nullish(),
  store: booleanType().nullish(),
  user: stringType().nullish(),
  reasoningEffort: stringType().nullish(),
  strictSchemas: booleanType().nullish(),
  instructions: stringType().nullish(),
  reasoningSummary: stringType().nullish()
});
var WebSearchPreviewParameters = objectType({});
function webSearchPreviewTool({
  searchContextSize,
  userLocation
} = {}) {
  return {
    type: "provider-defined",
    id: "openai.web_search_preview",
    args: {
      searchContextSize,
      userLocation
    },
    parameters: WebSearchPreviewParameters
  };
}
var openaiTools = {
  webSearchPreview: webSearchPreviewTool
};
var OpenAIProviderOptionsSchema = objectType({
  instructions: stringType().nullish(),
  speed: numberType().min(0.25).max(4).default(1).nullish()
});
var OpenAISpeechModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v1";
  }
  get provider() {
    return this.config.provider;
  }
  getArgs({
    text,
    voice = "alloy",
    outputFormat = "mp3",
    speed,
    instructions,
    providerOptions
  }) {
    const warnings = [];
    const openAIOptions = parseProviderOptions({
      provider: "openai",
      providerOptions,
      schema: OpenAIProviderOptionsSchema
    });
    const requestBody = {
      model: this.modelId,
      input: text,
      voice,
      response_format: "mp3",
      speed,
      instructions
    };
    if (outputFormat) {
      if (["mp3", "opus", "aac", "flac", "wav", "pcm"].includes(outputFormat)) {
        requestBody.response_format = outputFormat;
      } else {
        warnings.push({
          type: "unsupported-setting",
          setting: "outputFormat",
          details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`
        });
      }
    }
    if (openAIOptions) {
      const speechModelOptions = {};
      for (const key in speechModelOptions) {
        const value = speechModelOptions[key];
        if (value !== void 0) {
          requestBody[key] = value;
        }
      }
    }
    return {
      requestBody,
      warnings
    };
  }
  async doGenerate(options) {
    var _a, _b, _c;
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const { requestBody, warnings } = this.getArgs(options);
    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse
    } = await postJsonToApi$1({
      url: this.config.url({
        path: "/audio/speech",
        modelId: this.modelId
      }),
      headers: combineHeaders$1(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    return {
      audio,
      warnings,
      request: {
        body: JSON.stringify(requestBody)
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse
      }
    };
  }
};

// src/openai-provider.ts
function createOpenAI(options = {}) {
  var _a, _b, _c;
  const baseURL = (_a = withoutTrailingSlash$1(options.baseURL)) != null ? _a : "https://api.openai.com/v1";
  const compatibility = (_b = options.compatibility) != null ? _b : "compatible";
  const providerName = (_c = options.name) != null ? _c : "openai";
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey$1({
      apiKey: options.apiKey,
      environmentVariableName: "OPENAI_API_KEY",
      description: "OpenAI"
    })}`,
    "OpenAI-Organization": options.organization,
    "OpenAI-Project": options.project,
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => new OpenAIChatLanguageModel(modelId, settings, {
    provider: `${providerName}.chat`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    compatibility,
    fetch: options.fetch
  });
  const createCompletionModel = (modelId, settings = {}) => new OpenAICompletionLanguageModel(modelId, settings, {
    provider: `${providerName}.completion`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    compatibility,
    fetch: options.fetch
  });
  const createEmbeddingModel = (modelId, settings = {}) => new OpenAIEmbeddingModel(modelId, settings, {
    provider: `${providerName}.embedding`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createImageModel = (modelId, settings = {}) => new OpenAIImageModel(modelId, settings, {
    provider: `${providerName}.image`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createTranscriptionModel = (modelId) => new OpenAITranscriptionModel(modelId, {
    provider: `${providerName}.transcription`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createSpeechModel = (modelId) => new OpenAISpeechModel(modelId, {
    provider: `${providerName}.speech`,
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    fetch: options.fetch
  });
  const createLanguageModel = (modelId, settings) => {
    if (new.target) {
      throw new Error(
        "The OpenAI model function cannot be called with the new keyword."
      );
    }
    if (modelId === "gpt-3.5-turbo-instruct") {
      return createCompletionModel(
        modelId,
        settings
      );
    }
    return createChatModel(modelId, settings);
  };
  const createResponsesModel = (modelId) => {
    return new OpenAIResponsesLanguageModel(modelId, {
      provider: `${providerName}.responses`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch
    });
  };
  const provider = function(modelId, settings) {
    return createLanguageModel(modelId, settings);
  };
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.completion = createCompletionModel;
  provider.responses = createResponsesModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.tools = openaiTools;
  return provider;
}
createOpenAI({
  compatibility: "strict"
  // strict for OpenAI API
});

// src/anthropic-provider.ts
var anthropicErrorDataSchema = objectType({
  type: literalType("error"),
  error: objectType({
    type: stringType(),
    message: stringType()
  })
});
var anthropicFailedResponseHandler = createJsonErrorResponseHandler$1({
  errorSchema: anthropicErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
function prepareTools$2(mode) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  const betas = /* @__PURE__ */ new Set();
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings, betas };
  }
  const anthropicTools2 = [];
  for (const tool of tools) {
    switch (tool.type) {
      case "function":
        anthropicTools2.push({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters
        });
        break;
      case "provider-defined":
        switch (tool.id) {
          case "anthropic.computer_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "computer_20250124",
              display_width_px: tool.args.displayWidthPx,
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber
            });
            break;
          case "anthropic.computer_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "computer_20241022",
              display_width_px: tool.args.displayWidthPx,
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber
            });
            break;
          case "anthropic.text_editor_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "text_editor_20250124"
            });
            break;
          case "anthropic.text_editor_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "text_editor_20241022"
            });
            break;
          case "anthropic.bash_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "bash_20250124"
            });
            break;
          case "anthropic.bash_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "bash_20241022"
            });
            break;
          default:
            toolWarnings.push({ type: "unsupported-tool", tool });
            break;
        }
        break;
      default:
        toolWarnings.push({ type: "unsupported-tool", tool });
        break;
    }
  }
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return {
      tools: anthropicTools2,
      tool_choice: void 0,
      toolWarnings,
      betas
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        tools: anthropicTools2,
        tool_choice: { type: "auto" },
        toolWarnings,
        betas
      };
    case "required":
      return {
        tools: anthropicTools2,
        tool_choice: { type: "any" },
        toolWarnings,
        betas
      };
    case "none":
      return { tools: void 0, tool_choice: void 0, toolWarnings, betas };
    case "tool":
      return {
        tools: anthropicTools2,
        tool_choice: { type: "tool", name: toolChoice.toolName },
        toolWarnings,
        betas
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError$1({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
function convertToAnthropicMessagesPrompt({
  prompt,
  sendReasoning,
  warnings
}) {
  var _a, _b, _c, _d;
  const betas = /* @__PURE__ */ new Set();
  const blocks = groupIntoBlocks$1(prompt);
  let system = void 0;
  const messages = [];
  function getCacheControl(providerMetadata) {
    var _a2;
    const anthropic2 = providerMetadata == null ? void 0 : providerMetadata.anthropic;
    const cacheControlValue = (_a2 = anthropic2 == null ? void 0 : anthropic2.cacheControl) != null ? _a2 : anthropic2 == null ? void 0 : anthropic2.cache_control;
    return cacheControlValue;
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;
    switch (type) {
      case "system": {
        if (system != null) {
          throw new UnsupportedFunctionalityError$1({
            functionality: "Multiple system messages that are separated by user/assistant messages"
          });
        }
        system = block.messages.map(({ content, providerMetadata }) => ({
          type: "text",
          text: content,
          cache_control: getCacheControl(providerMetadata)
        }));
        break;
      }
      case "user": {
        const anthropicContent = [];
        for (const message of block.messages) {
          const { role, content } = message;
          switch (role) {
            case "user": {
              for (let j = 0; j < content.length; j++) {
                const part = content[j];
                const isLastPart = j === content.length - 1;
                const cacheControl = (_a = getCacheControl(part.providerMetadata)) != null ? _a : isLastPart ? getCacheControl(message.providerMetadata) : void 0;
                switch (part.type) {
                  case "text": {
                    anthropicContent.push({
                      type: "text",
                      text: part.text,
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "image": {
                    anthropicContent.push({
                      type: "image",
                      source: part.image instanceof URL ? {
                        type: "url",
                        url: part.image.toString()
                      } : {
                        type: "base64",
                        media_type: (_b = part.mimeType) != null ? _b : "image/jpeg",
                        data: convertUint8ArrayToBase64$1(part.image)
                      },
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "file": {
                    if (part.mimeType !== "application/pdf") {
                      throw new UnsupportedFunctionalityError$1({
                        functionality: "Non-PDF files in user messages"
                      });
                    }
                    betas.add("pdfs-2024-09-25");
                    anthropicContent.push({
                      type: "document",
                      source: part.data instanceof URL ? {
                        type: "url",
                        url: part.data.toString()
                      } : {
                        type: "base64",
                        media_type: "application/pdf",
                        data: part.data
                      },
                      cache_control: cacheControl
                    });
                    break;
                  }
                }
              }
              break;
            }
            case "tool": {
              for (let i2 = 0; i2 < content.length; i2++) {
                const part = content[i2];
                const isLastPart = i2 === content.length - 1;
                const cacheControl = (_c = getCacheControl(part.providerMetadata)) != null ? _c : isLastPart ? getCacheControl(message.providerMetadata) : void 0;
                const toolResultContent = part.content != null ? part.content.map((part2) => {
                  var _a2;
                  switch (part2.type) {
                    case "text":
                      return {
                        type: "text",
                        text: part2.text,
                        cache_control: void 0
                      };
                    case "image":
                      return {
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: (_a2 = part2.mimeType) != null ? _a2 : "image/jpeg",
                          data: part2.data
                        },
                        cache_control: void 0
                      };
                  }
                }) : JSON.stringify(part.result);
                anthropicContent.push({
                  type: "tool_result",
                  tool_use_id: part.toolCallId,
                  content: toolResultContent,
                  is_error: part.isError,
                  cache_control: cacheControl
                });
              }
              break;
            }
            default: {
              const _exhaustiveCheck = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }
        }
        messages.push({ role: "user", content: anthropicContent });
        break;
      }
      case "assistant": {
        const anthropicContent = [];
        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;
          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;
            const cacheControl = (_d = getCacheControl(part.providerMetadata)) != null ? _d : isLastContentPart ? getCacheControl(message.providerMetadata) : void 0;
            switch (part.type) {
              case "text": {
                anthropicContent.push({
                  type: "text",
                  text: (
                    // trim the last text part if it's the last message in the block
                    // because Anthropic does not allow trailing whitespace
                    // in pre-filled assistant responses
                    isLastBlock && isLastMessage && isLastContentPart ? part.text.trim() : part.text
                  ),
                  cache_control: cacheControl
                });
                break;
              }
              case "reasoning": {
                if (sendReasoning) {
                  anthropicContent.push({
                    type: "thinking",
                    thinking: part.text,
                    signature: part.signature,
                    cache_control: cacheControl
                  });
                } else {
                  warnings.push({
                    type: "other",
                    message: "sending reasoning content is disabled for this model"
                  });
                }
                break;
              }
              case "redacted-reasoning": {
                anthropicContent.push({
                  type: "redacted_thinking",
                  data: part.data,
                  cache_control: cacheControl
                });
                break;
              }
              case "tool-call": {
                anthropicContent.push({
                  type: "tool_use",
                  id: part.toolCallId,
                  name: part.toolName,
                  input: part.args,
                  cache_control: cacheControl
                });
                break;
              }
            }
          }
        }
        messages.push({ role: "assistant", content: anthropicContent });
        break;
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  return {
    prompt: { system, messages },
    betas
  };
}
function groupIntoBlocks$1(prompt) {
  const blocks = [];
  let currentBlock = void 0;
  for (const message of prompt) {
    const { role } = message;
    switch (role) {
      case "system": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "system") {
          currentBlock = { type: "system", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "assistant": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "assistant") {
          currentBlock = { type: "assistant", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "user": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "tool": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return blocks;
}

// src/map-anthropic-stop-reason.ts
function mapAnthropicStopReason(finishReason) {
  switch (finishReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool-calls";
    case "max_tokens":
      return "length";
    default:
      return "unknown";
  }
}

// src/anthropic-messages-language-model.ts
var AnthropicMessagesLanguageModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = "tool";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  supportsUrl(url) {
    return url.protocol === "https:";
  }
  get provider() {
    return this.config.provider;
  }
  get supportsImageUrls() {
    return this.config.supportsImageUrls;
  }
  async getArgs({
    mode,
    prompt,
    maxTokens = 4096,
    // 4096: max model output tokens TODO update default in v5
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    providerMetadata: providerOptions
  }) {
    var _a, _b, _c;
    const type = mode.type;
    const warnings = [];
    if (frequencyPenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "frequencyPenalty"
      });
    }
    if (presencePenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "presencePenalty"
      });
    }
    if (seed != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "seed"
      });
    }
    if (responseFormat != null && responseFormat.type !== "text") {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format is not supported."
      });
    }
    const { prompt: messagesPrompt, betas: messagesBetas } = convertToAnthropicMessagesPrompt({
      prompt,
      sendReasoning: (_a = this.settings.sendReasoning) != null ? _a : true,
      warnings
    });
    const anthropicOptions = parseProviderOptions({
      provider: "anthropic",
      providerOptions,
      schema: anthropicProviderOptionsSchema
    });
    const isThinking = ((_b = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _b.type) === "enabled";
    const thinkingBudget = (_c = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _c.budgetTokens;
    const baseArgs = {
      // model id:
      model: this.modelId,
      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_k: topK,
      top_p: topP,
      stop_sequences: stopSequences,
      // provider specific settings:
      ...isThinking && {
        thinking: { type: "enabled", budget_tokens: thinkingBudget }
      },
      // prompt:
      system: messagesPrompt.system,
      messages: messagesPrompt.messages
    };
    if (isThinking) {
      if (thinkingBudget == null) {
        throw new UnsupportedFunctionalityError$1({
          functionality: "thinking requires a budget"
        });
      }
      if (baseArgs.temperature != null) {
        baseArgs.temperature = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "temperature",
          details: "temperature is not supported when thinking is enabled"
        });
      }
      if (topK != null) {
        baseArgs.top_k = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "topK",
          details: "topK is not supported when thinking is enabled"
        });
      }
      if (topP != null) {
        baseArgs.top_p = void 0;
        warnings.push({
          type: "unsupported-setting",
          setting: "topP",
          details: "topP is not supported when thinking is enabled"
        });
      }
      baseArgs.max_tokens = maxTokens + thinkingBudget;
    }
    switch (type) {
      case "regular": {
        const {
          tools,
          tool_choice,
          toolWarnings,
          betas: toolsBetas
        } = prepareTools$2(mode);
        return {
          args: { ...baseArgs, tools, tool_choice },
          warnings: [...warnings, ...toolWarnings],
          betas: /* @__PURE__ */ new Set([...messagesBetas, ...toolsBetas])
        };
      }
      case "object-json": {
        throw new UnsupportedFunctionalityError$1({
          functionality: "json-mode object generation"
        });
      }
      case "object-tool": {
        const { name, description, parameters } = mode.tool;
        return {
          args: {
            ...baseArgs,
            tools: [{ name, description, input_schema: parameters }],
            tool_choice: { type: "tool", name }
          },
          warnings,
          betas: messagesBetas
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  async getHeaders({
    betas,
    headers
  }) {
    return combineHeaders$1(
      await resolve(this.config.headers),
      betas.size > 0 ? { "anthropic-beta": Array.from(betas).join(",") } : {},
      headers
    );
  }
  buildRequestUrl(isStreaming) {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.config).buildRequestUrl) == null ? void 0 : _b.call(_a, this.config.baseURL, isStreaming)) != null ? _c : `${this.config.baseURL}/messages`;
  }
  transformRequestBody(args) {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.config).transformRequestBody) == null ? void 0 : _b.call(_a, args)) != null ? _c : args;
  }
  async doGenerate(options) {
    var _a, _b, _c, _d;
    const { args, warnings, betas } = await this.getArgs(options);
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi$1({
      url: this.buildRequestUrl(false),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(args),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        anthropicMessagesResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    let text = "";
    for (const content of response.content) {
      if (content.type === "text") {
        text += content.text;
      }
    }
    let toolCalls = void 0;
    if (response.content.some((content) => content.type === "tool_use")) {
      toolCalls = [];
      for (const content of response.content) {
        if (content.type === "tool_use") {
          toolCalls.push({
            toolCallType: "function",
            toolCallId: content.id,
            toolName: content.name,
            args: JSON.stringify(content.input)
          });
        }
      }
    }
    const reasoning = response.content.filter(
      (content) => content.type === "redacted_thinking" || content.type === "thinking"
    ).map(
      (content) => content.type === "thinking" ? {
        type: "text",
        text: content.thinking,
        signature: content.signature
      } : {
        type: "redacted",
        data: content.data
      }
    );
    return {
      text,
      reasoning: reasoning.length > 0 ? reasoning : void 0,
      toolCalls,
      finishReason: mapAnthropicStopReason(response.stop_reason),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: {
        headers: responseHeaders,
        body: rawResponse
      },
      response: {
        id: (_a = response.id) != null ? _a : void 0,
        modelId: (_b = response.model) != null ? _b : void 0
      },
      warnings,
      providerMetadata: {
        anthropic: {
          cacheCreationInputTokens: (_c = response.usage.cache_creation_input_tokens) != null ? _c : null,
          cacheReadInputTokens: (_d = response.usage.cache_read_input_tokens) != null ? _d : null
        }
      },
      request: { body: JSON.stringify(args) }
    };
  }
  async doStream(options) {
    const { args, warnings, betas } = await this.getArgs(options);
    const body = { ...args, stream: true };
    const { responseHeaders, value: response } = await postJsonToApi$1({
      url: this.buildRequestUrl(true),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(body),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler$1(
        anthropicMessagesChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    let finishReason = "unknown";
    const usage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN
    };
    const toolCallContentBlocks = {};
    let providerMetadata = void 0;
    let blockType = void 0;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            var _a, _b, _c, _d;
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            switch (value.type) {
              case "ping": {
                return;
              }
              case "content_block_start": {
                const contentBlockType = value.content_block.type;
                blockType = contentBlockType;
                switch (contentBlockType) {
                  case "text":
                  case "thinking": {
                    return;
                  }
                  case "redacted_thinking": {
                    controller.enqueue({
                      type: "redacted-reasoning",
                      data: value.content_block.data
                    });
                    return;
                  }
                  case "tool_use": {
                    toolCallContentBlocks[value.index] = {
                      toolCallId: value.content_block.id,
                      toolName: value.content_block.name,
                      jsonText: ""
                    };
                    return;
                  }
                  default: {
                    const _exhaustiveCheck = contentBlockType;
                    throw new Error(
                      `Unsupported content block type: ${_exhaustiveCheck}`
                    );
                  }
                }
              }
              case "content_block_stop": {
                if (toolCallContentBlocks[value.index] != null) {
                  const contentBlock = toolCallContentBlocks[value.index];
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: contentBlock.toolCallId,
                    toolName: contentBlock.toolName,
                    args: contentBlock.jsonText
                  });
                  delete toolCallContentBlocks[value.index];
                }
                blockType = void 0;
                return;
              }
              case "content_block_delta": {
                const deltaType = value.delta.type;
                switch (deltaType) {
                  case "text_delta": {
                    controller.enqueue({
                      type: "text-delta",
                      textDelta: value.delta.text
                    });
                    return;
                  }
                  case "thinking_delta": {
                    controller.enqueue({
                      type: "reasoning",
                      textDelta: value.delta.thinking
                    });
                    return;
                  }
                  case "signature_delta": {
                    if (blockType === "thinking") {
                      controller.enqueue({
                        type: "reasoning-signature",
                        signature: value.delta.signature
                      });
                    }
                    return;
                  }
                  case "input_json_delta": {
                    const contentBlock = toolCallContentBlocks[value.index];
                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: contentBlock.toolCallId,
                      toolName: contentBlock.toolName,
                      argsTextDelta: value.delta.partial_json
                    });
                    contentBlock.jsonText += value.delta.partial_json;
                    return;
                  }
                  default: {
                    const _exhaustiveCheck = deltaType;
                    throw new Error(
                      `Unsupported delta type: ${_exhaustiveCheck}`
                    );
                  }
                }
              }
              case "message_start": {
                usage.promptTokens = value.message.usage.input_tokens;
                usage.completionTokens = value.message.usage.output_tokens;
                providerMetadata = {
                  anthropic: {
                    cacheCreationInputTokens: (_a = value.message.usage.cache_creation_input_tokens) != null ? _a : null,
                    cacheReadInputTokens: (_b = value.message.usage.cache_read_input_tokens) != null ? _b : null
                  }
                };
                controller.enqueue({
                  type: "response-metadata",
                  id: (_c = value.message.id) != null ? _c : void 0,
                  modelId: (_d = value.message.model) != null ? _d : void 0
                });
                return;
              }
              case "message_delta": {
                usage.completionTokens = value.usage.output_tokens;
                finishReason = mapAnthropicStopReason(value.delta.stop_reason);
                return;
              }
              case "message_stop": {
                controller.enqueue({
                  type: "finish",
                  finishReason,
                  usage,
                  providerMetadata
                });
                return;
              }
              case "error": {
                controller.enqueue({ type: "error", error: value.error });
                return;
              }
              default: {
                const _exhaustiveCheck = value;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body: JSON.stringify(body) }
    };
  }
};
var anthropicMessagesResponseSchema = objectType({
  type: literalType("message"),
  id: stringType().nullish(),
  model: stringType().nullish(),
  content: arrayType(
    discriminatedUnionType("type", [
      objectType({
        type: literalType("text"),
        text: stringType()
      }),
      objectType({
        type: literalType("thinking"),
        thinking: stringType(),
        signature: stringType()
      }),
      objectType({
        type: literalType("redacted_thinking"),
        data: stringType()
      }),
      objectType({
        type: literalType("tool_use"),
        id: stringType(),
        name: stringType(),
        input: unknownType()
      })
    ])
  ),
  stop_reason: stringType().nullish(),
  usage: objectType({
    input_tokens: numberType(),
    output_tokens: numberType(),
    cache_creation_input_tokens: numberType().nullish(),
    cache_read_input_tokens: numberType().nullish()
  })
});
var anthropicMessagesChunkSchema = discriminatedUnionType("type", [
  objectType({
    type: literalType("message_start"),
    message: objectType({
      id: stringType().nullish(),
      model: stringType().nullish(),
      usage: objectType({
        input_tokens: numberType(),
        output_tokens: numberType(),
        cache_creation_input_tokens: numberType().nullish(),
        cache_read_input_tokens: numberType().nullish()
      })
    })
  }),
  objectType({
    type: literalType("content_block_start"),
    index: numberType(),
    content_block: discriminatedUnionType("type", [
      objectType({
        type: literalType("text"),
        text: stringType()
      }),
      objectType({
        type: literalType("thinking"),
        thinking: stringType()
      }),
      objectType({
        type: literalType("tool_use"),
        id: stringType(),
        name: stringType()
      }),
      objectType({
        type: literalType("redacted_thinking"),
        data: stringType()
      })
    ])
  }),
  objectType({
    type: literalType("content_block_delta"),
    index: numberType(),
    delta: discriminatedUnionType("type", [
      objectType({
        type: literalType("input_json_delta"),
        partial_json: stringType()
      }),
      objectType({
        type: literalType("text_delta"),
        text: stringType()
      }),
      objectType({
        type: literalType("thinking_delta"),
        thinking: stringType()
      }),
      objectType({
        type: literalType("signature_delta"),
        signature: stringType()
      })
    ])
  }),
  objectType({
    type: literalType("content_block_stop"),
    index: numberType()
  }),
  objectType({
    type: literalType("error"),
    error: objectType({
      type: stringType(),
      message: stringType()
    })
  }),
  objectType({
    type: literalType("message_delta"),
    delta: objectType({ stop_reason: stringType().nullish() }),
    usage: objectType({ output_tokens: numberType() })
  }),
  objectType({
    type: literalType("message_stop")
  }),
  objectType({
    type: literalType("ping")
  })
]);
var anthropicProviderOptionsSchema = objectType({
  thinking: objectType({
    type: unionType([literalType("enabled"), literalType("disabled")]),
    budgetTokens: numberType().optional()
  }).optional()
});
var Bash20241022Parameters = objectType({
  command: stringType(),
  restart: booleanType().optional()
});
function bashTool_20241022(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.bash_20241022",
    args: {},
    parameters: Bash20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
var Bash20250124Parameters = objectType({
  command: stringType(),
  restart: booleanType().optional()
});
function bashTool_20250124(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.bash_20250124",
    args: {},
    parameters: Bash20250124Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
var TextEditor20241022Parameters = objectType({
  command: enumType(["view", "create", "str_replace", "insert", "undo_edit"]),
  path: stringType(),
  file_text: stringType().optional(),
  insert_line: numberType().int().optional(),
  new_str: stringType().optional(),
  old_str: stringType().optional(),
  view_range: arrayType(numberType().int()).optional()
});
function textEditorTool_20241022(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.text_editor_20241022",
    args: {},
    parameters: TextEditor20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
var TextEditor20250124Parameters = objectType({
  command: enumType(["view", "create", "str_replace", "insert", "undo_edit"]),
  path: stringType(),
  file_text: stringType().optional(),
  insert_line: numberType().int().optional(),
  new_str: stringType().optional(),
  old_str: stringType().optional(),
  view_range: arrayType(numberType().int()).optional()
});
function textEditorTool_20250124(options = {}) {
  return {
    type: "provider-defined",
    id: "anthropic.text_editor_20250124",
    args: {},
    parameters: TextEditor20250124Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
var Computer20241022Parameters = objectType({
  action: enumType([
    "key",
    "type",
    "mouse_move",
    "left_click",
    "left_click_drag",
    "right_click",
    "middle_click",
    "double_click",
    "screenshot",
    "cursor_position"
  ]),
  coordinate: arrayType(numberType().int()).optional(),
  text: stringType().optional()
});
function computerTool_20241022(options) {
  return {
    type: "provider-defined",
    id: "anthropic.computer_20241022",
    args: {
      displayWidthPx: options.displayWidthPx,
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber
    },
    parameters: Computer20241022Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
var Computer20250124Parameters = objectType({
  action: enumType([
    "key",
    "hold_key",
    "type",
    "cursor_position",
    "mouse_move",
    "left_mouse_down",
    "left_mouse_up",
    "left_click",
    "left_click_drag",
    "right_click",
    "middle_click",
    "double_click",
    "triple_click",
    "scroll",
    "wait",
    "screenshot"
  ]),
  coordinate: tupleType([numberType().int(), numberType().int()]).optional(),
  duration: numberType().optional(),
  scroll_amount: numberType().optional(),
  scroll_direction: enumType(["up", "down", "left", "right"]).optional(),
  start_coordinate: tupleType([numberType().int(), numberType().int()]).optional(),
  text: stringType().optional()
});
function computerTool_20250124(options) {
  return {
    type: "provider-defined",
    id: "anthropic.computer_20250124",
    args: {
      displayWidthPx: options.displayWidthPx,
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber
    },
    parameters: Computer20250124Parameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent
  };
}
var anthropicTools = {
  bash_20241022: bashTool_20241022,
  bash_20250124: bashTool_20250124,
  textEditor_20241022: textEditorTool_20241022,
  textEditor_20250124: textEditorTool_20250124,
  computer_20241022: computerTool_20241022,
  computer_20250124: computerTool_20250124
};

// src/anthropic-provider.ts
function createAnthropic(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash$1(options.baseURL)) != null ? _a : "https://api.anthropic.com/v1";
  const getHeaders = () => ({
    "anthropic-version": "2023-06-01",
    "x-api-key": loadApiKey$1({
      apiKey: options.apiKey,
      environmentVariableName: "ANTHROPIC_API_KEY",
      description: "Anthropic"
    }),
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => new AnthropicMessagesLanguageModel(modelId, settings, {
    provider: "anthropic.messages",
    baseURL,
    headers: getHeaders,
    fetch: options.fetch,
    supportsImageUrls: true
  });
  const provider = function(modelId, settings) {
    if (new.target) {
      throw new Error(
        "The Anthropic model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.tools = anthropicTools;
  return provider;
}
createAnthropic();

// src/google-provider.ts

// src/convert-json-schema-to-openapi-schema.ts
function convertJSONSchemaToOpenAPISchema(jsonSchema) {
  if (isEmptyObjectSchema(jsonSchema)) {
    return void 0;
  }
  if (typeof jsonSchema === "boolean") {
    return { type: "boolean", properties: {} };
  }
  const {
    type,
    description,
    required,
    properties,
    items,
    allOf,
    anyOf,
    oneOf,
    format,
    const: constValue,
    minLength,
    enum: enumValues
  } = jsonSchema;
  const result = {};
  if (description)
    result.description = description;
  if (required)
    result.required = required;
  if (format)
    result.format = format;
  if (constValue !== void 0) {
    result.enum = [constValue];
  }
  if (type) {
    if (Array.isArray(type)) {
      if (type.includes("null")) {
        result.type = type.filter((t) => t !== "null")[0];
        result.nullable = true;
      } else {
        result.type = type;
      }
    } else if (type === "null") {
      result.type = "null";
    } else {
      result.type = type;
    }
  }
  if (enumValues !== void 0) {
    result.enum = enumValues;
  }
  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchema(value);
        return acc;
      },
      {}
    );
  }
  if (items) {
    result.items = Array.isArray(items) ? items.map(convertJSONSchemaToOpenAPISchema) : convertJSONSchemaToOpenAPISchema(items);
  }
  if (allOf) {
    result.allOf = allOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (anyOf) {
    if (anyOf.some(
      (schema) => typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null"
    )) {
      const nonNullSchemas = anyOf.filter(
        (schema) => !(typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null")
      );
      if (nonNullSchemas.length === 1) {
        const converted = convertJSONSchemaToOpenAPISchema(nonNullSchemas[0]);
        if (typeof converted === "object") {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        result.anyOf = nonNullSchemas.map(convertJSONSchemaToOpenAPISchema);
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(convertJSONSchemaToOpenAPISchema);
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (minLength !== void 0) {
    result.minLength = minLength;
  }
  return result;
}
function isEmptyObjectSchema(jsonSchema) {
  return jsonSchema != null && typeof jsonSchema === "object" && jsonSchema.type === "object" && (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0);
}
function convertToGoogleGenerativeAIMessages(prompt) {
  var _a, _b;
  const systemInstructionParts = [];
  const contents = [];
  let systemMessagesAllowed = true;
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        if (!systemMessagesAllowed) {
          throw new UnsupportedFunctionalityError$1({
            functionality: "system messages are only supported at the beginning of the conversation"
          });
        }
        systemInstructionParts.push({ text: content });
        break;
      }
      case "user": {
        systemMessagesAllowed = false;
        const parts = [];
        for (const part of content) {
          switch (part.type) {
            case "text": {
              parts.push({ text: part.text });
              break;
            }
            case "image": {
              parts.push(
                part.image instanceof URL ? {
                  fileData: {
                    mimeType: (_a = part.mimeType) != null ? _a : "image/jpeg",
                    fileUri: part.image.toString()
                  }
                } : {
                  inlineData: {
                    mimeType: (_b = part.mimeType) != null ? _b : "image/jpeg",
                    data: convertUint8ArrayToBase64$1(part.image)
                  }
                }
              );
              break;
            }
            case "file": {
              parts.push(
                part.data instanceof URL ? {
                  fileData: {
                    mimeType: part.mimeType,
                    fileUri: part.data.toString()
                  }
                } : {
                  inlineData: {
                    mimeType: part.mimeType,
                    data: part.data
                  }
                }
              );
              break;
            }
          }
        }
        contents.push({ role: "user", parts });
        break;
      }
      case "assistant": {
        systemMessagesAllowed = false;
        contents.push({
          role: "model",
          parts: content.map((part) => {
            switch (part.type) {
              case "text": {
                return part.text.length === 0 ? void 0 : { text: part.text };
              }
              case "file": {
                if (part.mimeType !== "image/png") {
                  throw new UnsupportedFunctionalityError$1({
                    functionality: "Only PNG images are supported in assistant messages"
                  });
                }
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError$1({
                    functionality: "File data URLs in assistant messages are not supported"
                  });
                }
                return {
                  inlineData: {
                    mimeType: part.mimeType,
                    data: part.data
                  }
                };
              }
              case "tool-call": {
                return {
                  functionCall: {
                    name: part.toolName,
                    args: part.args
                  }
                };
              }
            }
          }).filter((part) => part !== void 0)
        });
        break;
      }
      case "tool": {
        systemMessagesAllowed = false;
        contents.push({
          role: "user",
          parts: content.map((part) => ({
            functionResponse: {
              name: part.toolName,
              response: {
                name: part.toolName,
                content: part.result
              }
            }
          }))
        });
        break;
      }
    }
  }
  return {
    systemInstruction: systemInstructionParts.length > 0 ? { parts: systemInstructionParts } : void 0,
    contents
  };
}

// src/get-model-path.ts
function getModelPath(modelId) {
  return modelId.includes("/") ? modelId : `models/${modelId}`;
}
var googleErrorDataSchema = objectType({
  error: objectType({
    code: numberType().nullable(),
    message: stringType(),
    status: stringType()
  })
});
var googleFailedResponseHandler = createJsonErrorResponseHandler$1({
  errorSchema: googleErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
function prepareTools$1(mode, useSearchGrounding, dynamicRetrievalConfig, modelId) {
  var _a, _b;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  const isGemini2 = modelId.includes("gemini-2");
  const supportsDynamicRetrieval = modelId.includes("gemini-1.5-flash") && !modelId.includes("-8b");
  if (useSearchGrounding) {
    return {
      tools: isGemini2 ? { googleSearch: {} } : {
        googleSearchRetrieval: !supportsDynamicRetrieval || !dynamicRetrievalConfig ? {} : { dynamicRetrievalConfig }
      },
      toolConfig: void 0,
      toolWarnings
    };
  }
  if (tools == null) {
    return { tools: void 0, toolConfig: void 0, toolWarnings };
  }
  const functionDeclarations = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      functionDeclarations.push({
        name: tool.name,
        description: (_b = tool.description) != null ? _b : "",
        parameters: convertJSONSchemaToOpenAPISchema(tool.parameters)
      });
    }
  }
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return {
      tools: { functionDeclarations },
      toolConfig: void 0,
      toolWarnings
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        toolWarnings
      };
    case "none":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "NONE" } },
        toolWarnings
      };
    case "required":
      return {
        tools: { functionDeclarations },
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
        toolWarnings
      };
    case "tool":
      return {
        tools: { functionDeclarations },
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [toolChoice.toolName]
          }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError$1({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}

// src/map-google-generative-ai-finish-reason.ts
function mapGoogleGenerativeAIFinishReason({
  finishReason,
  hasToolCalls
}) {
  switch (finishReason) {
    case "STOP":
      return hasToolCalls ? "tool-calls" : "stop";
    case "MAX_TOKENS":
      return "length";
    case "IMAGE_SAFETY":
    case "RECITATION":
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content-filter";
    case "FINISH_REASON_UNSPECIFIED":
    case "OTHER":
      return "other";
    case "MALFORMED_FUNCTION_CALL":
      return "error";
    default:
      return "unknown";
  }
}

// src/google-generative-ai-language-model.ts
var GoogleGenerativeAILanguageModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = "json";
    this.supportsImageUrls = false;
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get supportsStructuredOutputs() {
    var _a;
    return (_a = this.settings.structuredOutputs) != null ? _a : true;
  }
  get provider() {
    return this.config.provider;
  }
  async getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    providerMetadata
  }) {
    var _a, _b, _c;
    const type = mode.type;
    const warnings = [];
    const googleOptions = parseProviderOptions({
      provider: "google",
      providerOptions: providerMetadata,
      schema: googleGenerativeAIProviderOptionsSchema
    });
    if (((_a = googleOptions == null ? void 0 : googleOptions.thinkingConfig) == null ? void 0 : _a.includeThoughts) === true && !this.config.provider.startsWith("google.vertex.")) {
      warnings.push({
        type: "other",
        message: `The 'includeThoughts' option is only supported with the Google Vertex provider and might not be supported or could behave unexpectedly with the current Google provider (${this.config.provider}).`
      });
    }
    const generationConfig = {
      // standardized settings:
      maxOutputTokens: maxTokens,
      temperature,
      topK,
      topP,
      frequencyPenalty,
      presencePenalty,
      stopSequences,
      seed,
      // response format:
      responseMimeType: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? "application/json" : void 0,
      responseSchema: (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && // Google GenAI does not support all OpenAPI Schema features,
      // so this is needed as an escape hatch:
      this.supportsStructuredOutputs ? convertJSONSchemaToOpenAPISchema(responseFormat.schema) : void 0,
      ...this.settings.audioTimestamp && {
        audioTimestamp: this.settings.audioTimestamp
      },
      // provider options:
      responseModalities: googleOptions == null ? void 0 : googleOptions.responseModalities,
      thinkingConfig: googleOptions == null ? void 0 : googleOptions.thinkingConfig
    };
    const { contents, systemInstruction } = convertToGoogleGenerativeAIMessages(prompt);
    switch (type) {
      case "regular": {
        const { tools, toolConfig, toolWarnings } = prepareTools$1(
          mode,
          (_b = this.settings.useSearchGrounding) != null ? _b : false,
          this.settings.dynamicRetrievalConfig,
          this.modelId
        );
        return {
          args: {
            generationConfig,
            contents,
            systemInstruction,
            safetySettings: this.settings.safetySettings,
            tools,
            toolConfig,
            cachedContent: this.settings.cachedContent
          },
          warnings: [...warnings, ...toolWarnings]
        };
      }
      case "object-json": {
        return {
          args: {
            generationConfig: {
              ...generationConfig,
              responseMimeType: "application/json",
              responseSchema: mode.schema != null && // Google GenAI does not support all OpenAPI Schema features,
              // so this is needed as an escape hatch:
              this.supportsStructuredOutputs ? convertJSONSchemaToOpenAPISchema(mode.schema) : void 0
            },
            contents,
            systemInstruction,
            safetySettings: this.settings.safetySettings,
            cachedContent: this.settings.cachedContent
          },
          warnings
        };
      }
      case "object-tool": {
        return {
          args: {
            generationConfig,
            contents,
            tools: {
              functionDeclarations: [
                {
                  name: mode.tool.name,
                  description: (_c = mode.tool.description) != null ? _c : "",
                  parameters: convertJSONSchemaToOpenAPISchema(
                    mode.tool.parameters
                  )
                }
              ]
            },
            toolConfig: { functionCallingConfig: { mode: "ANY" } },
            safetySettings: this.settings.safetySettings,
            cachedContent: this.settings.cachedContent
          },
          warnings
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  supportsUrl(url) {
    return this.config.isSupportedUrl(url);
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e;
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);
    const mergedHeaders = combineHeaders$1(
      await resolve(this.config.headers),
      options.headers
    );
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi$1({
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId
      )}:generateContent`,
      headers: mergedHeaders,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(responseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { contents: rawPrompt, ...rawSettings } = args;
    const candidate = response.candidates[0];
    const parts = candidate.content == null || typeof candidate.content !== "object" || !("parts" in candidate.content) ? [] : candidate.content.parts;
    const toolCalls = getToolCallsFromParts({
      parts,
      // Use candidateParts
      generateId: this.config.generateId
    });
    const usageMetadata = response.usageMetadata;
    return {
      text: getTextFromParts(parts),
      reasoning: getReasoningDetailsFromParts(parts),
      files: (_a = getInlineDataParts(parts)) == null ? void 0 : _a.map((part) => ({
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      })),
      toolCalls,
      finishReason: mapGoogleGenerativeAIFinishReason({
        finishReason: candidate.finishReason,
        hasToolCalls: toolCalls != null && toolCalls.length > 0
      }),
      usage: {
        promptTokens: (_b = usageMetadata == null ? void 0 : usageMetadata.promptTokenCount) != null ? _b : NaN,
        completionTokens: (_c = usageMetadata == null ? void 0 : usageMetadata.candidatesTokenCount) != null ? _c : NaN
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders, body: rawResponse },
      warnings,
      providerMetadata: {
        google: {
          groundingMetadata: (_d = candidate.groundingMetadata) != null ? _d : null,
          safetyRatings: (_e = candidate.safetyRatings) != null ? _e : null
        }
      },
      sources: extractSources({
        groundingMetadata: candidate.groundingMetadata,
        generateId: this.config.generateId
      }),
      request: { body }
    };
  }
  async doStream(options) {
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);
    const headers = combineHeaders$1(
      await resolve(this.config.headers),
      options.headers
    );
    const { responseHeaders, value: response } = await postJsonToApi$1({
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId
      )}:streamGenerateContent?alt=sse`,
      headers,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler$1(chunkSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { contents: rawPrompt, ...rawSettings } = args;
    let finishReason = "unknown";
    let usage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN
    };
    let providerMetadata = void 0;
    const generateId2 = this.config.generateId;
    let hasToolCalls = false;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f;
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            const usageMetadata = value.usageMetadata;
            if (usageMetadata != null) {
              usage = {
                promptTokens: (_a = usageMetadata.promptTokenCount) != null ? _a : NaN,
                completionTokens: (_b = usageMetadata.candidatesTokenCount) != null ? _b : NaN
              };
            }
            const candidate = (_c = value.candidates) == null ? void 0 : _c[0];
            if (candidate == null) {
              return;
            }
            const content = candidate.content;
            if (content != null) {
              const deltaText = getTextFromParts(content.parts);
              if (deltaText != null) {
                controller.enqueue({
                  type: "text-delta",
                  textDelta: deltaText
                });
              }
              const reasoningDeltaText = getReasoningDetailsFromParts(
                content.parts
              );
              if (reasoningDeltaText != null) {
                for (const part of reasoningDeltaText) {
                  controller.enqueue({
                    type: "reasoning",
                    textDelta: part.text
                  });
                }
              }
              const inlineDataParts = getInlineDataParts(content.parts);
              if (inlineDataParts != null) {
                for (const part of inlineDataParts) {
                  controller.enqueue({
                    type: "file",
                    mimeType: part.inlineData.mimeType,
                    data: part.inlineData.data
                  });
                }
              }
              const toolCallDeltas = getToolCallsFromParts({
                parts: content.parts,
                generateId: generateId2
              });
              if (toolCallDeltas != null) {
                for (const toolCall of toolCallDeltas) {
                  controller.enqueue({
                    type: "tool-call-delta",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    argsTextDelta: toolCall.args
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    args: toolCall.args
                  });
                  hasToolCalls = true;
                }
              }
            }
            if (candidate.finishReason != null) {
              finishReason = mapGoogleGenerativeAIFinishReason({
                finishReason: candidate.finishReason,
                hasToolCalls
              });
              const sources = (_d = extractSources({
                groundingMetadata: candidate.groundingMetadata,
                generateId: generateId2
              })) != null ? _d : [];
              for (const source of sources) {
                controller.enqueue({ type: "source", source });
              }
              providerMetadata = {
                google: {
                  groundingMetadata: (_e = candidate.groundingMetadata) != null ? _e : null,
                  safetyRatings: (_f = candidate.safetyRatings) != null ? _f : null
                }
              };
            }
          },
          flush(controller) {
            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
              providerMetadata
            });
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body }
    };
  }
};
function getToolCallsFromParts({
  parts,
  generateId: generateId2
}) {
  const functionCallParts = parts == null ? void 0 : parts.filter(
    (part) => "functionCall" in part
  );
  return functionCallParts == null || functionCallParts.length === 0 ? void 0 : functionCallParts.map((part) => ({
    toolCallType: "function",
    toolCallId: generateId2(),
    toolName: part.functionCall.name,
    args: JSON.stringify(part.functionCall.args)
  }));
}
function getTextFromParts(parts) {
  const textParts = parts == null ? void 0 : parts.filter(
    (part) => "text" in part && part.thought !== true
  );
  return textParts == null || textParts.length === 0 ? void 0 : textParts.map((part) => part.text).join("");
}
function getReasoningDetailsFromParts(parts) {
  const reasoningParts = parts == null ? void 0 : parts.filter(
    (part) => "text" in part && part.thought === true && part.text != null
  );
  return reasoningParts == null || reasoningParts.length === 0 ? void 0 : reasoningParts.map((part) => ({ type: "text", text: part.text }));
}
function getInlineDataParts(parts) {
  return parts == null ? void 0 : parts.filter(
    (part) => "inlineData" in part
  );
}
function extractSources({
  groundingMetadata,
  generateId: generateId2
}) {
  var _a;
  return (_a = groundingMetadata == null ? void 0 : groundingMetadata.groundingChunks) == null ? void 0 : _a.filter(
    (chunk) => chunk.web != null
  ).map((chunk) => ({
    sourceType: "url",
    id: generateId2(),
    url: chunk.web.uri,
    title: chunk.web.title
  }));
}
var contentSchema = objectType({
  parts: arrayType(
    unionType([
      // note: order matters since text can be fully empty
      objectType({
        functionCall: objectType({
          name: stringType(),
          args: unknownType()
        })
      }),
      objectType({
        inlineData: objectType({
          mimeType: stringType(),
          data: stringType()
        })
      }),
      objectType({
        text: stringType().nullish(),
        thought: booleanType().nullish()
      })
    ])
  ).nullish()
});
var groundingChunkSchema = objectType({
  web: objectType({ uri: stringType(), title: stringType() }).nullish(),
  retrievedContext: objectType({ uri: stringType(), title: stringType() }).nullish()
});
var groundingMetadataSchema = objectType({
  webSearchQueries: arrayType(stringType()).nullish(),
  retrievalQueries: arrayType(stringType()).nullish(),
  searchEntryPoint: objectType({ renderedContent: stringType() }).nullish(),
  groundingChunks: arrayType(groundingChunkSchema).nullish(),
  groundingSupports: arrayType(
    objectType({
      segment: objectType({
        startIndex: numberType().nullish(),
        endIndex: numberType().nullish(),
        text: stringType().nullish()
      }),
      segment_text: stringType().nullish(),
      groundingChunkIndices: arrayType(numberType()).nullish(),
      supportChunkIndices: arrayType(numberType()).nullish(),
      confidenceScores: arrayType(numberType()).nullish(),
      confidenceScore: arrayType(numberType()).nullish()
    })
  ).nullish(),
  retrievalMetadata: unionType([
    objectType({
      webDynamicRetrievalScore: numberType()
    }),
    objectType({})
  ]).nullish()
});
var safetyRatingSchema = objectType({
  category: stringType().nullish(),
  probability: stringType().nullish(),
  probabilityScore: numberType().nullish(),
  severity: stringType().nullish(),
  severityScore: numberType().nullish(),
  blocked: booleanType().nullish()
});
var responseSchema = objectType({
  candidates: arrayType(
    objectType({
      content: contentSchema.nullish().or(objectType({}).strict()),
      finishReason: stringType().nullish(),
      safetyRatings: arrayType(safetyRatingSchema).nullish(),
      groundingMetadata: groundingMetadataSchema.nullish()
    })
  ),
  usageMetadata: objectType({
    promptTokenCount: numberType().nullish(),
    candidatesTokenCount: numberType().nullish(),
    totalTokenCount: numberType().nullish()
  }).nullish()
});
var chunkSchema = objectType({
  candidates: arrayType(
    objectType({
      content: contentSchema.nullish(),
      finishReason: stringType().nullish(),
      safetyRatings: arrayType(safetyRatingSchema).nullish(),
      groundingMetadata: groundingMetadataSchema.nullish()
    })
  ).nullish(),
  usageMetadata: objectType({
    promptTokenCount: numberType().nullish(),
    candidatesTokenCount: numberType().nullish(),
    totalTokenCount: numberType().nullish()
  }).nullish()
});
var googleGenerativeAIProviderOptionsSchema = objectType({
  responseModalities: arrayType(enumType(["TEXT", "IMAGE"])).nullish(),
  thinkingConfig: objectType({
    thinkingBudget: numberType().nullish(),
    includeThoughts: booleanType().nullish()
  }).nullish()
});
var GoogleGenerativeAIEmbeddingModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  get maxEmbeddingsPerCall() {
    return 2048;
  }
  get supportsParallelCalls() {
    return true;
  }
  async doEmbed({
    values,
    headers,
    abortSignal
  }) {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        provider: this.provider,
        modelId: this.modelId,
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        values
      });
    }
    const mergedHeaders = combineHeaders$1(
      await resolve(this.config.headers),
      headers
    );
    const { responseHeaders, value: response } = await postJsonToApi$1({
      url: `${this.config.baseURL}/models/${this.modelId}:batchEmbedContents`,
      headers: mergedHeaders,
      body: {
        requests: values.map((value) => ({
          model: `models/${this.modelId}`,
          content: { role: "user", parts: [{ text: value }] },
          outputDimensionality: this.settings.outputDimensionality,
          taskType: this.settings.taskType
        }))
      },
      failedResponseHandler: googleFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler$1(
        googleGenerativeAITextEmbeddingResponseSchema
      ),
      abortSignal,
      fetch: this.config.fetch
    });
    return {
      embeddings: response.embeddings.map((item) => item.values),
      usage: void 0,
      rawResponse: { headers: responseHeaders }
    };
  }
};
var googleGenerativeAITextEmbeddingResponseSchema = objectType({
  embeddings: arrayType(objectType({ values: arrayType(numberType()) }))
});

// src/google-supported-file-url.ts
function isSupportedFileUrl(url) {
  return url.toString().startsWith("https://generativelanguage.googleapis.com/v1beta/files/");
}

// src/google-provider.ts
function createGoogleGenerativeAI(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash$1(options.baseURL)) != null ? _a : "https://generativelanguage.googleapis.com/v1beta";
  const getHeaders = () => ({
    "x-goog-api-key": loadApiKey$1({
      apiKey: options.apiKey,
      environmentVariableName: "GOOGLE_GENERATIVE_AI_API_KEY",
      description: "Google Generative AI"
    }),
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => {
    var _a2;
    return new GoogleGenerativeAILanguageModel(modelId, settings, {
      provider: "google.generative-ai",
      baseURL,
      headers: getHeaders,
      generateId: (_a2 = options.generateId) != null ? _a2 : generateId$1,
      isSupportedUrl: isSupportedFileUrl,
      fetch: options.fetch
    });
  };
  const createEmbeddingModel = (modelId, settings = {}) => new GoogleGenerativeAIEmbeddingModel(modelId, settings, {
    provider: "google.generative-ai",
    baseURL,
    headers: getHeaders,
    fetch: options.fetch
  });
  const provider = function(modelId, settings) {
    if (new.target) {
      throw new Error(
        "The Google Generative AI model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.generativeAI = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  return provider;
}
createGoogleGenerativeAI();

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

const fromString$1 = (input, encoding) => {
    if (typeof input !== "string") {
        throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
    }
    return buffer.Buffer.from(input, encoding) ;
};

const fromUtf8$1 = (input) => {
    const buf = fromString$1(input, "utf8");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Quick polyfill
typeof Buffer !== "undefined" && Buffer.from
    ? function (input) { return Buffer.from(input, "utf8"); }
    : fromUtf8$1;

// Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// IE 11 does not support Array.from, so we do it manually
function uint32ArrayFrom(a_lookUpTable) {
    if (!Uint32Array.from) {
        var return_array = new Uint32Array(a_lookUpTable.length);
        var a_index = 0;
        while (a_index < a_lookUpTable.length) {
            return_array[a_index] = a_lookUpTable[a_index];
            a_index += 1;
        }
        return return_array;
    }
    return Uint32Array.from(a_lookUpTable);
}

var Crc32 = /** @class */ (function () {
    function Crc32() {
        this.checksum = 0xffffffff;
    }
    Crc32.prototype.update = function (data) {
        var e_1, _a;
        try {
            for (var data_1 = __values(data), data_1_1 = data_1.next(); !data_1_1.done; data_1_1 = data_1.next()) {
                var byte = data_1_1.value;
                this.checksum =
                    (this.checksum >>> 8) ^ lookupTable[(this.checksum ^ byte) & 0xff];
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (data_1_1 && !data_1_1.done && (_a = data_1.return)) _a.call(data_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return this;
    };
    Crc32.prototype.digest = function () {
        return (this.checksum ^ 0xffffffff) >>> 0;
    };
    return Crc32;
}());
// prettier-ignore
var a_lookUpTable = [
    0x00000000, 0x77073096, 0xEE0E612C, 0x990951BA,
    0x076DC419, 0x706AF48F, 0xE963A535, 0x9E6495A3,
    0x0EDB8832, 0x79DCB8A4, 0xE0D5E91E, 0x97D2D988,
    0x09B64C2B, 0x7EB17CBD, 0xE7B82D07, 0x90BF1D91,
    0x1DB71064, 0x6AB020F2, 0xF3B97148, 0x84BE41DE,
    0x1ADAD47D, 0x6DDDE4EB, 0xF4D4B551, 0x83D385C7,
    0x136C9856, 0x646BA8C0, 0xFD62F97A, 0x8A65C9EC,
    0x14015C4F, 0x63066CD9, 0xFA0F3D63, 0x8D080DF5,
    0x3B6E20C8, 0x4C69105E, 0xD56041E4, 0xA2677172,
    0x3C03E4D1, 0x4B04D447, 0xD20D85FD, 0xA50AB56B,
    0x35B5A8FA, 0x42B2986C, 0xDBBBC9D6, 0xACBCF940,
    0x32D86CE3, 0x45DF5C75, 0xDCD60DCF, 0xABD13D59,
    0x26D930AC, 0x51DE003A, 0xC8D75180, 0xBFD06116,
    0x21B4F4B5, 0x56B3C423, 0xCFBA9599, 0xB8BDA50F,
    0x2802B89E, 0x5F058808, 0xC60CD9B2, 0xB10BE924,
    0x2F6F7C87, 0x58684C11, 0xC1611DAB, 0xB6662D3D,
    0x76DC4190, 0x01DB7106, 0x98D220BC, 0xEFD5102A,
    0x71B18589, 0x06B6B51F, 0x9FBFE4A5, 0xE8B8D433,
    0x7807C9A2, 0x0F00F934, 0x9609A88E, 0xE10E9818,
    0x7F6A0DBB, 0x086D3D2D, 0x91646C97, 0xE6635C01,
    0x6B6B51F4, 0x1C6C6162, 0x856530D8, 0xF262004E,
    0x6C0695ED, 0x1B01A57B, 0x8208F4C1, 0xF50FC457,
    0x65B0D9C6, 0x12B7E950, 0x8BBEB8EA, 0xFCB9887C,
    0x62DD1DDF, 0x15DA2D49, 0x8CD37CF3, 0xFBD44C65,
    0x4DB26158, 0x3AB551CE, 0xA3BC0074, 0xD4BB30E2,
    0x4ADFA541, 0x3DD895D7, 0xA4D1C46D, 0xD3D6F4FB,
    0x4369E96A, 0x346ED9FC, 0xAD678846, 0xDA60B8D0,
    0x44042D73, 0x33031DE5, 0xAA0A4C5F, 0xDD0D7CC9,
    0x5005713C, 0x270241AA, 0xBE0B1010, 0xC90C2086,
    0x5768B525, 0x206F85B3, 0xB966D409, 0xCE61E49F,
    0x5EDEF90E, 0x29D9C998, 0xB0D09822, 0xC7D7A8B4,
    0x59B33D17, 0x2EB40D81, 0xB7BD5C3B, 0xC0BA6CAD,
    0xEDB88320, 0x9ABFB3B6, 0x03B6E20C, 0x74B1D29A,
    0xEAD54739, 0x9DD277AF, 0x04DB2615, 0x73DC1683,
    0xE3630B12, 0x94643B84, 0x0D6D6A3E, 0x7A6A5AA8,
    0xE40ECF0B, 0x9309FF9D, 0x0A00AE27, 0x7D079EB1,
    0xF00F9344, 0x8708A3D2, 0x1E01F268, 0x6906C2FE,
    0xF762575D, 0x806567CB, 0x196C3671, 0x6E6B06E7,
    0xFED41B76, 0x89D32BE0, 0x10DA7A5A, 0x67DD4ACC,
    0xF9B9DF6F, 0x8EBEEFF9, 0x17B7BE43, 0x60B08ED5,
    0xD6D6A3E8, 0xA1D1937E, 0x38D8C2C4, 0x4FDFF252,
    0xD1BB67F1, 0xA6BC5767, 0x3FB506DD, 0x48B2364B,
    0xD80D2BDA, 0xAF0A1B4C, 0x36034AF6, 0x41047A60,
    0xDF60EFC3, 0xA867DF55, 0x316E8EEF, 0x4669BE79,
    0xCB61B38C, 0xBC66831A, 0x256FD2A0, 0x5268E236,
    0xCC0C7795, 0xBB0B4703, 0x220216B9, 0x5505262F,
    0xC5BA3BBE, 0xB2BD0B28, 0x2BB45A92, 0x5CB36A04,
    0xC2D7FFA7, 0xB5D0CF31, 0x2CD99E8B, 0x5BDEAE1D,
    0x9B64C2B0, 0xEC63F226, 0x756AA39C, 0x026D930A,
    0x9C0906A9, 0xEB0E363F, 0x72076785, 0x05005713,
    0x95BF4A82, 0xE2B87A14, 0x7BB12BAE, 0x0CB61B38,
    0x92D28E9B, 0xE5D5BE0D, 0x7CDCEFB7, 0x0BDBDF21,
    0x86D3D2D4, 0xF1D4E242, 0x68DDB3F8, 0x1FDA836E,
    0x81BE16CD, 0xF6B9265B, 0x6FB077E1, 0x18B74777,
    0x88085AE6, 0xFF0F6A70, 0x66063BCA, 0x11010B5C,
    0x8F659EFF, 0xF862AE69, 0x616BFFD3, 0x166CCF45,
    0xA00AE278, 0xD70DD2EE, 0x4E048354, 0x3903B3C2,
    0xA7672661, 0xD06016F7, 0x4969474D, 0x3E6E77DB,
    0xAED16A4A, 0xD9D65ADC, 0x40DF0B66, 0x37D83BF0,
    0xA9BCAE53, 0xDEBB9EC5, 0x47B2CF7F, 0x30B5FFE9,
    0xBDBDF21C, 0xCABAC28A, 0x53B39330, 0x24B4A3A6,
    0xBAD03605, 0xCDD70693, 0x54DE5729, 0x23D967BF,
    0xB3667A2E, 0xC4614AB8, 0x5D681B02, 0x2A6F2B94,
    0xB40BBE37, 0xC30C8EA1, 0x5A05DF1B, 0x2D02EF8D,
];
var lookupTable = uint32ArrayFrom(a_lookUpTable);

const SHORT_TO_HEX = {};
const HEX_TO_SHORT = {};
for (let i = 0; i < 256; i++) {
    let encodedByte = i.toString(16).toLowerCase();
    if (encodedByte.length === 1) {
        encodedByte = `0${encodedByte}`;
    }
    SHORT_TO_HEX[i] = encodedByte;
    HEX_TO_SHORT[encodedByte] = i;
}
function fromHex(encoded) {
    if (encoded.length % 2 !== 0) {
        throw new Error("Hex encoded strings must have an even number length");
    }
    const out = new Uint8Array(encoded.length / 2);
    for (let i = 0; i < encoded.length; i += 2) {
        const encodedByte = encoded.slice(i, i + 2).toLowerCase();
        if (encodedByte in HEX_TO_SHORT) {
            out[i / 2] = HEX_TO_SHORT[encodedByte];
        }
        else {
            throw new Error(`Cannot decode unrecognized sequence ${encodedByte} as hexadecimal`);
        }
    }
    return out;
}
function toHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        out += SHORT_TO_HEX[bytes[i]];
    }
    return out;
}

class Int64 {
    constructor(bytes) {
        this.bytes = bytes;
        if (bytes.byteLength !== 8) {
            throw new Error("Int64 buffers must be exactly 8 bytes");
        }
    }
    static fromNumber(number) {
        if (number > 9223372036854776000 || number < -9223372036854776e3) {
            throw new Error(`${number} is too large (or, if negative, too small) to represent as an Int64`);
        }
        const bytes = new Uint8Array(8);
        for (let i = 7, remaining = Math.abs(Math.round(number)); i > -1 && remaining > 0; i--, remaining /= 256) {
            bytes[i] = remaining;
        }
        if (number < 0) {
            negate(bytes);
        }
        return new Int64(bytes);
    }
    valueOf() {
        const bytes = this.bytes.slice(0);
        const negative = bytes[0] & 0b10000000;
        if (negative) {
            negate(bytes);
        }
        return parseInt(toHex(bytes), 16) * (negative ? -1 : 1);
    }
    toString() {
        return String(this.valueOf());
    }
}
function negate(bytes) {
    for (let i = 0; i < 8; i++) {
        bytes[i] ^= 0xff;
    }
    for (let i = 7; i > -1; i--) {
        bytes[i]++;
        if (bytes[i] !== 0)
            break;
    }
}

class HeaderMarshaller {
    constructor(toUtf8, fromUtf8) {
        this.toUtf8 = toUtf8;
        this.fromUtf8 = fromUtf8;
    }
    format(headers) {
        const chunks = [];
        for (const headerName of Object.keys(headers)) {
            const bytes = this.fromUtf8(headerName);
            chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
        }
        const out = new Uint8Array(chunks.reduce((carry, bytes) => carry + bytes.byteLength, 0));
        let position = 0;
        for (const chunk of chunks) {
            out.set(chunk, position);
            position += chunk.byteLength;
        }
        return out;
    }
    formatHeaderValue(header) {
        switch (header.type) {
            case "boolean":
                return Uint8Array.from([header.value ? 0 : 1]);
            case "byte":
                return Uint8Array.from([2, header.value]);
            case "short":
                const shortView = new DataView(new ArrayBuffer(3));
                shortView.setUint8(0, 3);
                shortView.setInt16(1, header.value, false);
                return new Uint8Array(shortView.buffer);
            case "integer":
                const intView = new DataView(new ArrayBuffer(5));
                intView.setUint8(0, 4);
                intView.setInt32(1, header.value, false);
                return new Uint8Array(intView.buffer);
            case "long":
                const longBytes = new Uint8Array(9);
                longBytes[0] = 5;
                longBytes.set(header.value.bytes, 1);
                return longBytes;
            case "binary":
                const binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
                binView.setUint8(0, 6);
                binView.setUint16(1, header.value.byteLength, false);
                const binBytes = new Uint8Array(binView.buffer);
                binBytes.set(header.value, 3);
                return binBytes;
            case "string":
                const utf8Bytes = this.fromUtf8(header.value);
                const strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
                strView.setUint8(0, 7);
                strView.setUint16(1, utf8Bytes.byteLength, false);
                const strBytes = new Uint8Array(strView.buffer);
                strBytes.set(utf8Bytes, 3);
                return strBytes;
            case "timestamp":
                const tsBytes = new Uint8Array(9);
                tsBytes[0] = 8;
                tsBytes.set(Int64.fromNumber(header.value.valueOf()).bytes, 1);
                return tsBytes;
            case "uuid":
                if (!UUID_PATTERN.test(header.value)) {
                    throw new Error(`Invalid UUID received: ${header.value}`);
                }
                const uuidBytes = new Uint8Array(17);
                uuidBytes[0] = 9;
                uuidBytes.set(fromHex(header.value.replace(/\-/g, "")), 1);
                return uuidBytes;
        }
    }
    parse(headers) {
        const out = {};
        let position = 0;
        while (position < headers.byteLength) {
            const nameLength = headers.getUint8(position++);
            const name = this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, nameLength));
            position += nameLength;
            switch (headers.getUint8(position++)) {
                case 0:
                    out[name] = {
                        type: BOOLEAN_TAG,
                        value: true,
                    };
                    break;
                case 1:
                    out[name] = {
                        type: BOOLEAN_TAG,
                        value: false,
                    };
                    break;
                case 2:
                    out[name] = {
                        type: BYTE_TAG,
                        value: headers.getInt8(position++),
                    };
                    break;
                case 3:
                    out[name] = {
                        type: SHORT_TAG,
                        value: headers.getInt16(position, false),
                    };
                    position += 2;
                    break;
                case 4:
                    out[name] = {
                        type: INT_TAG,
                        value: headers.getInt32(position, false),
                    };
                    position += 4;
                    break;
                case 5:
                    out[name] = {
                        type: LONG_TAG,
                        value: new Int64(new Uint8Array(headers.buffer, headers.byteOffset + position, 8)),
                    };
                    position += 8;
                    break;
                case 6:
                    const binaryLength = headers.getUint16(position, false);
                    position += 2;
                    out[name] = {
                        type: BINARY_TAG,
                        value: new Uint8Array(headers.buffer, headers.byteOffset + position, binaryLength),
                    };
                    position += binaryLength;
                    break;
                case 7:
                    const stringLength = headers.getUint16(position, false);
                    position += 2;
                    out[name] = {
                        type: STRING_TAG,
                        value: this.toUtf8(new Uint8Array(headers.buffer, headers.byteOffset + position, stringLength)),
                    };
                    position += stringLength;
                    break;
                case 8:
                    out[name] = {
                        type: TIMESTAMP_TAG,
                        value: new Date(new Int64(new Uint8Array(headers.buffer, headers.byteOffset + position, 8)).valueOf()),
                    };
                    position += 8;
                    break;
                case 9:
                    const uuidBytes = new Uint8Array(headers.buffer, headers.byteOffset + position, 16);
                    position += 16;
                    out[name] = {
                        type: UUID_TAG,
                        value: `${toHex(uuidBytes.subarray(0, 4))}-${toHex(uuidBytes.subarray(4, 6))}-${toHex(uuidBytes.subarray(6, 8))}-${toHex(uuidBytes.subarray(8, 10))}-${toHex(uuidBytes.subarray(10))}`,
                    };
                    break;
                default:
                    throw new Error(`Unrecognized header type tag`);
            }
        }
        return out;
    }
}
var HEADER_VALUE_TYPE;
(function (HEADER_VALUE_TYPE) {
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolTrue"] = 0] = "boolTrue";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolFalse"] = 1] = "boolFalse";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byte"] = 2] = "byte";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["short"] = 3] = "short";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["integer"] = 4] = "integer";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["long"] = 5] = "long";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byteArray"] = 6] = "byteArray";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["string"] = 7] = "string";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["timestamp"] = 8] = "timestamp";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["uuid"] = 9] = "uuid";
})(HEADER_VALUE_TYPE || (HEADER_VALUE_TYPE = {}));
const BOOLEAN_TAG = "boolean";
const BYTE_TAG = "byte";
const SHORT_TAG = "short";
const INT_TAG = "integer";
const LONG_TAG = "long";
const BINARY_TAG = "binary";
const STRING_TAG = "string";
const TIMESTAMP_TAG = "timestamp";
const UUID_TAG = "uuid";
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

const PRELUDE_MEMBER_LENGTH = 4;
const PRELUDE_LENGTH = PRELUDE_MEMBER_LENGTH * 2;
const CHECKSUM_LENGTH = 4;
const MINIMUM_MESSAGE_LENGTH = PRELUDE_LENGTH + CHECKSUM_LENGTH * 2;
function splitMessage({ byteLength, byteOffset, buffer }) {
    if (byteLength < MINIMUM_MESSAGE_LENGTH) {
        throw new Error("Provided message too short to accommodate event stream message overhead");
    }
    const view = new DataView(buffer, byteOffset, byteLength);
    const messageLength = view.getUint32(0, false);
    if (byteLength !== messageLength) {
        throw new Error("Reported message length does not match received message length");
    }
    const headerLength = view.getUint32(PRELUDE_MEMBER_LENGTH, false);
    const expectedPreludeChecksum = view.getUint32(PRELUDE_LENGTH, false);
    const expectedMessageChecksum = view.getUint32(byteLength - CHECKSUM_LENGTH, false);
    const checksummer = new Crc32().update(new Uint8Array(buffer, byteOffset, PRELUDE_LENGTH));
    if (expectedPreludeChecksum !== checksummer.digest()) {
        throw new Error(`The prelude checksum specified in the message (${expectedPreludeChecksum}) does not match the calculated CRC32 checksum (${checksummer.digest()})`);
    }
    checksummer.update(new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH, byteLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH)));
    if (expectedMessageChecksum !== checksummer.digest()) {
        throw new Error(`The message checksum (${checksummer.digest()}) did not match the expected value of ${expectedMessageChecksum}`);
    }
    return {
        headers: new DataView(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH, headerLength),
        body: new Uint8Array(buffer, byteOffset + PRELUDE_LENGTH + CHECKSUM_LENGTH + headerLength, messageLength - headerLength - (PRELUDE_LENGTH + CHECKSUM_LENGTH + CHECKSUM_LENGTH)),
    };
}

class EventStreamCodec {
    constructor(toUtf8, fromUtf8) {
        this.headerMarshaller = new HeaderMarshaller(toUtf8, fromUtf8);
        this.messageBuffer = [];
        this.isEndOfStream = false;
    }
    feed(message) {
        this.messageBuffer.push(this.decode(message));
    }
    endOfStream() {
        this.isEndOfStream = true;
    }
    getMessage() {
        const message = this.messageBuffer.pop();
        const isEndOfStream = this.isEndOfStream;
        return {
            getMessage() {
                return message;
            },
            isEndOfStream() {
                return isEndOfStream;
            },
        };
    }
    getAvailableMessages() {
        const messages = this.messageBuffer;
        this.messageBuffer = [];
        const isEndOfStream = this.isEndOfStream;
        return {
            getMessages() {
                return messages;
            },
            isEndOfStream() {
                return isEndOfStream;
            },
        };
    }
    encode({ headers: rawHeaders, body }) {
        const headers = this.headerMarshaller.format(rawHeaders);
        const length = headers.byteLength + body.byteLength + 16;
        const out = new Uint8Array(length);
        const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
        const checksum = new Crc32();
        view.setUint32(0, length, false);
        view.setUint32(4, headers.byteLength, false);
        view.setUint32(8, checksum.update(out.subarray(0, 8)).digest(), false);
        out.set(headers, 12);
        out.set(body, headers.byteLength + 12);
        view.setUint32(length - 4, checksum.update(out.subarray(8, length - 4)).digest(), false);
        return out;
    }
    decode(message) {
        const { headers, body } = splitMessage(message);
        return { headers: this.headerMarshaller.parse(headers), body };
    }
    formatHeaders(rawHeaders) {
        return this.headerMarshaller.format(rawHeaders);
    }
}

const isArrayBuffer = (arg) => (typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer) ||
    Object.prototype.toString.call(arg) === "[object ArrayBuffer]";

const fromArrayBuffer = (input, offset = 0, length = input.byteLength - offset) => {
    if (!isArrayBuffer(input)) {
        throw new TypeError(`The "input" argument must be ArrayBuffer. Received type ${typeof input} (${input})`);
    }
    return buffer.Buffer.from(input, offset, length);
};
const fromString = (input, encoding) => {
    if (typeof input !== "string") {
        throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
    }
    return buffer.Buffer.from(input, encoding) ;
};

const fromUtf8 = (input) => {
    const buf = fromString(input, "utf8");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};

const toUtf8 = (input) => {
    if (typeof input === "string") {
        return input;
    }
    if (typeof input !== "object" || typeof input.byteOffset !== "number" || typeof input.byteLength !== "number") {
        throw new Error("@smithy/util-utf8: toUtf8 encoder function only accepts string | Uint8Array.");
    }
    return fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("utf8");
};

/**
 * @license MIT <https://opensource.org/licenses/MIT>
 * @copyright Michael Hart 2024
 */
const encoder = new TextEncoder();
const HOST_SERVICES = {
  appstream2: 'appstream',
  cloudhsmv2: 'cloudhsm',
  email: 'ses',
  marketplace: 'aws-marketplace',
  mobile: 'AWSMobileHubService',
  pinpoint: 'mobiletargeting',
  queue: 'sqs',
  'git-codecommit': 'codecommit',
  'mturk-requester-sandbox': 'mturk-requester',
  'personalize-runtime': 'personalize',
};
const UNSIGNABLE_HEADERS = new Set([
  'authorization',
  'content-type',
  'content-length',
  'user-agent',
  'presigned-expires',
  'expect',
  'x-amzn-trace-id',
  'range',
  'connection',
]);
class AwsV4Signer {
  constructor({ method, url, headers, body, accessKeyId, secretAccessKey, sessionToken, service, region, cache, datetime, signQuery, appendSessionToken, allHeaders, singleEncode }) {
    if (url == null) throw new TypeError('url is a required option')
    if (accessKeyId == null) throw new TypeError('accessKeyId is a required option')
    if (secretAccessKey == null) throw new TypeError('secretAccessKey is a required option')
    this.method = method || (body ? 'POST' : 'GET');
    this.url = new URL(url);
    this.headers = new Headers(headers || {});
    this.body = body;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.sessionToken = sessionToken;
    let guessedService, guessedRegion;
    if (!service || !region) {
[guessedService, guessedRegion] = guessServiceRegion(this.url, this.headers);
    }
    this.service = service || guessedService || '';
    this.region = region || guessedRegion || 'us-east-1';
    this.cache = cache || new Map();
    this.datetime = datetime || new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    this.signQuery = signQuery;
    this.appendSessionToken = appendSessionToken || this.service === 'iotdevicegateway';
    this.headers.delete('Host');
    if (this.service === 's3' && !this.signQuery && !this.headers.has('X-Amz-Content-Sha256')) {
      this.headers.set('X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD');
    }
    const params = this.signQuery ? this.url.searchParams : this.headers;
    params.set('X-Amz-Date', this.datetime);
    if (this.sessionToken && !this.appendSessionToken) {
      params.set('X-Amz-Security-Token', this.sessionToken);
    }
    this.signableHeaders = ['host', ...this.headers.keys()]
      .filter(header => allHeaders || !UNSIGNABLE_HEADERS.has(header))
      .sort();
    this.signedHeaders = this.signableHeaders.join(';');
    this.canonicalHeaders = this.signableHeaders
      .map(header => header + ':' + (header === 'host' ? this.url.host : (this.headers.get(header) || '').replace(/\s+/g, ' ')))
      .join('\n');
    this.credentialString = [this.datetime.slice(0, 8), this.region, this.service, 'aws4_request'].join('/');
    if (this.signQuery) {
      if (this.service === 's3' && !params.has('X-Amz-Expires')) {
        params.set('X-Amz-Expires', '86400');
      }
      params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
      params.set('X-Amz-Credential', this.accessKeyId + '/' + this.credentialString);
      params.set('X-Amz-SignedHeaders', this.signedHeaders);
    }
    if (this.service === 's3') {
      try {
        this.encodedPath = decodeURIComponent(this.url.pathname.replace(/\+/g, ' '));
      } catch (e) {
        this.encodedPath = this.url.pathname;
      }
    } else {
      this.encodedPath = this.url.pathname.replace(/\/+/g, '/');
    }
    if (!singleEncode) {
      this.encodedPath = encodeURIComponent(this.encodedPath).replace(/%2F/g, '/');
    }
    this.encodedPath = encodeRfc3986(this.encodedPath);
    const seenKeys = new Set();
    this.encodedSearch = [...this.url.searchParams]
      .filter(([k]) => {
        if (!k) return false
        if (this.service === 's3') {
          if (seenKeys.has(k)) return false
          seenKeys.add(k);
        }
        return true
      })
      .map(pair => pair.map(p => encodeRfc3986(encodeURIComponent(p))))
      .sort(([k1, v1], [k2, v2]) => k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0)
      .map(pair => pair.join('='))
      .join('&');
  }
  async sign() {
    if (this.signQuery) {
      this.url.searchParams.set('X-Amz-Signature', await this.signature());
      if (this.sessionToken && this.appendSessionToken) {
        this.url.searchParams.set('X-Amz-Security-Token', this.sessionToken);
      }
    } else {
      this.headers.set('Authorization', await this.authHeader());
    }
    return {
      method: this.method,
      url: this.url,
      headers: this.headers,
      body: this.body,
    }
  }
  async authHeader() {
    return [
      'AWS4-HMAC-SHA256 Credential=' + this.accessKeyId + '/' + this.credentialString,
      'SignedHeaders=' + this.signedHeaders,
      'Signature=' + (await this.signature()),
    ].join(', ')
  }
  async signature() {
    const date = this.datetime.slice(0, 8);
    const cacheKey = [this.secretAccessKey, date, this.region, this.service].join();
    let kCredentials = this.cache.get(cacheKey);
    if (!kCredentials) {
      const kDate = await hmac('AWS4' + this.secretAccessKey, date);
      const kRegion = await hmac(kDate, this.region);
      const kService = await hmac(kRegion, this.service);
      kCredentials = await hmac(kService, 'aws4_request');
      this.cache.set(cacheKey, kCredentials);
    }
    return buf2hex(await hmac(kCredentials, await this.stringToSign()))
  }
  async stringToSign() {
    return [
      'AWS4-HMAC-SHA256',
      this.datetime,
      this.credentialString,
      buf2hex(await hash(await this.canonicalString())),
    ].join('\n')
  }
  async canonicalString() {
    return [
      this.method.toUpperCase(),
      this.encodedPath,
      this.encodedSearch,
      this.canonicalHeaders + '\n',
      this.signedHeaders,
      await this.hexBodyHash(),
    ].join('\n')
  }
  async hexBodyHash() {
    let hashHeader = this.headers.get('X-Amz-Content-Sha256') || (this.service === 's3' && this.signQuery ? 'UNSIGNED-PAYLOAD' : null);
    if (hashHeader == null) {
      if (this.body && typeof this.body !== 'string' && !('byteLength' in this.body)) {
        throw new Error('body must be a string, ArrayBuffer or ArrayBufferView, unless you include the X-Amz-Content-Sha256 header')
      }
      hashHeader = buf2hex(await hash(this.body || ''));
    }
    return hashHeader
  }
}
async function hmac(key, string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(string))
}
async function hash(content) {
  return crypto.subtle.digest('SHA-256', typeof content === 'string' ? encoder.encode(content) : content)
}
const HEX_CHARS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
function buf2hex(arrayBuffer) {
  const buffer = new Uint8Array(arrayBuffer);
  let out = '';
  for (let idx = 0; idx < buffer.length; idx++) {
    const n = buffer[idx];
    out += HEX_CHARS[(n >>> 4) & 0xF];
    out += HEX_CHARS[n & 0xF];
  }
  return out
}
function encodeRfc3986(urlEncodedStr) {
  return urlEncodedStr.replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}
function guessServiceRegion(url, headers) {
  const { hostname, pathname } = url;
  if (hostname.endsWith('.on.aws')) {
    const match = hostname.match(/^[^.]{1,63}\.lambda-url\.([^.]{1,63})\.on\.aws$/);
    return match != null ? ['lambda', match[1] || ''] : ['', '']
  }
  if (hostname.endsWith('.r2.cloudflarestorage.com')) {
    return ['s3', 'auto']
  }
  if (hostname.endsWith('.backblazeb2.com')) {
    const match = hostname.match(/^(?:[^.]{1,63}\.)?s3\.([^.]{1,63})\.backblazeb2\.com$/);
    return match != null ? ['s3', match[1] || ''] : ['', '']
  }
  const match = hostname.replace('dualstack.', '').match(/([^.]{1,63})\.(?:([^.]{0,63})\.)?amazonaws\.com(?:\.cn)?$/);
  let service = (match && match[1]) || '';
  let region = match && match[2];
  if (region === 'us-gov') {
    region = 'us-gov-west-1';
  } else if (region === 's3' || region === 's3-accelerate') {
    region = 'us-east-1';
    service = 's3';
  } else if (service === 'iot') {
    if (hostname.startsWith('iot.')) {
      service = 'execute-api';
    } else if (hostname.startsWith('data.jobs.iot.')) {
      service = 'iot-jobs-data';
    } else {
      service = pathname === '/mqtt' ? 'iotdevicegateway' : 'iotdata';
    }
  } else if (service === 'autoscaling') {
    const targetPrefix = (headers.get('X-Amz-Target') || '').split('.')[0];
    if (targetPrefix === 'AnyScaleFrontendService') {
      service = 'application-autoscaling';
    } else if (targetPrefix === 'AnyScaleScalingPlannerFrontendService') {
      service = 'autoscaling-plans';
    }
  } else if (region == null && service.startsWith('s3-')) {
    region = service.slice(3).replace(/^fips-|^external-1/, '');
    service = 's3';
  } else if (service.endsWith('-fips')) {
    service = service.slice(0, -5);
  } else if (region && /-\d$/.test(service) && !/-\d$/.test(region)) {
[service, region] = [region, service];
  }
  return [HOST_SERVICES[service] || service, region || '']
}

// src/bedrock-provider.ts

// src/bedrock-api-types.ts
var BEDROCK_CACHE_POINT = {
  cachePoint: { type: "default" }
};
var BEDROCK_STOP_REASONS = [
  "stop",
  "stop_sequence",
  "end_turn",
  "length",
  "max_tokens",
  "content-filter",
  "content_filtered",
  "guardrail_intervened",
  "tool-calls",
  "tool_use"
];
var BedrockErrorSchema = objectType({
  message: stringType(),
  type: stringType().nullish()
});
var createBedrockEventStreamResponseHandler = (chunkSchema) => async ({ response }) => {
  const responseHeaders = extractResponseHeaders$1(response);
  if (response.body == null) {
    throw new EmptyResponseBodyError$1({});
  }
  const codec = new EventStreamCodec(toUtf8, fromUtf8);
  let buffer = new Uint8Array(0);
  const textDecoder = new TextDecoder();
  return {
    responseHeaders,
    value: response.body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          var _a, _b;
          const newBuffer = new Uint8Array(buffer.length + chunk.length);
          newBuffer.set(buffer);
          newBuffer.set(chunk, buffer.length);
          buffer = newBuffer;
          while (buffer.length >= 4) {
            const totalLength = new DataView(
              buffer.buffer,
              buffer.byteOffset,
              buffer.byteLength
            ).getUint32(0, false);
            if (buffer.length < totalLength) {
              break;
            }
            try {
              const subView = buffer.subarray(0, totalLength);
              const decoded = codec.decode(subView);
              buffer = buffer.slice(totalLength);
              if (((_a = decoded.headers[":message-type"]) == null ? void 0 : _a.value) === "event") {
                const data = textDecoder.decode(decoded.body);
                const parsedDataResult = safeParseJSON$1({ text: data });
                if (!parsedDataResult.success) {
                  controller.enqueue(parsedDataResult);
                  break;
                }
                delete parsedDataResult.value.p;
                let wrappedData = {
                  [(_b = decoded.headers[":event-type"]) == null ? void 0 : _b.value]: parsedDataResult.value
                };
                const validatedWrappedData = safeValidateTypes$1({
                  value: wrappedData,
                  schema: chunkSchema
                });
                if (!validatedWrappedData.success) {
                  controller.enqueue(validatedWrappedData);
                } else {
                  controller.enqueue({
                    success: true,
                    value: validatedWrappedData.value,
                    rawValue: wrappedData
                  });
                }
              }
            } catch (e) {
              break;
            }
          }
        }
      })
    )
  };
};
function prepareTools(mode) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  if (tools == null) {
    return {
      toolConfig: { tools: void 0, toolChoice: void 0 },
      toolWarnings: []
    };
  }
  const toolWarnings = [];
  const bedrockTools = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      bedrockTools.push({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: {
            json: tool.parameters
          }
        }
      });
    }
  }
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return {
      toolConfig: { tools: bedrockTools, toolChoice: void 0 },
      toolWarnings
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        toolConfig: { tools: bedrockTools, toolChoice: { auto: {} } },
        toolWarnings
      };
    case "required":
      return {
        toolConfig: { tools: bedrockTools, toolChoice: { any: {} } },
        toolWarnings
      };
    case "none":
      return {
        toolConfig: { tools: void 0, toolChoice: void 0 },
        toolWarnings
      };
    case "tool":
      return {
        toolConfig: {
          tools: bedrockTools,
          toolChoice: { tool: { name: toolChoice.toolName } }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError$1({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
var generateFileId = createIdGenerator$1({ prefix: "file", size: 16 });
function getCachePoint(providerMetadata) {
  var _a;
  return (_a = providerMetadata == null ? void 0 : providerMetadata.bedrock) == null ? void 0 : _a.cachePoint;
}
function convertToBedrockChatMessages(prompt) {
  var _a, _b, _c, _d, _e;
  const blocks = groupIntoBlocks(prompt);
  let system = [];
  const messages = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;
    switch (type) {
      case "system": {
        if (messages.length > 0) {
          throw new UnsupportedFunctionalityError$1({
            functionality: "Multiple system messages that are separated by user/assistant messages"
          });
        }
        for (const message of block.messages) {
          system.push({ text: message.content });
          if (getCachePoint(message.providerMetadata)) {
            system.push(BEDROCK_CACHE_POINT);
          }
        }
        break;
      }
      case "user": {
        const bedrockContent = [];
        for (const message of block.messages) {
          const { role, content, providerMetadata } = message;
          switch (role) {
            case "user": {
              for (let j = 0; j < content.length; j++) {
                const part = content[j];
                switch (part.type) {
                  case "text": {
                    bedrockContent.push({
                      text: part.text
                    });
                    break;
                  }
                  case "image": {
                    if (part.image instanceof URL) {
                      throw new UnsupportedFunctionalityError$1({
                        functionality: "Image URLs in user messages"
                      });
                    }
                    bedrockContent.push({
                      image: {
                        format: (_b = (_a = part.mimeType) == null ? void 0 : _a.split(
                          "/"
                        )) == null ? void 0 : _b[1],
                        source: {
                          bytes: convertUint8ArrayToBase64$1(
                            (_c = part.image) != null ? _c : part.image
                          )
                        }
                      }
                    });
                    break;
                  }
                  case "file": {
                    if (part.data instanceof URL) {
                      throw new UnsupportedFunctionalityError$1({
                        functionality: "File URLs in user messages"
                      });
                    }
                    bedrockContent.push({
                      document: {
                        format: (_e = (_d = part.mimeType) == null ? void 0 : _d.split(
                          "/"
                        )) == null ? void 0 : _e[1],
                        name: generateFileId(),
                        source: {
                          bytes: part.data
                        }
                      }
                    });
                    break;
                  }
                }
              }
              break;
            }
            case "tool": {
              for (let i2 = 0; i2 < content.length; i2++) {
                const part = content[i2];
                const toolResultContent = part.content != void 0 ? part.content.map((part2) => {
                  switch (part2.type) {
                    case "text":
                      return {
                        text: part2.text
                      };
                    case "image":
                      if (!part2.mimeType) {
                        throw new Error(
                          "Image mime type is required in tool result part content"
                        );
                      }
                      const format = part2.mimeType.split("/")[1];
                      if (!isBedrockImageFormat(format)) {
                        throw new Error(
                          `Unsupported image format: ${format}`
                        );
                      }
                      return {
                        image: {
                          format,
                          source: {
                            bytes: part2.data
                          }
                        }
                      };
                  }
                }) : [{ text: JSON.stringify(part.result) }];
                bedrockContent.push({
                  toolResult: {
                    toolUseId: part.toolCallId,
                    content: toolResultContent
                  }
                });
              }
              break;
            }
            default: {
              const _exhaustiveCheck = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }
          if (getCachePoint(providerMetadata)) {
            bedrockContent.push(BEDROCK_CACHE_POINT);
          }
        }
        messages.push({ role: "user", content: bedrockContent });
        break;
      }
      case "assistant": {
        const bedrockContent = [];
        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;
          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;
            switch (part.type) {
              case "text": {
                bedrockContent.push({
                  text: (
                    // trim the last text part if it's the last message in the block
                    // because Bedrock does not allow trailing whitespace
                    // in pre-filled assistant responses
                    trimIfLast(
                      isLastBlock,
                      isLastMessage,
                      isLastContentPart,
                      part.text
                    )
                  )
                });
                break;
              }
              case "reasoning": {
                bedrockContent.push({
                  reasoningContent: {
                    reasoningText: {
                      // trim the last text part if it's the last message in the block
                      // because Bedrock does not allow trailing whitespace
                      // in pre-filled assistant responses
                      text: trimIfLast(
                        isLastBlock,
                        isLastMessage,
                        isLastContentPart,
                        part.text
                      ),
                      signature: part.signature
                    }
                  }
                });
                break;
              }
              case "redacted-reasoning": {
                bedrockContent.push({
                  reasoningContent: {
                    redactedReasoning: {
                      data: part.data
                    }
                  }
                });
                break;
              }
              case "tool-call": {
                bedrockContent.push({
                  toolUse: {
                    toolUseId: part.toolCallId,
                    name: part.toolName,
                    input: part.args
                  }
                });
                break;
              }
            }
          }
          if (getCachePoint(message.providerMetadata)) {
            bedrockContent.push(BEDROCK_CACHE_POINT);
          }
        }
        messages.push({ role: "assistant", content: bedrockContent });
        break;
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  return { system, messages };
}
function isBedrockImageFormat(format) {
  return ["jpeg", "png", "gif"].includes(format);
}
function trimIfLast(isLastBlock, isLastMessage, isLastContentPart, text) {
  return isLastBlock && isLastMessage && isLastContentPart ? text.trim() : text;
}
function groupIntoBlocks(prompt) {
  const blocks = [];
  let currentBlock = void 0;
  for (const message of prompt) {
    const { role } = message;
    switch (role) {
      case "system": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "system") {
          currentBlock = { type: "system", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "assistant": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "assistant") {
          currentBlock = { type: "assistant", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "user": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "tool": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return blocks;
}

// src/map-bedrock-finish-reason.ts
function mapBedrockFinishReason(finishReason) {
  switch (finishReason) {
    case "stop_sequence":
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "content_filtered":
    case "guardrail_intervened":
      return "content-filter";
    case "tool_use":
      return "tool-calls";
    default:
      return "unknown";
  }
}

// src/bedrock-chat-language-model.ts
var BedrockChatLanguageModel = class {
  constructor(modelId, settings, config) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.specificationVersion = "v1";
    this.provider = "amazon-bedrock";
    this.defaultObjectGenerationMode = "tool";
    this.supportsImageUrls = false;
  }
  getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    providerMetadata
  }) {
    var _a, _b, _c, _d, _e, _f, _g;
    const type = mode.type;
    const warnings = [];
    if (frequencyPenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "frequencyPenalty"
      });
    }
    if (presencePenalty != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "presencePenalty"
      });
    }
    if (seed != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "seed"
      });
    }
    if (topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK"
      });
    }
    if (responseFormat != null && responseFormat.type !== "text") {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format is not supported."
      });
    }
    const { system, messages } = convertToBedrockChatMessages(prompt);
    const reasoningConfigOptions = BedrockReasoningConfigOptionsSchema.safeParse(
      (_a = providerMetadata == null ? void 0 : providerMetadata.bedrock) == null ? void 0 : _a.reasoning_config
    );
    if (!reasoningConfigOptions.success) {
      throw new InvalidArgumentError$1({
        argument: "providerOptions.bedrock.reasoning_config",
        message: "invalid reasoning configuration options",
        cause: reasoningConfigOptions.error
      });
    }
    const isThinking = ((_b = reasoningConfigOptions.data) == null ? void 0 : _b.type) === "enabled";
    const thinkingBudget = (_e = (_c = reasoningConfigOptions.data) == null ? void 0 : _c.budgetTokens) != null ? _e : (_d = reasoningConfigOptions.data) == null ? void 0 : _d.budget_tokens;
    const inferenceConfig = {
      ...maxTokens != null && { maxTokens },
      ...temperature != null && { temperature },
      ...topP != null && { topP },
      ...stopSequences != null && { stopSequences }
    };
    if (isThinking && thinkingBudget != null) {
      if (inferenceConfig.maxTokens != null) {
        inferenceConfig.maxTokens += thinkingBudget;
      } else {
        inferenceConfig.maxTokens = thinkingBudget + 4096;
      }
      this.settings.additionalModelRequestFields = {
        ...this.settings.additionalModelRequestFields,
        reasoning_config: {
          type: (_f = reasoningConfigOptions.data) == null ? void 0 : _f.type,
          budget_tokens: thinkingBudget
        }
      };
    }
    if (isThinking && inferenceConfig.temperature != null) {
      delete inferenceConfig.temperature;
      warnings.push({
        type: "unsupported-setting",
        setting: "temperature",
        details: "temperature is not supported when thinking is enabled"
      });
    }
    if (isThinking && inferenceConfig.topP != null) {
      delete inferenceConfig.topP;
      warnings.push({
        type: "unsupported-setting",
        setting: "topP",
        details: "topP is not supported when thinking is enabled"
      });
    }
    const baseArgs = {
      system,
      additionalModelRequestFields: this.settings.additionalModelRequestFields,
      ...Object.keys(inferenceConfig).length > 0 && {
        inferenceConfig
      },
      messages,
      ...providerMetadata == null ? void 0 : providerMetadata.bedrock
    };
    switch (type) {
      case "regular": {
        const { toolConfig, toolWarnings } = prepareTools(mode);
        return {
          command: {
            ...baseArgs,
            ...((_g = toolConfig.tools) == null ? void 0 : _g.length) ? { toolConfig } : {}
          },
          warnings: [...warnings, ...toolWarnings]
        };
      }
      case "object-json": {
        throw new UnsupportedFunctionalityError$1({
          functionality: "json-mode object generation"
        });
      }
      case "object-tool": {
        return {
          command: {
            ...baseArgs,
            toolConfig: {
              tools: [
                {
                  toolSpec: {
                    name: mode.tool.name,
                    description: mode.tool.description,
                    inputSchema: {
                      json: mode.tool.parameters
                    }
                  }
                }
              ],
              toolChoice: { tool: { name: mode.tool.name } }
            }
          },
          warnings
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    const { command: args, warnings } = this.getArgs(options);
    const url = `${this.getUrl(this.modelId)}/converse`;
    const { value: response, responseHeaders } = await postJsonToApi$1({
      url,
      headers: combineHeaders$1(
        await resolve(this.config.headers),
        options.headers
      ),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler$1({
        errorSchema: BedrockErrorSchema,
        errorToMessage: (error) => {
          var _a2;
          return `${(_a2 = error.message) != null ? _a2 : "Unknown error"}`;
        }
      }),
      successfulResponseHandler: createJsonResponseHandler$1(
        BedrockResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    const providerMetadata = response.trace || response.usage ? {
      bedrock: {
        ...response.trace && typeof response.trace === "object" ? { trace: response.trace } : {},
        ...response.usage && {
          usage: {
            cacheReadInputTokens: (_b = (_a = response.usage) == null ? void 0 : _a.cacheReadInputTokens) != null ? _b : Number.NaN,
            cacheWriteInputTokens: (_d = (_c = response.usage) == null ? void 0 : _c.cacheWriteInputTokens) != null ? _d : Number.NaN
          }
        }
      }
    } : void 0;
    const reasoning = response.output.message.content.filter((content) => content.reasoningContent).map((content) => {
      var _a2;
      if (content.reasoningContent && "reasoningText" in content.reasoningContent) {
        return {
          type: "text",
          text: content.reasoningContent.reasoningText.text,
          ...content.reasoningContent.reasoningText.signature && {
            signature: content.reasoningContent.reasoningText.signature
          }
        };
      } else if (content.reasoningContent && "redactedReasoning" in content.reasoningContent) {
        return {
          type: "redacted",
          data: (_a2 = content.reasoningContent.redactedReasoning.data) != null ? _a2 : ""
        };
      } else {
        return void 0;
      }
    }).filter((item) => item !== void 0);
    return {
      text: (_h = (_g = (_f = (_e = response.output) == null ? void 0 : _e.message) == null ? void 0 : _f.content) == null ? void 0 : _g.map((part) => {
        var _a2;
        return (_a2 = part.text) != null ? _a2 : "";
      }).join("")) != null ? _h : void 0,
      toolCalls: (_l = (_k = (_j = (_i = response.output) == null ? void 0 : _i.message) == null ? void 0 : _j.content) == null ? void 0 : _k.filter((part) => !!part.toolUse)) == null ? void 0 : _l.map((part) => {
        var _a2, _b2, _c2, _d2, _e2, _f2;
        return {
          toolCallType: "function",
          toolCallId: (_b2 = (_a2 = part.toolUse) == null ? void 0 : _a2.toolUseId) != null ? _b2 : this.config.generateId(),
          toolName: (_d2 = (_c2 = part.toolUse) == null ? void 0 : _c2.name) != null ? _d2 : `tool-${this.config.generateId()}`,
          args: JSON.stringify((_f2 = (_e2 = part.toolUse) == null ? void 0 : _e2.input) != null ? _f2 : "")
        };
      }),
      finishReason: mapBedrockFinishReason(
        response.stopReason
      ),
      usage: {
        promptTokens: (_n = (_m = response.usage) == null ? void 0 : _m.inputTokens) != null ? _n : Number.NaN,
        completionTokens: (_p = (_o = response.usage) == null ? void 0 : _o.outputTokens) != null ? _p : Number.NaN
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      reasoning: reasoning.length > 0 ? reasoning : void 0,
      ...providerMetadata && { providerMetadata }
    };
  }
  async doStream(options) {
    const { command: args, warnings } = this.getArgs(options);
    const url = `${this.getUrl(this.modelId)}/converse-stream`;
    const { value: response, responseHeaders } = await postJsonToApi$1({
      url,
      headers: combineHeaders$1(
        await resolve(this.config.headers),
        options.headers
      ),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler$1({
        errorSchema: BedrockErrorSchema,
        errorToMessage: (error) => `${error.type}: ${error.message}`
      }),
      successfulResponseHandler: createBedrockEventStreamResponseHandler(BedrockStreamSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    let finishReason = "unknown";
    let usage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN
    };
    let providerMetadata = void 0;
    const toolCallContentBlocks = {};
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
            function enqueueError(bedrockError) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: bedrockError });
            }
            if (!chunk.success) {
              enqueueError(chunk.error);
              return;
            }
            const value = chunk.value;
            if (value.internalServerException) {
              enqueueError(value.internalServerException);
              return;
            }
            if (value.modelStreamErrorException) {
              enqueueError(value.modelStreamErrorException);
              return;
            }
            if (value.throttlingException) {
              enqueueError(value.throttlingException);
              return;
            }
            if (value.validationException) {
              enqueueError(value.validationException);
              return;
            }
            if (value.messageStop) {
              finishReason = mapBedrockFinishReason(
                value.messageStop.stopReason
              );
            }
            if (value.metadata) {
              usage = {
                promptTokens: (_b = (_a = value.metadata.usage) == null ? void 0 : _a.inputTokens) != null ? _b : Number.NaN,
                completionTokens: (_d = (_c = value.metadata.usage) == null ? void 0 : _c.outputTokens) != null ? _d : Number.NaN
              };
              const cacheUsage = ((_e = value.metadata.usage) == null ? void 0 : _e.cacheReadInputTokens) != null || ((_f = value.metadata.usage) == null ? void 0 : _f.cacheWriteInputTokens) != null ? {
                usage: {
                  cacheReadInputTokens: (_h = (_g = value.metadata.usage) == null ? void 0 : _g.cacheReadInputTokens) != null ? _h : Number.NaN,
                  cacheWriteInputTokens: (_j = (_i = value.metadata.usage) == null ? void 0 : _i.cacheWriteInputTokens) != null ? _j : Number.NaN
                }
              } : void 0;
              const trace = value.metadata.trace ? {
                trace: value.metadata.trace
              } : void 0;
              if (cacheUsage || trace) {
                providerMetadata = {
                  bedrock: {
                    ...cacheUsage,
                    ...trace
                  }
                };
              }
            }
            if (((_k = value.contentBlockDelta) == null ? void 0 : _k.delta) && "text" in value.contentBlockDelta.delta && value.contentBlockDelta.delta.text) {
              controller.enqueue({
                type: "text-delta",
                textDelta: value.contentBlockDelta.delta.text
              });
            }
            if (((_l = value.contentBlockDelta) == null ? void 0 : _l.delta) && "reasoningContent" in value.contentBlockDelta.delta && value.contentBlockDelta.delta.reasoningContent) {
              const reasoningContent = value.contentBlockDelta.delta.reasoningContent;
              if ("text" in reasoningContent && reasoningContent.text) {
                controller.enqueue({
                  type: "reasoning",
                  textDelta: reasoningContent.text
                });
              } else if ("signature" in reasoningContent && reasoningContent.signature) {
                controller.enqueue({
                  type: "reasoning-signature",
                  signature: reasoningContent.signature
                });
              } else if ("data" in reasoningContent && reasoningContent.data) {
                controller.enqueue({
                  type: "redacted-reasoning",
                  data: reasoningContent.data
                });
              }
            }
            const contentBlockStart = value.contentBlockStart;
            if (((_m = contentBlockStart == null ? void 0 : contentBlockStart.start) == null ? void 0 : _m.toolUse) != null) {
              const toolUse = contentBlockStart.start.toolUse;
              toolCallContentBlocks[contentBlockStart.contentBlockIndex] = {
                toolCallId: toolUse.toolUseId,
                toolName: toolUse.name,
                jsonText: ""
              };
            }
            const contentBlockDelta = value.contentBlockDelta;
            if ((contentBlockDelta == null ? void 0 : contentBlockDelta.delta) && "toolUse" in contentBlockDelta.delta && contentBlockDelta.delta.toolUse) {
              const contentBlock = toolCallContentBlocks[contentBlockDelta.contentBlockIndex];
              const delta = (_n = contentBlockDelta.delta.toolUse.input) != null ? _n : "";
              controller.enqueue({
                type: "tool-call-delta",
                toolCallType: "function",
                toolCallId: contentBlock.toolCallId,
                toolName: contentBlock.toolName,
                argsTextDelta: delta
              });
              contentBlock.jsonText += delta;
            }
            const contentBlockStop = value.contentBlockStop;
            if (contentBlockStop != null) {
              const index = contentBlockStop.contentBlockIndex;
              const contentBlock = toolCallContentBlocks[index];
              if (contentBlock != null) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallType: "function",
                  toolCallId: contentBlock.toolCallId,
                  toolName: contentBlock.toolName,
                  args: contentBlock.jsonText
                });
                delete toolCallContentBlocks[index];
              }
            }
          },
          flush(controller) {
            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
              ...providerMetadata && { providerMetadata }
            });
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings
    };
  }
  getUrl(modelId) {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}`;
  }
};
var BedrockReasoningConfigOptionsSchema = objectType({
  type: unionType([literalType("enabled"), literalType("disabled")]).nullish(),
  budget_tokens: numberType().nullish(),
  budgetTokens: numberType().nullish()
}).nullish();
var BedrockStopReasonSchema = unionType([
  enumType(BEDROCK_STOP_REASONS),
  stringType()
]);
var BedrockToolUseSchema = objectType({
  toolUseId: stringType(),
  name: stringType(),
  input: unknownType()
});
var BedrockReasoningTextSchema = objectType({
  signature: stringType().nullish(),
  text: stringType()
});
var BedrockRedactedReasoningSchema = objectType({
  data: stringType()
});
var BedrockResponseSchema = objectType({
  metrics: objectType({
    latencyMs: numberType()
  }).nullish(),
  output: objectType({
    message: objectType({
      content: arrayType(
        objectType({
          text: stringType().nullish(),
          toolUse: BedrockToolUseSchema.nullish(),
          reasoningContent: unionType([
            objectType({
              reasoningText: BedrockReasoningTextSchema
            }),
            objectType({
              redactedReasoning: BedrockRedactedReasoningSchema
            })
          ]).nullish()
        })
      ),
      role: stringType()
    })
  }),
  stopReason: BedrockStopReasonSchema,
  trace: unknownType().nullish(),
  usage: objectType({
    inputTokens: numberType(),
    outputTokens: numberType(),
    totalTokens: numberType(),
    cacheReadInputTokens: numberType().nullish(),
    cacheWriteInputTokens: numberType().nullish()
  })
});
var BedrockStreamSchema = objectType({
  contentBlockDelta: objectType({
    contentBlockIndex: numberType(),
    delta: unionType([
      objectType({ text: stringType() }),
      objectType({ toolUse: objectType({ input: stringType() }) }),
      objectType({
        reasoningContent: objectType({ text: stringType() })
      }),
      objectType({
        reasoningContent: objectType({
          signature: stringType()
        })
      }),
      objectType({
        reasoningContent: objectType({ data: stringType() })
      })
    ]).nullish()
  }).nullish(),
  contentBlockStart: objectType({
    contentBlockIndex: numberType(),
    start: objectType({
      toolUse: BedrockToolUseSchema.nullish()
    }).nullish()
  }).nullish(),
  contentBlockStop: objectType({
    contentBlockIndex: numberType()
  }).nullish(),
  internalServerException: recordType(unknownType()).nullish(),
  messageStop: objectType({
    additionalModelResponseFields: recordType(unknownType()).nullish(),
    stopReason: BedrockStopReasonSchema
  }).nullish(),
  metadata: objectType({
    trace: unknownType().nullish(),
    usage: objectType({
      cacheReadInputTokens: numberType().nullish(),
      cacheWriteInputTokens: numberType().nullish(),
      inputTokens: numberType(),
      outputTokens: numberType()
    }).nullish()
  }).nullish(),
  modelStreamErrorException: recordType(unknownType()).nullish(),
  throttlingException: recordType(unknownType()).nullish(),
  validationException: recordType(unknownType()).nullish()
});
var BedrockEmbeddingModel = class {
  constructor(modelId, settings, config) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.specificationVersion = "v1";
    this.provider = "amazon-bedrock";
    this.maxEmbeddingsPerCall = void 0;
    this.supportsParallelCalls = true;
  }
  getUrl(modelId) {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/invoke`;
  }
  async doEmbed({
    values,
    headers,
    abortSignal
  }) {
    const embedSingleText = async (inputText) => {
      const args = {
        inputText,
        dimensions: this.settings.dimensions,
        normalize: this.settings.normalize
      };
      const url = this.getUrl(this.modelId);
      const { value: response } = await postJsonToApi$1({
        url,
        headers: await resolve(
          combineHeaders$1(await resolve(this.config.headers), headers)
        ),
        body: args,
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: BedrockErrorSchema,
          errorToMessage: (error) => `${error.type}: ${error.message}`
        }),
        successfulResponseHandler: createJsonResponseHandler$1(
          BedrockEmbeddingResponseSchema
        ),
        fetch: this.config.fetch,
        abortSignal
      });
      return {
        embedding: response.embedding,
        inputTextTokenCount: response.inputTextTokenCount
      };
    };
    const responses = await Promise.all(values.map(embedSingleText));
    return responses.reduce(
      (accumulated, response) => {
        accumulated.embeddings.push(response.embedding);
        accumulated.usage.tokens += response.inputTextTokenCount;
        return accumulated;
      },
      { embeddings: [], usage: { tokens: 0 } }
    );
  }
};
var BedrockEmbeddingResponseSchema = objectType({
  embedding: arrayType(numberType()),
  inputTextTokenCount: numberType()
});

// src/bedrock-image-settings.ts
var modelMaxImagesPerCall = {
  "amazon.nova-canvas-v1:0": 5
};
var BedrockImageModel = class {
  constructor(modelId, settings, config) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.specificationVersion = "v1";
    this.provider = "amazon-bedrock";
  }
  get maxImagesPerCall() {
    var _a, _b;
    return (_b = (_a = this.settings.maxImagesPerCall) != null ? _a : modelMaxImagesPerCall[this.modelId]) != null ? _b : 1;
  }
  getUrl(modelId) {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/invoke`;
  }
  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal
  }) {
    var _a, _b, _c, _d, _e, _f;
    const warnings = [];
    const [width, height] = size ? size.split("x").map(Number) : [];
    const args = {
      taskType: "TEXT_IMAGE",
      textToImageParams: {
        text: prompt,
        ...((_a = providerOptions == null ? void 0 : providerOptions.bedrock) == null ? void 0 : _a.negativeText) ? {
          negativeText: providerOptions.bedrock.negativeText
        } : {}
      },
      imageGenerationConfig: {
        ...width ? { width } : {},
        ...height ? { height } : {},
        ...seed ? { seed } : {},
        ...n ? { numberOfImages: n } : {},
        ...((_b = providerOptions == null ? void 0 : providerOptions.bedrock) == null ? void 0 : _b.quality) ? { quality: providerOptions.bedrock.quality } : {},
        ...((_c = providerOptions == null ? void 0 : providerOptions.bedrock) == null ? void 0 : _c.cfgScale) ? { cfgScale: providerOptions.bedrock.cfgScale } : {}
      }
    };
    if (aspectRatio != void 0) {
      warnings.push({
        type: "unsupported-setting",
        setting: "aspectRatio",
        details: "This model does not support aspect ratio. Use `size` instead."
      });
    }
    const currentDate = (_f = (_e = (_d = this.config._internal) == null ? void 0 : _d.currentDate) == null ? void 0 : _e.call(_d)) != null ? _f : /* @__PURE__ */ new Date();
    const { value: response, responseHeaders } = await postJsonToApi$1({
      url: this.getUrl(this.modelId),
      headers: await resolve(
        combineHeaders$1(await resolve(this.config.headers), headers)
      ),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler$1({
        errorSchema: BedrockErrorSchema,
        errorToMessage: (error) => `${error.type}: ${error.message}`
      }),
      successfulResponseHandler: createJsonResponseHandler$1(
        bedrockImageResponseSchema
      ),
      abortSignal,
      fetch: this.config.fetch
    });
    return {
      images: response.images,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders
      }
    };
  }
};
var bedrockImageResponseSchema = objectType({
  images: arrayType(stringType())
});

// src/headers-utils.ts
function extractHeaders(headers) {
  let originalHeaders = {};
  if (headers) {
    if (headers instanceof Headers) {
      originalHeaders = convertHeadersToRecord(headers);
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) {
        originalHeaders[k.toLowerCase()] = v;
      }
    } else {
      originalHeaders = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
      );
    }
  }
  return originalHeaders;
}
function convertHeadersToRecord(headers) {
  const record = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}
function createSigV4FetchFunction(getCredentials, fetch = globalThis.fetch) {
  return async (input, init) => {
    var _a;
    if (((_a = init == null ? void 0 : init.method) == null ? void 0 : _a.toUpperCase()) !== "POST" || !(init == null ? void 0 : init.body)) {
      return fetch(input, init);
    }
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const originalHeaders = extractHeaders(init.headers);
    const body = prepareBodyString(init.body);
    const credentials = await getCredentials();
    const signer = new AwsV4Signer({
      url,
      method: "POST",
      headers: Object.entries(removeUndefinedEntries$1(originalHeaders)),
      body,
      region: credentials.region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      service: "bedrock"
    });
    const signingResult = await signer.sign();
    const signedHeaders = convertHeadersToRecord(signingResult.headers);
    return fetch(input, {
      ...init,
      body,
      headers: removeUndefinedEntries$1(
        combineHeaders$1(originalHeaders, signedHeaders)
      )
    });
  };
}
function prepareBodyString(body) {
  if (typeof body === "string") {
    return body;
  } else if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  } else if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  } else {
    return JSON.stringify(body);
  }
}

// src/bedrock-provider.ts
function createAmazonBedrock(options = {}) {
  const sigv4Fetch = createSigV4FetchFunction(async () => {
    const region = loadSetting({
      settingValue: options.region,
      settingName: "region",
      environmentVariableName: "AWS_REGION",
      description: "AWS region"
    });
    if (options.credentialProvider) {
      return {
        ...await options.credentialProvider(),
        region
      };
    }
    return {
      region,
      accessKeyId: loadSetting({
        settingValue: options.accessKeyId,
        settingName: "accessKeyId",
        environmentVariableName: "AWS_ACCESS_KEY_ID",
        description: "AWS access key ID"
      }),
      secretAccessKey: loadSetting({
        settingValue: options.secretAccessKey,
        settingName: "secretAccessKey",
        environmentVariableName: "AWS_SECRET_ACCESS_KEY",
        description: "AWS secret access key"
      }),
      sessionToken: loadOptionalSetting({
        settingValue: options.sessionToken,
        environmentVariableName: "AWS_SESSION_TOKEN"
      })
    };
  }, options.fetch);
  const getBaseUrl = () => {
    var _a, _b;
    return (_b = withoutTrailingSlash$1(
      (_a = options.baseURL) != null ? _a : `https://bedrock-runtime.${loadSetting({
        settingValue: options.region,
        settingName: "region",
        environmentVariableName: "AWS_REGION",
        description: "AWS region"
      })}.amazonaws.com`
    )) != null ? _b : `https://bedrock-runtime.us-east-1.amazonaws.com`;
  };
  const createChatModel = (modelId, settings = {}) => {
    var _a;
    return new BedrockChatLanguageModel(modelId, settings, {
      baseUrl: getBaseUrl,
      headers: (_a = options.headers) != null ? _a : {},
      fetch: sigv4Fetch,
      generateId: generateId$1
    });
  };
  const provider = function(modelId, settings) {
    if (new.target) {
      throw new Error(
        "The Amazon Bedrock model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  const createEmbeddingModel = (modelId, settings = {}) => {
    var _a;
    return new BedrockEmbeddingModel(modelId, settings, {
      baseUrl: getBaseUrl,
      headers: (_a = options.headers) != null ? _a : {},
      fetch: sigv4Fetch
    });
  };
  const createImageModel = (modelId, settings = {}) => {
    var _a;
    return new BedrockImageModel(modelId, settings, {
      baseUrl: getBaseUrl,
      headers: (_a = options.headers) != null ? _a : {},
      fetch: sigv4Fetch
    });
  };
  provider.languageModel = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  return provider;
}
createAmazonBedrock();

// src/errors/ai-sdk-error.ts
var marker = "vercel.ai.error";
var symbol = Symbol.for(marker);
var _a;
var _AISDKError = class _AISDKError extends Error {
  /**
   * Creates an AI SDK Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.name - The name of the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */
  constructor({
    name: name14,
    message,
    cause
  }) {
    super(message);
    this[_a] = true;
    this.name = name14;
    this.cause = cause;
  }
  /**
   * Checks if the given error is an AI SDK Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is an AI SDK Error, false otherwise.
   */
  static isInstance(error) {
    return _AISDKError.hasMarker(error, marker);
  }
  static hasMarker(error, marker15) {
    const markerSymbol = Symbol.for(marker15);
    return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
  }
};
_a = symbol;
var AISDKError = _AISDKError;

// src/errors/api-call-error.ts
var name = "AI_APICallError";
var marker2 = `vercel.ai.error.${name}`;
var symbol2 = Symbol.for(marker2);
var _a2;
var APICallError = class extends AISDKError {
  constructor({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseHeaders,
    responseBody,
    cause,
    isRetryable = statusCode != null && (statusCode === 408 || // request timeout
    statusCode === 409 || // conflict
    statusCode === 429 || // too many requests
    statusCode >= 500),
    // server error
    data
  }) {
    super({ name, message, cause });
    this[_a2] = true;
    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseHeaders = responseHeaders;
    this.responseBody = responseBody;
    this.isRetryable = isRetryable;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker2);
  }
};
_a2 = symbol2;

// src/errors/empty-response-body-error.ts
var name2 = "AI_EmptyResponseBodyError";
var marker3 = `vercel.ai.error.${name2}`;
var symbol3 = Symbol.for(marker3);
var _a3;
var EmptyResponseBodyError = class extends AISDKError {
  // used in isInstance
  constructor({ message = "Empty response body" } = {}) {
    super({ name: name2, message });
    this[_a3] = true;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker3);
  }
};
_a3 = symbol3;

// src/errors/get-error-message.ts
function getErrorMessage(error) {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}

// src/errors/invalid-argument-error.ts
var name3 = "AI_InvalidArgumentError";
var marker4 = `vercel.ai.error.${name3}`;
var symbol4 = Symbol.for(marker4);
var _a4;
var InvalidArgumentError = class extends AISDKError {
  constructor({
    message,
    cause,
    argument
  }) {
    super({ name: name3, message, cause });
    this[_a4] = true;
    this.argument = argument;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker4);
  }
};
_a4 = symbol4;

// src/errors/invalid-prompt-error.ts
var name4 = "AI_InvalidPromptError";
var marker5 = `vercel.ai.error.${name4}`;
var symbol5 = Symbol.for(marker5);
var _a5;
var InvalidPromptError = class extends AISDKError {
  constructor({
    prompt,
    message,
    cause
  }) {
    super({ name: name4, message: `Invalid prompt: ${message}`, cause });
    this[_a5] = true;
    this.prompt = prompt;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker5);
  }
};
_a5 = symbol5;

// src/errors/invalid-response-data-error.ts
var name5 = "AI_InvalidResponseDataError";
var marker6 = `vercel.ai.error.${name5}`;
var symbol6 = Symbol.for(marker6);
var _a6;
var InvalidResponseDataError = class extends AISDKError {
  constructor({
    data,
    message = `Invalid response data: ${JSON.stringify(data)}.`
  }) {
    super({ name: name5, message });
    this[_a6] = true;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker6);
  }
};
_a6 = symbol6;

// src/errors/json-parse-error.ts
var name6 = "AI_JSONParseError";
var marker7 = `vercel.ai.error.${name6}`;
var symbol7 = Symbol.for(marker7);
var _a7;
var JSONParseError = class extends AISDKError {
  constructor({ text, cause }) {
    super({
      name: name6,
      message: `JSON parsing failed: Text: ${text}.
Error message: ${getErrorMessage(cause)}`,
      cause
    });
    this[_a7] = true;
    this.text = text;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker7);
  }
};
_a7 = symbol7;

// src/errors/load-api-key-error.ts
var name7 = "AI_LoadAPIKeyError";
var marker8 = `vercel.ai.error.${name7}`;
var symbol8 = Symbol.for(marker8);
var _a8;
var LoadAPIKeyError = class extends AISDKError {
  // used in isInstance
  constructor({ message }) {
    super({ name: name7, message });
    this[_a8] = true;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker8);
  }
};
_a8 = symbol8;

// src/errors/type-validation-error.ts
var name12 = "AI_TypeValidationError";
var marker13 = `vercel.ai.error.${name12}`;
var symbol13 = Symbol.for(marker13);
var _a13;
var _TypeValidationError = class _TypeValidationError extends AISDKError {
  constructor({ value, cause }) {
    super({
      name: name12,
      message: `Type validation failed: Value: ${JSON.stringify(value)}.
Error message: ${getErrorMessage(cause)}`,
      cause
    });
    this[_a13] = true;
    this.value = value;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker13);
  }
  /**
   * Wraps an error into a TypeValidationError.
   * If the cause is already a TypeValidationError with the same value, it returns the cause.
   * Otherwise, it creates a new TypeValidationError.
   *
   * @param {Object} params - The parameters for wrapping the error.
   * @param {unknown} params.value - The value that failed validation.
   * @param {unknown} params.cause - The original error or cause of the validation failure.
   * @returns {TypeValidationError} A TypeValidationError instance.
   */
  static wrap({
    value,
    cause
  }) {
    return _TypeValidationError.isInstance(cause) && cause.value === value ? cause : new _TypeValidationError({ value, cause });
  }
};
_a13 = symbol13;
var TypeValidationError = _TypeValidationError;

// src/errors/unsupported-functionality-error.ts
var name13 = "AI_UnsupportedFunctionalityError";
var marker14 = `vercel.ai.error.${name13}`;
var symbol14 = Symbol.for(marker14);
var _a14;
var UnsupportedFunctionalityError = class extends AISDKError {
  constructor({
    functionality,
    message = `'${functionality}' functionality not supported.`
  }) {
    super({ name: name13, message });
    this[_a14] = true;
    this.functionality = functionality;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker14);
  }
};
_a14 = symbol14;

class ParseError extends Error {
  constructor(message, options) {
    super(message), this.name = "ParseError", this.type = options.type, this.field = options.field, this.value = options.value, this.line = options.line;
  }
}
function noop(_arg) {
}
function createParser(callbacks) {
  if (typeof callbacks == "function")
    throw new TypeError(
      "`callbacks` must be an object, got a function instead. Did you mean `{onEvent: fn}`?"
    );
  const { onEvent = noop, onError = noop, onRetry = noop, onComment } = callbacks;
  let incompleteLine = "", isFirstChunk = true, id, data = "", eventType = "";
  function feed(newChunk) {
    const chunk = isFirstChunk ? newChunk.replace(/^\xEF\xBB\xBF/, "") : newChunk, [complete, incomplete] = splitLines(`${incompleteLine}${chunk}`);
    for (const line of complete)
      parseLine(line);
    incompleteLine = incomplete, isFirstChunk = false;
  }
  function parseLine(line) {
    if (line === "") {
      dispatchEvent();
      return;
    }
    if (line.startsWith(":")) {
      onComment && onComment(line.slice(line.startsWith(": ") ? 2 : 1));
      return;
    }
    const fieldSeparatorIndex = line.indexOf(":");
    if (fieldSeparatorIndex !== -1) {
      const field = line.slice(0, fieldSeparatorIndex), offset = line[fieldSeparatorIndex + 1] === " " ? 2 : 1, value = line.slice(fieldSeparatorIndex + offset);
      processField(field, value, line);
      return;
    }
    processField(line, "", line);
  }
  function processField(field, value, line) {
    switch (field) {
      case "event":
        eventType = value;
        break;
      case "data":
        data = `${data}${value}
`;
        break;
      case "id":
        id = value.includes("\0") ? void 0 : value;
        break;
      case "retry":
        /^\d+$/.test(value) ? onRetry(parseInt(value, 10)) : onError(
          new ParseError(`Invalid \`retry\` value: "${value}"`, {
            type: "invalid-retry",
            value,
            line
          })
        );
        break;
      default:
        onError(
          new ParseError(
            `Unknown field "${field.length > 20 ? `${field.slice(0, 20)}\u2026` : field}"`,
            { type: "unknown-field", field, value, line }
          )
        );
        break;
    }
  }
  function dispatchEvent() {
    data.length > 0 && onEvent({
      id,
      event: eventType || void 0,
      // If the data buffer's last character is a U+000A LINE FEED (LF) character,
      // then remove the last character from the data buffer.
      data: data.endsWith(`
`) ? data.slice(0, -1) : data
    }), id = void 0, data = "", eventType = "";
  }
  function reset(options = {}) {
    incompleteLine && options.consume && parseLine(incompleteLine), isFirstChunk = true, id = void 0, data = "", eventType = "", incompleteLine = "";
  }
  return { feed, reset };
}
function splitLines(chunk) {
  const lines = [];
  let incompleteLine = "", searchIndex = 0;
  for (; searchIndex < chunk.length; ) {
    const crIndex = chunk.indexOf("\r", searchIndex), lfIndex = chunk.indexOf(`
`, searchIndex);
    let lineEnd = -1;
    if (crIndex !== -1 && lfIndex !== -1 ? lineEnd = Math.min(crIndex, lfIndex) : crIndex !== -1 ? lineEnd = crIndex : lfIndex !== -1 && (lineEnd = lfIndex), lineEnd === -1) {
      incompleteLine = chunk.slice(searchIndex);
      break;
    } else {
      const line = chunk.slice(searchIndex, lineEnd);
      lines.push(line), searchIndex = lineEnd + 1, chunk[searchIndex - 1] === "\r" && chunk[searchIndex] === `
` && searchIndex++;
    }
  }
  return [lines, incompleteLine];
}

class EventSourceParserStream extends TransformStream {
  constructor({ onError, onRetry, onComment } = {}) {
    let parser;
    super({
      start(controller) {
        parser = createParser({
          onEvent: (event) => {
            controller.enqueue(event);
          },
          onError(error) {
            onError === "terminate" ? controller.error(error) : typeof onError == "function" && onError(error);
          },
          onRetry,
          onComment
        });
      },
      transform(chunk) {
        parser.feed(chunk);
      }
    });
  }
}

// src/combine-headers.ts
function combineHeaders(...headers) {
  return headers.reduce(
    (combinedHeaders, currentHeaders) => ({
      ...combinedHeaders,
      ...currentHeaders != null ? currentHeaders : {}
    }),
    {}
  );
}

// src/extract-response-headers.ts
function extractResponseHeaders(response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}
var createIdGenerator = ({
  prefix,
  size: defaultSize = 16,
  alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  separator = "-"
} = {}) => {
  const generator = customAlphabet(alphabet, defaultSize);
  if (prefix == null) {
    return generator;
  }
  if (alphabet.includes(separator)) {
    throw new InvalidArgumentError({
      argument: "separator",
      message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`
    });
  }
  return (size) => `${prefix}${separator}${generator(size)}`;
};
var generateId = createIdGenerator();

// src/remove-undefined-entries.ts
function removeUndefinedEntries(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([_key, value]) => value != null)
  );
}

// src/is-abort-error.ts
function isAbortError(error) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
function loadApiKey({
  apiKey,
  environmentVariableName,
  apiKeyParameterName = "apiKey",
  description
}) {
  if (typeof apiKey === "string") {
    return apiKey;
  }
  if (apiKey != null) {
    throw new LoadAPIKeyError({
      message: `${description} API key must be a string.`
    });
  }
  if (typeof process === "undefined") {
    throw new LoadAPIKeyError({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables is not supported in this environment.`
    });
  }
  apiKey = process.env[environmentVariableName];
  if (apiKey == null) {
    throw new LoadAPIKeyError({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.`
    });
  }
  if (typeof apiKey !== "string") {
    throw new LoadAPIKeyError({
      message: `${description} API key must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
    });
  }
  return apiKey;
}

// src/validator.ts
var validatorSymbol = Symbol.for("vercel.ai.validator");
function validator(validate) {
  return { [validatorSymbol]: true, validate };
}
function isValidator(value) {
  return typeof value === "object" && value !== null && validatorSymbol in value && value[validatorSymbol] === true && "validate" in value;
}
function asValidator(value) {
  return isValidator(value) ? value : zodValidator(value);
}
function zodValidator(zodSchema) {
  return validator((value) => {
    const result = zodSchema.safeParse(value);
    return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
  });
}

// src/validate-types.ts
function validateTypes({
  value,
  schema: inputSchema
}) {
  const result = safeValidateTypes({ value, schema: inputSchema });
  if (!result.success) {
    throw TypeValidationError.wrap({ value, cause: result.error });
  }
  return result.value;
}
function safeValidateTypes({
  value,
  schema
}) {
  const validator2 = asValidator(schema);
  try {
    if (validator2.validate == null) {
      return { success: true, value };
    }
    const result = validator2.validate(value);
    if (result.success) {
      return result;
    }
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: result.error })
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: error })
    };
  }
}

// src/parse-json.ts
function parseJSON({
  text,
  schema
}) {
  try {
    const value = SecureJSON.parse(text);
    if (schema == null) {
      return value;
    }
    return validateTypes({ value, schema });
  } catch (error) {
    if (JSONParseError.isInstance(error) || TypeValidationError.isInstance(error)) {
      throw error;
    }
    throw new JSONParseError({ text, cause: error });
  }
}
function safeParseJSON({
  text,
  schema
}) {
  try {
    const value = SecureJSON.parse(text);
    if (schema == null) {
      return { success: true, value, rawValue: value };
    }
    const validationResult = safeValidateTypes({ value, schema });
    return validationResult.success ? { ...validationResult, rawValue: value } : validationResult;
  } catch (error) {
    return {
      success: false,
      error: JSONParseError.isInstance(error) ? error : new JSONParseError({ text, cause: error })
    };
  }
}
function isParsableJson(input) {
  try {
    SecureJSON.parse(input);
    return true;
  } catch (e) {
    return false;
  }
}
var getOriginalFetch2 = () => globalThis.fetch;
var postJsonToApi = async ({
  url,
  headers,
  body,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch
}) => postToApi({
  url,
  headers: {
    "Content-Type": "application/json",
    ...headers
  },
  body: {
    content: JSON.stringify(body),
    values: body
  },
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch
});
var postToApi = async ({
  url,
  headers = {},
  body,
  successfulResponseHandler,
  failedResponseHandler,
  abortSignal,
  fetch = getOriginalFetch2()
}) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: removeUndefinedEntries(headers),
      body: body.content,
      signal: abortSignal
    });
    const responseHeaders = extractResponseHeaders(response);
    if (!response.ok) {
      let errorInformation;
      try {
        errorInformation = await failedResponseHandler({
          response,
          url,
          requestBodyValues: body.values
        });
      } catch (error) {
        if (isAbortError(error) || APICallError.isInstance(error)) {
          throw error;
        }
        throw new APICallError({
          message: "Failed to process error response",
          cause: error,
          statusCode: response.status,
          url,
          responseHeaders,
          requestBodyValues: body.values
        });
      }
      throw errorInformation.value;
    }
    try {
      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues: body.values
      });
    } catch (error) {
      if (error instanceof Error) {
        if (isAbortError(error) || APICallError.isInstance(error)) {
          throw error;
        }
      }
      throw new APICallError({
        message: "Failed to process successful response",
        cause: error,
        statusCode: response.status,
        url,
        responseHeaders,
        requestBodyValues: body.values
      });
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (error instanceof TypeError && error.message === "fetch failed") {
      const cause = error.cause;
      if (cause != null) {
        throw new APICallError({
          message: `Cannot connect to API: ${cause.message}`,
          cause,
          url,
          requestBodyValues: body.values,
          isRetryable: true
          // retry when network error
        });
      }
    }
    throw error;
  }
};
var createJsonErrorResponseHandler = ({
  errorSchema,
  errorToMessage,
  isRetryable
}) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await response.text();
  const responseHeaders = extractResponseHeaders(response);
  if (responseBody.trim() === "") {
    return {
      responseHeaders,
      value: new APICallError({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
  try {
    const parsedError = parseJSON({
      text: responseBody,
      schema: errorSchema
    });
    return {
      responseHeaders,
      value: new APICallError({
        message: errorToMessage(parsedError),
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        data: parsedError,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response, parsedError)
      })
    };
  } catch (parseError) {
    return {
      responseHeaders,
      value: new APICallError({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
};
var createEventSourceResponseHandler = (chunkSchema) => async ({ response }) => {
  const responseHeaders = extractResponseHeaders(response);
  if (response.body == null) {
    throw new EmptyResponseBodyError({});
  }
  return {
    responseHeaders,
    value: response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).pipeThrough(
      new TransformStream({
        transform({ data }, controller) {
          if (data === "[DONE]") {
            return;
          }
          controller.enqueue(
            safeParseJSON({
              text: data,
              schema: chunkSchema
            })
          );
        }
      })
    )
  };
};
var createJsonResponseHandler = (responseSchema) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await response.text();
  const parsedResult = safeParseJSON({
    text: responseBody,
    schema: responseSchema
  });
  const responseHeaders = extractResponseHeaders(response);
  if (!parsedResult.success) {
    throw new APICallError({
      message: "Invalid JSON response",
      cause: parsedResult.error,
      statusCode: response.status,
      responseHeaders,
      responseBody,
      url,
      requestBodyValues
    });
  }
  return {
    responseHeaders,
    value: parsedResult.value,
    rawValue: parsedResult.rawValue
  };
};

// src/uint8-utils.ts
var { btoa} = globalThis;
function convertUint8ArrayToBase64(array) {
  let latin1string = "";
  for (let i = 0; i < array.length; i++) {
    latin1string += String.fromCodePoint(array[i]);
  }
  return btoa(latin1string);
}

// src/without-trailing-slash.ts
function withoutTrailingSlash(url) {
  return url == null ? void 0 : url.replace(/\/$/, "");
}

var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
function getCacheControl(providerMetadata) {
  var _a, _b, _c;
  const anthropic = providerMetadata == null ? void 0 : providerMetadata.anthropic;
  const openrouter2 = providerMetadata == null ? void 0 : providerMetadata.openrouter;
  return (_c = (_b = (_a = openrouter2 == null ? void 0 : openrouter2.cacheControl) != null ? _a : openrouter2 == null ? void 0 : openrouter2.cache_control) != null ? _b : anthropic == null ? void 0 : anthropic.cacheControl) != null ? _c : anthropic == null ? void 0 : anthropic.cache_control;
}
function convertToOpenRouterChatMessages(prompt) {
  var _a, _b, _c;
  const messages = [];
  for (const { role, content, providerMetadata } of prompt) {
    switch (role) {
      case "system": {
        messages.push({
          role: "system",
          content,
          cache_control: getCacheControl(providerMetadata)
        });
        break;
      }
      case "user": {
        if (content.length === 1 && ((_a = content[0]) == null ? void 0 : _a.type) === "text") {
          messages.push({
            role: "user",
            content: content[0].text,
            cache_control: (_b = getCacheControl(providerMetadata)) != null ? _b : getCacheControl(content[0].providerMetadata)
          });
          break;
        }
        const messageCacheControl = getCacheControl(providerMetadata);
        const contentParts = content.map(
          (part) => {
            var _a2, _b2, _c2, _d, _e, _f;
            switch (part.type) {
              case "text":
                return {
                  type: "text",
                  text: part.text,
                  // For text parts, only use part-specific cache control
                  cache_control: (_a2 = getCacheControl(part.providerMetadata)) != null ? _a2 : messageCacheControl
                };
              case "image":
                return {
                  type: "image_url",
                  image_url: {
                    url: part.image instanceof URL ? part.image.toString() : `data:${(_b2 = part.mimeType) != null ? _b2 : "image/jpeg"};base64,${convertUint8ArrayToBase64(
                      part.image
                    )}`
                  },
                  // For image parts, use part-specific or message-level cache control
                  cache_control: (_c2 = getCacheControl(part.providerMetadata)) != null ? _c2 : messageCacheControl
                };
              case "file":
                return {
                  type: "file",
                  file: {
                    filename: String(
                      (_e = (_d = part.providerMetadata) == null ? void 0 : _d.openrouter) == null ? void 0 : _e.filename
                    ),
                    file_data: part.data instanceof Uint8Array ? `data:${part.mimeType};base64,${convertUint8ArrayToBase64(part.data)}` : `data:${part.mimeType};base64,${part.data}`
                  },
                  cache_control: (_f = getCacheControl(part.providerMetadata)) != null ? _f : messageCacheControl
                };
              default: {
                const _exhaustiveCheck = part;
                throw new Error(
                  `Unsupported content part type: ${_exhaustiveCheck}`
                );
              }
            }
          }
        );
        messages.push({
          role: "user",
          content: contentParts
        });
        break;
      }
      case "assistant": {
        let text = "";
        const toolCalls = [];
        for (const part of content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args)
                }
              });
              break;
            }
            // TODO: Handle reasoning and redacted-reasoning
            case "reasoning":
            case "redacted-reasoning":
              break;
            default: {
              const _exhaustiveCheck = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }
        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : void 0,
          cache_control: getCacheControl(providerMetadata)
        });
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          messages.push({
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            content: JSON.stringify(toolResponse.result),
            cache_control: (_c = getCacheControl(providerMetadata)) != null ? _c : getCacheControl(toolResponse.providerMetadata)
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return messages;
}

// src/map-openrouter-chat-logprobs.ts
function mapOpenRouterChatLogProbsOutput(logprobs) {
  var _a, _b;
  return (_b = (_a = logprobs == null ? void 0 : logprobs.content) == null ? void 0 : _a.map(({ token, logprob, top_logprobs }) => ({
    token,
    logprob,
    topLogprobs: top_logprobs ? top_logprobs.map(({ token: token2, logprob: logprob2 }) => ({
      token: token2,
      logprob: logprob2
    })) : []
  }))) != null ? _b : void 0;
}

// src/map-openrouter-finish-reason.ts
function mapOpenRouterFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    case "function_call":
    case "tool_calls":
      return "tool-calls";
    default:
      return "unknown";
  }
}
var OpenRouterErrorResponseSchema = objectType({
  error: objectType({
    message: stringType(),
    type: stringType(),
    param: anyType().nullable(),
    code: stringType().nullable()
  })
});
var openrouterFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: OpenRouterErrorResponseSchema,
  errorToMessage: (data) => data.error.message
});

// src/openrouter-chat-language-model.ts
function isFunctionTool(tool) {
  return "parameters" in tool;
}
var OpenRouterChatLanguageModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = "tool";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
    stopSequences,
    responseFormat,
    topK,
    providerMetadata
  }) {
    var _a;
    const type = mode.type;
    const extraCallingBody = (_a = providerMetadata == null ? void 0 : providerMetadata["openrouter"]) != null ? _a : {};
    const baseArgs = __spreadValues(__spreadValues(__spreadValues({
      // model id:
      model: this.modelId,
      models: this.settings.models,
      // model specific settings:
      logit_bias: this.settings.logitBias,
      logprobs: this.settings.logprobs === true || typeof this.settings.logprobs === "number" ? true : void 0,
      top_logprobs: typeof this.settings.logprobs === "number" ? this.settings.logprobs : typeof this.settings.logprobs === "boolean" ? this.settings.logprobs ? 0 : void 0 : void 0,
      user: this.settings.user,
      parallel_tool_calls: this.settings.parallelToolCalls,
      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      seed,
      stop: stopSequences,
      response_format: responseFormat,
      top_k: topK,
      // messages:
      messages: convertToOpenRouterChatMessages(prompt),
      // OpenRouter specific settings:
      include_reasoning: this.settings.includeReasoning,
      reasoning: this.settings.reasoning
    }, this.config.extraBody), this.settings.extraBody), extraCallingBody);
    switch (type) {
      case "regular": {
        return __spreadValues(__spreadValues({}, baseArgs), prepareToolsAndToolChoice(mode));
      }
      case "object-json": {
        return __spreadProps(__spreadValues({}, baseArgs), {
          response_format: { type: "json_object" }
        });
      }
      case "object-tool": {
        return __spreadProps(__spreadValues({}, baseArgs), {
          tool_choice: { type: "function", function: { name: mode.tool.name } },
          tools: [
            {
              type: "function",
              function: {
                name: mode.tool.name,
                description: mode.tool.description,
                parameters: mode.tool.parameters
              }
            }
          ]
        });
      }
      // Handle all non-text types with a single default case
      default: {
        const _exhaustiveCheck = type;
        throw new UnsupportedFunctionalityError({
          functionality: `${_exhaustiveCheck} mode`
        });
      }
    }
  }
  async doGenerate(options) {
    var _b, _c, _d, _e, _f, _g, _h;
    const args = this.getArgs(options);
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: openrouterFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        OpenRouterNonStreamChatCompletionResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const _a = args, { messages: rawPrompt } = _a, rawSettings = __objRest(_a, ["messages"]);
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No choice in response");
    }
    return {
      response: {
        id: response.id,
        modelId: response.model
      },
      text: (_b = choice.message.content) != null ? _b : void 0,
      reasoning: (_c = choice.message.reasoning) != null ? _c : void 0,
      toolCalls: (_d = choice.message.tool_calls) == null ? void 0 : _d.map((toolCall) => {
        var _a2;
        return {
          toolCallType: "function",
          toolCallId: (_a2 = toolCall.id) != null ? _a2 : generateId(),
          toolName: toolCall.function.name,
          args: toolCall.function.arguments
        };
      }),
      finishReason: mapOpenRouterFinishReason(choice.finish_reason),
      usage: {
        promptTokens: (_f = (_e = response.usage) == null ? void 0 : _e.prompt_tokens) != null ? _f : 0,
        completionTokens: (_h = (_g = response.usage) == null ? void 0 : _g.completion_tokens) != null ? _h : 0
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings: [],
      logprobs: mapOpenRouterChatLogProbsOutput(choice.logprobs)
    };
  }
  async doStream(options) {
    const args = this.getArgs(options);
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: __spreadProps(__spreadValues({}, args), {
        stream: true,
        // only include stream_options when in strict compatibility mode:
        stream_options: this.config.compatibility === "strict" ? { include_usage: true } : void 0
      }),
      failedResponseHandler: openrouterFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        OpenRouterStreamChatCompletionChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const _a = args, { messages: rawPrompt } = _a, rawSettings = __objRest(_a, ["messages"]);
    const toolCalls = [];
    let finishReason = "other";
    let usage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN
    };
    let logprobs;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: value.error });
              return;
            }
            if (value.id) {
              controller.enqueue({
                type: "response-metadata",
                id: value.id
              });
            }
            if (value.model) {
              controller.enqueue({
                type: "response-metadata",
                modelId: value.model
              });
            }
            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens
              };
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapOpenRouterFinishReason(choice.finish_reason);
            }
            if ((choice == null ? void 0 : choice.delta) == null) {
              return;
            }
            const delta = choice.delta;
            if (delta.content != null) {
              controller.enqueue({
                type: "text-delta",
                textDelta: delta.content
              });
            }
            if (delta.reasoning != null) {
              controller.enqueue({
                type: "reasoning",
                textDelta: delta.reasoning
              });
            }
            const mappedLogprobs = mapOpenRouterChatLogProbsOutput(
              choice == null ? void 0 : choice.logprobs
            );
            if (mappedLogprobs == null ? void 0 : mappedLogprobs.length) {
              if (logprobs === void 0) logprobs = [];
              logprobs.push(...mappedLogprobs);
            }
            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== "function") {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`
                    });
                  }
                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    });
                  }
                  if (((_a2 = toolCallDelta.function) == null ? void 0 : _a2.name) == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    });
                  }
                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: (_b = toolCallDelta.function.arguments) != null ? _b : ""
                    },
                    sent: false
                  };
                  const toolCall2 = toolCalls[index];
                  if (toolCall2 == null) {
                    throw new Error("Tool call is missing");
                  }
                  if (((_c = toolCall2.function) == null ? void 0 : _c.name) != null && ((_d = toolCall2.function) == null ? void 0 : _d.arguments) != null && isParsableJson(toolCall2.function.arguments)) {
                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: toolCall2.id,
                      toolName: toolCall2.function.name,
                      argsTextDelta: toolCall2.function.arguments
                    });
                    controller.enqueue({
                      type: "tool-call",
                      toolCallType: "function",
                      toolCallId: (_e = toolCall2.id) != null ? _e : generateId(),
                      toolName: toolCall2.function.name,
                      args: toolCall2.function.arguments
                    });
                    toolCall2.sent = true;
                  }
                  continue;
                }
                const toolCall = toolCalls[index];
                if (toolCall == null) {
                  throw new Error("Tool call is missing");
                }
                if (((_f = toolCallDelta.function) == null ? void 0 : _f.arguments) != null) {
                  toolCall.function.arguments += (_h = (_g = toolCallDelta.function) == null ? void 0 : _g.arguments) != null ? _h : "";
                }
                controller.enqueue({
                  type: "tool-call-delta",
                  toolCallType: "function",
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: (_i = toolCallDelta.function.arguments) != null ? _i : ""
                });
                if (((_j = toolCall.function) == null ? void 0 : _j.name) != null && ((_k = toolCall.function) == null ? void 0 : _k.arguments) != null && isParsableJson(toolCall.function.arguments)) {
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: (_l = toolCall.id) != null ? _l : generateId(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments
                  });
                  toolCall.sent = true;
                }
              }
            }
          },
          flush(controller) {
            var _a2;
            if (finishReason === "tool-calls") {
              for (const toolCall of toolCalls) {
                if (!toolCall.sent) {
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: (_a2 = toolCall.id) != null ? _a2 : generateId(),
                    toolName: toolCall.function.name,
                    // Coerce invalid arguments to an empty JSON object
                    args: isParsableJson(toolCall.function.arguments) ? toolCall.function.arguments : "{}"
                  });
                  toolCall.sent = true;
                }
              }
            }
            controller.enqueue({
              type: "finish",
              finishReason,
              logprobs,
              usage
            });
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings: []
    };
  }
};
var OpenRouterChatCompletionBaseResponseSchema = objectType({
  id: stringType().optional(),
  model: stringType().optional(),
  usage: objectType({
    prompt_tokens: numberType(),
    completion_tokens: numberType(),
    total_tokens: numberType()
  }).nullish()
});
var OpenRouterNonStreamChatCompletionResponseSchema = OpenRouterChatCompletionBaseResponseSchema.extend({
  choices: arrayType(
    objectType({
      message: objectType({
        role: literalType("assistant"),
        content: stringType().nullable().optional(),
        reasoning: stringType().nullable().optional(),
        tool_calls: arrayType(
          objectType({
            id: stringType().optional().nullable(),
            type: literalType("function"),
            function: objectType({
              name: stringType(),
              arguments: stringType()
            })
          })
        ).optional()
      }),
      index: numberType(),
      logprobs: objectType({
        content: arrayType(
          objectType({
            token: stringType(),
            logprob: numberType(),
            top_logprobs: arrayType(
              objectType({
                token: stringType(),
                logprob: numberType()
              })
            )
          })
        ).nullable()
      }).nullable().optional(),
      finish_reason: stringType().optional().nullable()
    })
  )
});
var OpenRouterStreamChatCompletionChunkSchema = unionType([
  OpenRouterChatCompletionBaseResponseSchema.extend({
    choices: arrayType(
      objectType({
        delta: objectType({
          role: enumType(["assistant"]).optional(),
          content: stringType().nullish(),
          reasoning: stringType().nullish().optional(),
          tool_calls: arrayType(
            objectType({
              index: numberType(),
              id: stringType().nullish(),
              type: literalType("function").optional(),
              function: objectType({
                name: stringType().nullish(),
                arguments: stringType().nullish()
              })
            })
          ).nullish()
        }).nullish(),
        logprobs: objectType({
          content: arrayType(
            objectType({
              token: stringType(),
              logprob: numberType(),
              top_logprobs: arrayType(
                objectType({
                  token: stringType(),
                  logprob: numberType()
                })
              )
            })
          ).nullable()
        }).nullish(),
        finish_reason: stringType().nullable().optional(),
        index: numberType()
      })
    )
  }),
  OpenRouterErrorResponseSchema
]);
function prepareToolsAndToolChoice(mode) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0 };
  }
  const mappedTools = tools.map((tool) => {
    if (isFunctionTool(tool)) {
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      };
    } else {
      return {
        type: "function",
        function: {
          name: tool.name
        }
      };
    }
  });
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return { tools: mappedTools, tool_choice: void 0 };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: mappedTools, tool_choice: type };
    case "tool":
      return {
        tools: mappedTools,
        tool_choice: {
          type: "function",
          function: {
            name: toolChoice.toolName
          }
        }
      };
    default: {
      const _exhaustiveCheck = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}
function convertToOpenRouterCompletionPrompt({
  prompt,
  inputFormat,
  user = "user",
  assistant = "assistant"
}) {
  if (inputFormat === "prompt" && prompt.length === 1 && prompt[0] && prompt[0].role === "user" && prompt[0].content.length === 1 && prompt[0].content[0] && prompt[0].content[0].type === "text") {
    return { prompt: prompt[0].content[0].text };
  }
  let text = "";
  if (prompt[0] && prompt[0].role === "system") {
    text += `${prompt[0].content}

`;
    prompt = prompt.slice(1);
  }
  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        throw new InvalidPromptError({
          message: "Unexpected system message in prompt: ${content}",
          prompt
        });
      }
      case "user": {
        const userMessage = content.map((part) => {
          switch (part.type) {
            case "text": {
              return part.text;
            }
            case "image": {
              throw new UnsupportedFunctionalityError({
                functionality: "images"
              });
            }
            case "file": {
              throw new UnsupportedFunctionalityError({
                functionality: "file attachments"
              });
            }
            default: {
              const _exhaustiveCheck = part;
              throw new Error(
                `Unsupported content type: ${_exhaustiveCheck}`
              );
            }
          }
        }).join("");
        text += `${user}:
${userMessage}

`;
        break;
      }
      case "assistant": {
        const assistantMessage = content.map((part) => {
          switch (part.type) {
            case "text": {
              return part.text;
            }
            case "tool-call": {
              throw new UnsupportedFunctionalityError({
                functionality: "tool-call messages"
              });
            }
            case "reasoning": {
              throw new UnsupportedFunctionalityError({
                functionality: "reasoning messages"
              });
            }
            case "redacted-reasoning": {
              throw new UnsupportedFunctionalityError({
                functionality: "redacted reasoning messages"
              });
            }
            default: {
              const _exhaustiveCheck = part;
              throw new Error(
                `Unsupported content type: ${_exhaustiveCheck}`
              );
            }
          }
        }).join("");
        text += `${assistant}:
${assistantMessage}

`;
        break;
      }
      case "tool": {
        throw new UnsupportedFunctionalityError({
          functionality: "tool messages"
        });
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  text += `${assistant}:
`;
  return {
    prompt: text
  };
}

// src/map-openrouter-completion-logprobs.ts
function mapOpenRouterCompletionLogProbs(logprobs) {
  return logprobs == null ? void 0 : logprobs.tokens.map((token, index) => {
    var _a, _b;
    return {
      token,
      logprob: (_a = logprobs.token_logprobs[index]) != null ? _a : 0,
      topLogprobs: logprobs.top_logprobs ? Object.entries((_b = logprobs.top_logprobs[index]) != null ? _b : {}).map(
        ([token2, logprob]) => ({
          token: token2,
          logprob
        })
      ) : []
    };
  });
}

// src/openrouter-completion-language-model.ts
var OpenRouterCompletionLanguageModel = class {
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = void 0;
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  get provider() {
    return this.config.provider;
  }
  getArgs({
    mode,
    inputFormat,
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
    responseFormat,
    topK,
    stopSequences,
    providerMetadata
  }) {
    var _a, _b;
    const type = mode.type;
    const extraCallingBody = (_a = providerMetadata == null ? void 0 : providerMetadata["openrouter"]) != null ? _a : {};
    const { prompt: completionPrompt } = convertToOpenRouterCompletionPrompt({
      prompt,
      inputFormat
    });
    const baseArgs = __spreadValues(__spreadValues(__spreadValues({
      // model id:
      model: this.modelId,
      models: this.settings.models,
      // model specific settings:
      logit_bias: this.settings.logitBias,
      logprobs: typeof this.settings.logprobs === "number" ? this.settings.logprobs : typeof this.settings.logprobs === "boolean" ? this.settings.logprobs ? 0 : void 0 : void 0,
      suffix: this.settings.suffix,
      user: this.settings.user,
      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      seed,
      stop: stopSequences,
      response_format: responseFormat,
      top_k: topK,
      // prompt:
      prompt: completionPrompt,
      // OpenRouter specific settings:
      include_reasoning: this.settings.includeReasoning,
      reasoning: this.settings.reasoning
    }, this.config.extraBody), this.settings.extraBody), extraCallingBody);
    switch (type) {
      case "regular": {
        if ((_b = mode.tools) == null ? void 0 : _b.length) {
          throw new UnsupportedFunctionalityError({
            functionality: "tools"
          });
        }
        if (mode.toolChoice) {
          throw new UnsupportedFunctionalityError({
            functionality: "toolChoice"
          });
        }
        return baseArgs;
      }
      case "object-json": {
        throw new UnsupportedFunctionalityError({
          functionality: "object-json mode"
        });
      }
      case "object-tool": {
        throw new UnsupportedFunctionalityError({
          functionality: "object-tool mode"
        });
      }
      // Handle all non-text types with a single default case
      default: {
        const _exhaustiveCheck = type;
        throw new UnsupportedFunctionalityError({
          functionality: `${_exhaustiveCheck} mode`
        });
      }
    }
  }
  async doGenerate(options) {
    var _b, _c, _d, _e, _f;
    const args = this.getArgs(options);
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: openrouterFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        OpenRouterCompletionChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const _a = args, { prompt: rawPrompt } = _a, rawSettings = __objRest(_a, ["prompt"]);
    if ("error" in response) {
      throw new Error(`${response.error.message}`);
    }
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No choice in OpenRouter completion response");
    }
    return {
      response: {
        id: response.id,
        modelId: response.model
      },
      text: (_b = choice.text) != null ? _b : "",
      reasoning: choice.reasoning || void 0,
      usage: {
        promptTokens: (_d = (_c = response.usage) == null ? void 0 : _c.prompt_tokens) != null ? _d : 0,
        completionTokens: (_f = (_e = response.usage) == null ? void 0 : _e.completion_tokens) != null ? _f : 0
      },
      finishReason: mapOpenRouterFinishReason(choice.finish_reason),
      logprobs: mapOpenRouterCompletionLogProbs(choice.logprobs),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings: []
    };
  }
  async doStream(options) {
    const args = this.getArgs(options);
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: __spreadProps(__spreadValues({}, this.getArgs(options)), {
        stream: true,
        // only include stream_options when in strict compatibility mode:
        stream_options: this.config.compatibility === "strict" ? { include_usage: true } : void 0
      }),
      failedResponseHandler: openrouterFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        OpenRouterCompletionChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const _a = args, { prompt: rawPrompt } = _a, rawSettings = __objRest(_a, ["prompt"]);
    let finishReason = "other";
    let usage = {
      promptTokens: Number.NaN,
      completionTokens: Number.NaN
    };
    let logprobs;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: value.error });
              return;
            }
            if (value.usage != null) {
              usage = {
                promptTokens: value.usage.prompt_tokens,
                completionTokens: value.usage.completion_tokens
              };
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapOpenRouterFinishReason(choice.finish_reason);
            }
            if ((choice == null ? void 0 : choice.text) != null) {
              controller.enqueue({
                type: "text-delta",
                textDelta: choice.text
              });
            }
            const mappedLogprobs = mapOpenRouterCompletionLogProbs(
              choice == null ? void 0 : choice.logprobs
            );
            if (mappedLogprobs == null ? void 0 : mappedLogprobs.length) {
              if (logprobs === void 0) logprobs = [];
              logprobs.push(...mappedLogprobs);
            }
          },
          flush(controller) {
            controller.enqueue({
              type: "finish",
              finishReason,
              logprobs,
              usage
            });
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings: []
    };
  }
};
var OpenRouterCompletionChunkSchema = unionType([
  objectType({
    id: stringType().optional(),
    model: stringType().optional(),
    choices: arrayType(
      objectType({
        text: stringType(),
        reasoning: stringType().nullish().optional(),
        finish_reason: stringType().nullish(),
        index: numberType(),
        logprobs: objectType({
          tokens: arrayType(stringType()),
          token_logprobs: arrayType(numberType()),
          top_logprobs: arrayType(recordType(stringType(), numberType())).nullable()
        }).nullable().optional()
      })
    ),
    usage: objectType({
      prompt_tokens: numberType(),
      completion_tokens: numberType()
    }).optional().nullable()
  }),
  OpenRouterErrorResponseSchema
]);
function createOpenRouter(options = {}) {
  var _a, _b, _c;
  const baseURL = (_b = withoutTrailingSlash((_a = options.baseURL) != null ? _a : options.baseUrl)) != null ? _b : "https://openrouter.ai/api/v1";
  const compatibility = (_c = options.compatibility) != null ? _c : "compatible";
  const getHeaders = () => __spreadValues({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "OPENROUTER_API_KEY",
      description: "OpenRouter"
    })}`
  }, options.headers);
  const createChatModel = (modelId, settings = {}) => new OpenRouterChatLanguageModel(modelId, settings, {
    provider: "openrouter.chat",
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    compatibility,
    fetch: options.fetch,
    extraBody: options.extraBody
  });
  const createCompletionModel = (modelId, settings = {}) => new OpenRouterCompletionLanguageModel(modelId, settings, {
    provider: "openrouter.completion",
    url: ({ path }) => `${baseURL}${path}`,
    headers: getHeaders,
    compatibility,
    fetch: options.fetch,
    extraBody: options.extraBody
  });
  const createLanguageModel = (modelId, settings) => {
    if (new.target) {
      throw new Error(
        "The OpenRouter model function cannot be called with the new keyword."
      );
    }
    if (modelId === "openai/gpt-3.5-turbo-instruct") {
      return createCompletionModel(
        modelId,
        settings
      );
    }
    return createChatModel(modelId, settings);
  };
  const provider = function(modelId, settings) {
    return createLanguageModel(modelId, settings);
  };
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.completion = createCompletionModel;
  return provider;
}
createOpenRouter({
  compatibility: "strict"
  // strict for OpenRouter API
});

class RetryLanguageModel {
    constructor(llms, names, stream_first_timeout) {
        this.llms = llms;
        this.names = names || [];
        this.stream_first_timeout = stream_first_timeout || 30000;
        if (this.names.indexOf("default") == -1) {
            this.names.push("default");
        }
    }
    async call(request) {
        return await this.doGenerate({
            inputFormat: "messages",
            mode: {
                type: "regular",
                tools: request.tools,
                toolChoice: request.toolChoice,
            },
            prompt: request.messages,
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            topP: request.topP,
            topK: request.topK,
            providerMetadata: {},
            abortSignal: request.abortSignal,
        });
    }
    async doGenerate(options) {
        const maxTokens = options.maxTokens;
        const names = [...this.names, ...this.names];
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const llm = await this.getLLM(name);
            if (!llm) {
                continue;
            }
            if (!maxTokens) {
                options.maxTokens =
                    this.llms[name].config?.maxTokens || config.maxTokens;
            }
            try {
                let result = await llm.doGenerate(options);
                if (Log.isEnableDebug()) {
                    Log.debug(`LLM nonstream body, name: ${name} => `, result.request?.body);
                }
                return result;
            }
            catch (e) {
                if (e?.name === "AbortError") {
                    throw e;
                }
                if (Log.isEnableInfo()) {
                    Log.info(`LLM nonstream request, name: ${name} => `, {
                        tools: options.mode?.tools,
                        messages: options.prompt,
                    });
                }
                Log.error(`LLM error, name: ${name} => `, e);
            }
        }
        return Promise.reject(new Error("No LLM available"));
    }
    async callStream(request) {
        return await this.doStream({
            inputFormat: "messages",
            mode: {
                type: "regular",
                tools: request.tools,
                toolChoice: request.toolChoice,
            },
            prompt: request.messages,
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            topP: request.topP,
            topK: request.topK,
            providerMetadata: {},
            abortSignal: request.abortSignal,
        });
    }
    async doStream(options) {
        console.log('【zindler】params to llm: ', options);
        const maxTokens = options.maxTokens;
        const names = [...this.names, ...this.names];
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const llm = await this.getLLM(name);
            if (!llm) {
                continue;
            }
            if (!maxTokens) {
                options.maxTokens =
                    this.llms[name].config?.maxTokens || config.maxTokens;
            }
            try {
                const controller = new AbortController();
                const signal = options.abortSignal
                    ? AbortSignal.any([options.abortSignal, controller.signal])
                    : controller.signal;
                const result = await call_timeout(async () => await llm.doStream({ ...options, abortSignal: signal }), this.stream_first_timeout, (e) => {
                    controller.abort();
                });
                const stream = result.stream;
                const reader = stream.getReader();
                const { done, value } = await call_timeout(async () => await reader.read(), this.stream_first_timeout, (e) => {
                    reader.cancel();
                    reader.releaseLock();
                    controller.abort();
                });
                if (done) {
                    Log.warn(`LLM stream done, name: ${name} => `, { done, value });
                    reader.releaseLock();
                    continue;
                }
                if (Log.isEnableDebug()) {
                    Log.debug(`LLM stream body, name: ${name} => `, result.request?.body);
                }
                let chunk = value;
                if (chunk.type == "error") {
                    Log.error(`LLM stream error, name: ${name}`, chunk);
                    reader.releaseLock();
                    continue;
                }
                result.stream = this.streamWrapper([chunk], reader);
                return result;
            }
            catch (e) {
                if (e?.name === "AbortError") {
                    throw e;
                }
                if (Log.isEnableInfo()) {
                    Log.info(`LLM stream request, name: ${name} => `, {
                        tools: options.mode?.tools,
                        messages: options.prompt,
                    });
                }
                Log.error(`LLM error, name: ${name} => `, e);
            }
        }
        return Promise.reject(new Error("No LLM available"));
    }
    async getLLM(name) {
        const llm = this.llms[name];
        if (!llm) {
            return null;
        }
        let apiKey;
        if (typeof llm.apiKey === "string") {
            apiKey = llm.apiKey;
        }
        else {
            apiKey = await llm.apiKey();
        }
        let baseURL = undefined;
        if (llm.config?.baseURL) {
            if (typeof llm.config.baseURL === "string") {
                baseURL = llm.config.baseURL;
            }
            else {
                baseURL = await llm.config.baseURL();
            }
        }
        if (llm.provider == "openai") {
            return createOpenAI({
                apiKey: apiKey,
                baseURL: baseURL,
            }).languageModel(llm.model);
        }
        else if (llm.provider == "anthropic") {
            return createAnthropic({
                apiKey: apiKey,
                baseURL: baseURL,
            }).languageModel(llm.model);
        }
        else if (llm.provider == "google") {
            return createGoogleGenerativeAI({
                apiKey: apiKey,
                baseURL: baseURL,
            }).languageModel(llm.model);
        }
        else if (llm.provider == "aws") {
            let keys = apiKey.split("=");
            return createAmazonBedrock({
                accessKeyId: keys[0],
                secretAccessKey: keys[1],
                baseURL: baseURL,
                region: llm.config?.region || "us-west-1",
            }).languageModel(llm.model);
        }
        else if (llm.provider == "openrouter") {
            return createOpenRouter({
                apiKey: apiKey,
                baseURL: baseURL,
            }).languageModel(llm.model);
        }
        else {
            return llm.provider.languageModel(llm.model);
        }
    }
    streamWrapper(parts, reader) {
        return new ReadableStream({
            start: (controller) => {
                if (parts != null && parts.length > 0) {
                    for (let i = 0; i < parts.length; i++) {
                        controller.enqueue(parts[i]);
                    }
                }
            },
            pull: async (controller) => {
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    reader.releaseLock();
                    return;
                }
                controller.enqueue(value);
            },
            cancel: (reason) => {
                reader.cancel(reason);
            },
        });
    }
}

var domParser = {};

var entities = {};

var hasRequiredEntities;

function requireEntities () {
	if (hasRequiredEntities) return entities;
	hasRequiredEntities = 1;
	entities.entityMap = {
	       lt: '<',
	       gt: '>',
	       amp: '&',
	       quot: '"',
	       apos: "'",
	       Agrave: "À",
	       Aacute: "Á",
	       Acirc: "Â",
	       Atilde: "Ã",
	       Auml: "Ä",
	       Aring: "Å",
	       AElig: "Æ",
	       Ccedil: "Ç",
	       Egrave: "È",
	       Eacute: "É",
	       Ecirc: "Ê",
	       Euml: "Ë",
	       Igrave: "Ì",
	       Iacute: "Í",
	       Icirc: "Î",
	       Iuml: "Ï",
	       ETH: "Ð",
	       Ntilde: "Ñ",
	       Ograve: "Ò",
	       Oacute: "Ó",
	       Ocirc: "Ô",
	       Otilde: "Õ",
	       Ouml: "Ö",
	       Oslash: "Ø",
	       Ugrave: "Ù",
	       Uacute: "Ú",
	       Ucirc: "Û",
	       Uuml: "Ü",
	       Yacute: "Ý",
	       THORN: "Þ",
	       szlig: "ß",
	       agrave: "à",
	       aacute: "á",
	       acirc: "â",
	       atilde: "ã",
	       auml: "ä",
	       aring: "å",
	       aelig: "æ",
	       ccedil: "ç",
	       egrave: "è",
	       eacute: "é",
	       ecirc: "ê",
	       euml: "ë",
	       igrave: "ì",
	       iacute: "í",
	       icirc: "î",
	       iuml: "ï",
	       eth: "ð",
	       ntilde: "ñ",
	       ograve: "ò",
	       oacute: "ó",
	       ocirc: "ô",
	       otilde: "õ",
	       ouml: "ö",
	       oslash: "ø",
	       ugrave: "ù",
	       uacute: "ú",
	       ucirc: "û",
	       uuml: "ü",
	       yacute: "ý",
	       thorn: "þ",
	       yuml: "ÿ",
	       nbsp: "\u00a0",
	       iexcl: "¡",
	       cent: "¢",
	       pound: "£",
	       curren: "¤",
	       yen: "¥",
	       brvbar: "¦",
	       sect: "§",
	       uml: "¨",
	       copy: "©",
	       ordf: "ª",
	       laquo: "«",
	       not: "¬",
	       shy: "­­",
	       reg: "®",
	       macr: "¯",
	       deg: "°",
	       plusmn: "±",
	       sup2: "²",
	       sup3: "³",
	       acute: "´",
	       micro: "µ",
	       para: "¶",
	       middot: "·",
	       cedil: "¸",
	       sup1: "¹",
	       ordm: "º",
	       raquo: "»",
	       frac14: "¼",
	       frac12: "½",
	       frac34: "¾",
	       iquest: "¿",
	       times: "×",
	       divide: "÷",
	       forall: "∀",
	       part: "∂",
	       exist: "∃",
	       empty: "∅",
	       nabla: "∇",
	       isin: "∈",
	       notin: "∉",
	       ni: "∋",
	       prod: "∏",
	       sum: "∑",
	       minus: "−",
	       lowast: "∗",
	       radic: "√",
	       prop: "∝",
	       infin: "∞",
	       ang: "∠",
	       and: "∧",
	       or: "∨",
	       cap: "∩",
	       cup: "∪",
	       'int': "∫",
	       there4: "∴",
	       sim: "∼",
	       cong: "≅",
	       asymp: "≈",
	       ne: "≠",
	       equiv: "≡",
	       le: "≤",
	       ge: "≥",
	       sub: "⊂",
	       sup: "⊃",
	       nsub: "⊄",
	       sube: "⊆",
	       supe: "⊇",
	       oplus: "⊕",
	       otimes: "⊗",
	       perp: "⊥",
	       sdot: "⋅",
	       Alpha: "Α",
	       Beta: "Β",
	       Gamma: "Γ",
	       Delta: "Δ",
	       Epsilon: "Ε",
	       Zeta: "Ζ",
	       Eta: "Η",
	       Theta: "Θ",
	       Iota: "Ι",
	       Kappa: "Κ",
	       Lambda: "Λ",
	       Mu: "Μ",
	       Nu: "Ν",
	       Xi: "Ξ",
	       Omicron: "Ο",
	       Pi: "Π",
	       Rho: "Ρ",
	       Sigma: "Σ",
	       Tau: "Τ",
	       Upsilon: "Υ",
	       Phi: "Φ",
	       Chi: "Χ",
	       Psi: "Ψ",
	       Omega: "Ω",
	       alpha: "α",
	       beta: "β",
	       gamma: "γ",
	       delta: "δ",
	       epsilon: "ε",
	       zeta: "ζ",
	       eta: "η",
	       theta: "θ",
	       iota: "ι",
	       kappa: "κ",
	       lambda: "λ",
	       mu: "μ",
	       nu: "ν",
	       xi: "ξ",
	       omicron: "ο",
	       pi: "π",
	       rho: "ρ",
	       sigmaf: "ς",
	       sigma: "σ",
	       tau: "τ",
	       upsilon: "υ",
	       phi: "φ",
	       chi: "χ",
	       psi: "ψ",
	       omega: "ω",
	       thetasym: "ϑ",
	       upsih: "ϒ",
	       piv: "ϖ",
	       OElig: "Œ",
	       oelig: "œ",
	       Scaron: "Š",
	       scaron: "š",
	       Yuml: "Ÿ",
	       fnof: "ƒ",
	       circ: "ˆ",
	       tilde: "˜",
	       ensp: " ",
	       emsp: " ",
	       thinsp: " ",
	       zwnj: "‌",
	       zwj: "‍",
	       lrm: "‎",
	       rlm: "‏",
	       ndash: "–",
	       mdash: "—",
	       lsquo: "‘",
	       rsquo: "’",
	       sbquo: "‚",
	       ldquo: "“",
	       rdquo: "”",
	       bdquo: "„",
	       dagger: "†",
	       Dagger: "‡",
	       bull: "•",
	       hellip: "…",
	       permil: "‰",
	       prime: "′",
	       Prime: "″",
	       lsaquo: "‹",
	       rsaquo: "›",
	       oline: "‾",
	       euro: "€",
	       trade: "™",
	       larr: "←",
	       uarr: "↑",
	       rarr: "→",
	       darr: "↓",
	       harr: "↔",
	       crarr: "↵",
	       lceil: "⌈",
	       rceil: "⌉",
	       lfloor: "⌊",
	       rfloor: "⌋",
	       loz: "◊",
	       spades: "♠",
	       clubs: "♣",
	       hearts: "♥",
	       diams: "♦"
	};
	return entities;
}

var sax = {};

var hasRequiredSax;

function requireSax () {
	if (hasRequiredSax) return sax;
	hasRequiredSax = 1;
	//[4]   	NameStartChar	   ::=   	":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] | [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] | [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] | [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] | [#x10000-#xEFFFF]
	//[4a]   	NameChar	   ::=   	NameStartChar | "-" | "." | [0-9] | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]
	//[5]   	Name	   ::=   	NameStartChar (NameChar)*
	var nameStartChar = /[A-Z_a-z\xC0-\xD6\xD8-\xF6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;//\u10000-\uEFFFF
	var nameChar = new RegExp("[\\-\\.0-9"+nameStartChar.source.slice(1,-1)+"\\u00B7\\u0300-\\u036F\\u203F-\\u2040]");
	var tagNamePattern = new RegExp('^'+nameStartChar.source+nameChar.source+'*(?:\:'+nameStartChar.source+nameChar.source+'*)?$');
	//var tagNamePattern = /^[a-zA-Z_][\w\-\.]*(?:\:[a-zA-Z_][\w\-\.]*)?$/
	//var handlers = 'resolveEntity,getExternalSubset,characters,endDocument,endElement,endPrefixMapping,ignorableWhitespace,processingInstruction,setDocumentLocator,skippedEntity,startDocument,startElement,startPrefixMapping,notationDecl,unparsedEntityDecl,error,fatalError,warning,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,comment,endCDATA,endDTD,endEntity,startCDATA,startDTD,startEntity'.split(',')

	//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
	//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
	var S_TAG = 0;//tag name offerring
	var S_ATTR = 1;//attr name offerring 
	var S_ATTR_SPACE=2;//attr name end and space offer
	var S_EQ = 3;//=space?
	var S_ATTR_NOQUOT_VALUE = 4;//attr value(no quot value only)
	var S_ATTR_END = 5;//attr value end and no space(quot end)
	var S_TAG_SPACE = 6;//(attr value end || tag end ) && (space offer)
	var S_TAG_CLOSE = 7;//closed el<el />

	/**
	 * Creates an error that will not be caught by XMLReader aka the SAX parser.
	 *
	 * @param {string} message
	 * @param {any?} locator Optional, can provide details about the location in the source
	 * @constructor
	 */
	function ParseError(message, locator) {
		this.message = message;
		this.locator = locator;
		if(Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
	}
	ParseError.prototype = new Error();
	ParseError.prototype.name = ParseError.name;

	function XMLReader(){
		
	}

	XMLReader.prototype = {
		parse:function(source,defaultNSMap,entityMap){
			var domBuilder = this.domBuilder;
			domBuilder.startDocument();
			_copy(defaultNSMap ,defaultNSMap = {});
			parse(source,defaultNSMap,entityMap,
					domBuilder,this.errorHandler);
			domBuilder.endDocument();
		}
	};
	function parse(source,defaultNSMapCopy,entityMap,domBuilder,errorHandler){
		function fixedFromCharCode(code) {
			// String.prototype.fromCharCode does not supports
			// > 2 bytes unicode chars directly
			if (code > 0xffff) {
				code -= 0x10000;
				var surrogate1 = 0xd800 + (code >> 10)
					, surrogate2 = 0xdc00 + (code & 0x3ff);

				return String.fromCharCode(surrogate1, surrogate2);
			} else {
				return String.fromCharCode(code);
			}
		}
		function entityReplacer(a){
			var k = a.slice(1,-1);
			if(k in entityMap){
				return entityMap[k]; 
			}else if(k.charAt(0) === '#'){
				return fixedFromCharCode(parseInt(k.substr(1).replace('x','0x')))
			}else {
				errorHandler.error('entity not found:'+a);
				return a;
			}
		}
		function appendText(end){//has some bugs
			if(end>start){
				var xt = source.substring(start,end).replace(/&#?\w+;/g,entityReplacer);
				locator&&position(start);
				domBuilder.characters(xt,0,end-start);
				start = end;
			}
		}
		function position(p,m){
			while(p>=lineEnd && (m = linePattern.exec(source))){
				lineStart = m.index;
				lineEnd = lineStart + m[0].length;
				locator.lineNumber++;
				//console.log('line++:',locator,startPos,endPos)
			}
			locator.columnNumber = p-lineStart+1;
		}
		var lineStart = 0;
		var lineEnd = 0;
		var linePattern = /.*(?:\r\n?|\n)|.*$/g;
		var locator = domBuilder.locator;
		
		var parseStack = [{currentNSMap:defaultNSMapCopy}];
		var closeMap = {};
		var start = 0;
		while(true){
			try{
				var tagStart = source.indexOf('<',start);
				if(tagStart<0){
					if(!source.substr(start).match(/^\s*$/)){
						var doc = domBuilder.doc;
		    			var text = doc.createTextNode(source.substr(start));
		    			doc.appendChild(text);
		    			domBuilder.currentElement = text;
					}
					return;
				}
				if(tagStart>start){
					appendText(tagStart);
				}
				switch(source.charAt(tagStart+1)){
				case '/':
					var end = source.indexOf('>',tagStart+3);
					var tagName = source.substring(tagStart+2,end);
					var config = parseStack.pop();
					if(end<0){
						
		        		tagName = source.substring(tagStart+2).replace(/[\s<].*/,'');
		        		errorHandler.error("end tag name: "+tagName+' is not complete:'+config.tagName);
		        		end = tagStart+1+tagName.length;
		        	}else if(tagName.match(/\s</)){
		        		tagName = tagName.replace(/[\s<].*/,'');
		        		errorHandler.error("end tag name: "+tagName+' maybe not complete');
		        		end = tagStart+1+tagName.length;
					}
					var localNSMap = config.localNSMap;
					var endMatch = config.tagName == tagName;
					var endIgnoreCaseMach = endMatch || config.tagName&&config.tagName.toLowerCase() == tagName.toLowerCase();
			        if(endIgnoreCaseMach){
			        	domBuilder.endElement(config.uri,config.localName,tagName);
						if(localNSMap){
							for(var prefix in localNSMap){
								domBuilder.endPrefixMapping(prefix) ;
							}
						}
						if(!endMatch){
			            	errorHandler.fatalError("end tag name: "+tagName+' is not match the current start tagName:'+config.tagName ); // No known test case
						}
			        }else {
			        	parseStack.push(config);
			        }
					
					end++;
					break;
					// end elment
				case '?':// <?...?>
					locator&&position(tagStart);
					end = parseInstruction(source,tagStart,domBuilder);
					break;
				case '!':// <!doctype,<![CDATA,<!--
					locator&&position(tagStart);
					end = parseDCC(source,tagStart,domBuilder,errorHandler);
					break;
				default:
					locator&&position(tagStart);
					var el = new ElementAttributes();
					var currentNSMap = parseStack[parseStack.length-1].currentNSMap;
					//elStartEnd
					var end = parseElementStartPart(source,tagStart,el,currentNSMap,entityReplacer,errorHandler);
					var len = el.length;
					
					
					if(!el.closed && fixSelfClosed(source,end,el.tagName,closeMap)){
						el.closed = true;
						if(!entityMap.nbsp){
							errorHandler.warning('unclosed xml attribute');
						}
					}
					if(locator && len){
						var locator2 = copyLocator(locator,{});
						//try{//attribute position fixed
						for(var i = 0;i<len;i++){
							var a = el[i];
							position(a.offset);
							a.locator = copyLocator(locator,{});
						}
						domBuilder.locator = locator2;
						if(appendElement(el,domBuilder,currentNSMap)){
							parseStack.push(el);
						}
						domBuilder.locator = locator;
					}else {
						if(appendElement(el,domBuilder,currentNSMap)){
							parseStack.push(el);
						}
					}
					
					
					
					if(el.uri === 'http://www.w3.org/1999/xhtml' && !el.closed){
						end = parseHtmlSpecialContent(source,end,el.tagName,entityReplacer,domBuilder);
					}else {
						end++;
					}
				}
			}catch(e){
				if (e instanceof ParseError) {
					throw e;
				}
				errorHandler.error('element parse error: '+e);
				end = -1;
			}
			if(end>start){
				start = end;
			}else {
				//TODO: 这里有可能sax回退，有位置错误风险
				appendText(Math.max(tagStart,start)+1);
			}
		}
	}
	function copyLocator(f,t){
		t.lineNumber = f.lineNumber;
		t.columnNumber = f.columnNumber;
		return t;
	}

	/**
	 * @see #appendElement(source,elStartEnd,el,selfClosed,entityReplacer,domBuilder,parseStack);
	 * @return end of the elementStartPart(end of elementEndPart for selfClosed el)
	 */
	function parseElementStartPart(source,start,el,currentNSMap,entityReplacer,errorHandler){

		/**
		 * @param {string} qname
		 * @param {string} value
		 * @param {number} startIndex
		 */
		function addAttribute(qname, value, startIndex) {
			if (qname in el.attributeNames) errorHandler.fatalError('Attribute ' + qname + ' redefined');
			el.addValue(qname, value, startIndex);
		}
		var attrName;
		var value;
		var p = ++start;
		var s = S_TAG;//status
		while(true){
			var c = source.charAt(p);
			switch(c){
			case '=':
				if(s === S_ATTR){//attrName
					attrName = source.slice(start,p);
					s = S_EQ;
				}else if(s === S_ATTR_SPACE){
					s = S_EQ;
				}else {
					//fatalError: equal must after attrName or space after attrName
					throw new Error('attribute equal must after attrName'); // No known test case
				}
				break;
			case '\'':
			case '"':
				if(s === S_EQ || s === S_ATTR //|| s == S_ATTR_SPACE
					){//equal
					if(s === S_ATTR){
						errorHandler.warning('attribute value must after "="');
						attrName = source.slice(start,p);
					}
					start = p+1;
					p = source.indexOf(c,start);
					if(p>0){
						value = source.slice(start,p).replace(/&#?\w+;/g,entityReplacer);
						addAttribute(attrName, value, start-1);
						s = S_ATTR_END;
					}else {
						//fatalError: no end quot match
						throw new Error('attribute value no end \''+c+'\' match');
					}
				}else if(s == S_ATTR_NOQUOT_VALUE){
					value = source.slice(start,p).replace(/&#?\w+;/g,entityReplacer);
					//console.log(attrName,value,start,p)
					addAttribute(attrName, value, start);
					//console.dir(el)
					errorHandler.warning('attribute "'+attrName+'" missed start quot('+c+')!!');
					start = p+1;
					s = S_ATTR_END;
				}else {
					//fatalError: no equal before
					throw new Error('attribute value must after "="'); // No known test case
				}
				break;
			case '/':
				switch(s){
				case S_TAG:
					el.setTagName(source.slice(start,p));
				case S_ATTR_END:
				case S_TAG_SPACE:
				case S_TAG_CLOSE:
					s =S_TAG_CLOSE;
					el.closed = true;
				case S_ATTR_NOQUOT_VALUE:
				case S_ATTR:
				case S_ATTR_SPACE:
					break;
				//case S_EQ:
				default:
					throw new Error("attribute invalid close char('/')") // No known test case
				}
				break;
			case ''://end document
				errorHandler.error('unexpected end of input');
				if(s == S_TAG){
					el.setTagName(source.slice(start,p));
				}
				return p;
			case '>':
				switch(s){
				case S_TAG:
					el.setTagName(source.slice(start,p));
				case S_ATTR_END:
				case S_TAG_SPACE:
				case S_TAG_CLOSE:
					break;//normal
				case S_ATTR_NOQUOT_VALUE://Compatible state
				case S_ATTR:
					value = source.slice(start,p);
					if(value.slice(-1) === '/'){
						el.closed  = true;
						value = value.slice(0,-1);
					}
				case S_ATTR_SPACE:
					if(s === S_ATTR_SPACE){
						value = attrName;
					}
					if(s == S_ATTR_NOQUOT_VALUE){
						errorHandler.warning('attribute "'+value+'" missed quot(")!');
						addAttribute(attrName, value.replace(/&#?\w+;/g,entityReplacer), start);
					}else {
						if(currentNSMap[''] !== 'http://www.w3.org/1999/xhtml' || !value.match(/^(?:disabled|checked|selected)$/i)){
							errorHandler.warning('attribute "'+value+'" missed value!! "'+value+'" instead!!');
						}
						addAttribute(value, value, start);
					}
					break;
				case S_EQ:
					throw new Error('attribute value missed!!');
				}
	//			console.log(tagName,tagNamePattern,tagNamePattern.test(tagName))
				return p;
			/*xml space '\x20' | #x9 | #xD | #xA; */
			case '\u0080':
				c = ' ';
			default:
				if(c<= ' '){//space
					switch(s){
					case S_TAG:
						el.setTagName(source.slice(start,p));//tagName
						s = S_TAG_SPACE;
						break;
					case S_ATTR:
						attrName = source.slice(start,p);
						s = S_ATTR_SPACE;
						break;
					case S_ATTR_NOQUOT_VALUE:
						var value = source.slice(start,p).replace(/&#?\w+;/g,entityReplacer);
						errorHandler.warning('attribute "'+value+'" missed quot(")!!');
						addAttribute(attrName, value, start);
					case S_ATTR_END:
						s = S_TAG_SPACE;
						break;
					//case S_TAG_SPACE:
					//case S_EQ:
					//case S_ATTR_SPACE:
					//	void();break;
					//case S_TAG_CLOSE:
						//ignore warning
					}
				}else {//not space
	//S_TAG,	S_ATTR,	S_EQ,	S_ATTR_NOQUOT_VALUE
	//S_ATTR_SPACE,	S_ATTR_END,	S_TAG_SPACE, S_TAG_CLOSE
					switch(s){
					//case S_TAG:void();break;
					//case S_ATTR:void();break;
					//case S_ATTR_NOQUOT_VALUE:void();break;
					case S_ATTR_SPACE:
						el.tagName;
						if(currentNSMap[''] !== 'http://www.w3.org/1999/xhtml' || !attrName.match(/^(?:disabled|checked|selected)$/i)){
							errorHandler.warning('attribute "'+attrName+'" missed value!! "'+attrName+'" instead2!!');
						}
						addAttribute(attrName, attrName, start);
						start = p;
						s = S_ATTR;
						break;
					case S_ATTR_END:
						errorHandler.warning('attribute space is required"'+attrName+'"!!');
					case S_TAG_SPACE:
						s = S_ATTR;
						start = p;
						break;
					case S_EQ:
						s = S_ATTR_NOQUOT_VALUE;
						start = p;
						break;
					case S_TAG_CLOSE:
						throw new Error("elements closed character '/' and '>' must be connected to");
					}
				}
			}//end outer switch
			//console.log('p++',p)
			p++;
		}
	}
	/**
	 * @return true if has new namespace define
	 */
	function appendElement(el,domBuilder,currentNSMap){
		var tagName = el.tagName;
		var localNSMap = null;
		//var currentNSMap = parseStack[parseStack.length-1].currentNSMap;
		var i = el.length;
		while(i--){
			var a = el[i];
			var qName = a.qName;
			var value = a.value;
			var nsp = qName.indexOf(':');
			if(nsp>0){
				var prefix = a.prefix = qName.slice(0,nsp);
				var localName = qName.slice(nsp+1);
				var nsPrefix = prefix === 'xmlns' && localName;
			}else {
				localName = qName;
				prefix = null;
				nsPrefix = qName === 'xmlns' && '';
			}
			//can not set prefix,because prefix !== ''
			a.localName = localName ;
			//prefix == null for no ns prefix attribute 
			if(nsPrefix !== false){//hack!!
				if(localNSMap == null){
					localNSMap = {};
					//console.log(currentNSMap,0)
					_copy(currentNSMap,currentNSMap={});
					//console.log(currentNSMap,1)
				}
				currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
				a.uri = 'http://www.w3.org/2000/xmlns/';
				domBuilder.startPrefixMapping(nsPrefix, value); 
			}
		}
		var i = el.length;
		while(i--){
			a = el[i];
			var prefix = a.prefix;
			if(prefix){//no prefix attribute has no namespace
				if(prefix === 'xml'){
					a.uri = 'http://www.w3.org/XML/1998/namespace';
				}if(prefix !== 'xmlns'){
					a.uri = currentNSMap[prefix || ''];
					
					//{console.log('###'+a.qName,domBuilder.locator.systemId+'',currentNSMap,a.uri)}
				}
			}
		}
		var nsp = tagName.indexOf(':');
		if(nsp>0){
			prefix = el.prefix = tagName.slice(0,nsp);
			localName = el.localName = tagName.slice(nsp+1);
		}else {
			prefix = null;//important!!
			localName = el.localName = tagName;
		}
		//no prefix element has default namespace
		var ns = el.uri = currentNSMap[prefix || ''];
		domBuilder.startElement(ns,localName,tagName,el);
		//endPrefixMapping and startPrefixMapping have not any help for dom builder
		//localNSMap = null
		if(el.closed){
			domBuilder.endElement(ns,localName,tagName);
			if(localNSMap){
				for(prefix in localNSMap){
					domBuilder.endPrefixMapping(prefix); 
				}
			}
		}else {
			el.currentNSMap = currentNSMap;
			el.localNSMap = localNSMap;
			//parseStack.push(el);
			return true;
		}
	}
	function parseHtmlSpecialContent(source,elStartEnd,tagName,entityReplacer,domBuilder){
		if(/^(?:script|textarea)$/i.test(tagName)){
			var elEndStart =  source.indexOf('</'+tagName+'>',elStartEnd);
			var text = source.substring(elStartEnd+1,elEndStart);
			if(/[&<]/.test(text)){
				if(/^script$/i.test(tagName)){
					//if(!/\]\]>/.test(text)){
						//lexHandler.startCDATA();
						domBuilder.characters(text,0,text.length);
						//lexHandler.endCDATA();
						return elEndStart;
					//}
				}//}else{//text area
					text = text.replace(/&#?\w+;/g,entityReplacer);
					domBuilder.characters(text,0,text.length);
					return elEndStart;
				//}
				
			}
		}
		return elStartEnd+1;
	}
	function fixSelfClosed(source,elStartEnd,tagName,closeMap){
		//if(tagName in closeMap){
		var pos = closeMap[tagName];
		if(pos == null){
			//console.log(tagName)
			pos =  source.lastIndexOf('</'+tagName+'>');
			if(pos<elStartEnd){//忘记闭合
				pos = source.lastIndexOf('</'+tagName);
			}
			closeMap[tagName] =pos;
		}
		return pos<elStartEnd;
		//} 
	}
	function _copy(source,target){
		for(var n in source){target[n] = source[n];}
	}
	function parseDCC(source,start,domBuilder,errorHandler){//sure start with '<!'
		var next= source.charAt(start+2);
		switch(next){
		case '-':
			if(source.charAt(start + 3) === '-'){
				var end = source.indexOf('-->',start+4);
				//append comment source.substring(4,end)//<!--
				if(end>start){
					domBuilder.comment(source,start+4,end-start-4);
					return end+3;
				}else {
					errorHandler.error("Unclosed comment");
					return -1;
				}
			}else {
				//error
				return -1;
			}
		default:
			if(source.substr(start+3,6) == 'CDATA['){
				var end = source.indexOf(']]>',start+9);
				domBuilder.startCDATA();
				domBuilder.characters(source,start+9,end-start-9);
				domBuilder.endCDATA(); 
				return end+3;
			}
			//<!DOCTYPE
			//startDTD(java.lang.String name, java.lang.String publicId, java.lang.String systemId) 
			var matchs = split(source,start);
			var len = matchs.length;
			if(len>1 && /!doctype/i.test(matchs[0][0])){
				var name = matchs[1][0];
				var pubid = false;
				var sysid = false;
				if(len>3){
					if(/^public$/i.test(matchs[2][0])){
						pubid = matchs[3][0];
						sysid = len>4 && matchs[4][0];
					}else if(/^system$/i.test(matchs[2][0])){
						sysid = matchs[3][0];
					}
				}
				var lastMatch = matchs[len-1];
				domBuilder.startDTD(name, pubid, sysid);
				domBuilder.endDTD();
				
				return lastMatch.index+lastMatch[0].length
			}
		}
		return -1;
	}



	function parseInstruction(source,start,domBuilder){
		var end = source.indexOf('?>',start);
		if(end){
			var match = source.substring(start,end).match(/^<\?(\S*)\s*([\s\S]*?)\s*$/);
			if(match){
				match[0].length;
				domBuilder.processingInstruction(match[1], match[2]) ;
				return end+2;
			}else {//error
				return -1;
			}
		}
		return -1;
	}

	function ElementAttributes(){
		this.attributeNames = {};
	}
	ElementAttributes.prototype = {
		setTagName:function(tagName){
			if(!tagNamePattern.test(tagName)){
				throw new Error('invalid tagName:'+tagName)
			}
			this.tagName = tagName;
		},
		addValue:function(qName, value, offset) {
			if(!tagNamePattern.test(qName)){
				throw new Error('invalid attribute:'+qName)
			}
			this.attributeNames[qName] = this.length;
			this[this.length++] = {qName:qName,value:value,offset:offset};
		},
		length:0,
		getLocalName:function(i){return this[i].localName},
		getLocator:function(i){return this[i].locator},
		getQName:function(i){return this[i].qName},
		getURI:function(i){return this[i].uri},
		getValue:function(i){return this[i].value}
	//	,getIndex:function(uri, localName)){
	//		if(localName){
	//			
	//		}else{
	//			var qName = uri
	//		}
	//	},
	//	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
	//	getType:function(uri,localName){}
	//	getType:function(i){},
	};



	function split(source,start){
		var match;
		var buf = [];
		var reg = /'[^']+'|"[^"]+"|[^\s<>\/=]+=?|(\/?\s*>|<)/g;
		reg.lastIndex = start;
		reg.exec(source);//skip <
		while(match = reg.exec(source)){
			buf.push(match);
			if(match[1])return buf;
		}
	}

	sax.XMLReader = XMLReader;
	sax.ParseError = ParseError;
	return sax;
}

var dom = {};

var hasRequiredDom;

function requireDom () {
	if (hasRequiredDom) return dom;
	hasRequiredDom = 1;
	function copy(src,dest){
		for(var p in src){
			dest[p] = src[p];
		}
	}
	/**
	^\w+\.prototype\.([_\w]+)\s*=\s*((?:.*\{\s*?[\r\n][\s\S]*?^})|\S.*?(?=[;\r\n]));?
	^\w+\.prototype\.([_\w]+)\s*=\s*(\S.*?(?=[;\r\n]));?
	 */
	function _extends(Class,Super){
		var pt = Class.prototype;
		if(!(pt instanceof Super)){
			function t(){}			t.prototype = Super.prototype;
			t = new t();
			copy(pt,t);
			Class.prototype = pt = t;
		}
		if(pt.constructor != Class){
			if(typeof Class != 'function'){
				console.error("unknow Class:"+Class);
			}
			pt.constructor = Class;
		}
	}
	var htmlns = 'http://www.w3.org/1999/xhtml' ;
	// Node Types
	var NodeType = {};
	var ELEMENT_NODE                = NodeType.ELEMENT_NODE                = 1;
	var ATTRIBUTE_NODE              = NodeType.ATTRIBUTE_NODE              = 2;
	var TEXT_NODE                   = NodeType.TEXT_NODE                   = 3;
	var CDATA_SECTION_NODE          = NodeType.CDATA_SECTION_NODE          = 4;
	var ENTITY_REFERENCE_NODE       = NodeType.ENTITY_REFERENCE_NODE       = 5;
	var ENTITY_NODE                 = NodeType.ENTITY_NODE                 = 6;
	var PROCESSING_INSTRUCTION_NODE = NodeType.PROCESSING_INSTRUCTION_NODE = 7;
	var COMMENT_NODE                = NodeType.COMMENT_NODE                = 8;
	var DOCUMENT_NODE               = NodeType.DOCUMENT_NODE               = 9;
	var DOCUMENT_TYPE_NODE          = NodeType.DOCUMENT_TYPE_NODE          = 10;
	var DOCUMENT_FRAGMENT_NODE      = NodeType.DOCUMENT_FRAGMENT_NODE      = 11;
	var NOTATION_NODE               = NodeType.NOTATION_NODE               = 12;

	// ExceptionCode
	var ExceptionCode = {};
	var ExceptionMessage = {};
	ExceptionCode.INDEX_SIZE_ERR              = ((ExceptionMessage[1]="Index size error"),1);
	ExceptionCode.DOMSTRING_SIZE_ERR          = ((ExceptionMessage[2]="DOMString size error"),2);
	var HIERARCHY_REQUEST_ERR       = ExceptionCode.HIERARCHY_REQUEST_ERR       = ((ExceptionMessage[3]="Hierarchy request error"),3);
	ExceptionCode.WRONG_DOCUMENT_ERR          = ((ExceptionMessage[4]="Wrong document"),4);
	ExceptionCode.INVALID_CHARACTER_ERR       = ((ExceptionMessage[5]="Invalid character"),5);
	ExceptionCode.NO_DATA_ALLOWED_ERR         = ((ExceptionMessage[6]="No data allowed"),6);
	ExceptionCode.NO_MODIFICATION_ALLOWED_ERR = ((ExceptionMessage[7]="No modification allowed"),7);
	var NOT_FOUND_ERR               = ExceptionCode.NOT_FOUND_ERR               = ((ExceptionMessage[8]="Not found"),8);
	ExceptionCode.NOT_SUPPORTED_ERR           = ((ExceptionMessage[9]="Not supported"),9);
	var INUSE_ATTRIBUTE_ERR         = ExceptionCode.INUSE_ATTRIBUTE_ERR         = ((ExceptionMessage[10]="Attribute in use"),10);
	//level2
	ExceptionCode.INVALID_STATE_ERR        	= ((ExceptionMessage[11]="Invalid state"),11);
	ExceptionCode.SYNTAX_ERR               	= ((ExceptionMessage[12]="Syntax error"),12);
	ExceptionCode.INVALID_MODIFICATION_ERR 	= ((ExceptionMessage[13]="Invalid modification"),13);
	ExceptionCode.NAMESPACE_ERR           	= ((ExceptionMessage[14]="Invalid namespace"),14);
	ExceptionCode.INVALID_ACCESS_ERR      	= ((ExceptionMessage[15]="Invalid access"),15);

	/**
	 * DOM Level 2
	 * Object DOMException
	 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/ecma-script-binding.html
	 * @see http://www.w3.org/TR/REC-DOM-Level-1/ecma-script-language-binding.html
	 */
	function DOMException(code, message) {
		if(message instanceof Error){
			var error = message;
		}else {
			error = this;
			Error.call(this, ExceptionMessage[code]);
			this.message = ExceptionMessage[code];
			if(Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
		}
		error.code = code;
		if(message) this.message = this.message + ": " + message;
		return error;
	}	DOMException.prototype = Error.prototype;
	copy(ExceptionCode,DOMException);
	/**
	 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-536297177
	 * The NodeList interface provides the abstraction of an ordered collection of nodes, without defining or constraining how this collection is implemented. NodeList objects in the DOM are live.
	 * The items in the NodeList are accessible via an integral index, starting from 0.
	 */
	function NodeList() {
	}	NodeList.prototype = {
		/**
		 * The number of nodes in the list. The range of valid child node indices is 0 to length-1 inclusive.
		 * @standard level1
		 */
		length:0, 
		/**
		 * Returns the indexth item in the collection. If index is greater than or equal to the number of nodes in the list, this returns null.
		 * @standard level1
		 * @param index  unsigned long 
		 *   Index into the collection.
		 * @return Node
		 * 	The node at the indexth position in the NodeList, or null if that is not a valid index. 
		 */
		item: function(index) {
			return this[index] || null;
		},
		toString:function(isHTML,nodeFilter){
			for(var buf = [], i = 0;i<this.length;i++){
				serializeToString(this[i],buf,isHTML,nodeFilter);
			}
			return buf.join('');
		}
	};
	function LiveNodeList(node,refresh){
		this._node = node;
		this._refresh = refresh;
		_updateLiveList(this);
	}
	function _updateLiveList(list){
		var inc = list._node._inc || list._node.ownerDocument._inc;
		if(list._inc != inc){
			var ls = list._refresh(list._node);
			//console.log(ls.length)
			__set__(list,'length',ls.length);
			copy(ls,list);
			list._inc = inc;
		}
	}
	LiveNodeList.prototype.item = function(i){
		_updateLiveList(this);
		return this[i];
	};

	_extends(LiveNodeList,NodeList);
	/**
	 * 
	 * Objects implementing the NamedNodeMap interface are used to represent collections of nodes that can be accessed by name. Note that NamedNodeMap does not inherit from NodeList; NamedNodeMaps are not maintained in any particular order. Objects contained in an object implementing NamedNodeMap may also be accessed by an ordinal index, but this is simply to allow convenient enumeration of the contents of a NamedNodeMap, and does not imply that the DOM specifies an order to these Nodes.
	 * NamedNodeMap objects in the DOM are live.
	 * used for attributes or DocumentType entities 
	 */
	function NamedNodeMap() {
	}
	function _findNodeIndex(list,node){
		var i = list.length;
		while(i--){
			if(list[i] === node){return i}
		}
	}

	function _addNamedNode(el,list,newAttr,oldAttr){
		if(oldAttr){
			list[_findNodeIndex(list,oldAttr)] = newAttr;
		}else {
			list[list.length++] = newAttr;
		}
		if(el){
			newAttr.ownerElement = el;
			var doc = el.ownerDocument;
			if(doc){
				oldAttr && _onRemoveAttribute(doc,el,oldAttr);
				_onAddAttribute(doc,el,newAttr);
			}
		}
	}
	function _removeNamedNode(el,list,attr){
		//console.log('remove attr:'+attr)
		var i = _findNodeIndex(list,attr);
		if(i>=0){
			var lastIndex = list.length-1;
			while(i<lastIndex){
				list[i] = list[++i];
			}
			list.length = lastIndex;
			if(el){
				var doc = el.ownerDocument;
				if(doc){
					_onRemoveAttribute(doc,el,attr);
					attr.ownerElement = null;
				}
			}
		}else {
			throw DOMException(NOT_FOUND_ERR,new Error(el.tagName+'@'+attr))
		}
	}
	NamedNodeMap.prototype = {
		length:0,
		item:NodeList.prototype.item,
		getNamedItem: function(key) {
	//		if(key.indexOf(':')>0 || key == 'xmlns'){
	//			return null;
	//		}
			//console.log()
			var i = this.length;
			while(i--){
				var attr = this[i];
				//console.log(attr.nodeName,key)
				if(attr.nodeName == key){
					return attr;
				}
			}
		},
		setNamedItem: function(attr) {
			var el = attr.ownerElement;
			if(el && el!=this._ownerElement){
				throw new DOMException(INUSE_ATTRIBUTE_ERR);
			}
			var oldAttr = this.getNamedItem(attr.nodeName);
			_addNamedNode(this._ownerElement,this,attr,oldAttr);
			return oldAttr;
		},
		/* returns Node */
		setNamedItemNS: function(attr) {// raises: WRONG_DOCUMENT_ERR,NO_MODIFICATION_ALLOWED_ERR,INUSE_ATTRIBUTE_ERR
			var el = attr.ownerElement, oldAttr;
			if(el && el!=this._ownerElement){
				throw new DOMException(INUSE_ATTRIBUTE_ERR);
			}
			oldAttr = this.getNamedItemNS(attr.namespaceURI,attr.localName);
			_addNamedNode(this._ownerElement,this,attr,oldAttr);
			return oldAttr;
		},

		/* returns Node */
		removeNamedItem: function(key) {
			var attr = this.getNamedItem(key);
			_removeNamedNode(this._ownerElement,this,attr);
			return attr;
			
			
		},// raises: NOT_FOUND_ERR,NO_MODIFICATION_ALLOWED_ERR
		
		//for level2
		removeNamedItemNS:function(namespaceURI,localName){
			var attr = this.getNamedItemNS(namespaceURI,localName);
			_removeNamedNode(this._ownerElement,this,attr);
			return attr;
		},
		getNamedItemNS: function(namespaceURI, localName) {
			var i = this.length;
			while(i--){
				var node = this[i];
				if(node.localName == localName && node.namespaceURI == namespaceURI){
					return node;
				}
			}
			return null;
		}
	};
	/**
	 * @see http://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-102161490
	 */
	function DOMImplementation(/* Object */ features) {
		this._features = {};
		if (features) {
			for (var feature in features) {
				 this._features = features[feature];
			}
		}
	}
	DOMImplementation.prototype = {
		hasFeature: function(/* string */ feature, /* string */ version) {
			var versions = this._features[feature.toLowerCase()];
			if (versions && (!version || version in versions)) {
				return true;
			} else {
				return false;
			}
		},
		// Introduced in DOM Level 2:
		createDocument:function(namespaceURI,  qualifiedName, doctype){// raises:INVALID_CHARACTER_ERR,NAMESPACE_ERR,WRONG_DOCUMENT_ERR
			var doc = new Document();
			doc.implementation = this;
			doc.childNodes = new NodeList();
			doc.doctype = doctype;
			if(doctype){
				doc.appendChild(doctype);
			}
			if(qualifiedName){
				var root = doc.createElementNS(namespaceURI,qualifiedName);
				doc.appendChild(root);
			}
			return doc;
		},
		// Introduced in DOM Level 2:
		createDocumentType:function(qualifiedName, publicId, systemId){// raises:INVALID_CHARACTER_ERR,NAMESPACE_ERR
			var node = new DocumentType();
			node.name = qualifiedName;
			node.nodeName = qualifiedName;
			node.publicId = publicId;
			node.systemId = systemId;
			// Introduced in DOM Level 2:
			//readonly attribute DOMString        internalSubset;
			
			//TODO:..
			//  readonly attribute NamedNodeMap     entities;
			//  readonly attribute NamedNodeMap     notations;
			return node;
		}
	};


	/**
	 * @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-1950641247
	 */

	function Node() {
	}
	Node.prototype = {
		firstChild : null,
		lastChild : null,
		previousSibling : null,
		nextSibling : null,
		attributes : null,
		parentNode : null,
		childNodes : null,
		ownerDocument : null,
		nodeValue : null,
		namespaceURI : null,
		prefix : null,
		localName : null,
		// Modified in DOM Level 2:
		insertBefore:function(newChild, refChild){//raises 
			return _insertBefore(this,newChild,refChild);
		},
		replaceChild:function(newChild, oldChild){//raises 
			this.insertBefore(newChild,oldChild);
			if(oldChild){
				this.removeChild(oldChild);
			}
		},
		removeChild:function(oldChild){
			return _removeChild(this,oldChild);
		},
		appendChild:function(newChild){
			return this.insertBefore(newChild,null);
		},
		hasChildNodes:function(){
			return this.firstChild != null;
		},
		cloneNode:function(deep){
			return cloneNode(this.ownerDocument||this,this,deep);
		},
		// Modified in DOM Level 2:
		normalize:function(){
			var child = this.firstChild;
			while(child){
				var next = child.nextSibling;
				if(next && next.nodeType == TEXT_NODE && child.nodeType == TEXT_NODE){
					this.removeChild(next);
					child.appendData(next.data);
				}else {
					child.normalize();
					child = next;
				}
			}
		},
	  	// Introduced in DOM Level 2:
		isSupported:function(feature, version){
			return this.ownerDocument.implementation.hasFeature(feature,version);
		},
	    // Introduced in DOM Level 2:
	    hasAttributes:function(){
	    	return this.attributes.length>0;
	    },
	    lookupPrefix:function(namespaceURI){
	    	var el = this;
	    	while(el){
	    		var map = el._nsMap;
	    		//console.dir(map)
	    		if(map){
	    			for(var n in map){
	    				if(map[n] == namespaceURI){
	    					return n;
	    				}
	    			}
	    		}
	    		el = el.nodeType == ATTRIBUTE_NODE?el.ownerDocument : el.parentNode;
	    	}
	    	return null;
	    },
	    // Introduced in DOM Level 3:
	    lookupNamespaceURI:function(prefix){
	    	var el = this;
	    	while(el){
	    		var map = el._nsMap;
	    		//console.dir(map)
	    		if(map){
	    			if(prefix in map){
	    				return map[prefix] ;
	    			}
	    		}
	    		el = el.nodeType == ATTRIBUTE_NODE?el.ownerDocument : el.parentNode;
	    	}
	    	return null;
	    },
	    // Introduced in DOM Level 3:
	    isDefaultNamespace:function(namespaceURI){
	    	var prefix = this.lookupPrefix(namespaceURI);
	    	return prefix == null;
	    }
	};


	function _xmlEncoder(c){
		return c == '<' && '&lt;' ||
	         c == '>' && '&gt;' ||
	         c == '&' && '&amp;' ||
	         c == '"' && '&quot;' ||
	         '&#'+c.charCodeAt()+';'
	}


	copy(NodeType,Node);
	copy(NodeType,Node.prototype);

	/**
	 * @param callback return true for continue,false for break
	 * @return boolean true: break visit;
	 */
	function _visitNode(node,callback){
		if(callback(node)){
			return true;
		}
		if(node = node.firstChild){
			do{
				if(_visitNode(node,callback)){return true}
	        }while(node=node.nextSibling)
	    }
	}



	function Document(){
	}
	function _onAddAttribute(doc,el,newAttr){
		doc && doc._inc++;
		var ns = newAttr.namespaceURI ;
		if(ns == 'http://www.w3.org/2000/xmlns/'){
			//update namespace
			el._nsMap[newAttr.prefix?newAttr.localName:''] = newAttr.value;
		}
	}
	function _onRemoveAttribute(doc,el,newAttr,remove){
		doc && doc._inc++;
		var ns = newAttr.namespaceURI ;
		if(ns == 'http://www.w3.org/2000/xmlns/'){
			//update namespace
			delete el._nsMap[newAttr.prefix?newAttr.localName:''];
		}
	}
	function _onUpdateChild(doc,el,newChild){
		if(doc && doc._inc){
			doc._inc++;
			//update childNodes
			var cs = el.childNodes;
			if(newChild){
				cs[cs.length++] = newChild;
			}else {
				//console.log(1)
				var child = el.firstChild;
				var i = 0;
				while(child){
					cs[i++] = child;
					child =child.nextSibling;
				}
				cs.length = i;
			}
		}
	}

	/**
	 * attributes;
	 * children;
	 * 
	 * writeable properties:
	 * nodeValue,Attr:value,CharacterData:data
	 * prefix
	 */
	function _removeChild(parentNode,child){
		var previous = child.previousSibling;
		var next = child.nextSibling;
		if(previous){
			previous.nextSibling = next;
		}else {
			parentNode.firstChild = next;
		}
		if(next){
			next.previousSibling = previous;
		}else {
			parentNode.lastChild = previous;
		}
		_onUpdateChild(parentNode.ownerDocument,parentNode);
		return child;
	}
	/**
	 * preformance key(refChild == null)
	 */
	function _insertBefore(parentNode,newChild,nextChild){
		var cp = newChild.parentNode;
		if(cp){
			cp.removeChild(newChild);//remove and update
		}
		if(newChild.nodeType === DOCUMENT_FRAGMENT_NODE){
			var newFirst = newChild.firstChild;
			if (newFirst == null) {
				return newChild;
			}
			var newLast = newChild.lastChild;
		}else {
			newFirst = newLast = newChild;
		}
		var pre = nextChild ? nextChild.previousSibling : parentNode.lastChild;

		newFirst.previousSibling = pre;
		newLast.nextSibling = nextChild;
		
		
		if(pre){
			pre.nextSibling = newFirst;
		}else {
			parentNode.firstChild = newFirst;
		}
		if(nextChild == null){
			parentNode.lastChild = newLast;
		}else {
			nextChild.previousSibling = newLast;
		}
		do{
			newFirst.parentNode = parentNode;
		}while(newFirst !== newLast && (newFirst= newFirst.nextSibling))
		_onUpdateChild(parentNode.ownerDocument||parentNode,parentNode);
		//console.log(parentNode.lastChild.nextSibling == null)
		if (newChild.nodeType == DOCUMENT_FRAGMENT_NODE) {
			newChild.firstChild = newChild.lastChild = null;
		}
		return newChild;
	}
	function _appendSingleChild(parentNode,newChild){
		var cp = newChild.parentNode;
		if(cp){
			var pre = parentNode.lastChild;
			cp.removeChild(newChild);//remove and update
			var pre = parentNode.lastChild;
		}
		var pre = parentNode.lastChild;
		newChild.parentNode = parentNode;
		newChild.previousSibling = pre;
		newChild.nextSibling = null;
		if(pre){
			pre.nextSibling = newChild;
		}else {
			parentNode.firstChild = newChild;
		}
		parentNode.lastChild = newChild;
		_onUpdateChild(parentNode.ownerDocument,parentNode,newChild);
		return newChild;
		//console.log("__aa",parentNode.lastChild.nextSibling == null)
	}
	Document.prototype = {
		//implementation : null,
		nodeName :  '#document',
		nodeType :  DOCUMENT_NODE,
		doctype :  null,
		documentElement :  null,
		_inc : 1,
		
		insertBefore :  function(newChild, refChild){//raises 
			if(newChild.nodeType == DOCUMENT_FRAGMENT_NODE){
				var child = newChild.firstChild;
				while(child){
					var next = child.nextSibling;
					this.insertBefore(child,refChild);
					child = next;
				}
				return newChild;
			}
			if(this.documentElement == null && newChild.nodeType == ELEMENT_NODE){
				this.documentElement = newChild;
			}
			
			return _insertBefore(this,newChild,refChild),(newChild.ownerDocument = this),newChild;
		},
		removeChild :  function(oldChild){
			if(this.documentElement == oldChild){
				this.documentElement = null;
			}
			return _removeChild(this,oldChild);
		},
		// Introduced in DOM Level 2:
		importNode : function(importedNode,deep){
			return importNode(this,importedNode,deep);
		},
		// Introduced in DOM Level 2:
		getElementById :	function(id){
			var rtv = null;
			_visitNode(this.documentElement,function(node){
				if(node.nodeType == ELEMENT_NODE){
					if(node.getAttribute('id') == id){
						rtv = node;
						return true;
					}
				}
			});
			return rtv;
		},
		
		getElementsByClassName: function(className) {
			var pattern = new RegExp("(^|\\s)" + className + "(\\s|$)");
			return new LiveNodeList(this, function(base) {
				var ls = [];
				_visitNode(base.documentElement, function(node) {
					if(node !== base && node.nodeType == ELEMENT_NODE) {
						if(pattern.test(node.getAttribute('class'))) {
							ls.push(node);
						}
					}
				});
				return ls;
			});
		},
		
		//document factory method:
		createElement :	function(tagName){
			var node = new Element();
			node.ownerDocument = this;
			node.nodeName = tagName;
			node.tagName = tagName;
			node.childNodes = new NodeList();
			var attrs	= node.attributes = new NamedNodeMap();
			attrs._ownerElement = node;
			return node;
		},
		createDocumentFragment :	function(){
			var node = new DocumentFragment();
			node.ownerDocument = this;
			node.childNodes = new NodeList();
			return node;
		},
		createTextNode :	function(data){
			var node = new Text();
			node.ownerDocument = this;
			node.appendData(data);
			return node;
		},
		createComment :	function(data){
			var node = new Comment();
			node.ownerDocument = this;
			node.appendData(data);
			return node;
		},
		createCDATASection :	function(data){
			var node = new CDATASection();
			node.ownerDocument = this;
			node.appendData(data);
			return node;
		},
		createProcessingInstruction :	function(target,data){
			var node = new ProcessingInstruction();
			node.ownerDocument = this;
			node.tagName = node.target = target;
			node.nodeValue= node.data = data;
			return node;
		},
		createAttribute :	function(name){
			var node = new Attr();
			node.ownerDocument	= this;
			node.name = name;
			node.nodeName	= name;
			node.localName = name;
			node.specified = true;
			return node;
		},
		createEntityReference :	function(name){
			var node = new EntityReference();
			node.ownerDocument	= this;
			node.nodeName	= name;
			return node;
		},
		// Introduced in DOM Level 2:
		createElementNS :	function(namespaceURI,qualifiedName){
			var node = new Element();
			var pl = qualifiedName.split(':');
			var attrs	= node.attributes = new NamedNodeMap();
			node.childNodes = new NodeList();
			node.ownerDocument = this;
			node.nodeName = qualifiedName;
			node.tagName = qualifiedName;
			node.namespaceURI = namespaceURI;
			if(pl.length == 2){
				node.prefix = pl[0];
				node.localName = pl[1];
			}else {
				//el.prefix = null;
				node.localName = qualifiedName;
			}
			attrs._ownerElement = node;
			return node;
		},
		// Introduced in DOM Level 2:
		createAttributeNS :	function(namespaceURI,qualifiedName){
			var node = new Attr();
			var pl = qualifiedName.split(':');
			node.ownerDocument = this;
			node.nodeName = qualifiedName;
			node.name = qualifiedName;
			node.namespaceURI = namespaceURI;
			node.specified = true;
			if(pl.length == 2){
				node.prefix = pl[0];
				node.localName = pl[1];
			}else {
				//el.prefix = null;
				node.localName = qualifiedName;
			}
			return node;
		}
	};
	_extends(Document,Node);


	function Element() {
		this._nsMap = {};
	}	Element.prototype = {
		nodeType : ELEMENT_NODE,
		hasAttribute : function(name){
			return this.getAttributeNode(name)!=null;
		},
		getAttribute : function(name){
			var attr = this.getAttributeNode(name);
			return attr && attr.value || '';
		},
		getAttributeNode : function(name){
			return this.attributes.getNamedItem(name);
		},
		setAttribute : function(name, value){
			var attr = this.ownerDocument.createAttribute(name);
			attr.value = attr.nodeValue = "" + value;
			this.setAttributeNode(attr);
		},
		removeAttribute : function(name){
			var attr = this.getAttributeNode(name);
			attr && this.removeAttributeNode(attr);
		},
		
		//four real opeartion method
		appendChild:function(newChild){
			if(newChild.nodeType === DOCUMENT_FRAGMENT_NODE){
				return this.insertBefore(newChild,null);
			}else {
				return _appendSingleChild(this,newChild);
			}
		},
		setAttributeNode : function(newAttr){
			return this.attributes.setNamedItem(newAttr);
		},
		setAttributeNodeNS : function(newAttr){
			return this.attributes.setNamedItemNS(newAttr);
		},
		removeAttributeNode : function(oldAttr){
			//console.log(this == oldAttr.ownerElement)
			return this.attributes.removeNamedItem(oldAttr.nodeName);
		},
		//get real attribute name,and remove it by removeAttributeNode
		removeAttributeNS : function(namespaceURI, localName){
			var old = this.getAttributeNodeNS(namespaceURI, localName);
			old && this.removeAttributeNode(old);
		},
		
		hasAttributeNS : function(namespaceURI, localName){
			return this.getAttributeNodeNS(namespaceURI, localName)!=null;
		},
		getAttributeNS : function(namespaceURI, localName){
			var attr = this.getAttributeNodeNS(namespaceURI, localName);
			return attr && attr.value || '';
		},
		setAttributeNS : function(namespaceURI, qualifiedName, value){
			var attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
			attr.value = attr.nodeValue = "" + value;
			this.setAttributeNode(attr);
		},
		getAttributeNodeNS : function(namespaceURI, localName){
			return this.attributes.getNamedItemNS(namespaceURI, localName);
		},
		
		getElementsByTagName : function(tagName){
			return new LiveNodeList(this,function(base){
				var ls = [];
				_visitNode(base,function(node){
					if(node !== base && node.nodeType == ELEMENT_NODE && (tagName === '*' || node.tagName == tagName)){
						ls.push(node);
					}
				});
				return ls;
			});
		},
		getElementsByTagNameNS : function(namespaceURI, localName){
			return new LiveNodeList(this,function(base){
				var ls = [];
				_visitNode(base,function(node){
					if(node !== base && node.nodeType === ELEMENT_NODE && (namespaceURI === '*' || node.namespaceURI === namespaceURI) && (localName === '*' || node.localName == localName)){
						ls.push(node);
					}
				});
				return ls;
				
			});
		}
	};
	Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
	Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;


	_extends(Element,Node);
	function Attr() {
	}	Attr.prototype.nodeType = ATTRIBUTE_NODE;
	_extends(Attr,Node);


	function CharacterData() {
	}	CharacterData.prototype = {
		data : '',
		substringData : function(offset, count) {
			return this.data.substring(offset, offset+count);
		},
		appendData: function(text) {
			text = this.data+text;
			this.nodeValue = this.data = text;
			this.length = text.length;
		},
		insertData: function(offset,text) {
			this.replaceData(offset,0,text);
		
		},
		appendChild:function(newChild){
			throw new Error(ExceptionMessage[HIERARCHY_REQUEST_ERR])
		},
		deleteData: function(offset, count) {
			this.replaceData(offset,count,"");
		},
		replaceData: function(offset, count, text) {
			var start = this.data.substring(0,offset);
			var end = this.data.substring(offset+count);
			text = start + text + end;
			this.nodeValue = this.data = text;
			this.length = text.length;
		}
	};
	_extends(CharacterData,Node);
	function Text() {
	}	Text.prototype = {
		nodeName : "#text",
		nodeType : TEXT_NODE,
		splitText : function(offset) {
			var text = this.data;
			var newText = text.substring(offset);
			text = text.substring(0, offset);
			this.data = this.nodeValue = text;
			this.length = text.length;
			var newNode = this.ownerDocument.createTextNode(newText);
			if(this.parentNode){
				this.parentNode.insertBefore(newNode, this.nextSibling);
			}
			return newNode;
		}
	};
	_extends(Text,CharacterData);
	function Comment() {
	}	Comment.prototype = {
		nodeName : "#comment",
		nodeType : COMMENT_NODE
	};
	_extends(Comment,CharacterData);

	function CDATASection() {
	}	CDATASection.prototype = {
		nodeName : "#cdata-section",
		nodeType : CDATA_SECTION_NODE
	};
	_extends(CDATASection,CharacterData);


	function DocumentType() {
	}	DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
	_extends(DocumentType,Node);

	function Notation() {
	}	Notation.prototype.nodeType = NOTATION_NODE;
	_extends(Notation,Node);

	function Entity() {
	}	Entity.prototype.nodeType = ENTITY_NODE;
	_extends(Entity,Node);

	function EntityReference() {
	}	EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
	_extends(EntityReference,Node);

	function DocumentFragment() {
	}	DocumentFragment.prototype.nodeName =	"#document-fragment";
	DocumentFragment.prototype.nodeType =	DOCUMENT_FRAGMENT_NODE;
	_extends(DocumentFragment,Node);


	function ProcessingInstruction() {
	}
	ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
	_extends(ProcessingInstruction,Node);
	function XMLSerializer(){}
	XMLSerializer.prototype.serializeToString = function(node,isHtml,nodeFilter){
		return nodeSerializeToString.call(node,isHtml,nodeFilter);
	};
	Node.prototype.toString = nodeSerializeToString;
	function nodeSerializeToString(isHtml,nodeFilter){
		var buf = [];
		var refNode = this.nodeType == 9 && this.documentElement || this;
		var prefix = refNode.prefix;
		var uri = refNode.namespaceURI;
		
		if(uri && prefix == null){
			//console.log(prefix)
			var prefix = refNode.lookupPrefix(uri);
			if(prefix == null){
				//isHTML = true;
				var visibleNamespaces=[
				{namespace:uri,prefix:null}
				//{namespace:uri,prefix:''}
				];
			}
		}
		serializeToString(this,buf,isHtml,nodeFilter,visibleNamespaces);
		//console.log('###',this.nodeType,uri,prefix,buf.join(''))
		return buf.join('');
	}
	function needNamespaceDefine(node,isHTML, visibleNamespaces) {
		var prefix = node.prefix||'';
		var uri = node.namespaceURI;
		if (!prefix && !uri){
			return false;
		}
		if (prefix === "xml" && uri === "http://www.w3.org/XML/1998/namespace" 
			|| uri == 'http://www.w3.org/2000/xmlns/'){
			return false;
		}
		
		var i = visibleNamespaces.length; 
		//console.log('@@@@',node.tagName,prefix,uri,visibleNamespaces)
		while (i--) {
			var ns = visibleNamespaces[i];
			// get namespace prefix
			//console.log(node.nodeType,node.tagName,ns.prefix,prefix)
			if (ns.prefix == prefix){
				return ns.namespace != uri;
			}
		}
		//console.log(isHTML,uri,prefix=='')
		//if(isHTML && prefix ==null && uri == 'http://www.w3.org/1999/xhtml'){
		//	return false;
		//}
		//node.flag = '11111'
		//console.error(3,true,node.flag,node.prefix,node.namespaceURI)
		return true;
	}
	function serializeToString(node,buf,isHTML,nodeFilter,visibleNamespaces){
		if(nodeFilter){
			node = nodeFilter(node);
			if(node){
				if(typeof node == 'string'){
					buf.push(node);
					return;
				}
			}else {
				return;
			}
			//buf.sort.apply(attrs, attributeSorter);
		}
		switch(node.nodeType){
		case ELEMENT_NODE:
			if (!visibleNamespaces) visibleNamespaces = [];
			visibleNamespaces.length;
			var attrs = node.attributes;
			var len = attrs.length;
			var child = node.firstChild;
			var nodeName = node.tagName;
			
			isHTML =  (htmlns === node.namespaceURI) ||isHTML; 
			buf.push('<',nodeName);
			
			
			
			for(var i=0;i<len;i++){
				// add namespaces for attributes
				var attr = attrs.item(i);
				if (attr.prefix == 'xmlns') {
					visibleNamespaces.push({ prefix: attr.localName, namespace: attr.value });
				}else if(attr.nodeName == 'xmlns'){
					visibleNamespaces.push({ prefix: '', namespace: attr.value });
				}
			}
			for(var i=0;i<len;i++){
				var attr = attrs.item(i);
				if (needNamespaceDefine(attr,isHTML, visibleNamespaces)) {
					var prefix = attr.prefix||'';
					var uri = attr.namespaceURI;
					var ns = prefix ? ' xmlns:' + prefix : " xmlns";
					buf.push(ns, '="' , uri , '"');
					visibleNamespaces.push({ prefix: prefix, namespace:uri });
				}
				serializeToString(attr,buf,isHTML,nodeFilter,visibleNamespaces);
			}
			// add namespace for current node		
			if (needNamespaceDefine(node,isHTML, visibleNamespaces)) {
				var prefix = node.prefix||'';
				var uri = node.namespaceURI;
				if (uri) {
					// Avoid empty namespace value like xmlns:ds=""
					// Empty namespace URL will we produce an invalid XML document
					var ns = prefix ? ' xmlns:' + prefix : " xmlns";
					buf.push(ns, '="' , uri , '"');
					visibleNamespaces.push({ prefix: prefix, namespace:uri });
				}
			}
			
			if(child || isHTML && !/^(?:meta|link|img|br|hr|input)$/i.test(nodeName)){
				buf.push('>');
				//if is cdata child node
				if(isHTML && /^script$/i.test(nodeName)){
					while(child){
						if(child.data){
							buf.push(child.data);
						}else {
							serializeToString(child,buf,isHTML,nodeFilter,visibleNamespaces);
						}
						child = child.nextSibling;
					}
				}else
				{
					while(child){
						serializeToString(child,buf,isHTML,nodeFilter,visibleNamespaces);
						child = child.nextSibling;
					}
				}
				buf.push('</',nodeName,'>');
			}else {
				buf.push('/>');
			}
			// remove added visible namespaces
			//visibleNamespaces.length = startVisibleNamespaces;
			return;
		case DOCUMENT_NODE:
		case DOCUMENT_FRAGMENT_NODE:
			var child = node.firstChild;
			while(child){
				serializeToString(child,buf,isHTML,nodeFilter,visibleNamespaces);
				child = child.nextSibling;
			}
			return;
		case ATTRIBUTE_NODE:
			/**
			 * Well-formedness constraint: No < in Attribute Values
			 * The replacement text of any entity referred to directly or indirectly in an attribute value must not contain a <.
			 * @see https://www.w3.org/TR/xml/#CleanAttrVals
			 * @see https://www.w3.org/TR/xml/#NT-AttValue
			 */
			return buf.push(' ', node.name, '="', node.value.replace(/[<&"]/g,_xmlEncoder), '"');
		case TEXT_NODE:
			/**
			 * The ampersand character (&) and the left angle bracket (<) must not appear in their literal form,
			 * except when used as markup delimiters, or within a comment, a processing instruction, or a CDATA section.
			 * If they are needed elsewhere, they must be escaped using either numeric character references or the strings
			 * `&amp;` and `&lt;` respectively.
			 * The right angle bracket (>) may be represented using the string " &gt; ", and must, for compatibility,
			 * be escaped using either `&gt;` or a character reference when it appears in the string `]]>` in content,
			 * when that string is not marking the end of a CDATA section.
			 *
			 * In the content of elements, character data is any string of characters
			 * which does not contain the start-delimiter of any markup
			 * and does not include the CDATA-section-close delimiter, `]]>`.
			 *
			 * @see https://www.w3.org/TR/xml/#NT-CharData
			 */
			return buf.push(node.data
				.replace(/[<&]/g,_xmlEncoder)
				.replace(/]]>/g, ']]&gt;')
			);
		case CDATA_SECTION_NODE:
			return buf.push( '<![CDATA[',node.data,']]>');
		case COMMENT_NODE:
			return buf.push( "<!--",node.data,"-->");
		case DOCUMENT_TYPE_NODE:
			var pubid = node.publicId;
			var sysid = node.systemId;
			buf.push('<!DOCTYPE ',node.name);
			if(pubid){
				buf.push(' PUBLIC ', pubid);
				if (sysid && sysid!='.') {
					buf.push(' ', sysid);
				}
				buf.push('>');
			}else if(sysid && sysid!='.'){
				buf.push(' SYSTEM ', sysid, '>');
			}else {
				var sub = node.internalSubset;
				if(sub){
					buf.push(" [",sub,"]");
				}
				buf.push(">");
			}
			return;
		case PROCESSING_INSTRUCTION_NODE:
			return buf.push( "<?",node.target," ",node.data,"?>");
		case ENTITY_REFERENCE_NODE:
			return buf.push( '&',node.nodeName,';');
		//case ENTITY_NODE:
		//case NOTATION_NODE:
		default:
			buf.push('??',node.nodeName);
		}
	}
	function importNode(doc,node,deep){
		var node2;
		switch (node.nodeType) {
		case ELEMENT_NODE:
			node2 = node.cloneNode(false);
			node2.ownerDocument = doc;
			//var attrs = node2.attributes;
			//var len = attrs.length;
			//for(var i=0;i<len;i++){
				//node2.setAttributeNodeNS(importNode(doc,attrs.item(i),deep));
			//}
		case DOCUMENT_FRAGMENT_NODE:
			break;
		case ATTRIBUTE_NODE:
			deep = true;
			break;
		//case ENTITY_REFERENCE_NODE:
		//case PROCESSING_INSTRUCTION_NODE:
		////case TEXT_NODE:
		//case CDATA_SECTION_NODE:
		//case COMMENT_NODE:
		//	deep = false;
		//	break;
		//case DOCUMENT_NODE:
		//case DOCUMENT_TYPE_NODE:
		//cannot be imported.
		//case ENTITY_NODE:
		//case NOTATION_NODE：
		//can not hit in level3
		//default:throw e;
		}
		if(!node2){
			node2 = node.cloneNode(false);//false
		}
		node2.ownerDocument = doc;
		node2.parentNode = null;
		if(deep){
			var child = node.firstChild;
			while(child){
				node2.appendChild(importNode(doc,child,deep));
				child = child.nextSibling;
			}
		}
		return node2;
	}
	//
	//var _relationMap = {firstChild:1,lastChild:1,previousSibling:1,nextSibling:1,
	//					attributes:1,childNodes:1,parentNode:1,documentElement:1,doctype,};
	function cloneNode(doc,node,deep){
		var node2 = new node.constructor();
		for(var n in node){
			var v = node[n];
			if(typeof v != 'object' ){
				if(v != node2[n]){
					node2[n] = v;
				}
			}
		}
		if(node.childNodes){
			node2.childNodes = new NodeList();
		}
		node2.ownerDocument = doc;
		switch (node2.nodeType) {
		case ELEMENT_NODE:
			var attrs	= node.attributes;
			var attrs2	= node2.attributes = new NamedNodeMap();
			var len = attrs.length;
			attrs2._ownerElement = node2;
			for(var i=0;i<len;i++){
				node2.setAttributeNode(cloneNode(doc,attrs.item(i),true));
			}
			break;		case ATTRIBUTE_NODE:
			deep = true;
		}
		if(deep){
			var child = node.firstChild;
			while(child){
				node2.appendChild(cloneNode(doc,child,deep));
				child = child.nextSibling;
			}
		}
		return node2;
	}

	function __set__(object,key,value){
		object[key] = value;
	}
	//do dynamic
	try{
		if(Object.defineProperty){
			Object.defineProperty(LiveNodeList.prototype,'length',{
				get:function(){
					_updateLiveList(this);
					return this.$$length;
				}
			});
			Object.defineProperty(Node.prototype,'textContent',{
				get:function(){
					return getTextContent(this);
				},
				set:function(data){
					switch(this.nodeType){
					case ELEMENT_NODE:
					case DOCUMENT_FRAGMENT_NODE:
						while(this.firstChild){
							this.removeChild(this.firstChild);
						}
						if(data || String(data)){
							this.appendChild(this.ownerDocument.createTextNode(data));
						}
						break;
					default:
						//TODO:
						this.data = data;
						this.value = data;
						this.nodeValue = data;
					}
				}
			});
			
			function getTextContent(node){
				switch(node.nodeType){
				case ELEMENT_NODE:
				case DOCUMENT_FRAGMENT_NODE:
					var buf = [];
					node = node.firstChild;
					while(node){
						if(node.nodeType!==7 && node.nodeType !==8){
							buf.push(getTextContent(node));
						}
						node = node.nextSibling;
					}
					return buf.join('');
				default:
					return node.nodeValue;
				}
			}
			__set__ = function(object,key,value){
				//console.log(value)
				object['$$'+key] = value;
			};
		}
	}catch(e){//ie8
	}

	//if(typeof require == 'function'){
		dom.Node = Node;
		dom.DOMException = DOMException;
		dom.DOMImplementation = DOMImplementation;
		dom.XMLSerializer = XMLSerializer;
	//}
	return dom;
}

var hasRequiredDomParser;

function requireDomParser () {
	if (hasRequiredDomParser) return domParser;
	hasRequiredDomParser = 1;
	function DOMParser(options){
		this.options = options ||{locator:{}};
	}

	DOMParser.prototype.parseFromString = function(source,mimeType){
		var options = this.options;
		var sax =  new XMLReader();
		var domBuilder = options.domBuilder || new DOMHandler();//contentHandler and LexicalHandler
		var errorHandler = options.errorHandler;
		var locator = options.locator;
		var defaultNSMap = options.xmlns||{};
		var isHTML = /\/x?html?$/.test(mimeType);//mimeType.toLowerCase().indexOf('html') > -1;
	  	var entityMap = isHTML?htmlEntity.entityMap:{'lt':'<','gt':'>','amp':'&','quot':'"','apos':"'"};
		if(locator){
			domBuilder.setDocumentLocator(locator);
		}

		sax.errorHandler = buildErrorHandler(errorHandler,domBuilder,locator);
		sax.domBuilder = options.domBuilder || domBuilder;
		if(isHTML){
			defaultNSMap['']= 'http://www.w3.org/1999/xhtml';
		}
		defaultNSMap.xml = defaultNSMap.xml || 'http://www.w3.org/XML/1998/namespace';
		if(source && typeof source === 'string'){
			sax.parse(source,defaultNSMap,entityMap);
		}else {
			sax.errorHandler.error("invalid doc source");
		}
		return domBuilder.doc;
	};
	function buildErrorHandler(errorImpl,domBuilder,locator){
		if(!errorImpl){
			if(domBuilder instanceof DOMHandler){
				return domBuilder;
			}
			errorImpl = domBuilder ;
		}
		var errorHandler = {};
		var isCallback = errorImpl instanceof Function;
		locator = locator||{};
		function build(key){
			var fn = errorImpl[key];
			if(!fn && isCallback){
				fn = errorImpl.length == 2?function(msg){errorImpl(key,msg);}:errorImpl;
			}
			errorHandler[key] = fn && function(msg){
				fn('[xmldom '+key+']\t'+msg+_locator(locator));
			}||function(){};
		}
		build('warning');
		build('error');
		build('fatalError');
		return errorHandler;
	}

	//console.log('#\n\n\n\n\n\n\n####')
	/**
	 * +ContentHandler+ErrorHandler
	 * +LexicalHandler+EntityResolver2
	 * -DeclHandler-DTDHandler
	 *
	 * DefaultHandler:EntityResolver, DTDHandler, ContentHandler, ErrorHandler
	 * DefaultHandler2:DefaultHandler,LexicalHandler, DeclHandler, EntityResolver2
	 * @link http://www.saxproject.org/apidoc/org/xml/sax/helpers/DefaultHandler.html
	 */
	function DOMHandler() {
	    this.cdata = false;
	}
	function position(locator,node){
		node.lineNumber = locator.lineNumber;
		node.columnNumber = locator.columnNumber;
	}
	/**
	 * @see org.xml.sax.ContentHandler#startDocument
	 * @link http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
	 */
	DOMHandler.prototype = {
		startDocument : function() {
	    	this.doc = new DOMImplementation().createDocument(null, null, null);
	    	if (this.locator) {
	        	this.doc.documentURI = this.locator.systemId;
	    	}
		},
		startElement:function(namespaceURI, localName, qName, attrs) {
			var doc = this.doc;
		    var el = doc.createElementNS(namespaceURI, qName||localName);
		    var len = attrs.length;
		    appendElement(this, el);
		    this.currentElement = el;

			this.locator && position(this.locator,el);
		    for (var i = 0 ; i < len; i++) {
		        var namespaceURI = attrs.getURI(i);
		        var value = attrs.getValue(i);
		        var qName = attrs.getQName(i);
				var attr = doc.createAttributeNS(namespaceURI, qName);
				this.locator &&position(attrs.getLocator(i),attr);
				attr.value = attr.nodeValue = value;
				el.setAttributeNode(attr);
		    }
		},
		endElement:function(namespaceURI, localName, qName) {
			var current = this.currentElement;
			current.tagName;
			this.currentElement = current.parentNode;
		},
		startPrefixMapping:function(prefix, uri) {
		},
		endPrefixMapping:function(prefix) {
		},
		processingInstruction:function(target, data) {
		    var ins = this.doc.createProcessingInstruction(target, data);
		    this.locator && position(this.locator,ins);
		    appendElement(this, ins);
		},
		ignorableWhitespace:function(ch, start, length) {
		},
		characters:function(chars, start, length) {
			chars = _toString.apply(this,arguments);
			//console.log(chars)
			if(chars){
				if (this.cdata) {
					var charNode = this.doc.createCDATASection(chars);
				} else {
					var charNode = this.doc.createTextNode(chars);
				}
				if(this.currentElement){
					this.currentElement.appendChild(charNode);
				}else if(/^\s*$/.test(chars)){
					this.doc.appendChild(charNode);
					//process xml
				}
				this.locator && position(this.locator,charNode);
			}
		},
		skippedEntity:function(name) {
		},
		endDocument:function() {
			this.doc.normalize();
		},
		setDocumentLocator:function (locator) {
		    if(this.locator = locator){// && !('lineNumber' in locator)){
		    	locator.lineNumber = 0;
		    }
		},
		//LexicalHandler
		comment:function(chars, start, length) {
			chars = _toString.apply(this,arguments);
		    var comm = this.doc.createComment(chars);
		    this.locator && position(this.locator,comm);
		    appendElement(this, comm);
		},

		startCDATA:function() {
		    //used in characters() methods
		    this.cdata = true;
		},
		endCDATA:function() {
		    this.cdata = false;
		},

		startDTD:function(name, publicId, systemId) {
			var impl = this.doc.implementation;
		    if (impl && impl.createDocumentType) {
		        var dt = impl.createDocumentType(name, publicId, systemId);
		        this.locator && position(this.locator,dt);
		        appendElement(this, dt);
		    }
		},
		/**
		 * @see org.xml.sax.ErrorHandler
		 * @link http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
		 */
		warning:function(error) {
			console.warn('[xmldom warning]\t'+error,_locator(this.locator));
		},
		error:function(error) {
			console.error('[xmldom error]\t'+error,_locator(this.locator));
		},
		fatalError:function(error) {
			throw new ParseError(error, this.locator);
		}
	};
	function _locator(l){
		if(l){
			return '\n@'+(l.systemId ||'')+'#[line:'+l.lineNumber+',col:'+l.columnNumber+']'
		}
	}
	function _toString(chars,start,length){
		if(typeof chars == 'string'){
			return chars.substr(start,length)
		}else {//java sax connect width xmldom on rhino(what about: "? && !(chars instanceof String)")
			if(chars.length >= start+length || start){
				return new java.lang.String(chars,start,length)+'';
			}
			return chars;
		}
	}

	/*
	 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/LexicalHandler.html
	 * used method of org.xml.sax.ext.LexicalHandler:
	 *  #comment(chars, start, length)
	 *  #startCDATA()
	 *  #endCDATA()
	 *  #startDTD(name, publicId, systemId)
	 *
	 *
	 * IGNORED method of org.xml.sax.ext.LexicalHandler:
	 *  #endDTD()
	 *  #startEntity(name)
	 *  #endEntity(name)
	 *
	 *
	 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/DeclHandler.html
	 * IGNORED method of org.xml.sax.ext.DeclHandler
	 * 	#attributeDecl(eName, aName, type, mode, value)
	 *  #elementDecl(name, model)
	 *  #externalEntityDecl(name, publicId, systemId)
	 *  #internalEntityDecl(name, value)
	 * @link http://www.saxproject.org/apidoc/org/xml/sax/ext/EntityResolver2.html
	 * IGNORED method of org.xml.sax.EntityResolver2
	 *  #resolveEntity(String name,String publicId,String baseURI,String systemId)
	 *  #resolveEntity(publicId, systemId)
	 *  #getExternalSubset(name, baseURI)
	 * @link http://www.saxproject.org/apidoc/org/xml/sax/DTDHandler.html
	 * IGNORED method of org.xml.sax.DTDHandler
	 *  #notationDecl(name, publicId, systemId) {};
	 *  #unparsedEntityDecl(name, publicId, systemId, notationName) {};
	 */
	"endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(/\w+/g,function(key){
		DOMHandler.prototype[key] = function(){return null};
	});

	/* Private static helpers treated below as private instance methods, so don't need to add these to the public API; we might use a Relator to also get rid of non-standard public properties */
	function appendElement (hander,node) {
	    if (!hander.currentElement) {
	        hander.doc.appendChild(node);
	    } else {
	        hander.currentElement.appendChild(node);
	    }
	}//appendChild and setAttributeNS are preformance key

	//if(typeof require == 'function'){
	var htmlEntity = requireEntities();
	var sax = requireSax();
	var XMLReader = sax.XMLReader;
	var ParseError = sax.ParseError;
	var DOMImplementation = domParser.DOMImplementation = requireDom().DOMImplementation;
	domParser.XMLSerializer = requireDom().XMLSerializer ;
	domParser.DOMParser = DOMParser;
	domParser.__DOMHandler = DOMHandler;
	//}
	return domParser;
}

var domParserExports = requireDomParser();

function parseWorkflow(taskId, xml, done) {
    try {
        let sIdx = xml.indexOf("<root>");
        if (sIdx == -1) {
            return null;
        }
        xml = xml.substring(sIdx);
        let eIdx = xml.indexOf("</root>");
        if (eIdx > -1) {
            xml = xml.substring(0, eIdx + 7);
        }
        if (!done) {
            xml = fixXmlTag(xml);
        }
        const parser = new domParserExports.DOMParser();
        const doc = parser.parseFromString(xml, "text/xml");
        let root = doc.documentElement;
        if (root.tagName !== "root") {
            return null;
        }
        let agents = [];
        const workflow = {
            taskId: taskId,
            name: root.getElementsByTagName("name")[0]?.textContent || "",
            thought: root.getElementsByTagName("thought")[0]?.textContent || "",
            agents: agents,
            xml: xml,
        };
        let agentsNode = root.getElementsByTagName("agents");
        let agentsNodes = agentsNode.length > 0 ? agentsNode[0].getElementsByTagName("agent") : [];
        for (let i = 0; i < agentsNodes.length; i++) {
            let agentNode = agentsNodes[i];
            let name = agentNode.getAttribute("name");
            if (!name) {
                break;
            }
            let nodes = [];
            let agent = {
                name: name,
                id: taskId + "-" + (i < 10 ? "0" + i : i),
                task: agentNode.getElementsByTagName("task")[0]?.textContent || "",
                nodes: nodes,
                xml: agentNode.toString(),
            };
            let xmlNodes = agentNode.getElementsByTagName("nodes");
            if (xmlNodes.length > 0) {
                parseWorkflowNodes(nodes, xmlNodes[0].childNodes);
            }
            agents.push(agent);
        }
        return workflow;
    }
    catch (e) {
        if (done) {
            throw e;
        }
        else {
            return null;
        }
    }
}
function parseWorkflowNodes(nodes, xmlNodes) {
    for (let i = 0; i < xmlNodes.length; i++) {
        if (xmlNodes[i].nodeType !== 1) {
            continue;
        }
        let xmlNode = xmlNodes[i];
        switch (xmlNode.tagName) {
            case "node": {
                let node = {
                    type: "normal",
                    text: xmlNode.textContent || "",
                    input: xmlNode.getAttribute("input"),
                    output: xmlNode.getAttribute("output"),
                };
                nodes.push(node);
                break;
            }
            case "forEach": {
                let _nodes = [];
                let node = {
                    type: "forEach",
                    items: (xmlNode.getAttribute("items") || "list"),
                    nodes: _nodes,
                };
                let _xmlNodes = xmlNode.getElementsByTagName("node");
                if (_xmlNodes.length > 0) {
                    parseWorkflowNodes(_nodes, _xmlNodes);
                }
                nodes.push(node);
                break;
            }
            case "watch": {
                let _nodes = [];
                let node = {
                    type: "watch",
                    event: (xmlNode.getAttribute("event") || ""),
                    loop: xmlNode.getAttribute("loop") == "true",
                    description: xmlNode.getElementsByTagName("description")[0]?.textContent || "",
                    triggerNodes: _nodes,
                };
                let triggerNode = xmlNode.getElementsByTagName("trigger");
                if (triggerNode.length > 0) {
                    parseWorkflowNodes(_nodes, triggerNode[0].childNodes);
                }
                nodes.push(node);
                break;
            }
        }
    }
}
function buildAgentRootXml(agentXml, mainTaskPrompt, nodeCallback) {
    const parser = new domParserExports.DOMParser();
    const doc = parser.parseFromString(agentXml, "text/xml");
    let agentNode = doc.getElementsByTagName("agent");
    let nodesNode = doc.getElementsByTagName("nodes");
    if (nodesNode.length > 0) {
        let nodes = nodesNode[0].childNodes;
        let nodeId = 0;
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];
            if (node.nodeType == 1) {
                node.setAttribute("id", nodeId + "");
                nodeCallback && nodeCallback(nodeId, node);
                nodeId++;
            }
        }
    }
    // <root><mainTask></mainTask><currentTask></currentTask><nodes><node id="0"></node></nodes></root>
    let agentInnerHTML = getInnerXML(agentNode[0]);
    let prefix = agentInnerHTML.substring(0, agentInnerHTML.indexOf("<task>"));
    agentInnerHTML = agentInnerHTML
        .replace("<task>", "<currentTask>")
        .replace("</task>", "</currentTask>");
    return `<root>${prefix}<mainTask>${mainTaskPrompt}</mainTask>${agentInnerHTML}</root>`;
}
function extractAgentXmlNode(agentXml, nodeId) {
    const parser = new domParserExports.DOMParser();
    const doc = parser.parseFromString(agentXml, "text/xml");
    let nodesNode = doc.getElementsByTagName("nodes");
    if (nodesNode.length > 0) {
        let nodes = nodesNode[0].childNodes;
        let _nodeId = 0;
        for (let i = 0; i < nodes.length; i++) {
            let node = nodes[i];
            if (node.nodeType == 1) {
                if (node.getAttribute("id") == null || node.getAttribute("id") == "") {
                    node.setAttribute("id", _nodeId + "");
                }
                _nodeId++;
                if (node.getAttribute("id") == nodeId + "") {
                    return node;
                }
            }
        }
    }
    return null;
}
function getInnerXML(node) {
    let result = "";
    const serializer = new domParserExports.XMLSerializer();
    for (let i = 0; i < node.childNodes.length; i++) {
        result += serializer.serializeToString(node.childNodes[i]);
    }
    return result;
}

var xml = /*#__PURE__*/Object.freeze({
    __proto__: null,
    buildAgentRootXml: buildAgentRootXml,
    extractAgentXmlNode: extractAgentXmlNode,
    getInnerXML: getInnerXML,
    parseWorkflow: parseWorkflow
});

const TOOL_NAME$5 = "task_snapshot";
class TaskSnapshotTool {
    constructor() {
        this.name = TOOL_NAME$5;
        this.description = `Task snapshot archive, recording key information of the current task, updating task node status, facilitating subsequent continuation of operation.`;
        this.parameters = {
            type: "object",
            properties: {
                doneIds: {
                    type: "array",
                    description: "Update task node completion status, list of completed node IDs.",
                    items: {
                        type: "number",
                    },
                },
                taskSnapshot: {
                    type: "string",
                    description: "Current task important information, as detailed as possible, ensure that the task progress can be restored through this information later, output records of completed task information, contextual information, variables used, pending tasks information, etc.",
                },
            },
            required: ["doneIds", "taskSnapshot"],
        };
    }
    async execute(args, agentContext) {
        let doneIds = args.doneIds;
        let taskSnapshot = args.taskSnapshot;
        let agentNode = agentContext.agentChain.agent;
        let taskPrompt = agentContext.context.chain.taskPrompt;
        let agentXml = buildAgentRootXml(agentNode.xml, taskPrompt, (nodeId, node) => {
            let done = doneIds.indexOf(nodeId) > -1;
            node.setAttribute("status", done ? "done" : "todo");
        });
        let text = "The current task has been interrupted. Below is a snapshot of the task execution history.\n" +
            "# Task Snapshot\n" +
            taskSnapshot.trim() +
            "\n\n# Task\n" +
            agentXml;
        return {
            content: [
                {
                    type: "text",
                    text: text,
                },
            ],
        };
    }
}

function extractUsedTool(messages, agentTools) {
    let tools = [];
    let toolNames = [];
    for (let i = 0; i < messages.length; i++) {
        let message = messages[i];
        if (message.role == "tool") {
            for (let j = 0; j < message.content.length; j++) {
                let toolName = message.content[j].toolName;
                if (toolNames.indexOf(toolName) > -1) {
                    continue;
                }
                toolNames.push(toolName);
                let tool = agentTools.filter((tool) => tool.name === toolName)[0];
                if (tool) {
                    tools.push(tool);
                }
            }
        }
    }
    return tools;
}
function removeDuplicateToolUse(results) {
    if (results.length <= 1 ||
        results.filter((r) => r.type == "tool-call").length <= 1) {
        return results;
    }
    let _results = [];
    let tool_uniques = [];
    for (let i = 0; i < results.length; i++) {
        if (results[i].type === "tool-call") {
            let tool = results[i];
            let key = tool.toolName + tool.args;
            if (tool_uniques.indexOf(key) == -1) {
                _results.push(results[i]);
                tool_uniques.push(key);
            }
        }
        else {
            _results.push(results[i]);
        }
    }
    return _results;
}
async function compressAgentMessages(agentContext, rlm, messages, tools) {
    if (messages.length < 10) {
        return;
    }
    // extract used tool
    let usedTools = extractUsedTool(messages, tools);
    let snapshotTool = new TaskSnapshotTool();
    let newTools = mergeTools(usedTools, [
        {
            type: "function",
            name: snapshotTool.name,
            description: snapshotTool.description,
            parameters: snapshotTool.parameters,
        },
    ]);
    // handle messages
    let lastToolIndex = messages.length - 1;
    let newMessages = messages;
    for (let r = newMessages.length - 1; r > 3; r--) {
        if (newMessages[r].role == "tool") {
            newMessages = newMessages.slice(0, r + 1);
            lastToolIndex = r;
            break;
        }
    }
    newMessages.push({
        role: "user",
        content: [
            {
                type: "text",
                text: "Please create a snapshot backup of the current task, keeping only key important information and node completion status.",
            },
        ],
    });
    // compress snapshot
    let result = await callLLM(agentContext, rlm, newMessages, newTools, true, {
        type: "tool",
        toolName: snapshotTool.name,
    });
    let toolCall = result.filter((s) => s.type == "tool-call")[0];
    let args = typeof toolCall.args == "string"
        ? JSON.parse(toolCall.args || "{}")
        : toolCall.args || {};
    let toolResult = await snapshotTool.execute(args, agentContext);
    let callback = agentContext.context.config.callback;
    if (callback) {
        await callback.onMessage({
            taskId: agentContext.context.taskId,
            agentName: agentContext.agent.Name,
            nodeId: agentContext.agentChain.agent.id,
            type: "tool_result",
            toolId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            params: args,
            toolResult: toolResult,
        }, agentContext);
    }
    // handle original messages
    let firstToolIndex = 3;
    for (let i = 0; i < messages.length; i++) {
        if (messages[0].role == "tool") {
            firstToolIndex = i;
            break;
        }
    }
    // system, user, assistant, tool(first), [...], <user>, assistant, tool(last), ...
    messages.splice(firstToolIndex + 1, lastToolIndex - firstToolIndex - 2, {
        role: "user",
        content: toolResult.content.filter((s) => s.type == "text"),
    });
}
function handleLargeContextMessages(messages) {
    let imageNum = 0;
    let fileNum = 0;
    let maxNum = config.maxDialogueImgFileNum;
    let longTextTools = {};
    for (let i = messages.length - 1; i >= 0; i--) {
        let message = messages[i];
        if (message.role == "user") {
            for (let j = 0; j < message.content.length; j++) {
                let content = message.content[j];
                if (content.type == "image") {
                    if (++imageNum <= maxNum) {
                        break;
                    }
                    content = {
                        type: "text",
                        text: "[image]",
                    };
                    message.content[j] = content;
                }
                else if (content.type == "file") {
                    if (++fileNum <= maxNum) {
                        break;
                    }
                    content = {
                        type: "text",
                        text: "[file]",
                    };
                    message.content[j] = content;
                }
            }
        }
        else if (message.role == "tool") {
            for (let j = 0; j < message.content.length; j++) {
                let toolResult = message.content[j];
                let toolContent = toolResult.content;
                if (!toolContent || toolContent.length == 0) {
                    continue;
                }
                for (let r = 0; r < toolContent.length; r++) {
                    let _content = toolContent[r];
                    if (_content.type == "image") {
                        if (++imageNum <= maxNum) {
                            break;
                        }
                        _content = {
                            type: "text",
                            text: "[image]",
                        };
                        toolContent[r] = _content;
                    }
                }
                for (let r = 0; r < toolContent.length; r++) {
                    let _content = toolContent[r];
                    if (_content.type == "text" && _content.text?.length > config.largeTextLength) {
                        if (!longTextTools[toolResult.toolName]) {
                            longTextTools[toolResult.toolName] = 1;
                            break;
                        }
                        else {
                            longTextTools[toolResult.toolName]++;
                        }
                        _content = {
                            type: "text",
                            text: _content.text.substring(0, config.largeTextLength) + "...",
                        };
                        toolContent[r] = _content;
                    }
                }
            }
        }
    }
}

class ToolWrapper {
    constructor(toolSchema, execute) {
        this.tool = convertToolSchema(toolSchema);
        this.execute = execute;
    }
    get name() {
        return this.tool.name;
    }
    getTool() {
        return this.tool;
    }
    async callTool(args, agentContext, toolCall) {
        return await this.execute.execute(args, agentContext, toolCall);
    }
}

class ToolChain {
    constructor(toolUse, request) {
        this.toolName = toolUse.toolName;
        this.toolCallId = toolUse.toolCallId;
        this.request = JSON.parse(JSON.stringify(request));
    }
    updateParams(params) {
        this.params = params;
        this.onUpdate && this.onUpdate();
    }
    updateToolResult(toolResult) {
        this.toolResult = toolResult;
        this.onUpdate && this.onUpdate();
    }
}
class AgentChain {
    constructor(agent) {
        this.tools = [];
        this.agent = agent;
    }
    push(tool) {
        tool.onUpdate = () => {
            this.onUpdate &&
                this.onUpdate({
                    type: "update",
                    target: tool,
                });
        };
        this.tools.push(tool);
        this.onUpdate &&
            this.onUpdate({
                type: "update",
                target: this,
            });
    }
}
class Chain {
    constructor(taskPrompt) {
        this.agents = [];
        this.listeners = [];
        this.taskPrompt = taskPrompt;
    }
    push(agent) {
        agent.onUpdate = (event) => {
            this.pub(event);
        };
        this.agents.push(agent);
        this.pub({
            type: "update",
            target: agent,
        });
    }
    pub(event) {
        this.listeners.forEach((listener) => listener(this, event));
    }
    addListener(callback) {
        this.listeners.push(callback);
    }
    removeListener(callback) {
        this.listeners = this.listeners.filter((listener) => listener !== callback);
    }
}

const TOOL_NAME$4 = "foreach_task";
class ForeachTaskTool {
    constructor() {
        this.name = TOOL_NAME$4;
        this.description = `When executing the \`forEach\` node, please use the current tool for counting to ensure tasks are executed sequentially, the tool needs to be called with each loop iteration.`;
        this.parameters = {
            type: "object",
            properties: {
                nodeId: {
                    type: "number",
                    description: "forEach node ID.",
                },
                progress: {
                    type: "string",
                    description: "Current execution progress.",
                },
                next_step: {
                    type: "string",
                    description: "Next task description.",
                },
            },
            required: ["nodeId", "progress", "next_step"],
        };
    }
    async execute(args, agentContext) {
        let nodeId = args.nodeId;
        let agentXml = agentContext.agentChain.agent.xml;
        let node = extractAgentXmlNode(agentXml, nodeId);
        if (node == null) {
            throw new Error("Node ID does not exist: " + nodeId);
        }
        if (node.tagName !== "forEach") {
            throw new Error("Node ID is not a forEach node: " + nodeId);
        }
        let items = node.getAttribute("items");
        let varValue = null;
        let resultText = "Recorded";
        if (items && items != "list") {
            varValue = agentContext.context.variables.get(items.trim());
            if (varValue) {
                let key = "foreach_" + nodeId;
                let loop_count = agentContext.variables.get(key) || 0;
                if (loop_count % 5 == 0) {
                    resultText = `Variable information associated with the current loop task.\nvariable_name: ${items.trim()}\nvariable_value: ${varValue}`;
                }
                agentContext.variables.set(key, ++loop_count);
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: resultText,
                },
            ],
        };
    }
}

const TOOL_NAME$3 = "human_interact";
class HumanInteractTool {
    constructor() {
        this.name = TOOL_NAME$3;
        this.noPlan = true;
        this.description = `AI interacts with humans:
confirm: Ask the user to confirm whether to execute an operation, especially when performing dangerous actions such as deleting system files, users will choose Yes or No.
input: Prompt the user to enter text; for example, when a task is ambiguous, the AI can choose to ask the user for details, and the user can respond by inputting.
select: Allow the user to make a choice; in situations that require selection, the AI can ask the user to make a decision.
request_help: Request assistance from the user; for instance, when an operation is blocked, the AI can ask the user for help, such as needing to log into a website or solve a CAPTCHA or Scan the QR code.`;
        this.parameters = {
            type: "object",
            properties: {
                interactType: {
                    type: "string",
                    description: "The type of interaction with users.",
                    enum: ["confirm", "input", "select", "request_help"],
                },
                prompt: {
                    type: "string",
                    description: "Display prompts to users",
                },
                selectOptions: {
                    type: "array",
                    description: "Options provided to users, this parameter is required when interactType is select.",
                    items: {
                        type: "string",
                    },
                },
                selectMultiple: {
                    type: "boolean",
                    description: "isMultiple, used when interactType is select",
                },
                helpType: {
                    type: "string",
                    description: "Help type, required when interactType is request_help.",
                    enum: ["request_login", "request_assistance"],
                },
            },
            required: ["interactType", "prompt"],
        };
    }
    async execute(args, agentContext) {
        let interactType = args.interactType;
        let callback = agentContext.context.config.callback;
        let resultText = "";
        if (callback) {
            switch (interactType) {
                case "confirm":
                    if (callback.onHumanConfirm) {
                        let result = await callback.onHumanConfirm(agentContext, args.prompt);
                        resultText = `confirm result: ${result ? "Yes" : "No"}`;
                    }
                    break;
                case "input":
                    if (callback.onHumanInput) {
                        let result = await callback.onHumanInput(agentContext, args.prompt);
                        resultText = `input result: ${result}`;
                    }
                    break;
                case "select":
                    if (callback.onHumanSelect) {
                        let result = await callback.onHumanSelect(agentContext, args.prompt, (args.selectOptions || []), (args.selectMultiple || false));
                        resultText = `select result: ${JSON.stringify(result)}`;
                    }
                    break;
                case "request_help":
                    if (callback.onHumanHelp) {
                        if (args.helpType == "request_login" &&
                            (await this.checkIsLogined(agentContext))) {
                            resultText = "Already logged in";
                            break;
                        }
                        let result = await callback.onHumanHelp(agentContext, (args.helpType || "request_assistance"), args.prompt);
                        resultText = `request_help result: ${result ? "Solved" : "Unresolved"}`;
                    }
                    break;
            }
        }
        if (resultText) {
            return {
                content: [
                    {
                        type: "text",
                        text: resultText,
                    },
                ],
            };
        }
        else {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: Unsupported ${interactType} interaction operation`,
                    },
                ],
                isError: true,
            };
        }
    }
    async checkIsLogined(agentContext) {
        let screenshot = agentContext.agent["screenshot"];
        if (!screenshot) {
            return false;
        }
        try {
            let imageResult = (await screenshot.call(agentContext.agent, agentContext));
            let rlm = new RetryLanguageModel(agentContext.context.config.llms, agentContext.agent.Llms);
            let image = toImage(imageResult.imageBase64);
            let request = {
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                image: image,
                                mimeType: imageResult.imageType,
                            },
                            {
                                type: "text",
                                text: "Check if the current website is logged in. If not logged in, output `NOT_LOGIN`. If logged in, output `LOGGED_IN`. Output directly without explanation.",
                            },
                        ],
                    },
                ],
                abortSignal: agentContext.context.controller.signal,
            };
            let result = await rlm.call(request);
            return result.text && result.text.indexOf("LOGGED_IN") > -1;
        }
        catch (error) {
            console.error("Error auto checking login status:", error);
            return false;
        }
    }
}

const TOOL_NAME$2 = "task_node_status";
class TaskNodeStatusTool {
    constructor() {
        this.name = TOOL_NAME$2;
        this.description = `After completing each step of the task, you need to call this tool to update the status of the task node, and think about the tasks to be processed and the next action plan.`;
        this.parameters = {
            type: "object",
            properties: {
                thought: {
                    type: "string",
                    description: "Current thinking content, which can be analysis of the problem, assumptions, insights, reflections, or a summary of the previous, suggest the next action step to be taken, which should be specific, executable, and verifiable."
                },
                doneIds: {
                    type: "array",
                    description: "List of completed node IDs.",
                    items: {
                        type: "number",
                    },
                },
                todoIds: {
                    type: "array",
                    description: "List of pending node IDs.",
                    items: {
                        type: "number",
                    },
                },
            },
            required: ["thought", "doneIds", "todoIds"],
        };
    }
    async execute(args, agentContext) {
        let doneIds = args.doneIds;
        let todoIds = args.todoIds;
        let agentNode = agentContext.agentChain.agent;
        let taskPrompt = agentContext.context.chain.taskPrompt;
        let agentXml = buildAgentRootXml(agentNode.xml, taskPrompt, (nodeId, node) => {
            let done = doneIds.indexOf(nodeId) > -1;
            let todo = todoIds.indexOf(nodeId) > -1;
            if (done && todo) {
                throw new Error("The ID cannot appear in both doneIds and todoIds simultaneously, nodeId: " +
                    nodeId);
            }
            node.setAttribute("status", done ? "done" : "todo");
        });
        return {
            content: [
                {
                    type: "text",
                    text: agentXml,
                },
            ],
        };
    }
}

const TOOL_NAME$1 = "variable_storage";
class VariableStorageTool {
    constructor() {
        this.name = TOOL_NAME$1;
        this.description = `Used for storing, reading, and retrieving variable data, and maintaining input/output variables in task nodes.`;
        this.parameters = {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    description: "variable storage operation type.",
                    enum: ["read_variable", "write_variable", "list_all_variable"],
                },
                name: {
                    type: "string",
                    description: "variable name, required when reading and writing variables, If reading variables, it supports reading multiple variables separated by commas.",
                },
                value: {
                    type: "string",
                    description: "variable value, required when writing variables",
                },
            },
            required: ["operation"],
        };
    }
    async execute(args, agentContext) {
        let operation = args.operation;
        let resultText = "";
        switch (operation) {
            case "read_variable": {
                if (!args.name) {
                    resultText = "Error: name is required";
                }
                else {
                    let result = {};
                    let name = args.name;
                    let keys = name.split(",");
                    for (let i = 0; i < keys.length; i++) {
                        let key = keys[i].trim();
                        let value = agentContext.context.variables.get(key);
                        result[key] = value;
                    }
                    resultText = JSON.stringify(result);
                }
                break;
            }
            case "write_variable": {
                if (!args.name) {
                    resultText = "Error: name is required";
                    break;
                }
                if (args.value == undefined) {
                    resultText = "Error: value is required";
                    break;
                }
                let key = args.name;
                agentContext.context.variables.set(key.trim(), args.value);
                resultText = "success";
                break;
            }
            case "list_all_variable": {
                resultText = JSON.stringify(Object.keys(agentContext.context.variables));
                break;
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: resultText || "",
                },
            ],
        };
    }
}

const TOOL_NAME = "watch_trigger";
const watch_system_prompt = `You are a tool for detecting element changes. Given a task description, compare two images to determine whether the changes described in the task have occurred.
If the changes have occurred, return an json with \`changed\` set to true and \`changeInfo\` containing a description of the changes. If no changes have occurred, return an object with \`changed\` set to false.

## Example
User: Monitor new messages in group chat
### No changes detected
Output:
{
  "changed": false
}
### Change detected
Output:
{
  "changed": true,
  "changeInfo": "New message received in the group chat. The message content is: 'Hello, how are you?'"
}`;
class WatchTriggerTool {
    constructor() {
        this.name = TOOL_NAME;
        this.description = `When executing the \`watch\` node, please use it to monitor DOM element changes, it will block the listener until the element changes or times out.`;
        this.parameters = {
            type: "object",
            properties: {
                nodeId: {
                    type: "number",
                    description: "watch node ID.",
                },
                watch_area: {
                    type: "array",
                    description: "Element changes in monitoring area, eg: [x, y, width, height].",
                    items: {
                        type: "number",
                    },
                },
                watch_index: {
                    type: "array",
                    description: "The index of elements to be monitoring multiple elements simultaneously.",
                    items: {
                        type: "number",
                    },
                },
                frequency: {
                    type: "number",
                    description: "Check frequency, how many seconds between each check, default 1 seconds.",
                    default: 1,
                    minimum: 0.5,
                    maximum: 30,
                },
                timeout: {
                    type: "number",
                    description: "Timeout in minute, default 5 minutes.",
                    default: 5,
                    minimum: 1,
                    maximum: 30,
                },
            },
            required: ["nodeId"],
        };
    }
    async execute(args, agentContext) {
        let nodeId = args.nodeId;
        let agentXml = agentContext.agentChain.agent.xml;
        let node = extractAgentXmlNode(agentXml, nodeId);
        if (node == null) {
            throw new Error("Node ID does not exist: " + nodeId);
        }
        if (node.tagName !== "watch") {
            throw new Error("Node ID is not a watch node: " + nodeId);
        }
        let task_description = node.getElementsByTagName("description")[0]?.textContent || "";
        if (!task_description) {
            return {
                content: [
                    {
                        type: "text",
                        text: "The watch node does not have a description, skip.",
                    },
                ],
            };
        }
        await this.init_eko_observer(agentContext);
        const image1 = await this.get_screenshot(agentContext);
        const start = new Date().getTime();
        const timeout = (args.timeout || 5) * 60000;
        const frequency = Math.max(500, (args.frequency || 1) * 1000);
        let rlm = new RetryLanguageModel(agentContext.context.config.llms, agentContext.agent.Llms);
        while (new Date().getTime() - start < timeout) {
            await agentContext.context.checkAborted();
            await new Promise((resolve) => setTimeout(resolve, frequency));
            let changed = await this.has_eko_changed(agentContext);
            if (changed == "false") {
                continue;
            }
            await this.init_eko_observer(agentContext);
            const image2 = await this.get_screenshot(agentContext);
            const changeResult = await this.is_dom_change(agentContext, rlm, image1, image2, task_description);
            if (changeResult.changed) {
                return {
                    content: [
                        {
                            type: "text",
                            text: changeResult.changeInfo || "DOM change detected.",
                        },
                    ],
                };
            }
        }
        return {
            content: [
                {
                    type: "text",
                    text: "Timeout reached, no DOM changes detected.",
                },
            ],
        };
    }
    async get_screenshot(agentContext) {
        const screenshot = agentContext.agent["screenshot"];
        const imageResult = (await screenshot.call(agentContext.agent, agentContext));
        const image = toImage(imageResult.imageBase64);
        return {
            image: image,
            imageType: imageResult.imageType,
        };
    }
    async init_eko_observer(agentContext) {
        try {
            const screenshot = agentContext.agent["execute_script"];
            await screenshot.call(agentContext.agent, agentContext, () => {
                let _window = window;
                _window.has_eko_changed = false;
                _window.eko_observer && _window.eko_observer.disconnect();
                let eko_observer = new MutationObserver(function (mutations) {
                    _window.has_eko_changed = true;
                });
                eko_observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeOldValue: true,
                    characterData: true,
                    characterDataOldValue: true,
                });
                _window.eko_observer = eko_observer;
            }, []);
        }
        catch (error) {
            console.error("Error initializing Eko observer:", error);
        }
    }
    async has_eko_changed(agentContext) {
        try {
            const screenshot = agentContext.agent["execute_script"];
            let result = (await screenshot.call(agentContext.agent, agentContext, () => {
                return window.has_eko_changed + "";
            }, []));
            return result;
        }
        catch (e) {
            console.error("Error checking Eko change:", e);
            return "undefined";
        }
    }
    async is_dom_change(agentContext, rlm, image1, image2, task_description) {
        try {
            let request = {
                messages: [
                    {
                        role: "system",
                        content: watch_system_prompt,
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                image: image1.image,
                                mimeType: image1.imageType,
                            },
                            {
                                type: "image",
                                image: image2.image,
                                mimeType: image2.imageType,
                            },
                            {
                                type: "text",
                                text: task_description,
                            },
                        ],
                    },
                ],
                abortSignal: agentContext.context.controller.signal,
            };
            const result = await rlm.call(request);
            let resultText = result.text || "{}";
            resultText = resultText.substring(resultText.indexOf("{"), resultText.lastIndexOf("}") + 1);
            return JSON.parse(resultText);
        }
        catch (error) {
            Log.error("Error in is_dom_change:", error);
        }
        return {
            changed: false,
        };
    }
}

class McpTool {
    constructor(toolWrapper) {
        this.toolWrapper = toolWrapper;
        this.name = toolWrapper.name;
        this.description = toolWrapper.getTool().description;
        this.parameters = toolWrapper.getTool().parameters;
    }
    async execute(args, agentContext, toolCall) {
        return this.toolWrapper.callTool(args, agentContext, toolCall);
    }
}

const AGENT_SYSTEM_TEMPLATE = `
You are {name}, an autonomous AI agent for {agent} agent.
Current datetime: {datetime}

# Task Description
{description}
{prompt}

# User input task instructions
<root>
  <!-- Main task, completed through the collaboration of multiple Agents -->
  <mainTask>main task</mainTask>
  <!-- The tasks that the current agent needs to complete, the current agent only needs to complete the currentTask -->
  <currentTask>specific task</currentTask>
  <!-- Complete the corresponding step nodes of the task, Only for reference -->
  <nodes>
    <!-- node supports input/output variables to pass dependencies -->
    <node input="variable name" output="variable name" status="todo / done">task step node</node>{nodePrompt}
  </nodes>
</root>

The output language should follow the language corresponding to the user's task.
`;
const HUMAN_PROMPT = `
* HUMAN INTERACT
During the task execution process, you can use the \`${TOOL_NAME$3}\` tool to interact with humans.
`;
const VARIABLE_PROMPT = `
* VARIABLE STORAGE
If you need to read and write the input/output variables in the node, require the use of the \`${TOOL_NAME$1}\` tool.
`;
const FOR_EACH_NODE = `
    <!-- duplicate task node, items support list and variable -->
    <forEach items="list or variable name">
      <node>forEach item step node</node>
    </forEach>`;
const FOR_EACH_PROMPT = `
* forEach node
repetitive tasks, when executing to the forEach node, require the use of the \`${TOOL_NAME$4}\` tool.
`;
const WATCH_NODE = `
    <!-- monitor task node, the loop attribute specifies whether to listen in a loop or listen once -->
    <watch event="dom" loop="true">
      <description>Monitor task description</description>
      <trigger>
        <node>Trigger step node</node>
        <node>...</node>
      </trigger>
    </watch>`;
const WATCH_PROMPT = `
* watch node
monitor changes in webpage DOM elements, when executing to the watch node, require the use of the \`${TOOL_NAME}\` tool.
`;
function getAgentSystemPrompt(agent, agentNode, context, tools, extSysPrompt) {
    let prompt = "";
    let nodePrompt = "";
    tools = tools || agent.Tools;
    let agentNodeXml = agentNode.xml;
    let hasWatchNode = agentNodeXml.indexOf("</watch>") > -1;
    let hasForEachNode = agentNodeXml.indexOf("</forEach>") > -1;
    let hasHumanTool = tools.filter((tool) => tool.name == TOOL_NAME$3).length > 0;
    let hasVariable = agentNodeXml.indexOf("input=") > -1 ||
        agentNodeXml.indexOf("output=") > -1 ||
        tools.filter((tool) => tool.name == TOOL_NAME$1).length > 0;
    if (hasHumanTool) {
        prompt += HUMAN_PROMPT;
    }
    if (hasVariable) {
        prompt += VARIABLE_PROMPT;
    }
    if (hasForEachNode) {
        if (tools.filter((tool) => tool.name == TOOL_NAME$4).length > 0) {
            prompt += FOR_EACH_PROMPT;
        }
        nodePrompt += FOR_EACH_NODE;
    }
    if (hasWatchNode) {
        if (tools.filter((tool) => tool.name == TOOL_NAME).length > 0) {
            prompt += WATCH_PROMPT;
        }
        nodePrompt += WATCH_NODE;
    }
    if (extSysPrompt && extSysPrompt.trim()) {
        prompt += "\n" + extSysPrompt.trim() + "\n";
    }
    if (context.chain.agents.length > 1) {
        prompt += "\n Main task: " + context.chain.taskPrompt;
        prompt += "\n\n# Pre-task execution results";
        for (let i = 0; i < context.chain.agents.length; i++) {
            let agentChain = context.chain.agents[i];
            if (agentChain.agentResult) {
                prompt += `\n## ${agentChain.agent.task || agentChain.agent.name}\n${sub(agentChain.agentResult, 500)}`;
            }
        }
    }
    if (prompt) {
        prompt = "\n" + prompt.trim();
    }
    return AGENT_SYSTEM_TEMPLATE.replace("{name}", config.name)
        .replace("{agent}", agent.Name)
        .replace("{description}", agent.Description)
        .replace("{datetime}", new Date().toLocaleString())
        .replace("{prompt}", prompt)
        .replace("{nodePrompt}", nodePrompt)
        .trim();
}
function getAgentUserPrompt(agent, agentNode, context, tools) {
    let hasTaskNodeStatusTool = (tools || agent.Tools).filter((tool) => tool.name == TOOL_NAME$2)
        .length > 0;
    return buildAgentRootXml(agentNode.xml, context.chain.taskPrompt, (nodeId, node) => {
        if (hasTaskNodeStatusTool) {
            node.setAttribute("status", "todo");
        }
    });
}

class Agent {
    constructor(params) {
        this.tools = [];
        this.name = params.name;
        this.description = params.description;
        this.tools = params.tools;
        this.llms = params.llms;
        this.mcpClient = params.mcpClient;
        this.planDescription = params.planDescription;
    }
    async run(context, agentChain) {
        let mcpClient = this.mcpClient || context.config.defaultMcpClient;
        let agentContext = new AgentContext(context, this, agentChain);
        try {
            mcpClient && !mcpClient.isConnected() && (await mcpClient.connect());
            return this.runWithContext(agentContext, mcpClient, config.maxReactNum);
        }
        finally {
            mcpClient && (await mcpClient.close());
        }
    }
    async runWithContext(agentContext, mcpClient, maxReactNum = 100) {
        let loopNum = 0;
        let context = agentContext.context;
        let agentNode = agentContext.agentChain.agent;
        const tools = [...this.tools, ...this.system_auto_tools(agentNode)];
        let messages = [
            {
                role: "system",
                content: await this.buildSystemPrompt(agentContext, tools),
            },
            {
                role: "user",
                content: await this.buildUserPrompt(agentContext, tools),
            },
        ];
        let rlm = new RetryLanguageModel(context.config.llms, this.llms);
        let agentTools = tools;
        while (loopNum < maxReactNum) {
            await context.checkAborted();
            if (mcpClient) {
                let controlMcp = await this.controlMcpTools(agentContext, messages, loopNum);
                if (controlMcp.mcpTools) {
                    let mcpTools = await this.listTools(context, mcpClient, agentNode, controlMcp.mcpParams);
                    let usedTools = extractUsedTool(messages, agentTools);
                    let _agentTools = mergeTools(tools, usedTools);
                    agentTools = mergeTools(_agentTools, mcpTools);
                }
            }
            await this.handleMessages(agentContext, messages, tools);
            let results = await callLLM(agentContext, rlm, messages, this.convertTools(agentTools), false, undefined, false, this.callback);
            let finalResult = await this.handleCallResult(agentContext, messages, agentTools, results);
            if (finalResult) {
                return finalResult;
            }
            loopNum++;
        }
        return "Unfinished";
    }
    async handleCallResult(agentContext, messages, agentTools, results) {
        let text = null;
        let context = agentContext.context;
        let user_messages = [];
        let toolResults = [];
        results = removeDuplicateToolUse(results);
        if (results.length == 0) {
            return null;
        }
        for (let i = 0; i < results.length; i++) {
            let result = results[i];
            if (result.type == "text") {
                text = result.text;
                continue;
            }
            let toolResult;
            let toolChain = new ToolChain(result, agentContext.agentChain.agentRequest);
            agentContext.agentChain.push(toolChain);
            try {
                let args = typeof result.args == "string"
                    ? JSON.parse(result.args || "{}")
                    : result.args || {};
                toolChain.params = args;
                let tool = this.getTool(agentTools, result.toolName);
                if (!tool) {
                    throw new Error(result.toolName + " tool does not exist");
                }
                toolResult = await tool.execute(args, agentContext, result);
                toolChain.updateToolResult(toolResult);
                agentContext.consecutiveErrorNum = 0;
            }
            catch (e) {
                Log.error("tool call error: ", result.toolName, result.args, e);
                toolResult = {
                    content: [
                        {
                            type: "text",
                            text: e + "",
                        },
                    ],
                    isError: true,
                };
                toolChain.updateToolResult(toolResult);
                if (++agentContext.consecutiveErrorNum >= 10) {
                    throw e;
                }
            }
            const callback = this.callback || context.config.callback;
            if (callback) {
                await callback.onMessage({
                    taskId: context.taskId,
                    agentName: agentContext.agent.Name,
                    nodeId: agentContext.agentChain.agent.id,
                    type: "tool_result",
                    toolId: result.toolCallId,
                    toolName: result.toolName,
                    params: result.args || {},
                    toolResult: toolResult,
                }, agentContext);
            }
            let llmToolResult = this.convertToolResult(result, toolResult, user_messages);
            toolResults.push(llmToolResult);
        }
        messages.push({
            role: "assistant",
            content: results,
        });
        if (toolResults.length > 0) {
            messages.push({
                role: "tool",
                content: toolResults,
            });
            user_messages.forEach((message) => messages.push(message));
            return null;
        }
        else {
            return text;
        }
    }
    system_auto_tools(agentNode) {
        let tools = [];
        let agentNodeXml = agentNode.xml;
        let hasVariable = agentNodeXml.indexOf("input=") > -1 ||
            agentNodeXml.indexOf("output=") > -1;
        if (hasVariable) {
            tools.push(new VariableStorageTool());
        }
        let hasForeach = agentNodeXml.indexOf("</forEach>") > -1;
        if (hasForeach) {
            tools.push(new ForeachTaskTool());
        }
        let hasWatch = agentNodeXml.indexOf("</watch>") > -1;
        if (hasWatch) {
            tools.push(new WatchTriggerTool());
        }
        let toolNames = this.tools.map((tool) => tool.name);
        return tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
    }
    async buildSystemPrompt(agentContext, tools) {
        return getAgentSystemPrompt(this, agentContext.agentChain.agent, agentContext.context, tools, await this.extSysPrompt(agentContext, tools));
    }
    async buildUserPrompt(agentContext, tools) {
        return [
            {
                type: "text",
                text: getAgentUserPrompt(this, agentContext.agentChain.agent, agentContext.context, tools),
            },
        ];
    }
    async extSysPrompt(agentContext, tools) {
        return "";
    }
    async listTools(context, mcpClient, agentNode, mcpParams) {
        try {
            if (!mcpClient.isConnected()) {
                await mcpClient.connect();
            }
            let list = await mcpClient.listTools({
                taskId: context.taskId,
                nodeId: agentNode?.id,
                environment: config.platform,
                agent_name: agentNode?.name || this.name,
                params: {},
                prompt: agentNode?.task || context.chain.taskPrompt,
                ...(mcpParams || {}),
            });
            let mcpTools = [];
            for (let i = 0; i < list.length; i++) {
                let toolSchema = list[i];
                let execute = this.toolExecuter(mcpClient, toolSchema.name);
                let toolWrapper = new ToolWrapper(toolSchema, execute);
                mcpTools.push(new McpTool(toolWrapper));
            }
            return mcpTools;
        }
        catch (e) {
            Log.error("Mcp listTools error", e);
            return [];
        }
    }
    async controlMcpTools(agentContext, messages, loopNum) {
        return {
            mcpTools: loopNum == 0,
        };
    }
    toolExecuter(mcpClient, name) {
        return {
            execute: async function (args, agentContext) {
                return await mcpClient.callTool({
                    name: name,
                    arguments: args,
                    extInfo: {
                        taskId: agentContext.context.taskId,
                        nodeId: agentContext.agentChain.agent.id,
                        environment: config.platform,
                        agent_name: agentContext.agent.Name,
                    },
                });
            },
        };
    }
    convertTools(tools) {
        return tools.map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        }));
    }
    getTool(tools, name) {
        for (let i = 0; i < tools.length; i++) {
            if (tools[i].name == name) {
                return tools[i];
            }
        }
        return null;
    }
    convertToolResult(toolUse, toolResult, user_messages) {
        let text = "";
        for (let i = 0; i < toolResult.content.length; i++) {
            let content = toolResult.content[i];
            if (content.type == "text") {
                text += (text.length > 0 ? "\n" : "") + content.text;
            }
            else {
                // Only the calude model supports returning images from tool results, while openai only supports text,
                // Compatible with other AI models that do not support tool results as images.
                user_messages.push({
                    role: "user",
                    content: [
                        {
                            type: "image",
                            image: toImage(content.data),
                            mimeType: content.mimeType,
                        },
                        { type: "text", text: `call \`${toolUse.toolName}\` tool result` },
                    ],
                });
            }
        }
        let isError = toolResult.isError == true;
        if (isError && !text.startsWith("Error")) {
            text = "Error: " + text;
        }
        else if (!isError && text.length == 0) {
            text = "Successful";
        }
        let contentText = {
            type: "text",
            text: text,
        };
        let result = text;
        if (text &&
            ((text.startsWith("{") && text.endsWith("}")) ||
                (text.startsWith("[") && text.endsWith("]")))) {
            try {
                result = JSON.parse(text);
                contentText = null;
            }
            catch (e) { }
        }
        return {
            type: "tool-result",
            toolCallId: toolUse.toolCallId,
            toolName: toolUse.toolName,
            result: result,
            content: contentText ? [contentText] : undefined,
            isError: isError,
        };
    }
    async handleMessages(agentContext, messages, tools) {
        // Only keep the last image / file, large tool-text-result
        handleLargeContextMessages(messages);
        // User dialogue
        const userPrompts = agentContext.context.conversation
            .splice(0, agentContext.context.conversation.length)
            .filter((s) => !!s);
        if (userPrompts.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role == "user") {
                for (let i = 0; i < userPrompts.length; i++) {
                    lastMessage.content.push({
                        type: "text",
                        text: userPrompts[i],
                    });
                }
            }
            else {
                messages.push({
                    role: "user",
                    content: userPrompts.map((s) => {
                        return { type: "text", text: s };
                    }),
                });
            }
        }
    }
    async callInnerTool(fun) {
        let result = await fun();
        return {
            content: [
                {
                    type: "text",
                    text: result
                        ? typeof result == "string"
                            ? result
                            : JSON.stringify(result)
                        : "Successful",
                },
            ],
        };
    }
    async loadTools(context) {
        if (this.mcpClient) {
            let mcpTools = await this.listTools(context, this.mcpClient);
            if (mcpTools && mcpTools.length > 0) {
                return mergeTools(this.tools, mcpTools);
            }
        }
        return this.tools;
    }
    addTool(tool) {
        this.tools.push(tool);
    }
    get Llms() {
        return this.llms;
    }
    get Name() {
        return this.name;
    }
    get Description() {
        return this.description;
    }
    get Tools() {
        return this.tools;
    }
    get PlanDescription() {
        return this.planDescription;
    }
    get McpClient() {
        return this.mcpClient;
    }
}
async function callLLM(agentContext, rlm, messages, tools, noCompress, toolChoice, retry, callback) {
    let context = agentContext.context;
    let agentChain = agentContext.agentChain;
    let agentNode = agentChain.agent;
    let streamCallback = callback ||
        context.config.callback || {
        onMessage: async () => { },
    };
    let request = {
        tools: tools,
        toolChoice,
        messages: messages,
        abortSignal: context.controller.signal,
    };
    agentChain.agentRequest = request;
    let result = await rlm.callStream(request);
    let streamText = "";
    let thinkText = "";
    let toolArgsText = "";
    let streamId = uuidv4();
    let textStreamDone = false;
    let toolParts = [];
    const reader = result.stream.getReader();
    try {
        while (true) {
            await context.checkAborted();
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            let chunk = value;
            switch (chunk.type) {
                case "text-delta": {
                    streamText += chunk.textDelta || "";
                    await streamCallback.onMessage({
                        taskId: context.taskId,
                        agentName: agentNode.name,
                        nodeId: agentNode.id,
                        type: "text",
                        streamId,
                        streamDone: false,
                        text: streamText,
                    }, agentContext);
                    break;
                }
                case "reasoning": {
                    thinkText += chunk.textDelta || "";
                    await streamCallback.onMessage({
                        taskId: context.taskId,
                        agentName: agentNode.name,
                        nodeId: agentNode.id,
                        type: "thinking",
                        streamId,
                        streamDone: false,
                        text: thinkText,
                    }, agentContext);
                    break;
                }
                case "tool-call-delta": {
                    if (!textStreamDone) {
                        textStreamDone = true;
                        await streamCallback.onMessage({
                            taskId: context.taskId,
                            agentName: agentNode.name,
                            nodeId: agentNode.id,
                            type: "text",
                            streamId,
                            streamDone: true,
                            text: streamText,
                        }, agentContext);
                    }
                    toolArgsText += chunk.argsTextDelta || "";
                    await streamCallback.onMessage({
                        taskId: context.taskId,
                        agentName: agentNode.name,
                        nodeId: agentNode.id,
                        type: "tool_streaming",
                        toolId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        paramsText: toolArgsText,
                    }, agentContext);
                    break;
                }
                case "tool-call": {
                    toolArgsText = "";
                    let args = chunk.args ? JSON.parse(chunk.args) : {};
                    let message = {
                        taskId: context.taskId,
                        agentName: agentNode.name,
                        nodeId: agentNode.id,
                        type: "tool_use",
                        toolId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        params: args,
                    };
                    await streamCallback.onMessage(message, agentContext);
                    toolParts.push({
                        type: "tool-call",
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        args: message.params || args,
                    });
                    break;
                }
                case "file": {
                    await streamCallback.onMessage({
                        taskId: context.taskId,
                        agentName: agentNode.name,
                        nodeId: agentNode.id,
                        type: "file",
                        mimeType: chunk.mimeType,
                        data: chunk.data,
                    }, agentContext);
                    break;
                }
                case "error": {
                    Log.error(`${agentNode.name} agent error: `, chunk);
                    await streamCallback.onMessage({
                        taskId: context.taskId,
                        agentName: agentNode.name,
                        nodeId: agentNode.id,
                        type: "error",
                        error: chunk.error,
                    }, agentContext);
                    throw new Error("Plan Error");
                }
                case "finish": {
                    if (!textStreamDone) {
                        textStreamDone = true;
                        await streamCallback.onMessage({
                            taskId: context.taskId,
                            agentName: agentNode.name,
                            nodeId: agentNode.id,
                            type: "text",
                            streamId,
                            streamDone: true,
                            text: streamText,
                        }, agentContext);
                    }
                    await streamCallback.onMessage({
                        taskId: context.taskId,
                        agentName: agentNode.name,
                        nodeId: agentNode.id,
                        type: "finish",
                        finishReason: chunk.finishReason,
                        usage: chunk.usage,
                    }, agentContext);
                    if (chunk.finishReason === "length" &&
                        messages.length >= 10 &&
                        !noCompress &&
                        !retry) {
                        await compressAgentMessages(agentContext, rlm, messages, tools);
                        return callLLM(agentContext, rlm, messages, tools, noCompress, toolChoice, true, streamCallback);
                    }
                    break;
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
    agentChain.agentResult = streamText;
    return streamText
        ? [
            { type: "text", text: streamText },
            ...toolParts,
        ]
        : toolParts;
}

const AGENT_NAME$5 = "Chat";
class BaseChatAgent extends Agent {
    constructor(llms, ext_tools, mcpClient) {
        super({
            name: AGENT_NAME$5,
            description: "You are a helpful assistant.",
            tools: ext_tools || [],
            llms: llms,
            mcpClient: mcpClient,
            planDescription: "Chat assistant, handles non-task related conversations. Please use it to reply when the task does not involve operations with other agents.",
        });
    }
}

const PLAN_SYSTEM_TEMPLATE = `
You are {name}, an autonomous AI Agent Planner.
Current datetime: {datetime}

## Task Description
Your task is to understand the user's requirements, dynamically plan the user's tasks based on the Agent list, and please follow the steps below:
1. Understand the user's requirements.
2. Analyze the Agents that need to be used based on the user's requirements.
3. Generate the Agent calling plan based on the analysis results.
4. About agent name, please do not arbitrarily fabricate non-existent agent names.
5. You only need to provide the steps to complete the user's task, key steps only, no need to be too detailed.
6. Please strictly follow the output format and example output.
7. The output language should follow the language corresponding to the user's task.

## Agent list
{agents}

## Output Rules and Format
<root>
  <name>Task Name</name>
  <thought>Your thought process on user demand planning</thought>
  <!-- Multiple Agents work together to complete the task -->
  <agents>
    <!-- The required Agent, where the name can only be an available name in the Agent list -->
    <agent name="Agent name">
      <!-- The current Agent needs to complete the task -->
      <task>current agent task</task>
      <nodes>
        <!-- Nodes support input/output variables for parameter passing and dependency handling in multi-agent collaboration. -->
        <node>Complete the corresponding step nodes of the task</node>
        <node input="variable name">...</node>
        <node output="variable name">...</node>
        <!-- When including duplicate tasks, \`forEach\` can be used -->
        <forEach items="list or variable name">
          <node>forEach step node</node>
        </forEach>
        <!-- When you need to monitor changes in webpage DOM elements, you can use \`Watch\`, the loop attribute specifies whether to listen in a loop or listen once. -->
        <watch event="dom" loop="true">
          <description>Monitor task description</description>
          <trigger>
            <node>Trigger step node</node>
            <node>...</node>
          </trigger>
        </watch>
      </nodes>
    </agent>
  </agents>
</root>

{example_prompt}
`;
const PLAN_CHAT_EXAMPLE = `User: hello.
Output result:
<root>
  <name>Chat</name>
  <thought>Alright, the user wrote "hello". That's pretty straightforward. I need to respond in a friendly and welcoming manner.</thought>
  <agents>
    <!-- Chat agents can exist without the <task> and <nodes> nodes. -->
    <agent name="Chat"></agent>
  </agents>
</root>`;
const PLAN_EXAMPLE_LIST = [
    `User: Open Boss Zhipin, find 10 operation positions in Chengdu, and send a personal introduction to the recruiters based on the page information.
Output result:
<root>
  <name>Submit resume</name>
  <thought>OK, now the user requests me to create a workflow that involves opening the Boss Zhipin website, finding 10 operation positions in Chengdu, and sending personal resumes to the recruiters based on the job information.</thought>
  <agents>
    <agent name="Browser">
      <task>Open Boss Zhipin, find 10 operation positions in Chengdu, and send a personal introduction to the recruiters based on the page information.</task>
      <nodes>
        <node>Open Boss Zhipin, enter the job search page</node>
        <node>Set the regional filter to Chengdu and search for operational positions.</node>
        <node>Brows the job list and filter out 10 suitable operation positions.</node>
        <forEach items="list">
          <node>Analyze job requirements</node>
          <node>Send a self-introduction to the recruiter</node>
        </forEach>
      </nodes>
    </agent>
  </agents>
</root>`,
    `User: Every morning, help me collect the latest AI news, summarize it, and send it to the "AI Daily Morning Report" group chat on WeChat.
Output result:
<root>
  <name>AI Daily Morning Report</name>
  <thought>OK, the user needs to collect the latest AI news every morning, summarize it, and send it to a WeChat group named "AI Daily Morning Report" This requires automation, including the steps of data collection, processing, and distribution.</thought>
  <agents>
    <agent name="Timer">
      <task>Timing: every morning</task>
    </agent>
    <agent name="Browser">
      <task>Search for the latest updates on AI</task>
      <nodes>
        <node>Open Google</node>
        <node>Search for the latest updates on AI</node>
        <forEach items="list">
          <node>View Details</node>
        </forEach>
        <node output="summaryInfo">Summarize search information</node>
      </nodes>
    </agent>
    <agent name="Computer">
      <task>Send a message to the WeChat group chat "AI Daily Morning Report"</task>
      <nodes>
        <node>Open WeChat</node>
        <node>Search for the "AI Daily Morning Report" chat group</node>
        <node input="summaryInfo">Send summary message</node>
      </nodes>
    </agent>
  </agents>
</root>`,
    `User: Access the Google team's organization page on GitHub, extract all developer accounts from the team, and compile statistics on the countries and regions where these developers are located.
Output result:
<root>
  <name>Statistics of Google Team Developers' Geographic Distribution</name>
  <thought>Okay, I need to first visit GitHub, then find Google's organization page on GitHub, extract the team member list, and individually visit each developer's homepage to obtain location information for each developer. This requires using a browser to complete all operations.</thought>
  <agents>
    <agent name="Browser">
      <task>Visit Google GitHub Organization Page and Analyze Developer Geographic Distribution</task>
      <nodes>
        <node>Visit https://github.com/google</node>
        <node>Click "People" tab to view team members</node>
        <node>Scroll the page to load all developer information</node>
        <node output="developers">Extract all developer account information</node>
        <forEach items="developers">
          <node>Visit developer's homepage</node>
          <node>Extract developer's location information</node>
        </forEach>
        <node>Compile and analyze the geographic distribution data of all developers</node>
      </nodes>
    </agent>
  </agents>
</root>`,
    `User: Open Discord to monitor messages in Group A, and automatically reply when new messages are received.
Output result:
<root>
  <name>Automatic reply to Discord messages</name>
  <thought>OK, monitor the chat messages in Discord group A and automatically reply.</thought>
  <agents>
    <agent name="Browser">
      <task>Open Group A in Discord</task>
      <nodes>
        <node>Open Discord page</node>
        <node>Find and open Group A</node>
        <watch event="dom" loop="true">
          <description>Monitor new messages in group chat</description>
          <trigger>
            <node>Analyze message content</node>
            <node>Automatic reply to new messages</node>
          </trigger>
        </watch>
      </nodes>
    </agent>
  </agents>
</root>`,
];
const PLAN_USER_TEMPLATE = `
User Platform: {platform}
Task Description: {task_prompt}
`;
const PLAN_USER_TASK_WEBSITE_TEMPLATE = `
User Platform: {platform}
Task Website: {task_website}
Task Description: {task_prompt}
`;
async function getPlanSystemPrompt(context) {
    let agents_prompt = "";
    let agents = context.agents;
    for (let i = 0; i < agents.length; i++) {
        let agent = agents[i];
        let tools = await agent.loadTools(context);
        agents_prompt +=
            `<agent name="${agent.Name}">\n` +
                `Description: ${agent.PlanDescription || agent.Description}\n` +
                "Tools:\n" +
                tools
                    .filter((tool) => !tool.noPlan)
                    .map((tool) => `  - ${tool.name}: ${tool.planDescription || tool.description || ""}`)
                    .join("\n") +
                "\n</agent>\n\n";
    }
    let example_prompt = "";
    let hasChatAgent = context.agents.filter((a) => a.Name == AGENT_NAME$5).length > 0;
    const example_list = hasChatAgent
        ? [PLAN_CHAT_EXAMPLE, ...PLAN_EXAMPLE_LIST]
        : [...PLAN_EXAMPLE_LIST];
    for (let i = 0; i < example_list.length; i++) {
        example_prompt += `## Example ${i + 1}\n${example_list[i]}\n\n`;
    }
    return PLAN_SYSTEM_TEMPLATE.replace("{name}", config.name)
        .replace("{agents}", agents_prompt.trim())
        .replace("{datetime}", new Date().toLocaleString())
        .replace("{example_prompt}", example_prompt)
        .trim();
}
function getPlanUserPrompt(task_prompt, task_website, ext_prompt) {
    let prompt = "";
    if (task_website) {
        prompt = PLAN_USER_TASK_WEBSITE_TEMPLATE.replace("{task_prompt}", task_prompt)
            .replace("{platform}", config.platform)
            .replace("{task_website}", task_website);
    }
    else {
        prompt = PLAN_USER_TEMPLATE.replace("{task_prompt}", task_prompt)
            .replace("{platform}", config.platform);
    }
    prompt = prompt.trim();
    if (ext_prompt) {
        prompt += `\n${ext_prompt.trim()}`;
    }
    return prompt;
}

var plan = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getPlanSystemPrompt: getPlanSystemPrompt,
    getPlanUserPrompt: getPlanUserPrompt
});

class Planner {
    constructor(context, taskId) {
        this.context = context;
        this.taskId = taskId;
    }
    async plan(taskPrompt) {
        return await this.doPlan(taskPrompt, false);
    }
    async replan(taskPrompt) {
        return await this.doPlan(taskPrompt, true);
    }
    async doPlan(taskPrompt, replan = false) {
        let config = this.context.config;
        let chain = this.context.chain;
        let rlm = new RetryLanguageModel(config.llms, config.planLlms);
        let messages;
        if (replan && chain.planRequest && chain.planResult) {
            messages = [
                ...chain.planRequest.messages,
                {
                    role: "assistant",
                    content: [{ type: "text", text: chain.planResult }],
                },
                {
                    role: "user",
                    content: [{ type: "text", text: taskPrompt }],
                },
            ];
        }
        else {
            messages = [
                {
                    role: "system",
                    content: await getPlanSystemPrompt(this.context),
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: getPlanUserPrompt(taskPrompt, this.context.variables.get("task_website"), this.context.variables.get("plan_ext_prompt")),
                        },
                    ],
                },
            ];
        }
        let request = {
            maxTokens: 4096,
            temperature: 0.7,
            messages: messages,
            abortSignal: this.context.controller.signal,
        };
        let result = await rlm.callStream(request);
        const reader = result.stream.getReader();
        let streamText = "";
        try {
            while (true) {
                await this.context.checkAborted();
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                let chunk = value;
                if (chunk.type == "error") {
                    Log.error("Plan Error: ", chunk);
                    throw new Error("Plan Error");
                }
                if (chunk.type == "text-delta") {
                    streamText += chunk.textDelta || "";
                }
                if (config.callback) {
                    let workflow = parseWorkflow(this.taskId, streamText, false);
                    if (workflow) {
                        await config.callback.onMessage({
                            taskId: this.taskId,
                            agentName: "Planer",
                            type: "workflow",
                            streamDone: false,
                            workflow: workflow,
                        });
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
            Log.info("Planner result: \n" + streamText);
        }
        chain.planRequest = request;
        chain.planResult = streamText;
        let workflow = parseWorkflow(this.taskId, streamText, true);
        if (config.callback) {
            await config.callback.onMessage({
                taskId: this.taskId,
                agentName: "Planer",
                type: "workflow",
                streamDone: true,
                workflow: workflow,
            });
        }
        workflow.taskPrompt = taskPrompt;
        return workflow;
    }
}

class Eko {
    constructor(config) {
        this.config = config;
        this.taskMap = new Map();
    }
    async generate(taskPrompt, taskId = uuidv4(), contextParams) {
        const agents = [...(this.config.agents || [])];
        let chain = new Chain(taskPrompt);
        let context = new Context(taskId, this.config, agents, chain);
        if (contextParams) {
            Object.keys(contextParams).forEach((key) => context.variables.set(key, contextParams[key]));
        }
        try {
            this.taskMap.set(taskId, context);
            if (this.config.a2aClient) {
                let a2aList = await this.config.a2aClient.listAgents(taskPrompt);
                context.agents = mergeAgents(context.agents, a2aList);
            }
            let planner = new Planner(context, taskId);
            context.workflow = await planner.plan(taskPrompt);
            return context.workflow;
        }
        catch (e) {
            this.deleteTask(taskId);
            throw e;
        }
    }
    async modify(taskId, modifyTaskPrompt) {
        let context = this.taskMap.get(taskId);
        if (!context) {
            return await this.generate(modifyTaskPrompt, taskId);
        }
        if (this.config.a2aClient) {
            let a2aList = await this.config.a2aClient.listAgents(modifyTaskPrompt);
            context.agents = mergeAgents(context.agents, a2aList);
        }
        let planner = new Planner(context, taskId);
        context.workflow = await planner.replan(modifyTaskPrompt);
        return context.workflow;
    }
    async execute(taskId) {
        let context = this.getTask(taskId);
        if (!context) {
            throw new Error("The task does not exist");
        }
        if (context.paused) {
            context.paused = false;
        }
        context.conversation = [];
        if (context.controller.signal.aborted) {
            context.controller = new AbortController();
        }
        try {
            return await this.doRunWorkflow(context);
        }
        catch (e) {
            Log.error("execute error", e);
            return {
                taskId,
                success: false,
                stopReason: e?.name == "AbortError" ? "abort" : "error",
                result: e,
            };
        }
    }
    async run(taskPrompt, taskId = uuidv4(), contextParams) {
        await this.generate(taskPrompt, taskId, contextParams);
        return await this.execute(taskId);
    }
    /** extend: 使用历史生成的workflow-xml来执行 */
    async runExistingWorkflow(workflowXml, taskPrompt, taskId = uuidv4()) {
        const workflow = await mockGenerate.call(this, workflowXml, taskPrompt, taskId);
        if (workflow)
            await this.execute(taskId);
        /** 使用已有的xml来创建上下文状态，而不用 */
        async function mockGenerate(workflowXml, taskPrompt, taskId = uuidv4()) {
            const config = this.config;
            const agents = [...(this.config.agents || [])];
            const chain = new Chain(taskPrompt);
            const context = new Context(taskId, config, agents, chain);
            this.taskMap.set(taskId, context);
            try {
                const { getPlanSystemPrompt, getPlanUserPrompt } = await Promise.resolve().then(function () { return plan; });
                const mockMessages = [{
                        role: 'system',
                        content: await getPlanSystemPrompt(context),
                    }, {
                        role: 'user',
                        content: [{
                                type: 'text',
                                text: getPlanUserPrompt(taskPrompt),
                            }],
                    }];
                const mockRequest = {
                    maxTokens: 4096,
                    temperature: 0.7,
                    messages: mockMessages,
                    abortSignal: context.controller.signal,
                };
                chain.planRequest = mockRequest;
                chain.planResult = workflowXml;
                const { parseWorkflow } = await Promise.resolve().then(function () { return xml; });
                const workflow = parseWorkflow(taskId, workflowXml, true);
                await config.callback?.onMessage?.({
                    taskId,
                    agentName: 'Planner',
                    type: 'workflow',
                    streamDone: true,
                    workflow,
                });
                workflow.taskPrompt = taskPrompt;
                context.workflow = workflow;
                return workflow;
            }
            catch (e) {
                this.deleteTask(taskId);
                throw e;
            }
        }
    }
    async initContext(workflow, contextParams) {
        const agents = this.config.agents || [];
        let chain = new Chain(workflow.taskPrompt || workflow.name);
        let context = new Context(workflow.taskId, this.config, agents, chain);
        if (this.config.a2aClient) {
            let a2aList = await this.config.a2aClient.listAgents(workflow.taskPrompt || workflow.name);
            context.agents = mergeAgents(context.agents, a2aList);
        }
        if (contextParams) {
            Object.keys(contextParams).forEach((key) => context.variables.set(key, contextParams[key]));
        }
        context.workflow = workflow;
        this.taskMap.set(workflow.taskId, context);
        return context;
    }
    async doRunWorkflow(context) {
        let agents = context.agents;
        let workflow = context.workflow;
        if (!workflow || workflow.agents.length == 0) {
            throw new Error("Workflow error");
        }
        let agentMap = agents.reduce((map, item) => {
            map[item.Name] = item;
            return map;
        }, {});
        let results = [];
        for (let i = 0; i < workflow.agents.length; i++) {
            await context.checkAborted();
            let agentNode = workflow.agents[i];
            let agent = agentMap[agentNode.name];
            if (!agent) {
                throw new Error("Unknown Agent: " + agentNode.name);
            }
            let agentChain = new AgentChain(agentNode);
            context.chain.push(agentChain);
            agent.result = await agent.run(context, agentChain);
            results.push(agent.result);
            if (agentNode.name === "Timer") {
                break;
            }
        }
        return {
            success: true,
            stopReason: "done",
            result: results[results.length - 1],
            taskId: context.taskId,
        };
    }
    getTask(taskId) {
        return this.taskMap.get(taskId);
    }
    getAllTaskId() {
        return [...this.taskMap.keys()];
    }
    deleteTask(taskId) {
        this.abortTask(taskId);
        return this.taskMap.delete(taskId);
    }
    abortTask(taskId) {
        let context = this.taskMap.get(taskId);
        if (context) {
            context.paused = false;
            context.controller.abort();
            return true;
        }
        else {
            return false;
        }
    }
    pauseTask(taskId, paused) {
        let context = this.taskMap.get(taskId);
        if (context) {
            context.paused = paused;
            return true;
        }
        else {
            return false;
        }
    }
    chatTask(taskId, userPrompt) {
        let context = this.taskMap.get(taskId);
        if (context) {
            context.conversation.push(userPrompt);
            return context.conversation;
        }
    }
    addAgent(agent) {
        this.config.agents = this.config.agents || [];
        this.config.agents.push(agent);
    }
}

class SimpleSseMcpClient {
    constructor(sseServerUrl, clientName = "EkoMcpClient") {
        this.sseUrl = sseServerUrl;
        this.clientName = clientName;
        this.requestMap = new Map();
    }
    async connect() {
        Log.info("MCP Client, connecting...", this.sseUrl);
        if (this.sseHandler && this.sseHandler.readyState == 1) {
            this.sseHandler.close && this.sseHandler.close();
            this.sseHandler = undefined;
        }
        this.pingTimer && clearInterval(this.pingTimer);
        this.reconnectTimer && clearTimeout(this.reconnectTimer);
        await new Promise((resolve) => {
            let timer = setTimeout(resolve, 15000);
            this.sseHandler = {
                onopen: () => {
                    Log.info("MCP Client, connection successful", this.sseUrl);
                    clearTimeout(timer);
                    setTimeout(resolve, 200);
                },
                onmessage: (data) => this.onmessage(data),
                onerror: (e) => {
                    Log.error("MCP Client, error: ", e);
                    clearTimeout(timer);
                    if (this.sseHandler?.readyState === 2) {
                        this.pingTimer && clearInterval(this.pingTimer);
                        this.reconnectTimer = setTimeout(() => {
                            this.connect();
                        }, 500);
                    }
                    resolve();
                },
            };
            connectSse(this.sseUrl, this.sseHandler);
        });
        this.pingTimer = setInterval(() => this.ping(), 10000);
    }
    onmessage(data) {
        Log.debug("MCP Client, onmessage", this.sseUrl, data);
        if (data.event == "endpoint") {
            let uri = data.data;
            let msgUrl;
            let idx = this.sseUrl.indexOf("/", 10);
            if (idx > -1) {
                msgUrl = this.sseUrl.substring(0, idx) + uri;
            }
            else {
                msgUrl = this.sseUrl + uri;
            }
            this.msgUrl = msgUrl;
            this.initialize();
        }
        else if (data.event == "message") {
            let message = JSON.parse(data.data);
            let _resolve = this.requestMap.get(message.id);
            _resolve && _resolve(message);
        }
    }
    async initialize() {
        await this.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {
                tools: {
                    listChanged: true,
                },
                sampling: {},
            },
            clientInfo: {
                name: this.clientName,
                version: "1.0.0",
            },
        });
    }
    ping() {
        this.request("ping", {});
    }
    async request(method, params) {
        let id = uuidv4();
        try {
            let callback = new Promise((resolve) => {
                this.requestMap.set(id, resolve);
            });
            Log.debug(`MCP Client, ${method}`, id, params);
            const response = await fetch(this.msgUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: id,
                    method: method,
                    params: {
                        ...params,
                    },
                }),
            });
            let body = await response.text();
            if (body == "Accepted") {
                return await callback;
            }
            else {
                throw new Error("SseClient Response Exception: " + body);
            }
        }
        finally {
            this.requestMap.delete(id);
        }
    }
    async listTools(param) {
        let message = await this.request("tools/list", {
            ...param,
        });
        if (message.error) {
            Log.error("McpClient listTools error: ", param, message);
            throw new Error("listTools Exception");
        }
        return message.result.tools || [];
    }
    async callTool(param) {
        let message = await this.request("tools/call", {
            ...param,
        });
        if (message.error) {
            Log.error("McpClient callTool error: ", param, message);
            throw new Error("callTool Exception");
        }
        return message.result;
    }
    isConnected() {
        if (this.sseHandler && this.sseHandler.readyState == 1) {
            return true;
        }
        return false;
    }
    async close() {
        this.pingTimer && clearInterval(this.pingTimer);
        this.reconnectTimer && clearTimeout(this.reconnectTimer);
        this.sseHandler && this.sseHandler.close && this.sseHandler.close();
        this.pingTimer = undefined;
        this.sseHandler = undefined;
        this.reconnectTimer = undefined;
    }
}
async function connectSse(sseUrl, hander) {
    try {
        hander.readyState = 0;
        const controller = new AbortController();
        const response = await fetch(sseUrl, {
            method: "GET",
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
            },
            body: null,
            keepalive: true,
            signal: controller.signal,
        });
        const reader = response.body?.getReader();
        hander.close = () => {
            controller.abort();
            hander.readyState = 2;
            Log.debug("McpClient close abort.", sseUrl);
        };
        let str = "";
        let decoder = new TextDecoder();
        hander.readyState = 1;
        hander.onopen();
        while (hander.readyState == 1) {
            const { value, done } = await reader?.read();
            if (done) {
                break;
            }
            const text = decoder.decode(value);
            str += text;
            if (str.indexOf("\n\n") > -1) {
                let chunks = str.split("\n\n");
                for (let i = 0; i < chunks.length - 1; i++) {
                    let chunk = chunks[i];
                    let chunkData = parseChunk(chunk);
                    hander.onmessage(chunkData);
                }
                str = chunks[chunks.length - 1];
            }
        }
    }
    catch (e) {
        if (e?.name !== 'AbortError') {
            Log.error("MCP Client, connectSse error:", e);
            hander.onerror(e);
        }
    }
    finally {
        hander.readyState = 2;
    }
}
function parseChunk(chunk) {
    let lines = chunk.split("\n");
    let chunk_obj = {};
    for (let j = 0; j < lines.length; j++) {
        let line = lines[j];
        if (line.startsWith("id:")) {
            chunk_obj["id"] = line.substring(3).trim();
        }
        else if (line.startsWith("event:")) {
            chunk_obj["event"] = line.substring(6).trim();
        }
        else if (line.startsWith("data:")) {
            chunk_obj["data"] = line.substring(5).trim();
        }
        else {
            let idx = line.indexOf(":");
            if (idx > -1) {
                chunk_obj[line.substring(0, idx)] = line.substring(idx + 1).trim();
            }
        }
    }
    return chunk_obj;
}

const AGENT_NAME$4 = "File";
class BaseFileAgent extends Agent {
    constructor(work_path, llms, ext_tools, mcpClient, planDescription) {
        const _tools_ = [];
        const prompt = work_path
            ? `Your default working path is: ${work_path}`
            : "";
        super({
            name: AGENT_NAME$4,
            description: `You are a file agent, handling file-related tasks such as creating, finding, reading, modifying files, etc.${prompt}`,
            tools: _tools_,
            llms: llms,
            mcpClient: mcpClient,
            planDescription: planDescription ||
                "File operation agent, handling file-related tasks such as creating, finding, reading, modifying files, etc, only text file writing is supported.",
        });
        let init_tools = this.buildInitTools();
        if (ext_tools && ext_tools.length > 0) {
            init_tools = mergeTools(init_tools, ext_tools);
        }
        init_tools.forEach((tool) => _tools_.push(tool));
    }
    async do_file_read(agentContext, path, write_variable) {
        let file_context = await this.file_read(agentContext, path);
        if (file_context && file_context.length > config.fileTextMaxLength) {
            file_context = file_context.substring(0, config.fileTextMaxLength) + "...";
        }
        if (write_variable) {
            agentContext.context.variables.set(write_variable, file_context);
        }
        return {
            file_context: file_context,
            write_variable: write_variable,
        };
    }
    async do_file_write(agentContext, path, append, content, from_variable) {
        if (content == null && from_variable == null) {
            throw new Error(`content and from_variable cannot be both empty, cannot write to file ${path}`);
        }
        if (from_variable) {
            let variable_value = agentContext.context.variables.get(from_variable) || "";
            if (variable_value) {
                content = variable_value;
            }
            if (!content) {
                throw new Error(`Variable ${from_variable} is empty, cannot write to file ${path}`);
            }
        }
        if (!content) {
            throw new Error(`content is empty, cannot write to file ${path}`);
        }
        return await this.file_write(agentContext, path, content || "", append);
    }
    buildInitTools() {
        return [
            {
                name: "file_list",
                description: "Getting a list of files in a specified directory.",
                parameters: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "File directory path",
                        },
                    },
                    required: ["path"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.file_list(agentContext, args.path));
                },
            },
            {
                name: "file_read",
                description: "Read file content. Use to read files or check file content.",
                parameters: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "File path",
                        },
                        write_variable: {
                            type: "string",
                            description: "Variable name, the content after reading is simultaneously written to the variable, facilitating direct loading from the variable in subsequent operations.",
                        },
                    },
                    required: ["path"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.do_file_read(agentContext, args.path, args.write_variable));
                },
            },
            {
                name: "file_write",
                description: "Overwrite or append content to a file. Use for creating new files, appending content, or modifying existing files, only supports txt/md/json/csv or other text formats.",
                parameters: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "File path",
                        },
                        append: {
                            type: "boolean",
                            description: "(Optional) Whether to use append mode",
                            default: false,
                        },
                        content: {
                            type: "string",
                            description: "Text content, write content directly to the file.",
                        },
                        from_variable: {
                            type: "string",
                            description: "Variable name, read content from the variable and write it.",
                        },
                    },
                    required: ["path"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.do_file_write(agentContext, args.path, (args.append || false), args.content, args.from_variable));
                },
            },
            {
                name: "file_str_replace",
                description: "Replace specified string in a file. Use for updating specific content in files.",
                parameters: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "File path",
                        },
                        old_str: {
                            type: "string",
                            description: "Original string to be replaced",
                        },
                        new_str: {
                            type: "string",
                            description: "New string to replace with",
                        },
                    },
                    required: ["path", "old_str", "new_str"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.file_str_replace(agentContext, args.path, args.old_str, args.new_str));
                },
            },
            {
                name: "file_find_by_name",
                description: "Find files by name pattern in specified directory. Use for locating files with specific naming patterns.",
                parameters: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Absolute path of directory to search",
                        },
                        glob: {
                            type: "string",
                            description: "Filename pattern using glob syntax wildcards",
                        },
                    },
                    required: ["path", "glob"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.file_find_by_name(agentContext, args.path, args.glob));
                },
            },
        ];
    }
}

const AGENT_NAME$3 = "Shell";
class BaseShellAgent extends Agent {
    constructor(llms, ext_tools, mcpClient, planDescription) {
        const _tools_ = [];
        super({
            name: AGENT_NAME$3,
            description: `Run commands in a bash shell,
* You must first call create_session to create a new session when using it for the first time.
* Please execute delete commands with caution, and never perform dangerous operations like \`rm -rf /\`.
* Please avoid commands that may produce a very large amount of output.`,
            tools: _tools_,
            llms: llms,
            mcpClient: mcpClient,
            planDescription: planDescription || "Shell command agent, use to execute shell commands.",
        });
        let init_tools = this.buildInitTools();
        if (ext_tools && ext_tools.length > 0) {
            init_tools = mergeTools(init_tools, ext_tools);
        }
        init_tools.forEach((tool) => _tools_.push(tool));
    }
    buildInitTools() {
        return [
            {
                name: "create_session",
                description: "Create a new shell session",
                parameters: {
                    type: "object",
                    properties: {
                        exec_dir: {
                            type: "string",
                            description: "Working directory for command execution (absolute path)",
                        },
                    },
                    required: ["exec_dir"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.create_session(agentContext, args.exec_dir));
                },
            },
            {
                name: "shell_exec",
                description: "Execute commands in a specified shell session",
                parameters: {
                    type: "object",
                    properties: {
                        session_id: {
                            type: "string",
                            description: "shell session id",
                        },
                        command: {
                            type: "string",
                            description: "Shell command to execute",
                        },
                    },
                    required: ["session_id", "command"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.shell_exec(agentContext, args.session_id, args.command));
                },
            },
            {
                name: "close_session",
                description: "Close shell session",
                parameters: {
                    type: "object",
                    properties: {
                        session_id: {
                            type: "string",
                            description: "shell session id",
                        },
                    },
                    required: ["session_id"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.close_session(agentContext, args.session_id));
                },
            },
        ];
    }
}

const AGENT_NAME$2 = "Timer";
class BaseTimerAgent extends Agent {
    constructor(llms, ext_tools, mcpClient) {
        super({
            name: AGENT_NAME$2,
            description: "You are a scheduled task scheduling agent.",
            tools: ext_tools || [],
            llms: llms,
            mcpClient: mcpClient,
        });
        this.addTool(this.schedule_tool());
    }
    schedule_tool() {
        return {
            name: "task_schedule",
            description: "Task scheduled trigger, the task is triggered at a scheduled time and will automatically create a scheduled task for execution.",
            parameters: {
                type: "object",
                properties: {
                    trigger_description: {
                        type: "string",
                        description: "Trigger time description.",
                    },
                    task_description: {
                        type: "string",
                        description: "Main task description, excluding trigger time.",
                    },
                    cron: {
                        type: "string",
                        description: "The cron expression of the trigger, for example, '0 9 * * *' indicates that it triggers at 9 a.m. every day.",
                    },
                },
                required: ["cron"],
            },
            execute: async (args, agentContext) => {
                return await this.callInnerTool(() => this.task_schedule(agentContext, args.trigger_description, args.task_description, args.cron));
            },
        };
    }
}

const AGENT_NAME$1 = "Computer";
class BaseComputerAgent extends Agent {
    constructor(llms, ext_tools, mcpClient, keyboardKeys) {
        const _tools_ = [];
        super({
            name: AGENT_NAME$1,
            description: `You are a computer operation agent, who interacts with the computer using mouse and keyboard, completing specified tasks step by step based on the given tasks and screenshots. After each of your operations, you will receive the latest computer screenshot to evaluate the task execution status.
This is a computer GUI interface, observe the execution through screenshots, and specify action sequences to complete designated tasks.
* COMPUTER OPERATIONS:
  - You can operate the application using shortcuts.
  - If stuck, try alternative approaches`,
            tools: _tools_,
            llms: llms,
            mcpClient: mcpClient,
            planDescription: "Computer operation agent, interact with the computer using the mouse and keyboard."
        });
        if (!keyboardKeys) {
            if (config.platform == "windows") {
                keyboardKeys = [
                    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
                    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                    'enter', 'esc', 'backspace', 'tab', 'space', 'delete',
                    'ctrl', 'alt', 'shift', 'win',
                    'up', 'down', 'left', 'right',
                    'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
                    'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+a', 'ctrl+s',
                    'alt+tab', 'alt+f4', 'ctrl+alt+delete'
                ];
            }
            else {
                keyboardKeys = [
                    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
                    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
                    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
                    'enter', 'esc', 'backspace', 'tab', 'space', 'delete',
                    'command', 'option', 'shift', 'control',
                    'up', 'down', 'left', 'right',
                    'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
                    'command+c', 'command+v', 'command+x', 'command+z', 'command+a', 'command+s',
                    'command+tab', 'command+q', 'command+escape'
                ];
            }
        }
        let init_tools = this.buildInitTools(keyboardKeys);
        if (ext_tools && ext_tools.length > 0) {
            init_tools = mergeTools(init_tools, ext_tools);
        }
        init_tools.forEach((tool) => _tools_.push(tool));
    }
    buildInitTools(keyboardKeys) {
        return [
            {
                name: "typing",
                description: "Type specified text",
                parameters: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "Text to type",
                        },
                    },
                    required: ["text"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.typing(agentContext, args.text));
                },
            },
            {
                name: "click",
                description: "Click at current or specified position",
                parameters: {
                    type: "object",
                    properties: {
                        x: {
                            type: "number",
                            description: "X coordinate",
                        },
                        y: {
                            type: "number",
                            description: "Y coordinate",
                        },
                        num_clicks: {
                            type: "number",
                            description: "Number of clicks",
                            enum: [1, 2, 3],
                            default: 1,
                        },
                        button: {
                            type: "string",
                            description: "Mouse button to click",
                            enum: ["left", "right", "middle"],
                            default: "left",
                        },
                    },
                    required: ["x", "y"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.click(agentContext, args.x, args.y, (args.num_clicks || 1), (args.button || "left")));
                },
            },
            {
                name: "move_to",
                description: "Move cursor to specified position",
                parameters: {
                    type: "object",
                    properties: {
                        x: {
                            type: "number",
                            description: "X coordinate",
                        },
                        y: {
                            type: "number",
                            description: "Y coordinate",
                        },
                    },
                    required: ["x", "y"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.move_to(agentContext, args.x, args.y));
                },
            },
            {
                name: "scroll",
                description: "Scroll the mouse wheel at current position",
                parameters: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: "Scroll amount (up / down)",
                            minimum: 1,
                            maximum: 10,
                        },
                        direction: {
                            type: "string",
                            enum: ["up", "down"],
                        },
                    },
                    required: ["amount", "direction"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(async () => {
                        let amount = args.amount;
                        await this.scroll(agentContext, args.direction == "up" ? -amount : amount);
                    });
                },
            },
            {
                name: "press",
                description: "Press and release a key",
                parameters: {
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "Key to press",
                            enum: keyboardKeys,
                        },
                    },
                    required: ["key"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.press(agentContext, args.key));
                },
            },
            {
                name: "hotkey",
                description: "Press a key combination",
                parameters: {
                    type: "object",
                    properties: {
                        keys: {
                            type: "string",
                            description: "Key combination to press",
                            enum: keyboardKeys,
                        },
                    },
                    required: ["keys"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.hotkey(agentContext, args.keys));
                },
            },
            {
                name: "drag_and_drop",
                description: "Drag and drop operation",
                parameters: {
                    type: "object",
                    properties: {
                        x1: {
                            type: "number",
                            description: "From X coordinate",
                        },
                        y1: {
                            type: "number",
                            description: "From Y coordinate",
                        },
                        x2: {
                            type: "number",
                            description: "Target X coordinate",
                        },
                        y2: {
                            type: "number",
                            description: "Target Y coordinate",
                        },
                    },
                    required: ["x1", "y1", "x2", "y2"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.drag_and_drop(agentContext, args.x1, args.y1, args.x2, args.y2));
                },
            },
            {
                name: "wait",
                noPlan: true,
                description: "Wait for specified duration",
                parameters: {
                    type: "object",
                    properties: {
                        duration: {
                            type: "number",
                            description: "Duration in millisecond",
                            default: 500,
                            minimum: 200,
                            maximum: 10000,
                        },
                    },
                    required: ["duration"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => sleep((args.duration || 200)));
                },
            },
        ];
    }
    async handleMessages(agentContext, messages, tools) {
        let lastMessage = messages[messages.length - 1];
        if (lastMessage.role == "tool" &&
            lastMessage.content.filter((t) => t.type == "tool-result").length > 0) {
            await sleep(300);
            let result = await this.screenshot(agentContext);
            let image = toImage(result.imageBase64);
            messages.push({
                role: "user",
                content: [
                    {
                        type: "image",
                        image: image,
                        mimeType: result.imageType,
                    },
                    {
                        type: "text",
                        text: "This is the latest screenshot",
                    },
                ],
            });
        }
        else if (messages.length == 2 &&
            messages[0].role == "system" &&
            lastMessage.role == "user") {
            let result = await this.screenshot(agentContext);
            let image = toImage(result.imageBase64);
            lastMessage.content.push({
                type: "image",
                image: image,
                mimeType: result.imageType,
            });
        }
        super.handleMessages(agentContext, messages, tools);
    }
}

const AGENT_NAME = "Browser";
class BaseBrowserAgent extends Agent {
    async go_back(agentContext) {
        try {
            await this.execute_script(agentContext, () => {
                window.navigation.back();
            }, []);
            await sleep(100);
        }
        catch (e) { }
    }
    async extract_page_content(agentContext, variable_name) {
        let content = await this.execute_script(agentContext, () => {
            let str = window.document.body.innerText
                .replaceAll(/\n+/g, "\n")
                .replaceAll(/ +/g, " ")
                .trim();
            if (str.length > 20000) {
                str = str.substring(0, 20000) + "...";
            }
            return str;
        }, []);
        let pageInfo = await this.get_current_page(agentContext);
        let result = `title: ${pageInfo.title}\npage_url: ${pageInfo.url}\npage_content: \n${content}`;
        if (variable_name) {
            agentContext.context.variables.set(variable_name, result);
        }
        return result;
    }
    async controlMcpTools(agentContext, messages, loopNum) {
        if (loopNum > 0) {
            let url = null;
            try {
                url = (await this.get_current_page(agentContext)).url;
            }
            catch (e) { }
            let lastUrl = agentContext.variables.get("lastUrl");
            agentContext.variables.set("lastUrl", url);
            return {
                mcpTools: loopNum == 0 || url != lastUrl,
                mcpParams: {
                    environment: "browser",
                    browser_url: url,
                },
            };
        }
        else {
            return {
                mcpTools: true,
                mcpParams: {
                    environment: "browser",
                },
            };
        }
    }
    toolExecuter(mcpClient, name) {
        return {
            execute: async (args, agentContext) => {
                let result = await mcpClient.callTool({
                    name: name,
                    arguments: args,
                    extInfo: {
                        taskId: agentContext.context.taskId,
                        nodeId: agentContext.agentChain.agent.id,
                        environment: "browser",
                        agent_name: agentContext.agent.Name,
                        browser_url: agentContext.variables.get("lastUrl"),
                    },
                });
                if (result.extInfo &&
                    result.extInfo["javascript"] &&
                    result.content[0].type == "text") {
                    let script = result.content[0].text;
                    let params = JSON.stringify(args);
                    let runScript = `${script};execute(${params})`;
                    let scriptResult = await this.execute_mcp_script(agentContext, runScript);
                    let resultText;
                    if (typeof scriptResult == "string" ||
                        typeof scriptResult == "number") {
                        resultText = scriptResult + "";
                    }
                    else {
                        resultText = scriptResult
                            ? JSON.stringify(scriptResult)
                            : "Successful";
                    }
                    return {
                        content: [
                            {
                                type: "text",
                                text: resultText,
                            },
                        ],
                    };
                }
                return result;
            },
        };
    }
    async get_current_page(agentContext) {
        return await this.execute_script(agentContext, () => {
            return {
                url: window.location.href,
                title: window.document.title,
            };
        }, []);
    }
    lastToolResult(messages) {
        let lastMessage = messages[messages.length - 1];
        if (lastMessage.role != "tool") {
            return null;
        }
        let toolResult = lastMessage.content.filter((t) => t.type == "tool-result")[0];
        if (!toolResult) {
            return null;
        }
        let result = toolResult.result;
        let isError = toolResult.isError;
        for (let i = messages.length - 2; i > 0; i--) {
            if (messages[i].role !== "assistant" ||
                typeof messages[i].content == "string") {
                continue;
            }
            for (let j = 0; j < messages[i].content.length; j++) {
                let content = messages[i].content[j];
                if (typeof content !== "string" && content.type !== "tool-call") {
                    continue;
                }
                let toolUse = content;
                if (toolResult.toolCallId != toolUse.toolCallId) {
                    continue;
                }
                return {
                    id: toolResult.toolCallId,
                    toolName: toolUse.toolName,
                    args: toolUse.args,
                    result,
                    isError,
                };
            }
        }
        return null;
    }
    toolUseNames(messages) {
        let toolNames = [];
        if (!messages) {
            return toolNames;
        }
        for (let i = 0; i < messages.length; i++) {
            let message = messages[i];
            if (message.role == "tool") {
                toolNames.push(message.content[0].toolName);
            }
        }
        return toolNames;
    }
    async execute_mcp_script(agentContext, script) {
        return;
    }
}

// @ts-nocheck
function run_build_dom_tree() {
    /**
     * Get clickable elements on the page
     *
     * @param {*} doHighlightElements Is highlighted
     * @param {*} includeAttributes [attr_names...]
     * @returns { element_str, selector_map }
     */
    function get_clickable_elements(doHighlightElements = true, includeAttributes) {
        window.clickable_elements = {};
        document.querySelectorAll("[eko-user-highlight-id]").forEach(ele => ele.removeAttribute("eko-user-highlight-id"));
        let page_tree = build_dom_tree(doHighlightElements);
        let element_tree = parse_node(page_tree);
        let selector_map = create_selector_map(element_tree);
        let element_str = clickable_elements_to_string(element_tree, includeAttributes);
        return { element_str, selector_map };
    }
    function get_highlight_element(highlightIndex) {
        let element = document.querySelector(`[eko-user-highlight-id="eko-highlight-${highlightIndex}"]`);
        return element || window.clickable_elements[highlightIndex];
    }
    function remove_highlight() {
        let highlight = document.getElementById('eko-highlight-container');
        if (highlight) {
            highlight.remove();
        }
    }
    function clickable_elements_to_string(element_tree, includeAttributes) {
        if (!includeAttributes) {
            includeAttributes = [
                'id',
                'title',
                'type',
                'name',
                'role',
                'class',
                'src',
                'href',
                'aria-label',
                'placeholder',
                'value',
                'alt',
                'aria-expanded',
            ];
        }
        function get_all_text_till_next_clickable_element(element_node) {
            let text_parts = [];
            function collect_text(node) {
                if (node.tagName && node != element_node && node.highlightIndex != null) {
                    return;
                }
                if (!node.tagName && node.text) {
                    text_parts.push(node.text);
                }
                else if (node.tagName) {
                    for (let i = 0; i < node.children.length; i++) {
                        collect_text(node.children[i]);
                    }
                }
            }
            collect_text(element_node);
            return text_parts.join('\n').trim().replace(/\n+/g, ' ');
        }
        function has_parent_with_highlight_index(node) {
            let current = node.parent;
            while (current) {
                if (current.highlightIndex != null) {
                    return true;
                }
                current = current.parent;
            }
            return false;
        }
        let formatted_text = [];
        function process_node(node, depth) {
            if (node.text == null) {
                if (node.highlightIndex != null) {
                    let attributes_str = '';
                    if (includeAttributes) {
                        for (let i = 0; i < includeAttributes.length; i++) {
                            let key = includeAttributes[i];
                            let value = node.attributes[key];
                            if (key == "class" && value && value.length > 30) {
                                let classList = value.split(" ").slice(0, 3);
                                value = classList.join(" ");
                            }
                            else if ((key == "src" || key == "href") && value && value.length > 200) {
                                continue;
                            }
                            else if ((key == "src" || key == "href") && value && value.startsWith("/")) {
                                value = window.location.origin + value;
                            }
                            if (key && value) {
                                attributes_str += ` ${key}="${value}"`;
                            }
                        }
                        attributes_str = attributes_str.replace(/\n+/g, ' ');
                    }
                    let text = get_all_text_till_next_clickable_element(node);
                    formatted_text.push(`[${node.highlightIndex}]:<${node.tagName}${attributes_str}>${text}</${node.tagName}>`);
                }
                for (let i = 0; i < node.children.length; i++) {
                    let child = node.children[i];
                    process_node(child);
                }
            }
            else if (!has_parent_with_highlight_index(node)) {
                formatted_text.push(`[]:${node.text}`);
            }
        }
        process_node(element_tree);
        return formatted_text.join('\n');
    }
    function create_selector_map(element_tree) {
        let selector_map = {};
        function process_node(node) {
            if (node.tagName) {
                if (node.highlightIndex != null) {
                    selector_map[node.highlightIndex] = node;
                }
                for (let i = 0; i < node.children.length; i++) {
                    process_node(node.children[i]);
                }
            }
        }
        process_node(element_tree);
        return selector_map;
    }
    function parse_node(node_data, parent) {
        if (!node_data) {
            return;
        }
        if (node_data.type == 'TEXT_NODE') {
            return {
                text: node_data.text || '',
                isVisible: node_data.isVisible || false,
                parent: parent,
            };
        }
        let element_node = {
            tagName: node_data.tagName,
            xpath: node_data.xpath,
            highlightIndex: node_data.highlightIndex,
            attributes: node_data.attributes || {},
            isVisible: node_data.isVisible || false,
            isInteractive: node_data.isInteractive || false,
            isTopElement: node_data.isTopElement || false,
            shadowRoot: node_data.shadowRoot || false,
            children: [],
            parent: parent,
        };
        if (node_data.children) {
            let children = [];
            for (let i = 0; i < node_data.children.length; i++) {
                let child = node_data.children[i];
                if (child) {
                    let child_node = parse_node(child, element_node);
                    if (child_node) {
                        children.push(child_node);
                    }
                }
            }
            element_node.children = children;
        }
        return element_node;
    }
    function build_dom_tree(doHighlightElements) {
        let highlightIndex = 0; // Reset highlight index
        function highlightElement(element, index, parentIframe = null) {
            // Create or get highlight container
            let container = document.getElementById('eko-highlight-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'eko-highlight-container';
                container.style.position = 'fixed';
                container.style.pointerEvents = 'none';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '2147483647'; // Maximum z-index value
                document.documentElement.appendChild(container);
            }
            // Generate a color based on the index
            const colors = [
                '#FF0000',
                '#00FF00',
                '#0000FF',
                '#FFA500',
                '#800080',
                '#008080',
                '#FF69B4',
                '#4B0082',
                '#FF4500',
                '#2E8B57',
                '#DC143C',
                '#4682B4',
            ];
            const colorIndex = index % colors.length;
            const baseColor = colors[colorIndex];
            const backgroundColor = `${baseColor}1A`; // 10% opacity version of the color
            // Create highlight overlay
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.border = `2px solid ${baseColor}`;
            overlay.style.pointerEvents = 'none';
            overlay.style.boxSizing = 'border-box';
            // Position overlay based on element
            const rect = element.getBoundingClientRect();
            let top = rect.top;
            let left = rect.left;
            if (rect.width < window.innerWidth / 2 || rect.height < window.innerHeight / 2) {
                overlay.style.backgroundColor = backgroundColor;
            }
            // Adjust position if element is inside an iframe
            if (parentIframe) {
                const iframeRect = parentIframe.getBoundingClientRect();
                top += iframeRect.top;
                left += iframeRect.left;
            }
            overlay.style.top = `${top}px`;
            overlay.style.left = `${left}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;
            // Create label
            const label = document.createElement('div');
            label.className = 'eko-highlight-label';
            label.style.position = 'absolute';
            label.style.background = baseColor;
            label.style.color = 'white';
            label.style.padding = '1px 4px';
            label.style.borderRadius = '4px';
            label.style.fontSize = `${Math.min(12, Math.max(8, rect.height / 2))}px`; // Responsive font size
            label.textContent = index;
            // Calculate label position
            const labelWidth = 20; // Approximate width
            const labelHeight = 16; // Approximate height
            // Default position (top-right corner inside the box)
            let labelTop = top + 2;
            let labelLeft = left + rect.width - labelWidth - 2;
            // Adjust if box is too small
            if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
                // Position outside the box if it's too small
                labelTop = top - labelHeight - 2;
                labelLeft = left + rect.width - labelWidth;
            }
            // Ensure label stays within viewport
            if (labelTop < 0)
                labelTop = top + 2;
            if (labelLeft < 0)
                labelLeft = left + 2;
            if (labelLeft + labelWidth > window.innerWidth) {
                labelLeft = left + rect.width - labelWidth - 2;
            }
            label.style.top = `${labelTop}px`;
            label.style.left = `${labelLeft}px`;
            // Add to container
            container.appendChild(overlay);
            container.appendChild(label);
            // Store reference for cleanup
            element.setAttribute('eko-user-highlight-id', `eko-highlight-${index}`);
            return index + 1;
        }
        // Helper function to generate XPath as a tree
        function getXPathTree(element, stopAtBoundary = true) {
            const segments = [];
            let currentElement = element;
            while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
                // Stop if we hit a shadow root or iframe
                if (stopAtBoundary &&
                    (currentElement.parentNode instanceof ShadowRoot ||
                        currentElement.parentNode instanceof HTMLIFrameElement)) {
                    break;
                }
                let index = 0;
                let sibling = currentElement.previousSibling;
                while (sibling) {
                    if (sibling.nodeType === Node.ELEMENT_NODE &&
                        sibling.nodeName === currentElement.nodeName) {
                        index++;
                    }
                    sibling = sibling.previousSibling;
                }
                const tagName = currentElement.nodeName.toLowerCase();
                const xpathIndex = index > 0 ? `[${index + 1}]` : '';
                segments.unshift(`${tagName}${xpathIndex}`);
                currentElement = currentElement.parentNode;
            }
            return segments.join('/');
        }
        // Helper function to check if element is accepted
        function isElementAccepted(element) {
            const leafElementDenyList = new Set(['svg', 'script', 'style', 'link', 'meta']);
            return !leafElementDenyList.has(element.tagName.toLowerCase());
        }
        // Helper function to check if element is interactive
        function isInteractiveElement(element) {
            // Base interactive elements and roles
            const interactiveElements = new Set([
                'a',
                'button',
                'details',
                'embed',
                'input',
                'label',
                'menu',
                'menuitem',
                'object',
                'select',
                'textarea',
                'summary',
                'li',
            ]);
            const interactiveRoles = new Set([
                'button',
                'menu',
                'menuitem',
                'link',
                'checkbox',
                'radio',
                'slider',
                'tab',
                'tabpanel',
                'textbox',
                'combobox',
                'grid',
                'listbox',
                'option',
                'progressbar',
                'scrollbar',
                'searchbox',
                'switch',
                'tree',
                'treeitem',
                'spinbutton',
                'tooltip',
                'a-button-inner',
                'a-dropdown-button',
                'click',
                'menuitemcheckbox',
                'menuitemradio',
                'a-button-text',
                'button-text',
                'button-icon',
                'button-icon-only',
                'button-text-icon-only',
                'dropdown',
                'combobox',
            ]);
            const tagName = element.tagName.toLowerCase();
            const role = element.getAttribute('role');
            const ariaRole = element.getAttribute('aria-role');
            const tabIndex = element.getAttribute('tabindex');
            const contentEditable = element.getAttribute('contenteditable');
            // Basic role/attribute checks
            const hasInteractiveRole = contentEditable === 'true' ||
                interactiveElements.has(tagName) ||
                interactiveRoles.has(role) ||
                interactiveRoles.has(ariaRole) ||
                (tabIndex !== null && tabIndex !== '-1') ||
                element.getAttribute('data-action') === 'a-dropdown-select' ||
                element.getAttribute('data-action') === 'a-dropdown-button';
            if (hasInteractiveRole)
                return true;
            // Get computed style
            const style = window.getComputedStyle(element);
            // Check if element has click-like styling
            // const hasClickStyling = style.cursor === 'pointer' ||
            //     element.style.cursor === 'pointer' ||
            //     style.pointerEvents !== 'none';
            // Check for event listeners
            const hasClickHandler = element.onclick !== null ||
                element.getAttribute('onclick') !== null ||
                element.hasAttribute('ng-click') ||
                element.hasAttribute('@click') ||
                element.hasAttribute('v-on:click');
            // Helper function to safely get event listeners
            function getEventListeners(el) {
                try {
                    // Try to get listeners using Chrome DevTools API
                    return window.getEventListeners?.(el) || {};
                }
                catch (e) {
                    // Fallback: check for common event properties
                    const listeners = {};
                    // List of common event types to check
                    const eventTypes = [
                        'click',
                        'mousedown',
                        'mouseup',
                        'touchstart',
                        'touchend',
                        'keydown',
                        'keyup',
                        'focus',
                        'blur',
                    ];
                    for (const type of eventTypes) {
                        const handler = el[`on${type}`];
                        if (handler) {
                            listeners[type] = [
                                {
                                    listener: handler,
                                    useCapture: false,
                                },
                            ];
                        }
                    }
                    return listeners;
                }
            }
            // Check for click-related events on the element itself
            const listeners = getEventListeners(element);
            const hasClickListeners = listeners &&
                (listeners.click?.length > 0 ||
                    listeners.mousedown?.length > 0 ||
                    listeners.mouseup?.length > 0 ||
                    listeners.touchstart?.length > 0 ||
                    listeners.touchend?.length > 0);
            // Check for ARIA properties that suggest interactivity
            const hasAriaProps = element.hasAttribute('aria-expanded') ||
                element.hasAttribute('aria-pressed') ||
                element.hasAttribute('aria-selected') ||
                element.hasAttribute('aria-checked');
            // Check for form-related functionality
            element.form !== undefined ||
                element.hasAttribute('contenteditable') ||
                style.userSelect !== 'none';
            // Check if element is draggable
            const isDraggable = element.draggable || element.getAttribute('draggable') === 'true';
            return (hasAriaProps ||
                // hasClickStyling ||
                hasClickHandler ||
                hasClickListeners ||
                // isFormRelated ||
                isDraggable);
        }
        // Helper function to check if element is visible
        function isElementVisible(element) {
            const style = window.getComputedStyle(element);
            return (element.offsetWidth > 0 &&
                element.offsetHeight > 0 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none');
        }
        // Helper function to check if element is the top element at its position
        function isTopElement(element) {
            // Find the correct document context and root element
            let doc = element.ownerDocument;
            // If we're in an iframe, elements are considered top by default
            if (doc !== window.document) {
                return true;
            }
            // For shadow DOM, we need to check within its own root context
            const shadowRoot = element.getRootNode();
            if (shadowRoot instanceof ShadowRoot) {
                const rect = element.getBoundingClientRect();
                const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                try {
                    // Use shadow root's elementFromPoint to check within shadow DOM context
                    const topEl = shadowRoot.elementFromPoint(point.x, point.y);
                    if (!topEl)
                        return false;
                    // Check if the element or any of its parents match our target element
                    let current = topEl;
                    while (current && current !== shadowRoot) {
                        if (current === element)
                            return true;
                        current = current.parentElement;
                    }
                    return false;
                }
                catch (e) {
                    return true; // If we can't determine, consider it visible
                }
            }
            // Regular DOM elements
            const rect = element.getBoundingClientRect();
            const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            try {
                const topEl = document.elementFromPoint(point.x, point.y);
                if (!topEl)
                    return false;
                let current = topEl;
                while (current && current !== document.documentElement) {
                    if (current === element)
                        return true;
                    current = current.parentElement;
                }
                return false;
            }
            catch (e) {
                return true;
            }
        }
        // Helper function to check if text node is visible
        function isTextNodeVisible(textNode) {
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const rect = range.getBoundingClientRect();
            return (rect.width !== 0 &&
                rect.height !== 0 &&
                rect.top >= 0 &&
                rect.top <= window.innerHeight &&
                textNode.parentElement?.checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                }));
        }
        // Function to traverse the DOM and create nested JSON
        function buildDomTree(node, parentIframe = null) {
            if (!node)
                return null;
            // Special case for text nodes
            if (node.nodeType === Node.TEXT_NODE) {
                const textContent = node.textContent.trim();
                if (textContent && isTextNodeVisible(node)) {
                    return {
                        type: 'TEXT_NODE',
                        text: textContent,
                        isVisible: true,
                    };
                }
                return null;
            }
            // Check if element is accepted
            if (node.nodeType === Node.ELEMENT_NODE && !isElementAccepted(node)) {
                return null;
            }
            const nodeData = {
                tagName: node.tagName ? node.tagName.toLowerCase() : null,
                attributes: {},
                xpath: node.nodeType === Node.ELEMENT_NODE ? getXPathTree(node, true) : null,
                children: [],
            };
            // Copy all attributes if the node is an element
            if (node.nodeType === Node.ELEMENT_NODE && node.attributes) {
                // Use getAttributeNames() instead of directly iterating attributes
                const attributeNames = node.getAttributeNames?.() || [];
                for (const name of attributeNames) {
                    nodeData.attributes[name] = node.getAttribute(name);
                }
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                const isInteractive = isInteractiveElement(node);
                const isVisible = isElementVisible(node);
                const isTop = isTopElement(node);
                nodeData.isInteractive = isInteractive;
                nodeData.isVisible = isVisible;
                nodeData.isTopElement = isTop;
                // Highlight if element meets all criteria and highlighting is enabled
                if (isInteractive && isVisible && isTop) {
                    nodeData.highlightIndex = highlightIndex++;
                    window.clickable_elements[nodeData.highlightIndex] = node;
                    if (doHighlightElements) {
                        highlightElement(node, nodeData.highlightIndex, parentIframe);
                    }
                }
            }
            // Only add iframeContext if we're inside an iframe
            // if (parentIframe) {
            //     nodeData.iframeContext = `iframe[src="${parentIframe.src || ''}"]`;
            // }
            // Only add shadowRoot field if it exists
            if (node.shadowRoot) {
                nodeData.shadowRoot = true;
            }
            // Handle shadow DOM
            if (node.shadowRoot) {
                const shadowChildren = Array.from(node.shadowRoot.childNodes).map((child) => buildDomTree(child, parentIframe));
                nodeData.children.push(...shadowChildren);
            }
            // Handle iframes
            if (node.tagName === 'IFRAME') {
                try {
                    const iframeDoc = node.contentDocument || node.contentWindow.document;
                    if (iframeDoc) {
                        const iframeChildren = Array.from(iframeDoc.body.childNodes).map((child) => buildDomTree(child, node));
                        nodeData.children.push(...iframeChildren);
                    }
                }
                catch (e) {
                    console.warn('Unable to access iframe:', node);
                }
            }
            else {
                const children = Array.from(node.childNodes).map((child) => buildDomTree(child, parentIframe));
                nodeData.children.push(...children);
            }
            return nodeData;
        }
        return buildDomTree(document.body);
    }
    window.get_clickable_elements = get_clickable_elements;
    window.get_highlight_element = get_highlight_element;
    window.remove_highlight = remove_highlight;
}

class BaseBrowserLabelsAgent extends BaseBrowserAgent {
    constructor(llms, ext_tools, mcpClient) {
        const description = `You are a browser operation agent, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.
* For the first visit, please call the \`navigate_to\` or \`current_page\` tool first. After that, each of your actions will return a screenshot of the page and structured element information, both of which have been specially processed.
* Screenshot description:
  - Screenshot are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshot help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshot, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshot.
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_page_content' instead.
  - If the webpage content hasn't loaded, please use the \`wait\` tool to allow time for the content to load.
* ELEMENT INTERACTION:
   - Only use indexes that exist in the provided element list
   - Each element has a unique index number (e.g., "[33]:<button>")
   - Elements marked with "[]:" are non-interactive (for context only)
   - Use the latest element index, do not rely on historical outdated element indexes
* ERROR HANDLING:
   - If no suitable elements exist, use other functions to complete the task
   - If stuck, try alternative approaches, don't refuse tasks
   - Handle popups/cookies by accepting or closing them
* BROWSER OPERATION:
   - Use scroll to find elements you are looking for, When extracting content, prioritize using extract_page_content, only scroll when you need to load more content`;
        const _tools_ = [];
        super({
            name: AGENT_NAME,
            description: description,
            tools: _tools_,
            llms: llms,
            mcpClient: mcpClient,
            planDescription: "Browser operation agent, interact with the browser using the mouse and keyboard.",
        });
        let init_tools = this.buildInitTools();
        if (ext_tools && ext_tools.length > 0) {
            init_tools = mergeTools(init_tools, ext_tools);
        }
        init_tools.forEach((tool) => _tools_.push(tool));
    }
    async input_text(agentContext, index, text, enter) {
        await this.execute_script(agentContext, typing, [{ index, text, enter }]);
        if (enter) {
            await sleep(200);
        }
    }
    async click_element(agentContext, index, num_clicks, button) {
        await this.execute_script(agentContext, do_click, [
            { index, num_clicks, button },
        ]);
    }
    async scroll_to_element(agentContext, index) {
        await this.execute_script(agentContext, (index) => {
            return window
                .get_highlight_element(index)
                .scrollIntoView({ behavior: "smooth" });
        }, [index]);
        await sleep(200);
    }
    async scroll_mouse_wheel(agentContext, amount, extract_page_content) {
        await this.execute_script(agentContext, scroll_by, [{ amount }]);
        await sleep(200);
        if (!extract_page_content) {
            const tools = this.toolUseNames(agentContext.agentChain.agentRequest?.messages);
            let scroll_count = 0;
            for (let i = tools.length - 1; i >= Math.max(tools.length - 8, 0); i--) {
                if (tools[i] == "scroll_mouse_wheel") {
                    scroll_count++;
                }
            }
            if (scroll_count >= 3) {
                extract_page_content = true;
            }
        }
        if (extract_page_content) {
            let page_content = await this.extract_page_content(agentContext);
            return ("The current page content has been extracted, latest page content:\n" +
                page_content);
        }
    }
    async hover_to_element(agentContext, index) {
        await this.execute_script(agentContext, hover_to, [{ index }]);
    }
    async get_select_options(agentContext, index) {
        return await this.execute_script(agentContext, get_select_options, [
            { index },
        ]);
    }
    async select_option(agentContext, index, option) {
        return await this.execute_script(agentContext, select_option, [
            { index, option },
        ]);
    }
    async screenshot_and_html(agentContext) {
        try {
            let element_result = null;
            for (let i = 0; i < 5; i++) {
                await sleep(200);
                await this.execute_script(agentContext, run_build_dom_tree, []);
                await sleep(50);
                element_result = (await this.execute_script(agentContext, () => {
                    return window.get_clickable_elements(true);
                }, []));
                if (element_result) {
                    break;
                }
            }
            await sleep(100);
            let screenshot = await this.screenshot(agentContext);
            // agentContext.variables.set("selector_map", element_result.selector_map);
            let pseudoHtml = element_result.element_str;
            return {
                imageBase64: screenshot.imageBase64,
                imageType: screenshot.imageType,
                pseudoHtml: pseudoHtml,
            };
        }
        finally {
            try {
                await this.execute_script(agentContext, () => {
                    return window.remove_highlight();
                }, []);
            }
            catch (e) { }
        }
    }
    get_element_script(index) {
        return `window.get_highlight_element(${index});`;
    }
    buildInitTools() {
        return [
            {
                name: "navigate_to",
                description: "Navigate to a specific url",
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The url to navigate to",
                        },
                    },
                    required: ["url"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.navigate_to(agentContext, args.url));
                },
            },
            {
                name: "current_page",
                description: "Get the information of the current webpage (url, title)",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.get_current_page(agentContext));
                },
            },
            {
                name: "go_back",
                description: "Navigate back in browser history",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.go_back(agentContext));
                },
            },
            {
                name: "input_text",
                description: "Input text into an element",
                parameters: {
                    type: "object",
                    properties: {
                        index: {
                            type: "number",
                            description: "The index of the element to input text into",
                        },
                        text: {
                            type: "string",
                            description: "The text to input",
                        },
                        enter: {
                            type: "boolean",
                            description: "When text input is completed, press Enter (applicable to search boxes)",
                            default: false,
                        },
                    },
                    required: ["index", "text"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.input_text(agentContext, args.index, args.text, args.enter));
                },
            },
            {
                name: "click_element",
                description: "Click on an element by index",
                parameters: {
                    type: "object",
                    properties: {
                        index: {
                            type: "number",
                            description: "The index of the element to click",
                        },
                        num_clicks: {
                            type: "number",
                            description: "number of times to click the element, default 1",
                        },
                        button: {
                            type: "string",
                            description: "Mouse button type, default left",
                            enum: ["left", "right", "middle"],
                        },
                    },
                    required: ["index"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.click_element(agentContext, args.index, (args.num_clicks || 1), (args.button || "left")));
                },
            },
            /*
            {
              name: "scroll_to_element",
              description: "Scroll to the element",
              parameters: {
                type: "object",
                properties: {
                  index: {
                    type: "number",
                    description: "The index of the element to input text into",
                  },
                },
                required: ["index"],
              },
              execute: async (
                args: Record<string, unknown>,
                agentContext: AgentContext
              ): Promise<ToolResult> => {
                return await this.callInnerTool(() =>
                  this.scroll_to_element(agentContext, args.index as number)
                );
              },
            },
            */
            {
                name: "scroll_mouse_wheel",
                description: "Scroll the mouse wheel at current position, only scroll when you need to load more content",
                parameters: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: "Scroll amount (up / down)",
                            minimum: 1,
                            maximum: 10,
                        },
                        direction: {
                            type: "string",
                            enum: ["up", "down"],
                        },
                        extract_page_content: {
                            type: "boolean",
                            default: false,
                            description: "After scrolling is completed, whether to extract the current latest page content",
                        },
                    },
                    required: ["amount", "direction", "extract_page_content"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(async () => {
                        let amount = args.amount;
                        await this.scroll_mouse_wheel(agentContext, args.direction == "up" ? -amount : amount, args.extract_page_content == true);
                    });
                },
            },
            {
                name: "hover_to_element",
                description: "Mouse hover over the element",
                parameters: {
                    type: "object",
                    properties: {
                        index: {
                            type: "number",
                            description: "The index of the element to input text into",
                        },
                    },
                    required: ["index"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.hover_to_element(agentContext, args.index));
                },
            },
            {
                name: "extract_page_content",
                description: "Extract the text content of the current webpage, please use this tool to obtain webpage data.",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.extract_page_content(agentContext));
                },
            },
            {
                name: "get_select_options",
                description: "Get all options from a native dropdown element (<select>).",
                parameters: {
                    type: "object",
                    properties: {
                        index: {
                            type: "number",
                            description: "The index of the element to select",
                        },
                    },
                    required: ["index"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.get_select_options(agentContext, args.index));
                },
            },
            {
                name: "select_option",
                description: "Select the native dropdown option, Use this after get_select_options and when you need to select an option from a dropdown.",
                parameters: {
                    type: "object",
                    properties: {
                        index: {
                            type: "number",
                            description: "The index of the element to select",
                        },
                        option: {
                            type: "string",
                            description: "Text option",
                        },
                    },
                    required: ["index", "option"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.select_option(agentContext, args.index, args.option));
                },
            },
            {
                name: "get_all_tabs",
                description: "Get all tabs of the current browser",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.get_all_tabs(agentContext));
                },
            },
            {
                name: "switch_tab",
                description: "Switch to the specified tab page",
                parameters: {
                    type: "object",
                    properties: {
                        tabId: {
                            type: "number",
                            description: "Tab ID, obtained through get_all_tabs",
                        },
                    },
                    required: ["tabId"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.switch_tab(agentContext, args.tabId));
                },
            },
            {
                name: "wait",
                noPlan: true,
                description: "Wait for specified duration",
                parameters: {
                    type: "object",
                    properties: {
                        duration: {
                            type: "number",
                            description: "Duration in millisecond",
                            default: 500,
                            minimum: 200,
                            maximum: 10000,
                        },
                    },
                    required: ["duration"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => sleep((args.duration || 200)));
                },
            },
        ];
    }
    async double_screenshots(agentContext, messages, tools) {
        return true;
    }
    async handleMessages(agentContext, messages, tools) {
        const pseudoHtmlDescription = "请你先评估从当前截图中看到的执行结果是否符合预期，用拟人化的语气将看到的结果分点简洁列出，例如“太好了! 我看到..., 或者完美！我观察到...”。然后用一句话说明接下来要执行的一个操作是什么，例如“接下来我会执行...”。请仔细分辨下拉框（有灰色下拉标志）和输入框，当涉及到“选择”操作时，必须通过点击下拉框/单选框后选择最符合的选项，禁止直接向下拉框中输入文本。这是最新的截图和页面元素信息.\n元素和对应的index:\n"
        let lastTool = this.lastToolResult(messages);
        if (lastTool &&
            lastTool.toolName !== "extract_page_content" &&
            lastTool.toolName !== "get_all_tabs" &&
            lastTool.toolName !== "variable_storage") {
            await sleep(300);
            let image_contents = [];
            if (await this.double_screenshots(agentContext, messages, tools)) {
                let imageResult = await this.screenshot(agentContext);
                let image = toImage(imageResult.imageBase64);
                image_contents.push({
                    type: "image",
                    image: image,
                    mimeType: imageResult.imageType,
                });
            }
            let result = await this.screenshot_and_html(agentContext);
            let image = toImage(result.imageBase64);
            image_contents.push({
                type: "image",
                image: image,
                mimeType: result.imageType,
            });
            messages.push({
                role: "user",
                content: [
                    ...image_contents,
                    {
                        type: "text",
                        text: pseudoHtmlDescription + result.pseudoHtml,
                    },
                ],
            });
        }
        super.handleMessages(agentContext, messages, tools);
        this.handlePseudoHtmlText(messages, pseudoHtmlDescription);
    }
    handlePseudoHtmlText(messages, pseudoHtmlDescription) {
        for (let i = 0; i < messages.length; i++) {
            let message = messages[i];
            if (message.role !== "user" || message.content.length <= 1) {
                continue;
            }
            let content = message.content;
            for (let j = 0; j < content.length; j++) {
                let _content = content[j];
                if (_content.type == "text" &&
                    _content.text.startsWith(pseudoHtmlDescription)) {
                    if (i >= 2 && i < messages.length - 3) {
                        _content.text = this.removePseudoHtmlAttr(_content.text, [
                            "class",
                            "src",
                            "href",
                        ]);
                    }
                }
            }
            if (content[0].text == "[image]" &&
                content[1].text == "[image]") {
                content.splice(0, 1);
            }
        }
    }
    removePseudoHtmlAttr(pseudoHtml, remove_attrs) {
        return pseudoHtml
            .split("\n")
            .map((line) => {
            if (!line.startsWith("[") || line.indexOf("]:<") == -1) {
                return line;
            }
            line = line.substring(line.indexOf("]:<") + 2);
            for (let i = 0; i < remove_attrs.length; i++) {
                let sIdx = line.indexOf(remove_attrs[i] + '="');
                if (sIdx == -1) {
                    continue;
                }
                let eIdx = line.indexOf('"', sIdx + remove_attrs[i].length + 3);
                if (eIdx == -1) {
                    continue;
                }
                line =
                    line.substring(0, sIdx) +
                        line.substring(eIdx + 1).trim();
            }
            return line.replace('" >', '">').replace(" >", ">");
        })
            .join("\n");
    }
}
function typing(params) {
    let { index, text, enter } = params;
    let element = window.get_highlight_element(index);
    if (!element) {
        return false;
    }
    let input;
    if (element.tagName == "IFRAME") {
        let iframeDoc = element.contentDocument || element.contentWindow.document;
        input =
            iframeDoc.querySelector("textarea") ||
                iframeDoc.querySelector('*[contenteditable="true"]') ||
                iframeDoc.querySelector("input");
    }
    else if (element.tagName == "INPUT" ||
        element.tagName == "TEXTAREA" ||
        element.childElementCount == 0) {
        input = element;
    }
    else {
        input = element.querySelector("input") || element.querySelector("textarea");
        if (!input) {
            input = element.querySelector('*[contenteditable="true"]') || element;
            if (input.tagName == "DIV") {
                input =
                    input.querySelector("span") || input.querySelector("div") || input;
            }
        }
    }
    input.focus && input.focus();
    if (!text && enter) {
        ["keydown", "keypress", "keyup"].forEach((eventType) => {
            const event = new KeyboardEvent(eventType, {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
                cancelable: true,
            });
            input.dispatchEvent(event);
        });
        return true;
    }
    if (input.value == undefined) {
        input.textContent = text;
    }
    else {
        input.value = text;
        if (input.__proto__) {
            let value_setter = Object.getOwnPropertyDescriptor(input.__proto__, "value")?.set;
            value_setter && value_setter.call(input, text);
        }
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (enter) {
        ["keydown", "keypress", "keyup"].forEach((eventType) => {
            const event = new KeyboardEvent(eventType, {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
                cancelable: true,
            });
            input.dispatchEvent(event);
        });
    }
    return true;
}
function do_click(params) {
    let { index, button, num_clicks } = params;
    function simulateMouseEvent(eventTypes, button) {
        let element = window.get_highlight_element(index);
        if (!element) {
            return false;
        }
        for (let n = 0; n < num_clicks; n++) {
            for (let i = 0; i < eventTypes.length; i++) {
                const event = new MouseEvent(eventTypes[i], {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    button, // 0 left; 1 middle; 2 right
                });
                element.dispatchEvent(event);
            }
        }
        return true;
    }
    if (button == "right") {
        return simulateMouseEvent(["mousedown", "mouseup", "contextmenu"], 2);
    }
    else if (button == "middle") {
        return simulateMouseEvent(["mousedown", "mouseup", "click"], 1);
    }
    else {
        return simulateMouseEvent(["mousedown", "mouseup", "click"], 0);
    }
}
function hover_to(params) {
    let element = window.get_highlight_element(params.index);
    if (!element) {
        return false;
    }
    const event = new MouseEvent("mouseenter", {
        bubbles: true,
        cancelable: true,
        view: window,
    });
    element.dispatchEvent(event);
    return true;
}
function get_select_options(params) {
    let element = window.get_highlight_element(params.index);
    if (!element || element.tagName.toUpperCase() !== "SELECT") {
        return "Error: Not a select element";
    }
    return {
        options: Array.from(element.options).map((opt) => ({
            index: opt.index,
            text: opt.text.trim(),
            value: opt.value,
        })),
        name: element.name,
    };
}
function select_option(params) {
    let element = window.get_highlight_element(params.index);
    if (!element || element.tagName.toUpperCase() !== "SELECT") {
        return "Error: Not a select element";
    }
    let text = params.option.trim();
    let option = Array.from(element.options).find((opt) => opt.text.trim() === text);
    if (!option) {
        option = Array.from(element.options).find((opt) => opt.value.trim() === text);
    }
    if (!option) {
        return {
            success: false,
            error: "Select Option not found",
            availableOptions: Array.from(element.options).map((o) => o.text.trim()),
        };
    }
    element.value = option.value;
    element.dispatchEvent(new Event("change"));
    return {
        success: true,
        selectedValue: option.value,
        selectedText: option.text.trim(),
    };
}
function scroll_by(params) {
    const amount = params.amount;
    const documentElement = document.documentElement || document.body;
    if (documentElement.scrollHeight > window.innerHeight * 1.2) {
        const y = Math.max(20, Math.min((window.innerHeight || documentElement.clientHeight) / 10, 200));
        window.scrollBy(0, y * amount);
        return;
    }
    function findNodes(element = document, nodes = []) {
        for (const node of Array.from(element.querySelectorAll("*"))) {
            if (node.tagName === "IFRAME" && node.contentDocument) {
                findNodes(node.contentDocument, nodes);
            }
            else {
                nodes.push(node);
            }
        }
        return nodes;
    }
    function findScrollableElements() {
        const allElements = findNodes();
        let elements = allElements.filter((el) => {
            const style = window.getComputedStyle(el);
            const overflowY = style.getPropertyValue("overflow-y");
            return ((overflowY === "auto" || overflowY === "scroll") &&
                el.scrollHeight > el.clientHeight);
        });
        if (elements.length == 0) {
            elements = allElements.filter((el) => {
                const style = window.getComputedStyle(el);
                const overflowY = style.getPropertyValue("overflow-y");
                return (overflowY === "auto" ||
                    overflowY === "scroll" ||
                    el.scrollHeight > el.clientHeight);
            });
        }
        return elements;
    }
    function getVisibleArea(element) {
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight || documentElement.clientHeight;
        const viewportWidth = window.innerWidth || documentElement.clientWidth;
        const visibleLeft = Math.max(0, Math.min(rect.left, viewportWidth));
        const visibleRight = Math.max(0, Math.min(rect.right, viewportWidth));
        const visibleTop = Math.max(0, Math.min(rect.top, viewportHeight));
        const visibleBottom = Math.max(0, Math.min(rect.bottom, viewportHeight));
        const visibleWidth = visibleRight - visibleLeft;
        const visibleHeight = visibleBottom - visibleTop;
        return visibleWidth * visibleHeight;
    }
    const scrollableElements = findScrollableElements();
    if (scrollableElements.length === 0) {
        const y = Math.max(20, Math.min((window.innerHeight || documentElement.clientHeight) / 10, 200));
        window.scrollBy(0, y * amount);
        return false;
    }
    const sortedElements = scrollableElements.sort((a, b) => {
        return getVisibleArea(b) - getVisibleArea(a);
    });
    const largestElement = sortedElements[0];
    const viewportHeight = largestElement.clientHeight;
    const y = Math.max(20, Math.min(viewportHeight / 10, 200));
    largestElement.scrollBy(0, y * amount);
    const maxHeightElement = sortedElements.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    if (maxHeightElement != largestElement) {
        const viewportHeight = maxHeightElement.clientHeight;
        const y = Math.max(20, Math.min(viewportHeight / 10, 200));
        maxHeightElement.scrollBy(0, y * amount);
    }
    return true;
}

class BaseBrowserScreenAgent extends BaseBrowserAgent {
    constructor(llms, ext_tools, mcpClient) {
        const description = `You are a browser operation agent, use a mouse and keyboard to interact with a browser.
* This is a browser GUI interface, observe the webpage execution through screenshots, and specify action sequences to complete designated tasks.
* For the first visit, please call the \`navigate_to\` or \`current_page\` tool first. After that, each of your actions will return a screenshot of the page.
* BROWSER OPERATIONS:
  - Navigate to URLs and manage history
  - Fill forms and submit data
  - Click elements and interact with pages
  - Extract text and HTML content
  - Wait for elements to load
  - Scroll pages and handle infinite scroll
  - YOU CAN DO ANYTHING ON THE BROWSER - including clicking on elements, filling forms, submitting data, etc.`;
        const _tools_ = [];
        super({
            name: AGENT_NAME,
            description: description,
            tools: _tools_,
            llms: llms,
            mcpClient: mcpClient,
            planDescription: "Browser operation agent, interact with the browser using the mouse and keyboard.",
        });
        let init_tools = this.buildInitTools();
        if (ext_tools && ext_tools.length > 0) {
            init_tools = mergeTools(init_tools, ext_tools);
        }
        init_tools.forEach((tool) => _tools_.push(tool));
    }
    buildInitTools() {
        return [
            {
                name: "navigate_to",
                description: "Navigate to a specific url",
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The url to navigate to",
                        },
                    },
                    required: ["url"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.navigate_to(agentContext, args.url));
                },
            },
            {
                name: "current_page",
                description: "Get the information of the current webpage (url, title)",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.get_current_page(agentContext));
                },
            },
            {
                name: "go_back",
                description: "Navigate back in browser history",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.go_back(agentContext));
                },
            },
            {
                name: "typing",
                description: "Type specified text",
                parameters: {
                    type: "object",
                    properties: {
                        text: {
                            type: "string",
                            description: "Text to type",
                        },
                    },
                    required: ["text"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.typing(agentContext, args.text));
                },
            },
            {
                name: "click",
                description: "Click at current or specified position",
                parameters: {
                    type: "object",
                    properties: {
                        x: {
                            type: "number",
                            description: "X coordinate",
                        },
                        y: {
                            type: "number",
                            description: "Y coordinate",
                        },
                        num_clicks: {
                            type: "number",
                            description: "Number of clicks",
                            enum: [1, 2, 3],
                            default: 1,
                        },
                        button: {
                            type: "string",
                            description: "Mouse button to click",
                            enum: ["left", "right", "middle"],
                            default: "left",
                        },
                    },
                    required: ["x", "y"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.click(agentContext, args.x, args.y, (args.num_clicks || 1), (args.button || "left")));
                },
            },
            {
                name: "move_to",
                description: "Move cursor to specified position",
                parameters: {
                    type: "object",
                    properties: {
                        x: {
                            type: "number",
                            description: "X coordinate",
                        },
                        y: {
                            type: "number",
                            description: "Y coordinate",
                        },
                    },
                    required: ["x", "y"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.move_to(agentContext, args.x, args.y));
                },
            },
            {
                name: "scroll",
                description: "Scroll the mouse wheel at current position",
                parameters: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: "Scroll amount (up / down)",
                            minimum: 1,
                            maximum: 10,
                        },
                        direction: {
                            type: "string",
                            enum: ["up", "down"],
                        },
                    },
                    required: ["amount", "direction"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(async () => {
                        let amount = args.amount;
                        await this.scroll(agentContext, args.direction == "up" ? -amount : amount);
                    });
                },
            },
            {
                name: "extract_page_content",
                description: "Extract the text content of the current webpage, please use this tool to obtain webpage data.",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.extract_page_content(agentContext));
                },
            },
            {
                name: "press",
                description: "Press and release a key, supports Enter, Delete, Backspace, Tab, Space",
                parameters: {
                    type: "object",
                    properties: {
                        key: {
                            type: "string",
                            description: "Key to press",
                            enum: ["enter", "tab", "space", "backspace", "delete"],
                        },
                    },
                    required: ["key"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.press(agentContext, args.key));
                },
            },
            {
                name: "drag_and_drop",
                description: "Drag and drop operation",
                parameters: {
                    type: "object",
                    properties: {
                        x1: {
                            type: "number",
                            description: "From X coordinate",
                        },
                        y1: {
                            type: "number",
                            description: "From Y coordinate",
                        },
                        x2: {
                            type: "number",
                            description: "Target X coordinate",
                        },
                        y2: {
                            type: "number",
                            description: "Target Y coordinate",
                        },
                    },
                    required: ["x1", "y1", "x2", "y2"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.drag_and_drop(agentContext, args.x1, args.y1, args.x2, args.y2));
                },
            },
            {
                name: "get_all_tabs",
                description: "Get all tabs of the current browser",
                parameters: {
                    type: "object",
                    properties: {},
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.get_all_tabs(agentContext));
                },
            },
            {
                name: "switch_tab",
                description: "Switch to the specified tab page",
                parameters: {
                    type: "object",
                    properties: {
                        tabId: {
                            type: "number",
                            description: "Tab ID, obtained through get_all_tabs",
                        },
                    },
                    required: ["tabId"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => this.switch_tab(agentContext, args.tabId));
                },
            },
            {
                name: "wait",
                noPlan: true,
                description: "Wait for specified duration",
                parameters: {
                    type: "object",
                    properties: {
                        duration: {
                            type: "number",
                            description: "Duration in millisecond",
                            default: 500,
                            minimum: 200,
                            maximum: 10000,
                        },
                    },
                    required: ["duration"],
                },
                execute: async (args, agentContext) => {
                    return await this.callInnerTool(() => sleep((args.duration || 200)));
                },
            },
        ];
    }
    async handleMessages(agentContext, messages, tools) {
        let lastTool = this.lastToolResult(messages);
        if (lastTool &&
            lastTool.toolName !== "extract_page_content" &&
            lastTool.toolName !== "get_all_tabs" &&
            lastTool.toolName !== "variable_storage") {
            await sleep(300);
            let result = await this.screenshot(agentContext);
            let image = toImage(result.imageBase64);
            messages.push({
                role: "user",
                content: [
                    {
                        type: "image",
                        image: image,
                        mimeType: result.imageType,
                    },
                    {
                        type: "text",
                        text: "This is the latest screenshot",
                    },
                ],
            });
        }
        super.handleMessages(agentContext, messages, tools);
    }
}

exports.Agent = Agent;
exports.AgentChain = AgentChain;
exports.AgentContext = AgentContext;
exports.BaseBrowserAgent = BaseBrowserAgent;
exports.BaseBrowserLabelsAgent = BaseBrowserLabelsAgent;
exports.BaseBrowserScreenAgent = BaseBrowserScreenAgent;
exports.BaseChatAgent = BaseChatAgent;
exports.BaseComputerAgent = BaseComputerAgent;
exports.BaseFileAgent = BaseFileAgent;
exports.BaseShellAgent = BaseShellAgent;
exports.BaseTimerAgent = BaseTimerAgent;
exports.Chain = Chain;
exports.Context = Context;
exports.Eko = Eko;
exports.ForeachTaskTool = ForeachTaskTool;
exports.HumanInteractTool = HumanInteractTool;
exports.Log = Log;
exports.RetryLanguageModel = RetryLanguageModel;
exports.SimpleSseMcpClient = SimpleSseMcpClient;
exports.TaskNodeStatusTool = TaskNodeStatusTool;
exports.VariableStorageTool = VariableStorageTool;
exports.WatchTriggerTool = WatchTriggerTool;
exports.call_timeout = call_timeout;
exports.config = config;
exports.convertToolSchema = convertToolSchema;
exports.default = Eko;
exports.mergeTools = mergeTools;
exports.toImage = toImage;
exports.uuidv4 = uuidv4;
//# sourceMappingURL=index.cjs.js.map
