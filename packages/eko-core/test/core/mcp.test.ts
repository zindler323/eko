import {
  Eko,
  Agent,
  Log,
  LLMs,
  StreamCallbackMessage,
  SimpleSseMcpClient,
} from "../../src/index";
import { TaskNodeStatusTool } from "../../src/tools";
import dotenv from "dotenv";

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
  let sseUrl = "http://localhost:8083/sse";
  let mcpClient = new SimpleSseMcpClient(sseUrl);
  let agents: Agent[] = [
    new Agent({
      name: "SmartMall",
      description: "提供商品查询、库存管理和订单处理",
      tools: [],
      // tools: [new TaskNodeStatusTool()],
      mcpClient: mcpClient,
      llms: Object.keys(llms),
    }),
  ];
  let eko = new Eko({ llms, agents, callback });
  let result = await eko.run(
    "我有3000块钱，请帮我购买华为 MateBook X Pro 和 1个蓝牙耳机、1个移动电源"
  );
  console.log("result: ", JSON.stringify(result));
}

test.only("eko", async () => {
  await run();
});
