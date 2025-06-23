import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1FunctionTool,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  LanguageModelV1TextPart,
} from "@ai-sdk/provider";
import Log from "../common/log";
import config from "../config";
import { createOpenAI } from "@ai-sdk/openai";
import { call_timeout } from "../common/utils";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  GenerateResult,
  LLMRequest,
  LLMs,
  StreamResult,
} from "../types/llm.types";

export class RetryLanguageModel {
  private llms: LLMs;
  private names: string[];
  private stream_first_timeout: number;

  constructor(llms: LLMs, names?: string[], stream_first_timeout?: number) {
    this.llms = llms;
    this.names = names || [];
    this.stream_first_timeout = stream_first_timeout || 30_000;
    if (this.names.indexOf("default") == -1) {
      this.names.push("default");
    }
  }

  async call(request: LLMRequest): Promise<GenerateResult> {
    // 保存工具定义用于添加到系统提示
    const toolsDescription = this.generateToolsDescription(request.tools);
    
    // 修改系统提示，添加工具描述
    const messages = [...request.messages];
    this.addToolDescriptionToSystemPrompt(messages, toolsDescription);
    
    // 不传递标准工具定义
    return await this.doGenerate({
      inputFormat: "messages",
      mode: {
        type: "regular",
        // 不传递 tools 和 toolChoice
      },
      prompt: messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      providerMetadata: {},
      abortSignal: request.abortSignal,
    });
  }

  async doGenerate(
    options: LanguageModelV1CallOptions
  ): Promise<GenerateResult> {
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
          Log.debug(
            `LLM nonstream body, name: ${name} => `,
            result.request?.body
          );
        }
        return result;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw e;
        }
        if (Log.isEnableInfo()) {
          Log.info(`LLM nonstream request, name: ${name} => `, {
            tools: (options.mode as any)?.tools,
            messages: options.prompt,
          });
        }
        Log.error(`LLM error, name: ${name} => `, e);
      }
    }
    return Promise.reject(new Error("No LLM available"));
  }

  async callStream(request: LLMRequest): Promise<StreamResult> {
    console.log('【zindler】params to llm: ', request);
    
    // 保存工具定义用于添加到系统提示
    const toolsDescription = this.generateToolsDescription(request.tools);
    
    // 修改系统提示，添加工具描述
    const messages = [...request.messages];
    this.addToolDescriptionToSystemPrompt(messages, toolsDescription);
    
    // 不传递标准工具定义
    return await this.doStream({
      inputFormat: "messages",
      mode: {
        type: "regular",
        // 不传递 tools 和 toolChoice
      },
      prompt: messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      topP: request.topP,
      topK: request.topK,
      providerMetadata: {},
      abortSignal: request.abortSignal,
    });
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<StreamResult> {
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
        const result = await call_timeout(
          async () => await llm.doStream({ ...options, abortSignal: signal }),
          this.stream_first_timeout,
          (e) => {
            controller.abort();
          }
        );
        const stream = result.stream;
        const reader = stream.getReader();
        const { done, value } = await call_timeout(
          async () => await reader.read(),
          this.stream_first_timeout,
          (e) => {
            reader.cancel();
            reader.releaseLock();
            controller.abort();
          }
        );
        if (done) {
          Log.warn(`LLM stream done, name: ${name} => `, { done, value });
          reader.releaseLock();
          continue;
        }
        if (Log.isEnableDebug()) {
          Log.debug(`LLM stream body, name: ${name} => `, result.request?.body);
        }
        let chunk = value as LanguageModelV1StreamPart;
        if (chunk.type == "error") {
          Log.error(`LLM stream error, name: ${name}`, chunk);
          reader.releaseLock();
          continue;
        }
        result.stream = this.streamWrapper([chunk], reader);
        return result;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw e;
        }
        if (Log.isEnableInfo()) {
          Log.info(`LLM stream request, name: ${name} => `, {
            tools: (options.mode as any)?.tools,
            messages: options.prompt,
          });
        }
        Log.error(`LLM error, name: ${name} => `, e);
      }
    }
    return Promise.reject(new Error("No LLM available"));
  }

  private generateToolsDescription(tools?: Array<LanguageModelV1FunctionTool>): string {
    if (!tools || tools.length === 0) return "";
    
    let description = "You have access to the following tools. Use them by formatting your response as shown below:\n\n";
    
    // 添加每个工具的描述
    for (const tool of tools) {
      description += `Tool: ${tool.name}\n`;
      description += `Description: ${tool.description}\n`;
      
      // 添加参数说明
      if (tool.parameters) {
        description += "Parameters:\n";
        const parameters = tool.parameters.properties || {};
        
        for (const paramName in parameters) {
          const param = parameters[paramName];
          const paramDesc = typeof param === 'object' && param ? (param.description || 'No description') : 'No description';
          description += `- ${paramName}: ${paramDesc}\n`;
        }
      }
      
      description += "\n";
    }
    
    // 添加使用格式说明
    description += `\nWhen you want to use a tool, format your response like this:\n\n`;
    description += `<function>tool_name</function>\n<args>\n{
  "param1": "value1",\n  "param2": "value2"\n}\n</args>\n\n`;
    description += `You can call multiple tools in a single response if needed.\n`;
    
    return description;
  }

  private addToolDescriptionToSystemPrompt(messages: LanguageModelV1Prompt, toolsDescription: string): void {
    if (!toolsDescription) return;
    
    const systemMessageIndex = messages.findIndex(message => message.role === "system");
    if (systemMessageIndex >= 0) {
      const systemMessage = messages[systemMessageIndex];
      if (typeof systemMessage.content === "string") {
        // 使用类型断言来解决类型不兼容问题
        (messages[systemMessageIndex] as any) = {
          ...systemMessage,
          content: [{ type: "text", text: `${systemMessage.content}\n\n${toolsDescription}` }]
        };
      } else if (Array.isArray(systemMessage.content)) {
        // 如果是数组类型，添加到最后一个文本部分
        const textParts = systemMessage.content.filter(part => part.type === "text") as Array<{type: "text", text: string}>;
        if (textParts.length > 0) {
          textParts[textParts.length - 1].text += `\n\n${toolsDescription}`;
        } else {
          // 如果没有文本部分，添加一个新的
          systemMessage.content.push({ type: "text", text: toolsDescription } as any);
        }
      }
    } else {
      // 如果没有系统消息，创建一个
      messages.unshift({
        role: "system",
        content: [{ type: "text", text: toolsDescription }]
      } as any);
    }
  }

  private async getLLM(name: string): Promise<LanguageModelV1 | null> {
    const llm = this.llms[name];
    if (!llm) {
      return null;
    }
    let apiKey;
    if (typeof llm.apiKey === "string") {
      apiKey = llm.apiKey;
    } else {
      apiKey = await llm.apiKey();
    }
    let baseURL = undefined;
    if (llm.config?.baseURL) {
      if (typeof llm.config.baseURL === "string") {
        baseURL = llm.config.baseURL;
      } else {
        baseURL = await llm.config.baseURL();
      }
    }
    if (llm.provider == "openai") {
      return createOpenAI({
        apiKey: apiKey,
        baseURL: baseURL,
      }).languageModel(llm.model);
    } else if (llm.provider == "anthropic") {
      return createAnthropic({
        apiKey: apiKey,
        baseURL: baseURL,
      }).languageModel(llm.model);
    } else if (llm.provider == "google") {
      return createGoogleGenerativeAI({
        apiKey: apiKey,
        baseURL: baseURL,
      }).languageModel(llm.model);
    } else if (llm.provider == "aws") {
      let keys = apiKey.split("=");
      return createAmazonBedrock({
        accessKeyId: keys[0],
        secretAccessKey: keys[1],
        baseURL: baseURL,
        region: llm.config?.region || "us-west-1",
      }).languageModel(llm.model);
    } else if (llm.provider == "openrouter") {
      return createOpenRouter({
        apiKey: apiKey,
        baseURL: baseURL,
      }).languageModel(llm.model);
    } else {
      return llm.provider.languageModel(llm.model);
    }
  }

  private streamWrapper(
    parts: LanguageModelV1StreamPart[],
    reader: ReadableStreamDefaultReader<LanguageModelV1StreamPart>
  ): ReadableStream<LanguageModelV1StreamPart> {
    return new ReadableStream<LanguageModelV1StreamPart>({
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
