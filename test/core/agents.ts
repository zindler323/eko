import { AgentContext } from "../../src";
import { BaseBrowserLabelsAgent, BaseChatAgent } from "../../src/agent";
import { ToolResult } from "../../src/types/tools.types";

export class SimpleChatAgent extends BaseChatAgent {
  constructor(llms?: string[]) {
    super(llms, [
      {
        name: "get_weather",
        description: "weather query",
        parameters: {
          type: "object",
          properties: {
            city: {
              type: "string",
              default: "Beijing",
            },
          },
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            (async () => `Today, the weather in ${args.city} is cloudy, 25-30° (Celsius), suitable for going out for a walk.`)()
          );
        },
      },
    ]);
  }
}

export class SimpleBrowserAgent extends BaseBrowserLabelsAgent {
  protected screenshot(agentContext: AgentContext): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png"; }> {
    throw new Error("Method not implemented.");
  }
  protected navigate_to(agentContext: AgentContext, url: string): Promise<any> {
    throw new Error("Method not implemented.");
  }
  protected execute_script(agentContext: AgentContext, func: (...args: any[]) => void, args: any[]): Promise<any> {
    throw new Error("Method not implemented.");
  }
}