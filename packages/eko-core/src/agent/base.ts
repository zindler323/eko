import config from "../config";
import Log from "../common/log";
import * as memory from "../memory";
import { RetryLanguageModel } from "../llm";
import { ToolWrapper } from "../tools/wrapper";
import { AgentChain, ToolChain } from "../core/chain";
import Context, { AgentContext } from "../core/context";
import {
  ForeachTaskTool,
  McpTool,
  VariableStorageTool,
  WatchTriggerTool,
} from "../tools";
import { toImage, mergeTools } from "../common/utils";
import { getAgentSystemPrompt, getAgentUserPrompt } from "../prompt/agent";
import {
  WorkflowAgent,
  IMcpClient,
  LLMRequest,
  Tool,
  ToolExecuter,
  ToolResult,
  ToolSchema,
  StreamCallback,
  HumanCallback,
} from "../types";
import {
  LanguageModelV1FilePart,
  LanguageModelV1FunctionTool,
  LanguageModelV1ImagePart,
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
  LanguageModelV1ToolCallPart,
  LanguageModelV1ToolResultPart,
} from "@ai-sdk/provider";
import { callAgentLLM } from "./llm";

export type AgentParams = {
  name: string;
  description: string;
  tools: Tool[];
  llms?: string[];
  mcpClient?: IMcpClient;
  planDescription?: string;
  requestHandler?: (request: LLMRequest) => void;
};

export class Agent {
  protected name: string;
  protected description: string;
  protected tools: Tool[] = [];
  protected llms?: string[];
  protected mcpClient?: IMcpClient;
  protected planDescription?: string;
  protected requestHandler?: (request: LLMRequest) => void;
  protected callback?: StreamCallback & HumanCallback;
  protected agentContext?: AgentContext;

  constructor(params: AgentParams) {
    this.name = params.name;
    this.description = params.description;
    this.tools = params.tools;
    this.llms = params.llms;
    this.mcpClient = params.mcpClient;
    this.planDescription = params.planDescription;
    this.requestHandler = params.requestHandler;
  }

  public async run(context: Context, agentChain: AgentChain): Promise<string> {
    let mcpClient = this.mcpClient || context.config.defaultMcpClient;
    let agentContext = new AgentContext(context, this, agentChain);
    try {
      this.agentContext = agentContext;
      mcpClient && !mcpClient.isConnected() && (await mcpClient.connect());
      return this.runWithContext(agentContext, mcpClient, config.maxReactNum);
    } finally {
      mcpClient && (await mcpClient.close());
    }
  }

  public async runWithContext(
    agentContext: AgentContext,
    mcpClient?: IMcpClient,
    maxReactNum: number = 100,
    historyMessages: LanguageModelV1Prompt = []
  ): Promise<string> {
    let loopNum = 0;
    this.agentContext = agentContext;
    let context = agentContext.context;
    let agentNode = agentContext.agentChain.agent;
    const tools = [...this.tools, ...this.system_auto_tools(agentNode)];
    const messages: LanguageModelV1Prompt = [
      {
        role: "system",
        content: await this.buildSystemPrompt(agentContext, tools),
      },
      ...historyMessages,
      {
        role: "user",
        content: await this.buildUserPrompt(agentContext, tools),
      },
    ];
    agentContext.messages = messages;
    let rlm = new RetryLanguageModel(context.config.llms, this.llms);
    let agentTools = tools;
    while (loopNum < maxReactNum) {
      await context.checkAborted();
      if (mcpClient) {
        let controlMcp = await this.controlMcpTools(
          agentContext,
          messages,
          loopNum
        );
        if (controlMcp.mcpTools) {
          let mcpTools = await this.listTools(
            context,
            mcpClient,
            agentNode,
            controlMcp.mcpParams
          );
          let usedTools = memory.extractUsedTool(messages, agentTools);
          let _agentTools = mergeTools(tools, usedTools);
          agentTools = mergeTools(_agentTools, mcpTools);
        }
      }
      // 自动压缩
      await this.maybeCompressMessages(agentContext, rlm, messages, tools);
      await this.handleMessages(agentContext, messages, tools);
      let results = await callAgentLLM(
        agentContext,
        rlm,
        messages,
        this.convertTools(agentTools),
        false,
        undefined,
        0,
        this.callback,
        this.requestHandler
      );
      let finalResult = await this.handleCallResult(
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
    return "Reached LLM call limit. Please simplify requirements and retry.";
  }

  protected async handleCallResult(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    agentTools: Tool[],
    results: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>
  ): Promise<string | null> {
    const forceStop = agentContext.variables.get("forceStop");
    if (forceStop) {
      return forceStop;
    }
    let text: string | null = null;
    let context = agentContext.context;
    let user_messages: LanguageModelV1Prompt = [];
    let toolResults: LanguageModelV1ToolResultPart[] = [];
    results = memory.removeDuplicateToolUse(results);
    if (results.length == 0) {
      return null;
    }
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
        toolResult = await tool.execute(args, agentContext, result);
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
      const callback = this.callback || context.config.callback;
      if (callback) {
        await callback.onMessage(
          {
            taskId: context.taskId,
            agentName: agentContext.agent.Name,
            nodeId: agentContext.agentChain.agent.id,
            type: "tool_result",
            toolId: result.toolCallId,
            toolName: result.toolName,
            params: result.args || {},
            toolResult: toolResult,
          },
          agentContext
        );
      }
      let llmToolResult = this.convertToolResult(
        result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
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
    let hasForeach = agentNodeXml.indexOf("</forEach>") > -1;
    if (hasForeach) {
      tools.push(new ForeachTaskTool());
    }
    let hasWatch = agentNodeXml.indexOf("</watch>") > -1;
    if (hasWatch) {
      tools.push(new WatchTriggerTool());
    }
    let toolNames = this.tools.map((tool) => tool.name);
    return tools.filter((tool) => toolNames.indexOf(tool.name) == -1);
  }

  protected async buildSystemPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return getAgentSystemPrompt(
      this,
      agentContext.agentChain.agent,
      agentContext.context,
      tools,
      await this.extSysPrompt(agentContext, tools)
    );
  }

  protected async buildUserPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<
    Array<
      | LanguageModelV1TextPart
      | LanguageModelV1ImagePart
      | LanguageModelV1FilePart
    >
  > {
    return [
      {
        type: "text",
        text: getAgentUserPrompt(
          this,
          agentContext.agentChain.agent,
          agentContext.context,
          tools
        ),
      },
    ];
  }

  protected async extSysPrompt(
    agentContext: AgentContext,
    tools: Tool[]
  ): Promise<string> {
    return "";
  }

  private async listTools(
    context: Context,
    mcpClient: IMcpClient,
    agentNode?: WorkflowAgent,
    mcpParams?: Record<string, unknown>
  ): Promise<Tool[]> {
    try {
      if (!mcpClient.isConnected()) {
        await mcpClient.connect();
      }
      let list = await mcpClient.listTools({
        taskId: context.taskId,
        nodeId: agentNode?.id,
        environment: config.platform,
        agent_name: agentNode?.name || this.name,
        params: {},
        prompt: agentNode?.task || context.chain.taskPrompt,
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
    } catch (e) {
      Log.error("Mcp listTools error", e);
      return [];
    }
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
    messages: LanguageModelV1Prompt,
    tools: Tool[]
  ): Promise<void> {
    // Only keep the last image / file, large tool-text-result
    memory.handleLargeContextMessages(messages);
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

  public async loadTools(context: Context): Promise<Tool[]> {
    if (this.mcpClient) {
      let mcpTools = await this.listTools(context, this.mcpClient);
      if (mcpTools && mcpTools.length > 0) {
        return mergeTools(this.tools, mcpTools);
      }
    }
    return this.tools;
  }

  public addTool(tool: Tool) {
    this.tools.push(tool);
  }

  protected async onTaskStatus(
    status: "pause" | "abort" | "resume-pause",
    reason?: string
  ) {
    if (status == "abort" && this.agentContext) {
      this.agentContext?.variables.clear();
    }
  }

  get Llms(): string[] | undefined {
    return this.llms;
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

  get AgentContext(): AgentContext | undefined {
    return this.agentContext;
  }

  protected async maybeCompressMessages(
    agentContext: AgentContext,
    rlm: any,
    messages: any[],
    tools: any[]
  ) {
    // 基类不做任何处理，子类可重写
  }
}
