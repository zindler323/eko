import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { AgentContext } from "../core/context";
import { uuidv4, sleep } from "../common/utils";
import {
  LLMRequest,
  StreamCallbackMessage,
  StreamCallback,
  HumanCallback,
  StreamResult,
} from "../types";
import {
  LanguageModelV1FunctionTool,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  LanguageModelV1TextPart,
  LanguageModelV1ToolCallPart,
  LanguageModelV1ToolChoice,
} from "@ai-sdk/provider";

export async function callAgentLLM(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV1Prompt,
  tools: LanguageModelV1FunctionTool[],
  noCompress?: boolean,
  toolChoice?: LanguageModelV1ToolChoice,
  retry?: boolean,
  callback?: StreamCallback & HumanCallback
): Promise<Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>> {
  await agentContext.context.checkAborted();
  if (messages.length >= config.compressThreshold && !noCompress) {
    await memory.compressAgentMessages(agentContext, rlm, messages, tools);
  }
  if (!toolChoice) {
    // Append user dialogue
    appendUserConversation(agentContext, messages);
  }
  let context = agentContext.context;
  let agentChain = agentContext.agentChain;
  let agentNode = agentChain.agent;
  let streamCallback = callback ||
    context.config.callback || {
      onMessage: async () => {},
    };
  const stepController = new AbortController();
  const signal = AbortSignal.any([
    context.controller.signal,
    stepController.signal,
  ]);
  let request: LLMRequest = {
    tools: tools,
    toolChoice,
    messages: messages,
    abortSignal: signal,
  };
  agentChain.agentRequest = request;
  let result: StreamResult;
  try {
    context.currentStepControllers.add(stepController);
    result = await rlm.callStream(request);
  } catch (e: any) {
    context.currentStepControllers.delete(stepController);
    await context.checkAborted();
    if (
      !noCompress &&
      messages.length > 10 &&
      ((e + "").indexOf("tokens") > -1 || (e + "").indexOf("too long") > -1)
    ) {
      await memory.compressAgentMessages(agentContext, rlm, messages, tools);
    }
    if (!retry) {
      await sleep(200);
      return callAgentLLM(
        agentContext,
        rlm,
        messages,
        tools,
        noCompress,
        toolChoice,
        true,
        streamCallback
      );
    }
    throw e;
  }
  let streamText = "";
  let thinkText = "";
  let toolArgsText = "";
  let streamId = uuidv4();
  let textStreamDone = false;
  let toolParts: LanguageModelV1ToolCallPart[] = [];
  const reader = result.stream.getReader();
  try {
    let toolPart: LanguageModelV1ToolCallPart | null = null;
    while (true) {
      await context.checkAborted();
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let chunk = value as LanguageModelV1StreamPart;
      switch (chunk.type) {
        case "text-delta": {
          if (toolPart && !chunk.textDelta) {
            continue;
          }
          streamText += chunk.textDelta || "";
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "text",
              streamId,
              streamDone: false,
              text: streamText,
            },
            agentContext
          );
          if (toolPart) {
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "tool_use",
                toolId: toolPart.toolCallId,
                toolName: toolPart.toolName,
                params: toolPart.args || {},
              },
              agentContext
            );
            toolPart = null;
          }
          break;
        }
        case "reasoning": {
          thinkText += chunk.textDelta || "";
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "thinking",
              streamId,
              streamDone: false,
              text: thinkText,
            },
            agentContext
          );
          break;
        }
        case "tool-call-delta": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId,
                streamDone: true,
                text: streamText,
              },
              agentContext
            );
          }
          toolArgsText += chunk.argsTextDelta || "";
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "tool_streaming",
              toolId: chunk.toolCallId,
              toolName: chunk.toolName,
              paramsText: toolArgsText,
            },
            agentContext
          );
          if (toolPart == null) {
            toolPart = {
              type: "tool-call",
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: {},
            };
            toolParts.push(toolPart);
          }
          break;
        }
        case "tool-call": {
          toolArgsText = "";
          let args = chunk.args ? JSON.parse(chunk.args) : {};
          let message: StreamCallbackMessage = {
            taskId: context.taskId,
            agentName: agentNode.name,
            nodeId: agentNode.id,
            type: "tool_use",
            toolId: chunk.toolCallId,
            toolName: chunk.toolName,
            params: args,
          };
          await streamCallback.onMessage(message, agentContext);
          if (toolPart == null) {
            toolParts.push({
              type: "tool-call",
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: message.params || args,
            });
          } else {
            toolPart.args = message.params || args;
            toolPart = null;
          }
          break;
        }
        case "file": {
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "file",
              mimeType: chunk.mimeType,
              data: chunk.data as string,
            },
            agentContext
          );
          break;
        }
        case "error": {
          Log.error(`${agentNode.name} agent error: `, chunk);
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "error",
              error: chunk.error,
            },
            agentContext
          );
          throw new Error("LLM Error: " + chunk.error);
        }
        case "finish": {
          if (!textStreamDone) {
            textStreamDone = true;
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId,
                streamDone: true,
                text: streamText,
              },
              agentContext
            );
          }
          if (toolPart) {
            await streamCallback.onMessage(
              {
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "tool_use",
                toolId: toolPart.toolCallId,
                toolName: toolPart.toolName,
                params: toolPart.args || {},
              },
              agentContext
            );
            toolPart = null;
          }
          await streamCallback.onMessage(
            {
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "finish",
              finishReason: chunk.finishReason,
              usage: chunk.usage,
            },
            agentContext
          );
          if (
            chunk.finishReason === "length" &&
            messages.length >= 10 &&
            !noCompress &&
            !retry
          ) {
            await memory.compressAgentMessages(
              agentContext,
              rlm,
              messages,
              tools
            );
            return callAgentLLM(
              agentContext,
              rlm,
              messages,
              tools,
              noCompress,
              toolChoice,
              true,
              streamCallback
            );
          }
          break;
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw e;
    }
    if (!retry && (e + "").indexOf("network error") > -1) {
      return callAgentLLM(
        agentContext,
        rlm,
        messages,
        tools,
        noCompress,
        toolChoice,
        true,
        streamCallback
      );
    }
    throw e;
  } finally {
    reader.releaseLock();
    context.currentStepControllers.delete(stepController);
  }
  agentChain.agentResult = streamText;
  return streamText
    ? [
        { type: "text", text: streamText } as LanguageModelV1TextPart,
        ...toolParts,
      ]
    : toolParts;
}

function appendUserConversation(
  agentContext: AgentContext,
  messages: LanguageModelV1Prompt
) {
  const userPrompts = agentContext.context.conversation
    .splice(0, agentContext.context.conversation.length)
    .filter((s) => !!s);
  if (userPrompts.length > 0) {
    const prompt = "The user is intervening in the current task. Please replan and execute according to the following instructions:\n" + userPrompts.map(s => `- ${s.trim()}`).join("\n");
    messages.push({
      role: "user",
      content: [{ type: "text", text: prompt }],
    });
  }
}
