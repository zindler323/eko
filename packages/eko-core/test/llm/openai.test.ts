import { createOpenAI } from "@ai-sdk/openai";
import { LanguageModelV1, LanguageModelV1StreamPart } from "@ai-sdk/provider";
import dotenv from 'dotenv';

dotenv.config();

const baseURL = process.env.OPENAI_BASE_URL;
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY environment variable is required for integration tests');
}

export async function testOpenaiPrompt() {
  const client: LanguageModelV1 = createOpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("gpt-4.1-mini");

  let result = await client.doGenerate({
    inputFormat: "messages",
    mode: {
      type: "regular",
    },
    prompt: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
    maxTokens: 1024,
    temperature: 0.7,
    providerMetadata: {
    },
  });

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.text, result.usage);
}

export async function testOpenaiStream() {
  const client: LanguageModelV1 = createOpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("gpt-4.1-mini");

  let result = await client.doStream({
    inputFormat: "messages",
    mode: {
      type: "regular",
    },
    prompt: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
    maxTokens: 1024,
    temperature: 0.7,
    providerMetadata: {
      openai: {
        stream_options: {
          include_usage: true,
        },
      },
    },
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
  const client: LanguageModelV1 = createOpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  }).languageModel("gpt-4.1-mini");

  let result = await client.doGenerate({
    inputFormat: "messages",
    mode: {
      type: "regular",
      tools: [
        {
            "type": "function",
            "name": "get_current_country",
            "description": "user current country",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        },
        {
            "type": "function",
            "name": "web_search",
            "description": "google search tool",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "search for keywords"
                    },
                    "country": {
                        "type": "string"
                    },
                    "maxResults": {
                        "type": "number",
                        "description": "Maximum search results, default 5"
                    }
                },
                "required": [
                    "query"
                ]
            }
        }
    ],
      toolChoice: {
        type: 'auto'
      }
    },
    prompt: [
      { role: "system", content: "You are a helpful AI assistant" },
      { role: "user", content: [{ type: "text", text: "搜索最近的国家大事" }] },
    ],
    maxTokens: 1024,
    temperature: 0.7,
    providerMetadata: {},
  });

  console.log(JSON.stringify(result, null, 2));

  console.log(result.finishReason, result.text, result.toolCalls, result.usage);
}

test.only("testOpenai", async () => {
  await testOpenaiStream();
});

