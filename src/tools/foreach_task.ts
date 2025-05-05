import { JSONSchema7 } from "json-schema";
import { Tool } from ".";
import { AgentContext } from "../core/context";
import { ToolResult } from "../types/tools.types";
import { extractAgentXmlNode } from "../common/xml";

export const TOOL_NAME = "foreach_task";

export default class ForeachTaskTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `When executing the \`forEach\` node, please use it to complete the tasks corresponding to that forEach node, which will complete all tasks under the entire forEach node.`;
    this.parameters = {
      type: "object",
      properties: {
        nodeId: {
          type: "number",
          description: "forEach node ID.",
        },
      },
      required: ["nodeId"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    // 调用 forEach Agent 单独逻辑, 根据上下文判断并循环执行
    let nodeId = args.nodeId as number;
    let agentXml = agentContext.agentChain.agent.xml;
    let node = extractAgentXmlNode(agentXml, nodeId);
    if (node == null) {
      throw new Error("Node ID does not exist: " + nodeId);
    }
    if (node.tagName !== "forEach") {
      throw new Error("Node ID is not a forEach node: " + nodeId);
    }
    let items = node.getAttribute("items");
    let varValue = null;
    if (items && items != "list") {
      varValue = agentContext.context.variables.get(items.trim());
    }
    if (varValue) {
      // TODO 循环变量
      // 记录当前url，重新规划成一个个独立的任务
    } else {
      // TODO 循环列表
      // 继续执行
    }
    return null as any;
  }
}
