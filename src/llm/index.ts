import {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
} from "@ai-sdk/provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import Log from "../common/log";
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
    this.stream_first_timeout = stream_first_timeout || 20_000;
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
    for (let i = 0; i < this.names.length; i++) {
      const name = this.names[i];
      const llm = this.getLLM(name);
      if (!llm) {
        continue;
      }
      try {
        let result = await llm.doGenerate(options);
        if (Log.isEnableDebug()) {
          Log.debug(`LLM nonstream body, name: ${name} => `, result.request?.body);
        }
        return result;
      } catch (e) {
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
    for (let i = 0; i < this.names.length; i++) {
      const name = this.names[i];
      const llm = this.getLLM(name);
      if (!llm) {
        continue;
      }
      try {
        const result = await llm.doStream(options);
        const stream = result.stream;
        const reader = stream.getReader();
        const { done, value } = await new Promise<
          ReadableStreamReadResult<LanguageModelV1StreamPart>
        >(async (resolve, reject) => {
          let timer = setTimeout(async () => {
            reader.cancel();
            reader.releaseLock();
            reject();
          }, this.stream_first_timeout);
          const chunk = await reader.read();
          clearTimeout(timer);
          resolve(chunk);
        });
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
      } catch (e) {
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
      }).languageModel(llm.model, {
        // disable_parallel_tool_use
        parallelToolCalls: false,
      });
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
        region: llm.config?.region || "us-east-2",
        baseURL: llm.config?.baseURL,
        accessKeyId: keys[0],
        secretAccessKey: keys[1],
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
