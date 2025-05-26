import { AgentContext } from "../core/context";
import { IMcpClient, Tool, ToolResult } from "../types";
import { Agent } from "./base";

export const AGENT_NAME = "Timer";

export default abstract class BaseTimerAgent extends Agent {
  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    super({
      name: AGENT_NAME,
      description: "You are a scheduled task scheduling agent.",
      tools: ext_tools || [],
      llms: llms,
      mcpClient: mcpClient,
    });
    this.addTool(this.schedule_tool());
  }

  protected abstract task_schedule(
    agentContext: AgentContext,
    trigger_description: string,
    task_description: string,
    cron: string
  ): Promise<void>;

  private schedule_tool(): Tool {
    return {
      name: "task_schedule",
      description:
        "Task scheduled trigger, the task is triggered at a scheduled time and will automatically create a scheduled task for execution.",
      parameters: {
        type: "object",
        properties: {
          trigger_description: {
            type: "string",
            description: "Trigger time description.",
          },
          task_description: {
            type: "string",
            description: "Main task description, excluding trigger time.",
          },
          cron: {
            type: "string",
            description:
              "The cron expression of the trigger, for example, '0 9 * * *' indicates that it triggers at 9 a.m. every day.",
          },
        },
        required: ["cron"],
      },
      execute: async (
        args: Record<string, unknown>,
        agentContext: AgentContext
      ): Promise<ToolResult> => {
        return await this.callInnerTool(() =>
          this.task_schedule(
            agentContext,
            args.trigger_description as string,
            args.task_description as string,
            args.cron as string
          )
        );
      },
    };
  }
}

export { BaseTimerAgent };
