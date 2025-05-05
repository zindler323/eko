import { LanguageModelV1FinishReason } from "@ai-sdk/provider";
import { Agent } from "../agent";
import { IA2aClient } from "../agent/a2a";
import { IMcpClient } from "../mcp/client";
import { LLMs } from "./llm.types";
import { ToolResult } from "./tools.types";
import { AgentContext } from "../core/context";

export type EkoConfig = {
  llms: LLMs;
  agents?: Agent[];
  planLlms?: string[];
  callback?: StreamCallback & HumanCallback;
  defaultMcpClient?: IMcpClient;
  a2aClient?: IA2aClient;
};

export type StreamCallbackMessage = {
  taskId: string;
  agentName: string;
  nodeId?: string | null;
} & (
  | {
      type: "workflow";
      streamDone: boolean;
      workflow: Workflow;
    }
  | {
      type: "text" | "thinking" | "error";
      streamDone: boolean;
      text: string;
    }
  | {
      type: "file";
      mimeType: string;
      data: string;
    }
  | {
      type: "tool_streaming";
      toolName: string;
      toolId: string;
      paramsText: string;
    }
  | {
      type: "tool_use";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
    }
  | {
      type: "tool_running";
      toolName: string;
      toolId: string;
      text: string;
      streamDone: boolean;
    }
  | {
      type: "tool_result";
      toolName: string;
      toolId: string;
      params: Record<string, any>;
      toolResult: ToolResult;
    }
  | {
      type: "error";
      error: unknown;
    }
  | {
      type: "finish";
      finishReason: LanguageModelV1FinishReason;
      usage: {
        promptTokens: number;
        completionTokens: number;
      };
    }
);

export interface StreamCallback {
  onMessage: (message: StreamCallbackMessage) => void;
}

export type WorkflowTextNode = {
  text: string;
  input?: string | null;
  output?: string | null;
};

export type WorkflowForEachNode = {
  items: string; // list or variable name
  nodes: WorkflowNode[];
};

export type WorkflowWatchNode = {
  event: "dom" | "gui" | "file";
  loop: boolean;
  description: string;
  triggerNodes: (WorkflowTextNode | WorkflowForEachNode)[];
};

export type WorkflowNode =
  | WorkflowTextNode
  | WorkflowForEachNode
  | WorkflowWatchNode;

export type WorkflowAgent = {
  id: string;
  name: string;
  task: string;
  nodes: WorkflowNode[];
  xml: string; // <agent name="xxx">...</agent>
};

export type Workflow = {
  taskId: string;
  name: string;
  thought: string;
  agents: WorkflowAgent[];
  xml: string;
};

export interface HumanCallback {
  onHumanConfirm?: (
    agentContext: AgentContext,
    prompt: string
  ) => Promise<boolean>;
  onHumanInput?: (
    agentContext: AgentContext,
    prompt: string
  ) => Promise<string>;
  onHumanSelect?: (
    agentContext: AgentContext,
    prompt: string,
    options: string[],
    multiple?: boolean
  ) => Promise<string[]>;
  onHumanHelp?: (
    agentContext: AgentContext,
    helpType: "request_login" | "request_assistance",
    prompt: string
  ) => Promise<boolean>;
}

export type EkoResult = {
  success: boolean;
  stopReason: "abort" | "error" | "done";
  result?: any;
};
