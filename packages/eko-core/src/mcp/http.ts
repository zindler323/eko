import Log from "../common/log";
import { uuidv4 } from "../common/utils";
import {
  ToolResult,
  IMcpClient,
  McpCallToolParam,
  McpListToolParam,
  McpListToolResult,
} from "../types";

type SseEventData = {
  id?: string;
  event?: string;
  data?: string;
  [key: string]: unknown;
};

export class SimpleHttpMcpClient implements IMcpClient {
  private httpUrl: string;
  private clientName: string;
  private headers: Record<string, string>;
  private protocolVersion: string = "2025-06-18";
  private connected: boolean = false;
  private mcpSessionId?: string | null; // Mcp-Session-Id

  constructor(
    httpUrl: string,
    clientName: string = "EkoMcpClient",
    headers: Record<string, string> = {}
  ) {
    this.httpUrl = httpUrl;
    this.clientName = clientName;
    this.headers = headers;
  }

  async connect(signal?: AbortSignal): Promise<void> {
    Log.info("MCP Client, connecting...", this.httpUrl);
    await this.request("initialize", {
      protocolVersion: this.protocolVersion,
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
    }, signal);
    if (this.mcpSessionId) {
      this.request("notifications/initialized", {}, signal);
    }
    this.connected = true;
  }

  async listTools(param: McpListToolParam, signal?: AbortSignal): Promise<McpListToolResult> {
    const message = await this.request("tools/list", {
      ...param,
    }, signal);
    if (message.error) {
      Log.error("McpClient listTools error: ", param, message);
      throw new Error("listTools Exception");
    }
    return message.result.tools || [];
  }

  async callTool(param: McpCallToolParam, signal?: AbortSignal): Promise<ToolResult> {
    const message = await this.request("tools/call", {
      ...param,
    }, signal);
    if (message.error) {
      Log.error("McpClient callTool error: ", param, message);
      throw new Error("callTool Exception");
    }
    return message.result;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    this.connected = false;
    if (this.mcpSessionId) {
      this.request("notifications/cancelled", {
        requestId: uuidv4(),
        reason: "User requested cancellation",
      });
    }
  }

  async request(method: string, params: Record<string, any>, signal?: AbortSignal): Promise<any> {
    try {
      const id = uuidv4();
      const response = await fetch(this.httpUrl, {
        method: "POST",
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "MCP-Protocol-Version": this.protocolVersion,
          ...(this.mcpSessionId ? { "Mcp-Session-Id": this.mcpSessionId } : {}),
          ...this.headers,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: id,
          method: method,
          params: {
            ...params,
          },
        }),
        keepalive: true,
        signal: signal,
      });
      if (method == "initialize") {
        this.mcpSessionId =
          response.headers.get("Mcp-Session-Id") ||
          response.headers.get("mcp-session-id");
      }
      const contentType =
        response.headers.get("Content-Type") ||
        response.headers.get("content-type") ||
        "application/json";
      if (contentType?.includes("text/event-stream")) {
        // SSE
        const reader =
          response.body?.getReader() as ReadableStreamDefaultReader;
        let str = "";
        let message: any;
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader?.read();
          if (done) {
            break;
          }
          const text = decoder.decode(value);
          str += text;
          if (str.indexOf("\n\n") > -1) {
            const chunks = str.split("\n\n");
            for (let i = 0; i < chunks.length - 1; i++) {
              const chunk = chunks[i];
              const chunkData = this.parseChunk(chunk);
              if (chunkData.event == "message") {
                message = JSON.parse(chunkData.data as string);
                if (message.id == id) {
                  return message;
                }
              }
            }
            str = chunks[chunks.length - 1];
          }
        }
        return message;
      } else {
        // JSON
        const message = await response.json();
        return message;
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        Log.error("MCP Client, connectSse error:", e);
      }
      throw e;
    }
  }

  parseChunk(chunk: string): SseEventData {
    const lines = chunk.split("\n");
    const chunk_obj: SseEventData = {};
    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      if (line.startsWith("id:")) {
        chunk_obj["id"] = line.substring(3).trim();
      } else if (line.startsWith("event:")) {
        chunk_obj["event"] = line.substring(6).trim();
      } else if (line.startsWith("data:")) {
        chunk_obj["data"] = line.substring(5).trim();
      } else {
        const idx = line.indexOf(":");
        if (idx > -1) {
          chunk_obj[line.substring(0, idx)] = line.substring(idx + 1).trim();
        }
      }
    }
    return chunk_obj;
  }
}
