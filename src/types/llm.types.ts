import {
  ProviderV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1FunctionToolCall,
  LanguageModelV1ProviderMetadata,
  LanguageModelV1Source,
  LanguageModelV1StreamPart,
  LanguageModelV1FunctionTool,
  LanguageModelV1ToolChoice,
  LanguageModelV1Prompt,
} from "@ai-sdk/provider";

export type LLMprovider =
  | "openai"
  | "anthropic"
  | "google"
  | "aws"
  | ProviderV1;

export type LLMConfig = {
  provider: LLMprovider;
  model: string;
  apiKey: string;
  config?: {
    baseURL?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    [key: string]: any;
  };
};

export type LLMs = {
  default: LLMConfig;
  [key: string]: LLMConfig;
};

export type GenerateResult = {
  text?: string;
  reasoning?:
    | string
    | Array<
        | {
            type: "text";
            text: string;
            signature?: string;
          }
        | {
            type: "redacted";
            data: string;
          }
      >;
  files?: Array<{
    data: string | Uint8Array;
    mimeType: string;
  }>;
  toolCalls?: Array<LanguageModelV1FunctionToolCall>;
  finishReason: LanguageModelV1FinishReason;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  rawCall: {
    rawPrompt: unknown;
    rawSettings: Record<string, unknown>;
  };
  rawResponse?: {
    headers?: Record<string, string>;
    body?: unknown;
  };
  request?: {
    body?: string;
  };
  response?: {
    id?: string;
    timestamp?: Date;
    modelId?: string;
  };
  warnings?: LanguageModelV1CallWarning[];
  providerMetadata?: LanguageModelV1ProviderMetadata;
  sources?: LanguageModelV1Source[];
};

export type StreamResult = {
  stream: ReadableStream<LanguageModelV1StreamPart>;
  rawCall: {
    rawPrompt: unknown;
    rawSettings: Record<string, unknown>;
  };
  rawResponse?: {
    headers?: Record<string, string>;
  };
  request?: {
    body?: string;
  };
  warnings?: Array<LanguageModelV1CallWarning>;
};

export type LLMRequest = {
  maxTokens?: number;
  messages: LanguageModelV1Prompt;
  toolChoice?: LanguageModelV1ToolChoice;
  tools?: Array<LanguageModelV1FunctionTool>;
  temperature?: number;
  topP?: number;
  topK?: number;
  abortSignal?: AbortSignal;
};
