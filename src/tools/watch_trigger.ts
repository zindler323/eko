import { JSONSchema7 } from "json-schema";
import { Tool } from ".";
import { AgentContext } from "../core/context";
import { ToolResult } from "../types/tools.types";

export const TOOL_NAME = "watch_trigger";

export default class WatchTriggerTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `When executing the \`watch\` node, please use it to complete the tasks corresponding to that watch node. It will complete all tasks under the entire watch node.`;
    this.parameters = {
      type: "object",
      properties: {
        nodeId: {
          type: "number",
          description: "forEach node ID."
        },
      },
      required: ["nodeId"],
    };
  }

  async execute(args: Record<string, unknown>, agentContext: AgentContext): Promise<ToolResult> {
    // TODO 监听 dom 或 文件 改变，执行节点
    return null as any;
  }

}