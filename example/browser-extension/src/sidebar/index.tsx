import { createRoot } from "react-dom/client";
import React, { useState, useRef, useEffect } from "react";
import { Button, Input } from "antd";

interface LogMessage {
  time: string;
  log: string;
  level?: "info" | "error" | "success";
}

const AppRun = () => {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(
    "Open Twitter, search for \"Fellou AI\" and follow"
  );

  useEffect(() => {
    chrome.storage.local.get(["running", "prompt"], (result) => {
      if (result.running !== undefined) {
        setRunning(result.running);
      }
      if (result.prompt !== undefined) {
        setPrompt(result.prompt);
      }
    });
    const messageListener = (message: any) => {
      if (!message) {
        return;
      }
      if (message.type === "stop") {
        setRunning(false);
        chrome.storage.local.set({ running: false });
      } else if (message.type === "log") {
        const time = new Date().toLocaleTimeString();
        setLogs((prev) => [
          ...prev,
          { time, log: message.log, level: message.level || "info" },
        ]);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({
      behavior: 'smooth',
      top: document.body.scrollHeight
    });
  }, [logs]);

  const handleClick = () => {
    if (running) {
      setRunning(false);
      chrome.storage.local.set({ running: false, prompt });
      chrome.runtime.sendMessage({ type: "stop" });
      return;
    }
    if (!prompt.trim()) {
      return;
    }
    setLogs([]);
    setRunning(true);
    chrome.storage.local.set({ running: true, prompt });
    chrome.runtime.sendMessage({ type: "run", prompt: prompt.trim() });
  };

  const getLogStyle = (level: string) => {
    switch (level) {
      case "error":
        return { color: "#ff4d4f" };
      case "success":
        return { color: "#52c41a" };
      default:
        return { color: "#1890ff" };
    }
  };

  return (
    <div
      style={{
        minHeight: "80px",
      }}
    >
      <div>Prompt:</div>
      <div
        style={{
          textAlign: "center",
          marginTop: "4px",
        }}
      >
        <Input.TextArea
          ref={textAreaRef}
          rows={4}
          value={prompt}
          disabled={running}
          placeholder="Your workflow"
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button
          type="primary"
          onClick={handleClick}
          style={{
            marginTop: "8px",
            background: running ? "#6666" : "#1677ff"
          }}
        >
          {running ? "Running..." : "Run"}
        </Button>
      </div>
      {logs.length > 0 && (
        <div
          style={{
            marginTop: "16px",
            textAlign: "left",
            border: "1px solid #d9d9d9",
            borderRadius: "4px",
            padding: "8px",
            overflowY: "auto",
            backgroundColor: "#f5f5f5",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Logs:</div>
          {logs.map((log, index) => (
            <pre
              key={index}
              style={{
                margin: "2px 0",
                fontSize: "12px",
                fontFamily: "monospace",
                ...getLogStyle(log.level || "info"),
              }}
            >[{log.time}] {log.log}</pre>
          ))}
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <AppRun />
  </React.StrictMode>
);
