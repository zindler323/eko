import { JSONSchema7 } from "json-schema";
import { toImage } from "../common/utils";
import { AgentContext } from "../core/context";
import { extractAgentXmlNode } from "../common/xml";
import { Tool, ToolResult } from "../types/tools.types";
import Log from "../common/log";
import { LLMRequest } from "../types";
import { RetryLanguageModel } from "../llm";

export const TOOL_NAME = "watch_trigger";

export default class WatchTriggerTool implements Tool {
  readonly name: string = TOOL_NAME;
  readonly description: string;
  readonly parameters: JSONSchema7;

  constructor() {
    this.description = `When executing the \`watch\` node, please use it to monitor DOM element changes, it will block the listener until the element changes or times out.`;
    this.parameters = {
      type: "object",
      properties: {
        nodeId: {
          type: "number",
          description: "watch node ID.",
        },
        watch_area: {
          type: "array",
          description:
            "Element changes in monitoring area, eg: [x, y, width, height].",
          items: {
            type: "number",
          },
        },
        watch_index: {
          type: "array",
          description:
            "The index of elements to be monitoring multiple elements simultaneously.",
          items: {
            type: "number",
          },
        },
        frequency: {
          type: "number",
          description:
            "Check frequency, how many seconds between each check, default 1 seconds.",
          default: 1,
          minimum: 0.5,
          maximum: 30,
        },
        timeout: {
          type: "number",
          description: "Timeout in minute, default 5 minutes.",
          default: 5,
          minimum: 1,
          maximum: 30,
        },
      },
      required: ["nodeId"],
    };
  }

  async execute(
    args: Record<string, unknown>,
    agentContext: AgentContext
  ): Promise<ToolResult> {
    let nodeId = args.nodeId as number;
    let agentXml = agentContext.agentChain.agent.xml;
    let node = extractAgentXmlNode(agentXml, nodeId);
    if (node == null) {
      throw new Error("Node ID does not exist: " + nodeId);
    }
    if (node.tagName !== "watch") {
      throw new Error("Node ID is not a watch node: " + nodeId);
    }
    let task_description =
      node.getElementsByTagName("description")[0]?.textContent || "";
    if (!task_description) {
      return {
        content: [
          {
            type: "text",
            text: "The watch node does not have a description, skip.",
          },
        ],
      };
    }
    const screenshot = (agentContext.agent as any)["screenshot"];
    const image1Result = (await screenshot.call(
      agentContext.agent,
      agentContext
    )) as {
      imageBase64: string;
      imageType: "image/jpeg" | "image/png";
    };
    const image1 = toImage(image1Result.imageBase64);
    const start = new Date().getTime();
    const timeout = ((args.timeout as number) || 5) * 60000;
    const frequency = Math.max(
      500,
      (args.frequency = (args.frequency as number) || 1) * 1000
    );
    let rlm = new RetryLanguageModel(
      agentContext.context.config.llms,
      agentContext.agent.Llms
    );
    while (new Date().getTime() - start < timeout) {
      await agentContext.context.checkAborted();
      await new Promise((resolve) => setTimeout(resolve, frequency));
      const image2Result = (await screenshot.call(
        agentContext.agent,
        agentContext
      )) as {
        imageBase64: string;
        imageType: "image/jpeg" | "image/png";
      };
      const image2 = toImage(image2Result.imageBase64);
      const changeResult = await this.is_dom_change(
        agentContext,
        rlm,
        image1,
        image1Result.imageType,
        image2,
        image2Result.imageType,
        task_description
      );
      if (changeResult.changed) {
        return {
          content: [
            {
              type: "text",
              text: changeResult.changeInfo || "DOM change detected.",
            },
          ],
        };
      }
    }
    return {
      content: [
        {
          type: "text",
          text: "Timeout reached, no DOM changes detected.",
        },
      ],
    };
  }

  private async is_dom_change(
    agentContext: AgentContext,
    rlm: RetryLanguageModel,
    image1: Uint8Array | URL,
    image1Type: string,
    image2: Uint8Array | URL,
    image2Type: string,
    task_description: string
  ): Promise<{
    changed: boolean;
    changeInfo?: string;
  }> {
    try {
      let request: LLMRequest = {
        messages: [
          {
            role: "system",
            content: `You are a tool for detecting element changes. Given a task description, compare two images to determine whether the changes described in the task have occurred.
If the changes have occurred, return an json with \`changed\` set to true and \`changeInfo\` containing a description of the changes. If no changes have occurred, return an object with \`changed\` set to false.

## Example
User: Monitor new messages in group chat
### No changes detected
Output:
{
  "changed": false
}
### Change detected
Output:
{
  "changed": true,
  "changeInfo": "New message received in the group chat. The message content is: 'Hello, how are you?'"
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "image",
                image: image1,
                mimeType: image1Type,
              },
              {
                type: "image",
                image: image2,
                mimeType: image2Type,
              },
              {
                type: "text",
                text: task_description,
              },
            ],
          },
        ],
        abortSignal: agentContext.context.controller.signal,
      };
      const result = await rlm.call(request);
      let resultText = result.text || "{}";
      resultText = resultText.substring(
        resultText.indexOf("{"),
        resultText.lastIndexOf("}") + 1
      );
      return JSON.parse(resultText);
    } catch (error) {
      Log.error("Error in is_dom_change:", error);
    }
    return {
      changed: false,
    };
  }
}

export { WatchTriggerTool };
