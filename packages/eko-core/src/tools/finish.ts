import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../core/context";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "finish";

export default class FinishTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly noPlan: boolean = true;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `Terminate the current task when you believe the task is complete. Call this tool when you have accomplished all required tasks and want to signal completion.`;
    this.parameters = {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Optional completion message to explain why the task is considered complete.",
        }
      },
      required: []
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    const message = args.message ? `Task completed: ${args.message}` : "Task completed successfully";
    
    // Signal task completion
    agentContext.context.markTaskComplete();
    
    return {
      content: [
        {
          type: "text",
          text: message
        }
      ],
      isComplete: true
    };
  }
}

export { FinishTool };
