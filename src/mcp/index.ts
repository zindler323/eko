import Log from "../common/log";
import { uuidv4 } from "../common/utils";
import { ToolResult } from "../types/tools.types";
import {
  IMcpClient,
  McpCallToolParam,
  McpListToolParam,
  McpListToolResult,
} from "./client";

type SseEventData = {
  id?: string;
  event?: string;
  data?: string;
  [key: string]: unknown;
};

type SseHandler = {
  onopen: () => void;
  onmessage: (data: SseEventData) => void;
  onerror: (e: unknown) => void;
  readyState?: 0 | 1 | 2; // 0 init; 1 connected; 2 closed
  close?: Function;
};

export class SimpleSseMcpClient implements IMcpClient {
  private sseUrl: string;
  private clientName: string;
  private sseHandler?: SseHandler;
  private msgUrl?: string;
  private pingTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private requestMap: Map<string, (messageData: any) => void>;

  constructor(sseServerUrl: string, clientName: string = "EkoMcpClient") {
    this.sseUrl = sseServerUrl;
    this.clientName = clientName;
    this.requestMap = new Map();
  }

  async connect(): Promise<void> {
    Log.info("MCP Client, connecting...", this.sseUrl);
    if (this.sseHandler && this.sseHandler.readyState == 1) {
      this.sseHandler.close && this.sseHandler.close();
      this.sseHandler = undefined;
    }
    this.pingTimer && clearInterval(this.pingTimer);
    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    await new Promise<void>((resolve) => {
      let timer = setTimeout(resolve, 15000);
      this.sseHandler = {
        onopen: () => {
          Log.info("MCP Client, connection successful", this.sseUrl);
          clearTimeout(timer);
          setTimeout(resolve, 200);
        },
        onmessage: (data) => this.onmessage(data),
        onerror: (e) => {
          Log.error("MCP Client, error: ", e);
          clearTimeout(timer);
          if (this.sseHandler?.readyState === 2) {
            this.pingTimer && clearInterval(this.pingTimer);
            this.reconnectTimer = setTimeout(() => {
              this.connect();
            }, 500);
          }
          resolve();
        },
      };
      connectSse(this.sseUrl, this.sseHandler);
    });
    this.pingTimer = setInterval(() => this.ping(), 10000);
  }

  onmessage(data: SseEventData) {
    Log.debug("MCP Client, onmessage", this.sseUrl, data);
    if (data.event == "endpoint") {
      let uri = data.data as string;
      let msgUrl: string;
      let idx = this.sseUrl.indexOf("/", 10);
      if (idx > -1) {
        msgUrl = this.sseUrl.substring(0, idx) + uri;
      } else {
        msgUrl = this.sseUrl + uri;
      }
      this.msgUrl = msgUrl;
      this.initialize();
    } else if (data.event == "message") {
      let message = JSON.parse(data.data as string);
      let _resolve = this.requestMap.get(message.id);
      _resolve && _resolve(message);
    }
  }

  private async initialize() {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: true,
        },
        sampling: {},
      },
      clientInfo: {
        name: this.clientName,
        version: "1.0.0",
      },
    });
  }

  private ping() {
    this.request("ping", {});
  }

  private async request(
    method: string,
    params: Record<string, any>
  ): Promise<any> {
    let id = uuidv4();
    try {
      let callback = new Promise<any>((resolve) => {
        this.requestMap.set(id, resolve);
      });
      Log.debug(`MCP Client, ${method}`, id, params);
      const response = await fetch(this.msgUrl as string, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: id,
          method: method,
          params: {
            ...params,
          },
        }),
      });
      let body = await response.text();
      if (body == "Accepted") {
        return await callback;
      } else {
        throw new Error("SseClient Response Exception: " + body);
      }
    } finally {
      this.requestMap.delete(id);
    }
  }

  async listTools(param: McpListToolParam): Promise<McpListToolResult> {
    let message = await this.request("tools/list", {
      ...param,
    });
    if (message.error) {
      Log.error("McpClient listTools error: ", param, message);
      throw new Error("listTools Exception");
    }
    return message.result.tools || [];
  }

  async callTool(param: McpCallToolParam): Promise<ToolResult> {
    let message = await this.request("tools/call", {
      ...param,
    });
    if (message.error) {
      Log.error("McpClient callTool error: ", param, message);
      throw new Error("callTool Exception");
    }
    return message.result;
  }

  isConnected(): boolean {
    if (this.sseHandler && this.sseHandler.readyState == 1) {
      return true;
    }
    return false;
  }

  async close(): Promise<void> {
    this.pingTimer && clearInterval(this.pingTimer);
    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    this.sseHandler && this.sseHandler.close && this.sseHandler.close();
    this.pingTimer = undefined;
    this.sseHandler = undefined;
    this.reconnectTimer = undefined;
  }
}

async function connectSse(sseUrl: string, hander: SseHandler) {
  try {
    hander.readyState = 0;
    const controller = new AbortController();
    const response = await fetch(sseUrl, {
      method: "GET",
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: null,
      keepalive: true,
      signal: controller.signal,
    });
    const reader = response.body?.getReader() as ReadableStreamDefaultReader;
    hander.close = () => {
      controller.abort();
      hander.readyState = 2;
      Log.debug("McpClient close abort.", sseUrl);
    };
    let str = "";
    let decoder = new TextDecoder();
    hander.readyState = 1;
    hander.onopen();
    while (hander.readyState == 1) {
      const { value, done } = await reader?.read();
      if (done) {
        break;
      }
      const text = decoder.decode(value);
      str += text;
      console.log("str: ", str);
      if (str.indexOf("\n\n") > -1) {
        let chunks = str.split("\n\n");
        for (let i = 0; i < chunks.length - 1; i++) {
          let chunk = chunks[i];
          let chunkData = parseChunk(chunk);
          hander.onmessage(chunkData);
        }
        str = chunks[chunks.length - 1];
      }
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      Log.error("MCP Client, connectSse error:", e);
      hander.onerror(e);
    }
  } finally {
    hander.readyState = 2;
  }
}

function parseChunk(chunk: string): SseEventData {
  let lines = chunk.split("\n");
  let chunk_obj: SseEventData = {};
  for (let j = 0; j < lines.length; j++) {
    let line = lines[j];
    if (line.startsWith("id:")) {
      chunk_obj["id"] = line.substring(3).trim();
    } else if (line.startsWith("event:")) {
      chunk_obj["event"] = line.substring(6).trim();
    } else if (line.startsWith("data:")) {
      chunk_obj["data"] = line.substring(5).trim();
    } else {
      let idx = line.indexOf(":");
      if (idx > -1) {
        chunk_obj[line.substring(0, idx)] = line.substring(idx + 1).trim();
      }
    }
  }
  return chunk_obj;
}
