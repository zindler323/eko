import {
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from "@ai-sdk/provider";
import { toImage } from "../../src/common/utils";
import { RetryLanguageModel } from "../../src/llm";
import { LLMs } from "../../src/types/llm.types";
import dotenv from "dotenv";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;
const claudeBaseURL = process.env.ANTHROPIC_BASE_URL;
const claudeApiKey = process.env.ANTHROPIC_API_KEY;

const llms: LLMs = {
  default: {
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL,
    },
  },
  test1: {
    provider: "anthropic",
    model: "claude-3-7-sonnet-20250219",
    apiKey: "xxx",
    config: {
      baseURL: claudeBaseURL,
    },
  },
  test2: {
    provider: "openai",
    model: "xxx",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL,
    },
  },
  openai: {
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL,
    },
  },
  claude: {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    apiKey: claudeApiKey || "",
    config: {
      baseURL: claudeBaseURL,
    },
  },
};

const names = ["test1", "test2", "default"];

async function testRetryGenerate() {
  let client = new RetryLanguageModel(llms, names);

  let result = await client.call({
    maxTokens: 1024,
    temperature: 0.7,
    messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
  });

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.text, result.usage);
}

async function testOpenaiStream() {
  const client = new RetryLanguageModel(llms, names);

  let result = await client.callStream({
    maxTokens: 1024,
    temperature: 0.7,
    messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
  });

  console.log(JSON.stringify(result, null, 2));
  let stream = result.stream;
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("===> done", value);
        break;
      }
      let chunk = value as LanguageModelV1StreamPart;
      console.log("chunk: ", chunk);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function testToolsPrompt() {
  let client = new RetryLanguageModel(llms, names);

  let result = await client.call({
    tools: [
      {
        type: "function",
        name: "get_current_country",
        description: "user current country",
        parameters: {
          type: "object",
          properties: {},
        },
      },
      {
        type: "function",
        name: "web_search",
        description: "google search tool",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "search for keywords",
            },
            country: {
              type: "string",
            },
            maxResults: {
              type: "number",
              description: "Maximum search results, default 5",
            },
          },
          required: ["query"],
        },
      },
    ],
    toolChoice: {
      type: "auto",
    },
    messages: [
      { role: "system", content: "You are a helpful AI assistant" },
      { role: "user", content: [{ type: "text", text: "搜索最近的国家大事" }] },
    ],
    maxTokens: 1024,
    temperature: 0.7,
  });

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.text, result.toolCalls, result.usage);
}

async function testImage() {
  let client = new RetryLanguageModel(llms, names);
  let imageBase64 =
    "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";
  let result = await client.call({
    maxTokens: 1024,
    temperature: 0.7,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: toImage(imageBase64),
            mimeType: "image/jpeg",
          },
          { type: "text", text: "图片中包含什么？" },
        ],
      },
    ],
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(result.finishReason, result.text, result.usage);
}

export async function testImageToolsPrompt(llm: "openai" | "claude") {
  let imageBase64 =
    "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";
  let client = new RetryLanguageModel(llms, [llm]);
  let result = await client.callStream({
    tools: [
      {
        type: "function",
        name: "random_gen_image",
        description: "Randomly generate various images, handwritten text",
        parameters: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description: "Generate image type",
              enum: ["handwritten_text", "scenic", "anime"],
            },
          },
          required: ["type"],
        },
      },
    ],
    toolChoice: {
      type: "auto",
    },
    messages: [
      { role: "system", content: "You are a helpful AI assistant" },
      {
        role: "user",
        content: [{ type: "text", text: "帮我随机生成文字手写图片" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "tool_613DVw1dqWT9d33YDkZDKhFH",
            toolName: "random_gen_image",
            args: { type: "handwritten_text" },
          },
        ],
      },
      // Only the calude model supports returning images from tool results, while openai only supports text.
      ...((llm == "claude"
        ? [
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "tool_613DVw1dqWT9d33YDkZDKhFH",
                  toolName: "random_gen_image",
                  result: { success: true },
                  content: [
                    {
                      type: "image",
                      data: imageBase64,
                      mimeType: "image/jpeg",
                    },
                  ],
                },
              ],
            },
          ]
        : [
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "tool_613DVw1dqWT9d33YDkZDKhFH",
                  toolName: "random_gen_image",
                  result: { success: true },
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "image",
                  image: toImage(imageBase64),
                  mimeType: "image/jpeg",
                },
                { type: "text", text: "call `random_gen_image` tool result" },
              ],
            },
          ]) as LanguageModelV1Prompt),
    ],
    maxTokens: 1024,
    temperature: 0.7,
  });

  console.log(JSON.stringify(result, null, 2));
  let stream = result.stream;
  const reader = stream.getReader();
  let resultText = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("===> done", value);
        break;
      }
      let chunk = value as LanguageModelV1StreamPart;
      console.log("chunk: ", chunk);
      if (chunk.type == "text-delta") {
        resultText += chunk.textDelta;
      }
    }
  } finally {
    reader.releaseLock();
  }
  console.log("resultText: ", resultText);
}

test.only("test", async () => {
  await testImageToolsPrompt("openai");
  // await testImageToolsPrompt("claude");
});
