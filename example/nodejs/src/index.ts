import dotenv from "dotenv";
import ChatAgent from "./chat";
import BrowserAgent from "./browser";
import { Eko, Agent, Log, LLMs, StreamCallbackMessage } from "@eko-ai/eko";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;
const claudeBaseURL = process.env.ANTHROPIC_BASE_URL;
const claudeApiKey = process.env.ANTHROPIC_API_KEY;

const llms: LLMs = {
  default: {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20241022",
    apiKey: claudeApiKey || "",
    config: {
      baseURL: claudeBaseURL,
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
};

const callback = {
  onMessage: async (message: StreamCallbackMessage) => {
    if (message.type == "workflow" && !message.streamDone) {
      return;
    }
    if (message.type == "text" && !message.streamDone) {
      return;
    }
    if (message.type == "tool_streaming") {
      return;
    }
    console.log("message: ", JSON.stringify(message, null, 2));
  },
};

async function run() {
  Log.setLevel(0);
  let agents: Agent[] = [new ChatAgent(), new BrowserAgent()];
  let eko = new Eko({ llms, agents, callback });
  // let result = await eko.run("How is the weather in Beijing?");
  let result = await eko.run("Search for the latest news about Musk");
  console.log("result: ", result.result);
}

run().catch(e => {
  console.log(e)
});
