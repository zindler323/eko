import { Agent } from "./base";
import { Tool, IMcpClient } from "../types";

export const AGENT_NAME = "Chat";

export default abstract class BaseChatAgent extends Agent {
  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    super({
      name: AGENT_NAME,
      description: "You are a helpful assistant.",
      tools: ext_tools || [],
      llms: llms,
      mcpClient: mcpClient,
      planDescription:
        "Chat assistant, handles non-task related conversations. Please use it to reply when the task does not involve operations with other agents.",
    });
  }
}

export { BaseChatAgent };
