import { BaseChatAgent, AgentContext } from "@eko-ai/eko";
import { ToolResult } from "@eko-ai/eko/types";

export default class ChatAgent extends BaseChatAgent {
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
