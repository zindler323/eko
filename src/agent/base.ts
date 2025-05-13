import config from "../config";
import Log from "../common/log";
import { RetryLanguageModel } from "../llm";
import { ToolWrapper } from "../tools/wrapper";
import { WorkflowAgent, IMcpClient } from "../types";
import { AgentChain, ToolChain } from "../core/chain";
import Context, { AgentContext } from "../core/context";
import { toImage, mergeTools, uuidv4 } from "../common/utils";
import {
  LanguageModelV1FunctionTool,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  LanguageModelV1TextPart,
  LanguageModelV1ToolCallPart,
  LanguageModelV1ToolResultPart,
} from "@ai-sdk/provider";
import { LLMRequest } from "../types/llm.types";
import { McpTool, VariableStorageTool } from "../tools";
import { getAgentSystemPrompt, getAgentUserPrompt } from "../prompt/agent";
import {
  Tool,
  ToolExecuter,
  ToolResult,
  ToolSchema,
} from "../types/tools.types";

export type AgentParams = {
  name: string;
  description: string;
  tools: Tool[];
  llms?: string[];
  mcpClient?: IMcpClient;
  planDescription?: string;
};

export class Agent {
  protected name: string;
  protected description: string;
  protected tools: Tool[] = [];
  protected llms?: string[];
  protected mcpClient?: IMcpClient;
  protected planDescription?: string;

  constructor(params: AgentParams) {
    this.name = params.name;
    this.description = params.description;
    this.tools = params.tools;
    this.llms = params.llms;
    this.mcpClient = params.mcpClient;
    this.planDescription = params.planDescription;
  }

  public async run(
    context: Context,
    agentChain: AgentChain
  ): Promise<string> {
    let mcpClient = this.mcpClient || context.config.defaultMcpClient;
    let agentContext = new AgentContext(context, this, agentChain);
    try {
      mcpClient && !mcpClient.isConnected() && (await mcpClient.connect());
      return this.runWithContext(agentContext, mcpClient, config.maxReactNum);
    } finally {
      mcpClient && (await mcpClient.close());
    }
  }

  public async runWithContext(
    agentContext: AgentContext,
    mcpClient?: IMcpClient,
    maxReactNum: number = 100
  ): Promise<string> {
    let loopNum = 0;
    let context = agentContext.context;
    let agentNode = agentContext.agentChain.agent;
    const tools = [...this.tools, ...this.system_auto_tools(agentNode)];
    let messages = await this.initMessages(agentContext, tools);
    let rlm = new RetryLanguageModel(context.config.llms, this.llms);
    let agentTools = tools;
    while (loopNum < maxReactNum) {
      context.checkAborted();
      if (mcpClient) {
        let controlMcp = await this.controlMcpTools(
          agentContext,
          messages,
          loopNum
        );
        if (controlMcp.mcpTools) {
          let mcpTools = await this.listTools(
            agentNode,
            context,
            mcpClient,
            controlMcp.mcpParams
          );
          let usedTools = this.extractUsedTool(messages, agentTools);
          let _agentTools = mergeTools(tools, usedTools);
          agentTools = mergeTools(_agentTools, mcpTools);
        }
      }
      await this.handleMessages(agentContext, messages);
      let results = await this.callLLM(
        agentContext,
        rlm,
        messages,
        this.convertTools(agentTools)
      );
      let finalResult = await this.handleResult(
        agentContext,
        messages,
        agentTools,
        results
      );
      if (finalResult) {
        return finalResult;
      }
      loopNum++;
    }
    return "Unfinished";
  }

  protected async handleResult(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    agentTools: Tool[],
    results: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>
  ): Promise<string | null> {
    let text: string | null = null;
    let context = agentContext.context;
    let user_messages: LanguageModelV1Prompt = [];
    let toolResults: LanguageModelV1ToolResultPart[] = [];
    results = this.removeDuplicateToolUse(results);
    for (let i = 0; i < results.length; i++) {
      let result = results[i];
      if (result.type == "text") {
        text = result.text;
        continue;
      }
      let toolResult: ToolResult;
      let toolChain = new ToolChain(
        result,
        agentContext.agentChain.agentRequest as LLMRequest
      );
      agentContext.agentChain.push(toolChain);
      try {
        let args =
          typeof result.args == "string"
            ? JSON.parse(result.args || "{}")
            : result.args || {};
        toolChain.params = args;
        let tool = this.getTool(agentTools, result.toolName);
        if (!tool) {
          throw new Error(result.toolName + " tool does not exist");
        }
        toolResult = await tool.execute(args, agentContext);
        toolChain.updateToolResult(toolResult);
        agentContext.consecutiveErrorNum = 0;
      } catch (e) {
        Log.error("tool call error: ", result.toolName, result.args, e);
        toolResult = {
          content: [
            {
              type: "text",
              text: e + "",
            },
          ],
          isError: true,
        };
        toolChain.updateToolResult(toolResult);
        if (++agentContext.consecutiveErrorNum >= 10) {
          throw e;
        }
      }
      let llmToolResult = this.convertToolResult(
        result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
      if (context.config.callback) {
        context.config.callback.onMessage({
          taskId: context.taskId,
          agentName: result.toolName,
          nodeId: agentContext.agentChain.agent.id,
          type: "tool_result",
          toolId: result.toolCallId,
          toolName: result.toolName,
          params: result.args || {},
          toolResult: toolResult,
        });
      }
    }
    messages.push({
      role: "assistant",
      content: results,
    });
    if (toolResults.length > 0) {
      messages.push({
        role: "tool",
        content: toolResults,
      });
      user_messages.forEach((message) => messages.push(message));
      return null;
    } else {
      return text;
    }
  }

  protected system_auto_tools(agentNode: WorkflowAgent): Tool[] {
    let tools: Tool[] = [];
    let agentNodeXml = agentNode.xml;
    let hasVariable =
      agentNodeXml.indexOf("input=") > -1 ||
      agentNodeXml.indexOf("output=") > -1;
    if (hasVariable) {
      tools.push(new VariableStorageTool());
    }
    let toolNames = this.tools.map((tool) => tool.name);
    return tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
  }

  private removeDuplicateToolUse(
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

  protected async initMessages(agentContext: AgentContext, tools?: Tool[]): Promise<LanguageModelV1Prompt> {
    let messages: LanguageModelV1Prompt = [
      {
        role: "system",
        content: getAgentSystemPrompt(
          this,
          agentContext.agentChain.agent,
          agentContext.context,
          tools,
          await this.extSysPrompt(agentContext)
        ),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: getAgentUserPrompt(
              this,
              agentContext.agentChain.agent,
              agentContext.context,
              tools
            ),
          },
        ],
      },
    ];
    return messages;
  }

  protected async extSysPrompt(agentContext: AgentContext): Promise<string> {
    return "";
  }

  private async listTools(
    agentNode: WorkflowAgent,
    context: Context,
    mcpClient: IMcpClient,
    mcpParams?: Record<string, unknown>
  ): Promise<Tool[]> {
    let list = await mcpClient.listTools({
      taskId: context.taskId,
      nodeId: agentNode.id,
      environment: config.platform,
      agent_name: agentNode.name,
      params: {},
      prompt: agentNode.task,
      ...(mcpParams || {}),
    });
    let mcpTools: Tool[] = [];
    for (let i = 0; i < list.length; i++) {
      let toolSchema: ToolSchema = list[i];
      let execute = this.toolExecuter(mcpClient, toolSchema.name);
      let toolWrapper = new ToolWrapper(toolSchema, execute);
      mcpTools.push(new McpTool(toolWrapper));
    }
    return mcpTools;
  }

  protected async controlMcpTools(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    loopNum: number
  ): Promise<{
    mcpTools: boolean;
    mcpParams?: Record<string, unknown>;
  }> {
    return {
      mcpTools: loopNum == 0,
    };
  }

  protected toolExecuter(mcpClient: IMcpClient, name: string): ToolExecuter {
    return {
      execute: async function (args, agentContext): Promise<ToolResult> {
        return await mcpClient.callTool({
          name: name,
          arguments: args,
          extInfo: {
            taskId: agentContext.context.taskId,
            nodeId: agentContext.agentChain.agent.id,
            environment: config.platform,
            agent_name: agentContext.agent.Name,
          },
        });
      },
    };
  }

  private convertTools(tools: Tool[]): LanguageModelV1FunctionTool[] {
    return tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  private getTool(tools: Tool[], name: string): Tool | null {
    for (let i = 0; i < tools.length; i++) {
      if (tools[i].name == name) {
        return tools[i];
      }
    }
    return null;
  }

  private extractUsedTool(
    messages: LanguageModelV1Prompt,
    agentTools: Tool[]
  ): Tool[] {
    let tools: Tool[] = [];
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

  protected convertToolResult(
    toolUse: LanguageModelV1ToolCallPart,
    toolResult: ToolResult,
    user_messages: LanguageModelV1Prompt
  ): LanguageModelV1ToolResultPart {
    let text = "";
    for (let i = 0; i < toolResult.content.length; i++) {
      let content = toolResult.content[i];
      if (content.type == "text") {
        text += (text.length > 0 ? "\n" : "") + content.text;
      } else {
        // Only the calude model supports returning images from tool results, while openai only supports text,
        // Compatible with other AI models that do not support tool results as images.
        user_messages.push({
          role: "user",
          content: [
            {
              type: "image",
              image: toImage(content.data),
              mimeType: content.mimeType,
            },
            { type: "text", text: `call \`${toolUse.toolName}\` tool result` },
          ],
        });
      }
    }
    let isError = toolResult.isError == true;
    if (isError && !text.startsWith("Error")) {
      text = "Error: " + text;
    } else if (!isError && text.length == 0) {
      text = "Successful";
    }
    let contentText: {
      type: "text";
      text: string;
    } | null = {
      type: "text",
      text: text,
    };
    let result: unknown = text;
    if (
      text &&
      ((text.startsWith("{") && text.endsWith("}")) ||
        (text.startsWith("[") && text.endsWith("]")))
    ) {
      try {
        result = JSON.parse(text);
        contentText = null;
      } catch (e) {}
    }
    return {
      type: "tool-result",
      toolCallId: toolUse.toolCallId,
      toolName: toolUse.toolName,
      result: result,
      content: contentText ? [contentText] : undefined,
      isError: isError,
    };
  }

  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt
  ): Promise<void> {
    // Only keep the last image / file
    let imageNum = 0;
    let fileNum = 0;
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
          let content = message.content[j];
          let tool_content = content.content;
          if (!tool_content || tool_content.length == 0) {
            continue;
          }
          for (let r = 0; r < tool_content.length; r++) {
            let _content = tool_content[r];
            if (_content.type == "image") {
              if (++imageNum == 1) {
                break;
              }
              _content = {
                type: "text",
                text: "[image]",
              };
              tool_content[r] = _content;
            }
          }
        }
      }
    }
  }

  private async callLLM(
    agentContext: AgentContext,
    rlm: RetryLanguageModel,
    messages: LanguageModelV1Prompt,
    tools: LanguageModelV1FunctionTool[]
  ): Promise<Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>> {
    let context = agentContext.context;
    let agentChain = agentContext.agentChain;
    let agentNode = agentChain.agent;
    let streamCallback = context.config.callback || {
      onMessage: () => {},
    };
    let request: LLMRequest = {
      tools: tools,
      messages: messages,
      abortSignal: context.controller.signal,
    };
    agentChain.agentRequest = request;
    let result = await rlm.callStream(request);
    let streamText = "";
    let thinkText = "";
    let toolArgsText = "";
    let streamId = uuidv4();
    let textStreamDone = false;
    let toolParts: LanguageModelV1ToolCallPart[] = [];
    const reader = result.stream.getReader();
    try {
      while (true) {
        context.checkAborted();
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        let chunk = value as LanguageModelV1StreamPart;
        switch (chunk.type) {
          case "text-delta": {
            streamText += chunk.textDelta || "";
            streamCallback.onMessage({
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "text",
              streamId,
              streamDone: false,
              text: streamText,
            });
            break;
          }
          case "reasoning": {
            thinkText += chunk.textDelta || "";
            streamCallback.onMessage({
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "thinking",
              streamId,
              streamDone: false,
              text: thinkText,
            });
            break;
          }
          case "tool-call-delta": {
            if (!textStreamDone) {
              textStreamDone = true;
              streamCallback.onMessage({
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId,
                streamDone: true,
                text: streamText,
              });
            }
            toolArgsText += chunk.argsTextDelta || "";
            streamCallback.onMessage({
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "tool_streaming",
              toolId: chunk.toolCallId,
              toolName: chunk.toolName,
              paramsText: toolArgsText,
            });
            break;
          }
          case "tool-call": {
            toolArgsText = "";
            let args = chunk.args ? JSON.parse(chunk.args) : {};
            streamCallback.onMessage({
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "tool_use",
              toolId: chunk.toolCallId,
              toolName: chunk.toolName,
              params: args,
            });
            toolParts.push({
              type: "tool-call",
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: args,
            });
            break;
          }
          case "file": {
            streamCallback.onMessage({
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "file",
              mimeType: chunk.mimeType,
              data: chunk.data as string,
            });
            break;
          }
          case "error": {
            Log.error(`${this.name} agent error: `, chunk);
            streamCallback.onMessage({
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "error",
              error: chunk.error,
            });
            throw new Error("Plan Error");
          }
          case "finish": {
            if (!textStreamDone) {
              textStreamDone = true;
              streamCallback.onMessage({
                taskId: context.taskId,
                agentName: agentNode.name,
                nodeId: agentNode.id,
                type: "text",
                streamId,
                streamDone: true,
                text: streamText,
              });
            }
            streamCallback.onMessage({
              taskId: context.taskId,
              agentName: agentNode.name,
              nodeId: agentNode.id,
              type: "finish",
              finishReason: chunk.finishReason,
              usage: chunk.usage,
            });
            break;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    agentChain.agentResult = streamText;
    return streamText
      ? [
          { type: "text", text: streamText } as LanguageModelV1TextPart,
          ...toolParts,
        ]
      : toolParts;
  }

  protected async callInnerTool(fun: () => Promise<any>): Promise<ToolResult> {
    let result = await fun();
    return {
      content: [
        {
          type: "text",
          text: result
            ? typeof result == "string"
              ? result
              : JSON.stringify(result)
            : "Successful",
        },
      ],
    };
  }

  get Name(): string {
    return this.name;
  }

  get Description(): string {
    return this.description;
  }

  get Tools(): Tool[] {
    return this.tools;
  }

  get PlanDescription() {
    return this.planDescription;
  }

  get McpClient() {
    return this.mcpClient;
  }
}
