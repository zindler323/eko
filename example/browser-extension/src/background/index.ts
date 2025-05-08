import { Eko } from "@eko-ai/eko";
import { main } from "./main";

var eko: Eko;

chrome.storage.local.set({ running: false });

// Listen to messages from the browser extension
chrome.runtime.onMessage.addListener(async function (
  request,
  sender,
  sendResponse
) {
  if (request.type == "run") {
    try {
      // Click the RUN button to execute the main function (workflow)
      chrome.runtime.sendMessage({ type: "log", log: "Run..." });
      // Run workflow
      eko = await main(request.prompt);
    } catch (e) {
      console.error(e);
      chrome.runtime.sendMessage({
        type: "log",
        log: e.message,
        level: "error",
      });
    } finally {
      chrome.storage.local.set({ running: false });
      chrome.runtime.sendMessage({ type: "stop" });
    }
  } else if (request.type == "stop") {
    chrome.runtime.sendMessage({ type: "log", log: "Stop" });
    if (eko) {
      eko.getAllTaskId().forEach(taskId => eko.abortTask(taskId));
    }
  }
});

(chrome as any).sidePanel && (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true });