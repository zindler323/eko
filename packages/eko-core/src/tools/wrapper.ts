import { LanguageModelV1FunctionTool, LanguageModelV1ToolCallPart } from "@ai-sdk/provider";
import { ToolResult, ToolExecuter, ToolSchema } from "../types/tools.types";
import { convertToolSchema } from "../common/utils";
import { AgentContext } from "../core/context";

export class ToolWrapper {
  private tool: LanguageModelV1FunctionTool;
  private execute: ToolExecuter;

  constructor(toolSchema: ToolSchema, execute: ToolExecuter) {
    this.tool = convertToolSchema(toolSchema);
    this.execute = execute;
  }

  get name(): string {
    return this.tool.name;
  }

  getTool(): LanguageModelV1FunctionTool {
    return this.tool;
  }

  async callTool(
    args: Record<string, unknown>,
    agentContext: AgentContext,
    toolCall: LanguageModelV1ToolCallPart
  ): Promise<ToolResult> {
    return await this.execute.execute(args, agentContext, toolCall);
  }
}
