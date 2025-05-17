import {
  LanguageModelV1FunctionTool,
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
  LanguageModelV1ToolCallPart,
} from "@ai-sdk/provider";
import { Tool } from "../types";
import TaskSnapshotTool from "./snapshot";
import { callLLM } from "../agent/base";
import { RetryLanguageModel } from "../llm";
import { mergeTools } from "../common/utils";
import { AgentContext } from "../core/context";

export function extractUsedTool<T extends Tool | LanguageModelV1FunctionTool>(
  messages: LanguageModelV1Prompt,
  agentTools: T[]
): T[] {
  let tools: T[] = [];
  let toolNames: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    let message = messages[i];
    if (message.role == "tool") {
      for (let j = 0; j < message.content.length; j++) {
        let toolName = message.content[j].toolName;
        if (toolNames.indexOf(toolName) > -1) {
          continue;
        }
        toolNames.push(toolName);
        let tool = agentTools.filter((tool) => tool.name === toolName)[0];
        if (tool) {
          tools.push(tool);
        }
      }
    }
  }
  return tools;
}

export function removeDuplicateToolUse(
  results: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>
): Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart> {
  if (
    results.length <= 1 ||
    results.filter((r) => r.type == "tool-call").length <= 1
  ) {
    return results;
  }
  let _results = [];
  let tool_uniques = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].type === "tool-call") {
      let tool = results[i] as LanguageModelV1ToolCallPart;
      let key = tool.toolName + tool.args;
      if (tool_uniques.indexOf(key) == -1) {
        _results.push(results[i]);
        tool_uniques.push(key);
      }
    } else {
      _results.push(results[i]);
    }
  }
  return _results;
}

export async function compressAgentMessages(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV1Prompt,
  tools: LanguageModelV1FunctionTool[]
) {
  if (messages.length < 10) {
    return;
  }
  // extract used tool
  let usedTools = extractUsedTool(messages, tools);
  let snapshotTool = new TaskSnapshotTool();
  let newTools = mergeTools(usedTools, [
    {
      type: "function",
      name: snapshotTool.name,
      description: snapshotTool.description,
      parameters: snapshotTool.parameters,
    },
  ]);
  // handle messages
  let lastToolIndex = messages.length - 1;
  let newMessages: LanguageModelV1Prompt = messages;
  for (let r = newMessages.length - 1; r > 3; r--) {
    if (newMessages[r].role == "tool") {
      newMessages = newMessages.slice(0, r + 1);
      lastToolIndex = r;
      break;
    }
  }
  newMessages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: "Please create a snapshot backup of the current task, keeping only key important information and node completion status.",
      },
    ],
  });
  // compress snapshot
  let result = await callLLM(agentContext, rlm, newMessages, newTools, true, {
    type: "tool",
    toolName: snapshotTool.name,
  });
  let toolCall = result.filter((s) => s.type == "tool-call")[0];
  let args =
    typeof toolCall.args == "string"
      ? JSON.parse(toolCall.args || "{}")
      : toolCall.args || {};
  let toolResult = await snapshotTool.execute(args, agentContext);
  let callback = agentContext.context.config.callback;
  if (callback) {
    await callback.onMessage({
      taskId: agentContext.context.taskId,
      agentName: toolCall.toolName,
      nodeId: agentContext.agentChain.agent.id,
      type: "tool_result",
      toolId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      params: args,
      toolResult: toolResult,
    });
  }
  // handle original messages
  let firstToolIndex = 3;
  for (let i = 0; i < messages.length; i++) {
    if (messages[0].role == "tool") {
      firstToolIndex = i;
      break;
    }
  }
  // system, user, assistant, tool(first), [...], <user>, assistant, tool(last), ...
  messages.splice(firstToolIndex + 1, lastToolIndex - firstToolIndex - 2, {
    role: "user",
    content: toolResult.content.filter((s) => s.type == "text") as Array<{
      type: "text";
      text: string;
    }>,
  });
}

export function handleLargeContextMessages(messages: LanguageModelV1Prompt, largeTextLength: number = 5000) {
  let imageNum = 0;
  let fileNum = 0;
  let longTextTools: Record<string, number> = {};
  for (let i = messages.length - 1; i >= 0; i--) {
    let message = messages[i];
    if (message.role == "user") {
      for (let j = 0; j < message.content.length; j++) {
        let content = message.content[j];
        if (content.type == "image") {
          if (++imageNum == 1) {
            break;
          }
          content = {
            type: "text",
            text: "[image]",
          };
          message.content[j] = content;
        } else if (content.type == "file") {
          if (++fileNum == 1) {
            break;
          }
          content = {
            type: "text",
            text: "[file]",
          };
          message.content[j] = content;
        }
      }
    } else if (message.role == "tool") {
      for (let j = 0; j < message.content.length; j++) {
        let toolResult = message.content[j];
        let toolContent = toolResult.content;
        if (!toolContent || toolContent.length == 0) {
          continue;
        }
        for (let r = 0; r < toolContent.length; r++) {
          let _content = toolContent[r];
          if (_content.type == "image") {
            if (++imageNum == 1) {
              break;
            }
            _content = {
              type: "text",
              text: "[image]",
            };
            toolContent[r] = _content;
          }
        }
        for (let r = 0; r < toolContent.length; r++) {
          let _content = toolContent[r];
          if (_content.type == "text" && _content.text?.length > largeTextLength) {
            if (!longTextTools[toolResult.toolName]) {
              longTextTools[toolResult.toolName] = 1;
              break;
            } else {
              longTextTools[toolResult.toolName]++;
            }
            _content = {
              type: "text",
              text: _content.text.substring(0, 500) + "...",
            };
            toolContent[r] = _content;
          }
        }
      }
    }
  }
}
