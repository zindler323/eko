import { JSONSchema7 } from "json-schema";
import { AgentContext } from "../core/context";
import { Tool, ToolResult } from "../types/tools.types";

export const TOOL_NAME = "human_interact";

export default class HumanInteractTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `AI interacts with humans:
confirm: Ask the user to confirm whether to execute an operation, especially when performing dangerous actions such as deleting system files.
input: Prompt the user to enter text; for example, when a task is ambiguous, the AI can choose to ask the user for details, and the user can respond by inputting.
select: Allow the user to make a choice; in situations that require selection, the AI can ask the user to make a decision.
request_help: Request assistance from the user; for instance, when an operation is blocked, the AI can ask the user for help, such as needing to log into a website or solve a CAPTCHA.`;
    this.parameters = {
      type: "object",
      properties: {
        interactType: {
          type: "string",
          description: "The type of interaction with users.",
          enum: ["confirm", "input", "select", "request_help"],
        },
        confirm: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Display prompts to users",
            },
          },
          required: ["prompt"],
        },
        input: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Display prompts to users",
            },
          },
          required: ["prompt"],
        },
        select: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Display prompts to users",
            },
            options: {
              type: "array",
              description: "Options provided to the user",
              items: {
                type: "string",
              },
            },
            multiple: {
              type: "boolean",
            },
          },
          required: ["prompt", "options"],
        },
        request_help: {
          type: "object",
          properties: {
            helpType: {
              type: "string",
              description: "Display prompts to users",
              enum: ["request_login", "request_assistance"],
            },
            prompt: {
              type: "string",
              description: "Display prompts to users",
            },
          },
          required: ["helpType", "prompt"],
        },
      },
      required: ["interactType"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    let interactType = args.interactType as string;
    let interact = args[interactType] as any;
    let callback = agentContext.context.config.callback;
    let resultText = "";
    if (callback) {
      switch (interactType) {
        case "confirm":
          if (callback.onHumanConfirm) {
            let result = await callback.onHumanConfirm(
              agentContext,
              interact.prompt
            );
            resultText = `confirm result: ${result ? "Yes" : "No"}`;
          }
          break;
        case "input":
          if (callback.onHumanInput) {
            let result = await callback.onHumanInput(
              agentContext,
              interact.prompt
            );
            resultText = `input result: ${result}`;
          }
          break;
        case "select":
          if (callback.onHumanSelect) {
            let result = await callback.onHumanSelect(
              agentContext,
              interact.prompt,
              interact.options,
              interact.multiple
            );
            resultText = `select result: ${JSON.stringify(result)}`;
          }
          break;
        case "request_help":
          if (callback.onHumanHelp) {
            let result = await callback.onHumanHelp(
              agentContext,
              interact.helpType,
              interact.prompt
            );
            resultText = `request_help result: ${
              result ? "Solved" : "Unresolved"
            }`;
          }
          break;
      }
    }
    if (resultText) {
      return {
        content: [
          {
            type: "text",
            text: resultText,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Error: Unsupported ${interactType} interaction operation`,
          },
        ],
        isError: true,
      };
    }
  }
}
