import { JSONSchema7 } from "json-schema";
import { ToolResult } from "../types/tools.types";

export type McpListToolParam = {
  environment: "browser" | "windows" | "mac" | "linux";
  agent_name: string;
  prompt: string;
  taskId?: string;
  nodeId?: string;
  browser_url?: string | null;
  params?: Record<string, unknown> | undefined;
};

export type McpCallToolParam = {
  name: string;
  arguments?: Record<string, unknown> | undefined;
  extInfo?: {
    taskId: string;
    nodeId: string;
    environment: "browser" | "windows" | "mac" | "linux";
    agent_name: string;
    browser_url?: string | null;
  };
};

export type McpListToolResult = Array<{
  name: string;
  description?: string;
  inputSchema: JSONSchema7;
}>;

export interface IMcpClient {
  connect(): Promise<void>;

  listTools(param: McpListToolParam): Promise<McpListToolResult>;

  callTool(param: McpCallToolParam): Promise<ToolResult>;

  isConnected(): boolean;

  close(): Promise<void>;
}
