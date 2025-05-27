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

  constructor(llms: LLMs, names?: string[], stream_first_timeout?: number) {
    this.llms = llms;
    this.names = names || [];
    this.stream_first_timeout = stream_first_timeout || 30_000;
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
      const llm = this.getLLM(name);
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

  async doStream(options: LanguageModelV1CallOptions): Promise<StreamResult> {
    const maxTokens = options.maxTokens;
    const names = [...this.names, ...this.names];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const llm = this.getLLM(name);
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

  private getLLM(name: string): LanguageModelV1 | null {
    const llm = this.llms[name];
    if (!llm) {
      return null;
    }
    if (llm.provider == "openai") {
      return createOpenAI({
        apiKey: llm.apiKey,
        baseURL: llm.config?.baseURL,
      }).languageModel(llm.model);
    } else if (llm.provider == "anthropic") {
      return createAnthropic({
        apiKey: llm.apiKey,
        baseURL: llm.config?.baseURL,
      }).languageModel(llm.model);
    } else if (llm.provider == "google") {
      return createGoogleGenerativeAI({
        apiKey: llm.apiKey,
        baseURL: llm.config?.baseURL,
      }).languageModel(llm.model);
    } else if (llm.provider == "aws") {
      let keys = llm.apiKey.split("=");
      return createAmazonBedrock({
        accessKeyId: keys[0],
        secretAccessKey: keys[1],
        baseURL: llm.config?.baseURL,
        region: llm.config?.region || "us-west-1",
      }).languageModel(llm.model);
    } else if (llm.provider == "openrouter") {
      return createOpenRouter({
        apiKey: llm.apiKey,
        baseURL: llm.config?.baseURL,
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
