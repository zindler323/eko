import { Agent } from "./base";
import { Tool } from "../tools";
import { IMcpClient } from "../mcp/client";
import { AgentContext } from "../core/context";
import { ToolResult } from "../types/tools.types";
import { LanguageModelV1Prompt } from "@ai-sdk/provider";
import { mergeTools, sleep, toImage } from "../common/utils";

export const AGENT_NAME = "Computer";

export default abstract class BaseComputerAgent extends Agent {
  readonly keyboardKeys: string[] = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'enter', 'esc', 'backspace', 'tab', 'space', 'delete',
    'ctrl', 'alt', 'shift', 'win',
    'up', 'down', 'left', 'right',
    'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
    'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+a', 'ctrl+s',
    'alt+tab', 'alt+f4', 'ctrl+alt+delete'
  ];

  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    const _tools_ = [] as Tool[];
    super({
      name: AGENT_NAME,
      description: "You are a computer operation agent, who interacts with the computer using mouse and keyboard, completing specified tasks step by step based on the given tasks and screenshots. After each of your operations, you will receive the latest computer screenshot to evaluate the task execution status.",
      tools: _tools_,
      llms: llms,
      mcpClient: mcpClient,
      planDescription: "Computer operation agent, interact with the computer using the mouse and keyboard."
    });
    let init_tools = this.buildInitTools();
    if (ext_tools && ext_tools.length > 0) {
      init_tools = mergeTools(init_tools, ext_tools);
    }
    init_tools.forEach((tool) => _tools_.push(tool));
  }

  protected abstract screenshot(agentContext: AgentContext): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
  }>;

  protected abstract typing(
    agentContext: AgentContext,
    text: string
  ): Promise<void>;

  protected abstract click(
    agentContext: AgentContext,
    x: number,
    y: number,
    num_clicks: number,
    button_type: "left" | "right" | "middle"
  ): Promise<void>;

  protected abstract scroll(
    agentContext: AgentContext,
    amount: number
  ): Promise<void>;

  protected abstract move_to(
    agentContext: AgentContext,
    x: number,
    y: number
  ): Promise<void>;

  protected abstract press(
    agentContext: AgentContext,
    key: string
  ): Promise<void>;

  protected abstract hotkey(
    agentContext: AgentContext,
    keys: string
  ): Promise<void>;

  protected abstract drag_and_drop(
    agentContext: AgentContext,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): Promise<void>;

  private buildInitTools(): Tool[] {
    return [
      {
        name: "typing",
        description: "Type specified text",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Text to type",
            },
          },
          required: ["text"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.typing(agentContext, args.text as string)
          );
        },
      },
      {
        name: "click",
        description: "Click at current or specified position",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "X coordinate",
            },
            y: {
              type: "number",
              description: "Y coordinate",
            },
            num_clicks: {
              type: "number",
              description: "Number of clicks",
              enum: [1, 2, 3],
              default: 1,
            },
            button: {
              type: "string",
              description: "Mouse button to click",
              enum: ["left", "right", "middle"],
              default: "left",
            },
          },
          required: ["x", "y"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.click(
              agentContext,
              args.x as number,
              args.y as number,
              (args.num_clicks || 1) as number,
              (args.button || "left") as any
            )
          );
        },
      },
      {
        name: "move_to",
        description: "Move cursor to specified position",
        parameters: {
          type: "object",
          properties: {
            x: {
              type: "number",
              description: "X coordinate",
            },
            y: {
              type: "number",
              description: "Y coordinate",
            },
          },
          required: ["x", "y"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.move_to(agentContext, args.x as number, args.y as number)
          );
        },
      },
      {
        name: "scroll",
        description: "Scroll the mouse wheel at current position",
        parameters: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "Scroll amount (positive for up, negative for down)",
              minimum: -10,
              maximum: 10,
            },
          },
          required: ["amount"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.scroll(agentContext, args.amount as number)
          );
        },
      },
      {
        name: "press",
        description: "Press and release a key",
        parameters: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Key to press",
              enum: this.keyboardKeys,
            },
          },
          required: ["key"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.press(agentContext, args.key as any)
          );
        },
      },
      {
        name: "hotkey",
        description: "Press a key combination",
        parameters: {
          type: "object",
          properties: {
            keys: {
              type: "string",
              description: "Key combination to press",
              enum: this.keyboardKeys,
            },
          },
          required: ["keys"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.hotkey(agentContext, args.keys as any)
          );
        },
      },
      {
        name: "drag_and_drop",
        description: "Drag and drop operation",
        parameters: {
          type: "object",
          properties: {
            x1: {
              type: "number",
              description: "From X coordinate",
            },
            y1: {
              type: "number",
              description: "From Y coordinate",
            },
            x2: {
              type: "number",
              description: "Target X coordinate",
            },
            y2: {
              type: "number",
              description: "Target Y coordinate",
            },
          },
          required: ["x1", "y1", "x2", "y2"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.drag_and_drop(
              agentContext,
              args.x1 as number,
              args.y1 as number,
              args.x2 as number,
              args.y2 as number
            )
          );
        },
      },
      {
        name: "wait",
        description: "Wait for specified duration",
        parameters: {
          type: "object",
          properties: {
            duration: {
              type: "number",
              description: "Duration in seconds",
              default: 0.5,
            },
          },
          required: ["duration"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            sleep(((args.duration || 0.5) as number) * 1000)
          );
        },
      },
    ];
  }

  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt
  ): Promise<void> {
    let lastMessage = messages[messages.length - 1];
    if (
      lastMessage.role == "tool" &&
      lastMessage.content.filter((t) => t.type == "tool-result").length > 0
    ) {
      await sleep(200);
      let result = await this.screenshot(agentContext);
      let image = toImage(result.imageBase64);
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            image: image,
            mimeType: result.imageType,
          },
          {
            type: "text",
            text: "This is the latest screenshot",
          },
        ],
      });
    } else if (
      messages.length == 2 && 
      messages[0].role == "system" && 
      lastMessage.role == "user"
    ) {
      let result = await this.screenshot(agentContext);
      let image = toImage(result.imageBase64);
      lastMessage.content.push({
        type: "image",
        image: image,
        mimeType: result.imageType,
      });
    }
    super.handleMessages(agentContext, messages);
  }

}
