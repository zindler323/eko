import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
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
  private stream_token_timeout: number;

  constructor(
    llms: LLMs,
    names?: string[],
    stream_first_timeout?: number,
    stream_token_timeout?: number
  ) {
    this.llms = llms;
    this.names = names || [];
    this.stream_first_timeout = stream_first_timeout || 30_000;
    this.stream_token_timeout = stream_token_timeout || 180_000;
    if (this.names.indexOf("default") == -1) {
      this.names.push("default");
    }
  }

  async call(request: LLMRequest): Promise<GenerateResult> {
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
      stopSequences: request.stopSequences,
      abortSignal: request.abortSignal,
    });
  }

  async doGenerate(
    options: LanguageModelV1CallOptions
  ): Promise<GenerateResult> {
    const maxTokens = options.maxTokens;
    const providerMetadata = options.providerMetadata;
    const names = [...this.names, ...this.names];
    let lastError;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const llmConfig = this.llms[name];
      const llm = await this.getLLM(name);
      if (!llm) {
        continue;
      }
      if (!maxTokens) {
        options.maxTokens = llmConfig.config?.maxTokens || config.maxTokens;
      }
      if (!providerMetadata) {
        options.providerMetadata = {};
        options.providerMetadata[llm.provider] = llmConfig.options || {};
      }
      let _options = options;
      if (llmConfig.handler) {
        _options = await llmConfig.handler(_options);
      }
      try {
        let result = (await llm.doGenerate(_options)) as GenerateResult;
        if (Log.isEnableDebug()) {
          Log.debug(
            `LLM nonstream body, name: ${name} => `,
            result.request?.body
          );
        }
        result.llm = name;
        result.llmConfig = llmConfig;
        return result;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw e;
        }
        lastError = e;
        if (Log.isEnableInfo()) {
          Log.info(`LLM nonstream request, name: ${name} => `, {
            tools: (_options.mode as any)?.tools,
            messages: _options.prompt,
          });
        }
        Log.error(`LLM error, name: ${name} => `, e);
      }
    }
    return Promise.reject(
      lastError ? lastError : new Error("No LLM available")
    );
  }

  async callStream(request: LLMRequest): Promise<StreamResult> {
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
      stopSequences: request.stopSequences,
      abortSignal: request.abortSignal,
    });
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<StreamResult> {
    console.log('【zindler】params to llm: ', options);
    const maxTokens = options.maxTokens;
    const providerMetadata = options.providerMetadata;
    const names = [...this.names, ...this.names];
    let lastError;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const llmConfig = this.llms[name];
      const llm = await this.getLLM(name);
      if (!llm) {
        continue;
      }
      if (!maxTokens) {
        options.maxTokens = llmConfig.config?.maxTokens || config.maxTokens;
      }
      if (!providerMetadata) {
        options.providerMetadata = {};
        options.providerMetadata[llm.provider] = llmConfig.options || {};
      }
      let _options = options;
      if (llmConfig.handler) {
        _options = await llmConfig.handler(_options);
      }
      try {
        const controller = new AbortController();
        const signal = _options.abortSignal
          ? AbortSignal.any([_options.abortSignal, controller.signal])
          : controller.signal;
        const result = (await call_timeout(
          async () => await llm.doStream({ ..._options, abortSignal: signal }),
          this.stream_first_timeout,
          (e) => {
            controller.abort();
          }
        )) as StreamResult;
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
        result.llm = name;
        result.llmConfig = llmConfig;
        result.stream = this.streamWrapper([chunk], reader, controller);
        return result;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw e;
        }
        lastError = e;
        if (Log.isEnableInfo()) {
          Log.info(`LLM stream request, name: ${name} => `, {
            tools: (_options.mode as any)?.tools,
            messages: _options.prompt,
          });
        }
        Log.error(`LLM error, name: ${name} => `, e);
      }
    }
    return Promise.reject(
      lastError ? lastError : new Error("No LLM available")
    );
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
        fetch: llm.fetch,
        organization: llm.config?.organization,
        project: llm.config?.project,
        headers: llm.config?.headers,
        compatibility: llm.config?.compatibility,
      }).languageModel(llm.model);
    } else if (llm.provider == "anthropic") {
      return createAnthropic({
        apiKey: apiKey,
        baseURL: baseURL,
        fetch: llm.fetch,
        headers: llm.config?.headers,
      }).languageModel(llm.model);
    } else if (llm.provider == "google") {
      return createGoogleGenerativeAI({
        apiKey: apiKey,
        baseURL: baseURL,
        fetch: llm.fetch,
        headers: llm.config?.headers,
      }).languageModel(llm.model);
    } else if (llm.provider == "aws") {
      let keys = apiKey.split("=");
      return createAmazonBedrock({
        accessKeyId: keys[0],
        secretAccessKey: keys[1],
        baseURL: baseURL,
        region: llm.config?.region || "us-west-1",
        fetch: llm.fetch,
        headers: llm.config?.headers,
        sessionToken: llm.config?.sessionToken,
      }).languageModel(llm.model);
    } else if (llm.provider == "openrouter") {
      return createOpenRouter({
        apiKey: apiKey,
        baseURL: baseURL,
        fetch: llm.fetch,
        headers: llm.config?.headers,
        compatibility: llm.config?.compatibility,
      }).languageModel(llm.model);
    } else {
      return llm.provider.languageModel(llm.model);
    }
  }

  private streamWrapper(
    parts: LanguageModelV1StreamPart[],
    reader: ReadableStreamDefaultReader<LanguageModelV1StreamPart>,
    abortController: AbortController
  ): ReadableStream<LanguageModelV1StreamPart> {
    let timer: any = null;
    return new ReadableStream<LanguageModelV1StreamPart>({
      start: (controller) => {
        if (parts != null && parts.length > 0) {
          for (let i = 0; i < parts.length; i++) {
            controller.enqueue(parts[i]);
          }
        }
      },
      pull: async (controller) => {
        timer = setTimeout(() => {
          abortController.abort("Streaming request timeout");
        }, this.stream_token_timeout);
        const { done, value } = await reader.read();
        clearTimeout(timer);
        if (done) {
          controller.close();
          reader.releaseLock();
          return;
        }
        controller.enqueue(value);
      },
      cancel: (reason) => {
        timer && clearTimeout(timer);
        reader.cancel(reason);
      },
    });
  }

  public get Llms(): LLMs {
    return this.llms;
  }

  public get Names(): string[] {
    return this.names;
  }
}
