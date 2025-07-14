import { Agent } from "./base";
import { Tool, IMcpClient } from "../types";
import {AgentContext} from "../core/context";
import {LanguageModelV1ImagePart, LanguageModelV1Prompt} from "@ai-sdk/provider";
import {sleep, toImage} from "../common/utils";

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
