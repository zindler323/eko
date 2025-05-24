import {
  Eko,
  Agent,
  Log,
  LLMs,
  StreamCallbackMessage,
} from "../../src/index";
import dotenv from "dotenv";
import { SimpleBrowserAgent, SimpleChatAgent } from "./agents";

dotenv.config();

const openaiBaseURL = process.env.OPENAI_BASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;

const llms: LLMs = {
  default: {
    provider: "openai",
    model: "gpt-4.1-mini",
    apiKey: openaiApiKey || "",
    config: {
      baseURL: openaiBaseURL,
    },
  },
};

async function run() {
  Log.setLevel(0);
  let callback = {
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
  let agents: Agent[] = [
    new SimpleChatAgent(),
    new SimpleBrowserAgent()
  ];
  let eko = new Eko({ llms, agents, callback });
  // let result = await eko.run("Who are you?");
  let result = await eko.run("How is the weather in Beijing?");
  console.log("result: ", result.result);
}

test.only("eko", async () => {
  await run();
});
