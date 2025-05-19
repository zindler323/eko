import { Eko, LLMs, StreamCallbackMessage } from "@eko-ai/eko";
import { StreamCallback, HumanCallback } from "@eko-ai/eko/types";
import { BrowserAgent } from "@eko-ai/eko-extension";

export async function getLLMConfig(name: string = "llmConfig"): Promise<any> {
  let result = await chrome.storage.sync.get([name]);
  return result[name];
}

export async function main(prompt: string): Promise<Eko> {
  let config = await getLLMConfig();
  if (!config || !config.apiKey) {
    printLog("Please configure apiKey, configure in the eko extension options of the browser extensions.", "error");
    return;
  }

  const llms: LLMs = {
    default: {
      provider: config.llm as any,
      model: config.modelName,
      apiKey: config.apiKey,
      config: {
        baseURL: config.options.baseURL,
      },
    },
  };

  let callback: StreamCallback & HumanCallback = {
    onMessage: async (message: StreamCallbackMessage) => {
      if (message.type == "workflow" && message.streamDone) {
        printLog("Plan\n" + message.workflow.xml);
      } else if (message.type == "text" && message.streamDone) {
        printLog(message.text);
      } else if (message.type == "tool_use") {
        printLog(
          `${message.agentName} > ${message.toolName}\n${JSON.stringify(
            message.params
          )}`
        );
      }
      console.log("message: ", JSON.stringify(message, null, 2));
    },
    onHumanConfirm: async (context, prompt) => {
      return confirm(prompt);
    },
  };

  let agents = [new BrowserAgent()];
  let eko = new Eko({ llms, agents, callback });
  eko
    .run(prompt)
    .then((res) => {
      printLog(res.result, res.success ? "success" : "error");
    })
    .catch((error) => {
      printLog(error, "error");
    }).finally(() => {
      chrome.storage.local.set({ running: false });
      chrome.runtime.sendMessage({ type: "stop" });
    });
  return eko;
}

function printLog(message: string, level?: "info" | "success" | "error") {
  chrome.runtime.sendMessage({ type: "log", log: message + "", level: level || "info" });
}
