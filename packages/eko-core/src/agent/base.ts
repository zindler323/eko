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
import { toImage, mergeTools, uuidv4 } from "../common/utils";
import { getAgentSystemPrompt, getAgentUserPrompt } from "../prompt/agent";
import {
  WorkflowAgent,
  IMcpClient,
  LLMRequest,
  Tool,
  ToolExecuter,
  ToolResult,
  ToolSchema,
  StreamCallbackMessage,
  StreamCallback,
  HumanCallback,
} from "../types";
import { JSONSchema7 } from "json-schema";
import {
  LanguageModelV1FilePart,
  LanguageModelV1FunctionTool,
  LanguageModelV1ImagePart,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  LanguageModelV1TextPart,
  LanguageModelV1ToolCallPart,
  LanguageModelV1ToolChoice,
  LanguageModelV1ToolResultPart,
} from "@ai-sdk/provider";
import {string} from "zod";

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
  protected callback?: StreamCallback & HumanCallback;

  constructor(params: AgentParams) {
    this.name = params.name;
    this.description = params.description;
    this.tools = params.tools;
    this.llms = params.llms;
    this.mcpClient = params.mcpClient;
    this.planDescription = params.planDescription;
  }

  public async run(context: Context, agentChain: AgentChain): Promise<string> {
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
    let messages: LanguageModelV1Prompt = [
      {
        role: "system",
        content: await this.buildSystemPrompt(agentContext, tools),
      },
      {
        role: "user",
        content: await this.buildUserPrompt(agentContext, tools),
      },
    ];
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
      await this.handleMessages(agentContext, messages, tools);
      let results = await callLLM(
        agentContext,
        rlm,
        messages,
        this.convertTools(agentTools),
        false,
        undefined,
        false,
        this.callback
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
    return "Unfinished";
  }

  protected async handleCallResult(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    agentTools: Tool[],
    results: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>
  ): Promise<string | null> {
    let resultText: string | null = null;
    let context = agentContext.context;
    let user_messages: LanguageModelV1Prompt = [];
    let toolResults: LanguageModelV1ToolResultPart[] = [];

    // 调试日志：记录接收到的工具调用结果
    console.log(`[DEBUG] handleCallResult接收到结果:`,
      JSON.stringify(results.map(r => r.type === 'tool-call' ?
        { type: r.type, name: r.toolName, args: r.args } :
        { type: r.type, textLen: r.text ? r.text.length : 0 }
      )));

    results = memory.removeDuplicateToolUse(results);
    console.log(`[DEBUG] handleCallResult去重后结果:`, results);
    if (results.length == 0) {
      return null;
    }
    
    for (let i = 0; i < results.length; i++) {
      let result = results[i];
      let tool_result: LanguageModelV1ToolCallPart;

      // 根据结果类型进行不同处理
      if (result.type === "text") {
        // 文本类型：尝试从文本中解析工具调用
        const currentText = result.text;
        const tool_results = await parseToolCalls(currentText);
        
        // 检查是否找到了工具调用
        if (!tool_results || tool_results.length === 0) {
          console.log(`[DEBUG] 未在文本中找到工具调用`);
          continue; // 如果没有工具调用，跳过当前循环
        }
        
        // 从解析结果创建工具调用
        tool_result = {
          type: 'tool-call', 
          toolCallId: tool_results[0].toolCallId, 
          args: tool_results[0].args, 
          toolName: tool_results[0].toolName
        };
      } else if (result.type === "tool-call") {
        // 已经是工具调用类型，直接使用
        tool_result = result;
      } else {
        // 未知类型，跳过
        console.log(`[DEBUG] 未知结果类型: ${(result as any).type}`);
        continue;
      }

      let toolResult: ToolResult;
      let toolChain = new ToolChain(
        tool_result,
        agentContext.agentChain.agentRequest as LLMRequest
      );
      agentContext.agentChain.push(toolChain);
      try {
        let args =
          typeof tool_result.args == "string"
            ? JSON.parse(tool_result.args || "{}")
            : tool_result.args || {};
        toolChain.params = args;
        // 调试日志：在查找工具前记录工具名称
        console.log(`[DEBUG] 正在查找工具: ${tool_result.toolName}`);

        // 打印可用工具列表
        console.log(`[DEBUG] 可用工具列表:`,
          JSON.stringify(agentTools.map(t => ({ name: t.name, description: t.description }))));

        let tool = this.getTool(agentTools, tool_result.toolName);
        if (!tool) {
          console.error(`[ERROR] 找不到工具: ${tool_result.toolName}`);
          throw new Error(tool_result.toolName + " tool does not exist");
        }

        // 调试日志：工具找到，准备执行
        console.log(`[DEBUG] 找到工具 ${tool_result.toolName}，准备执行，参数:`, JSON.stringify(args));

        try {
          toolResult = await tool.execute(args, agentContext, tool_result);
          // 成功执行
          console.log(`[DEBUG] 工具 ${tool_result.toolName} 执行成功`);
        } catch (execError) {
          console.error(`[ERROR] 工具 ${tool_result.toolName} 执行失败:`, execError);
          throw execError;
        }

        toolChain.updateToolResult(toolResult);
        agentContext.consecutiveErrorNum = 0;
      } catch (e) {
        Log.error("tool call error: ", tool_result.toolName, tool_result.args, e);
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
            toolId: tool_result.toolCallId,
            toolName: tool_result.toolName,
            params: tool_result.args || {},
            toolResult: toolResult,
          },
          agentContext
        );
      }
      let llmToolResult = this.convertToolResult(
        tool_result,
        toolResult,
        user_messages
      );
      toolResults.push(llmToolResult);
    }
    // 修复类型错误：确保content的类型与LanguageModelV1Prompt期望的类型一致
    // 将results转换为合适的格式
    const assistantContent: Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart> = [];
    for (const result of results) {
      if (result.type === "text" || result.type === "tool-call") {
        assistantContent.push(result);
      }
    }
    
    messages.push({
      role: "assistant",
      content: assistantContent,
    });

    // 添加消息
    if (toolResults.length > 0) {
      // messages.push({
      //   role: "tool",
      //   content: toolResults,
      // });
      console.log()
      
      // 获取工具结果文本
      console.log("[DEBUG] toolResults:", JSON.stringify(toolResults));
      
      const toolTexts = toolResults.map(tr => {
        // 检查result字段，这在content为undefined时可以作为备选
        if (tr.result) {
          return typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result);
        }
        
        // 原有的检查content[0]
        if (tr?.content?.[0]) {
          const content = tr.content[0];
          if (content.type === "text" && typeof content.text === 'string') {
            return content.text;
          }
        }
        
        return '';
      }).filter(Boolean);
      
      console.log("[DEBUG] 提取的toolTexts:", toolTexts);
      
      // 确保即使没有工具文本也至少有一个默认响应
      const finalText = toolTexts.length > 0 
        ? toolTexts.join('\n') 
        : "工具执行完成，但没有返回文本结果。";
      
      // 直接使用正确的类型，简单明了
      messages.push({
        role: "user",
        content: [{
          type: "text",
          text: finalText
        }],
      });
      user_messages.forEach((message) => messages.push(message));
    }

    // 检查是否调用了finish工具

    // 解析文本中的所有工具调用
    let textContent = "";
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.type === "text" && result.text) {
        textContent += result.text;
      }
    }

    // 使用正则表达式专门查找 finish 工具调用
    const finishRegex = /<function>\s*finish\s*<\/function>/i;
    if (finishRegex.test(textContent)) {
      // 如果找到finish工具调用，终止流程
      return resultText || "任务已完成";
    }

    // 注意：其他工具调用（如navigate_to）不会导致流程终止

    // 无论是否调用了其他工具，只要没有调用finish，就继续进行
    return null;
  }

  protected system_auto_tools(agentNode: WorkflowAgent): Tool[] {
    const tools: Tool[] = [];
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
    // 添加finish工具
    tools.push({
      name: "finish",
      description: "当任务已经完成时，使用该方法终止任务，不需要参数",
      parameters: {
        type: "object",
        properties: {},
        required: []
      } as JSONSchema7,
      execute: async (): Promise<ToolResult> => {
        return {
          content: [{ type: "text", text: "任务已完成" }]
        };
      }
    } as Tool);
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
    // User dialogue
    const userPrompts = agentContext.context.conversation
      .splice(0, agentContext.context.conversation.length)
      .filter((s) => !!s);
    if (userPrompts.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role == "user") {
        for (let i = 0; i < userPrompts.length; i++) {
          lastMessage.content.push({
            type: "text",
            text: userPrompts[i],
          });
        }
      } else {
        messages.push({
          role: "user",
          content: userPrompts.map((s) => {
            return { type: "text", text: s };
          }),
        });
      }
    }
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
  
  // 解析自定义格式的工具调用
  // public parseToolCalls(text: string): Array<{toolName: string, args: any, toolCallId: string}> {
  //   const toolCalls: Array<{toolName: string, args: any, toolCallId: string}> = [];
  //
  //   if (text.trim().length === 0) {
  //     return toolCalls;
  //   }
  //
  //   // 首先从文本中提取所有的函数名
  //   const functionRegex = /<function>\s*([\w_]+)\s*<\/function>/g;
  //   let functionMatches: Array<{toolName: string, position: number}> = [];
  //   let functionMatch: RegExpExecArray | null;
  //
  //   while ((functionMatch = functionRegex.exec(text)) !== null) {
  //     const toolName = functionMatch[1].trim();
  //     const position = functionMatch.index;
  //     functionMatches.push({ toolName, position });
  //   }
  //
  //   // 然后从文本中提取所有的参数
  //   const argsRegex = /<args>([\s\S]*?)<\/args>/g;
  //   let argsMatches: Array<{argsText: string, position: number}> = [];
  //   let argsMatch: RegExpExecArray | null;
  //
  //   while ((argsMatch = argsRegex.exec(text)) !== null) {
  //     const argsText = argsMatch[1].trim();
  //     const position = argsMatch.index;
  //     argsMatches.push({ argsText, position });
  //   }
  //
  //   // 尝试匹配函数名和参数，通常函数名在前，参数紧跟着
  //   const combinedMatches: Array<{toolName: string, argsText: string}> = [];
  //
  //   for (const funcMatch of functionMatches) {
  //     // 找到第一个在函数名之后的参数
  //     const nextArgs = argsMatches.find(arg => arg.position > funcMatch.position);
  //
  //     if (nextArgs) {
  //       combinedMatches.push({
  //         toolName: funcMatch.toolName,
  //         argsText: nextArgs.argsText
  //       });
  //
  //       // 从候选中移除已使用的参数，防止重复匹配
  //       argsMatches = argsMatches.filter(arg => arg !== nextArgs);
  //     } else {
  //       // 如果没有找到匹配的参数，使用空对象
  //       combinedMatches.push({
  //         toolName: funcMatch.toolName,
  //         argsText: "{}"
  //       });
  //     }
  //   }
  //
  //   // 处理每一对匹配的函数和参数
  //   for (const match of combinedMatches) {
  //     let args: any;
  //     try {
  //       args = JSON.parse(match.argsText);
  //     } catch (e) {
  //       try {
  //         // 尝试修复一些常见的JSON格式错误
  //         const fixedArgsText = match.argsText
  //           .replace(/'/g, '"')  // 将单引号替换为双引号
  //           .replace(/\s*([\w]+)\s*:/g, '"$1":')  // 为没有引号的键名添加引号
  //           .replace(/,\s*}/g, '}');  // 删除末尾多余的逗号
  //
  //         args = JSON.parse(fixedArgsText);
  //       } catch (fixError) {
  //         // 如果修复后仍无法解析，使用空对象
  //         args = {};
  //       }
  //     }
  //
  //     // 生成唯一的工具调用ID
  //     const toolCallId = `tool-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  //
  //     // 添加到结果集
  //     toolCalls.push({
  //       toolCallId,
  //       toolName: match.toolName,
  //       args,
  //     });
  //
  //     if (match.toolName && Object.keys(args).length > 0) {
  //       console.log(`[INFO] 解析到工具调用: ${match.toolName}, 参数: ${JSON.stringify(args)}`);
  //     }
  //   }
  //
  //   if (toolCalls.length > 0) {
  //     console.log(`[INFO] 共解析出 ${toolCalls.length} 个工具调用`);
  //   }
  //
  //   return toolCalls;
  // }

  // 清理文本中的工具调用标记
  // public cleanToolCallsText(text: string): string {
  //   return text
  //     .replace(/<function>.*?<\/function>[\s\S]*?<args>[\s\S]*?<\/args>/g, "")
  //     .trim();
  // }
}

export async function callLLM(
  agentContext: AgentContext,
  rlm: RetryLanguageModel,
  messages: LanguageModelV1Prompt,
  tools: LanguageModelV1FunctionTool[],
  noCompress?: boolean,
  toolChoice?: LanguageModelV1ToolChoice,
  retry?: boolean,
  callback?: StreamCallback & HumanCallback
): Promise<Array<LanguageModelV1TextPart | LanguageModelV1ToolCallPart>> {
  let context = agentContext.context;
  let agentChain = agentContext.agentChain;
  let agentNode = agentChain.agent;
  let streamCallback = callback ||
    context.config.callback || {
      onMessage: async () => {},
    };
  let request: LLMRequest = {
    tools: tools,
    toolChoice,
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
      await context.checkAborted();
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let chunk = value as LanguageModelV1StreamPart;
      switch (chunk.type) {
        case "text-delta": {
          // 不打印文本增量，保持跟踪完整文本
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

          // 解析流中的自定义工具调用
          // 使用代理对象中的方法来解析文本中的工具调用

          // if (agentChain.agent instanceof Agent) {
          //   const agent = agentChain.agent as Agent;
          //
          //   // 解析所有工具调
          //
          //     // 处理新发现的工具调用
          //   // for (const toolCall of newToolCalls) {
          //   //   // 检查是否已经处理过相同的工具调用
          //   //   const existingToolCall = toolParts.find(tp => tp.toolName === toolCall.toolName &&
          //   //                                        JSON.stringify(tp.args) === JSON.stringify(toolCall.args));
          //
          //   //   if (!existingToolCall) {
          //   //     // 将自定义工具调用转换为标准工具调用部分
          //   //     toolParts.push({
          //   //       type: "tool-call",
          //   //       toolCallId: toolCall.toolCallId,
          //   //       toolName: toolCall.toolName,
          //   //       args: toolCall.args,
          //   //     });
          //
          //   //     console.log(`[INFO] 流处理中解析到工具调用: ${toolCall.toolName}`);
          //
          //   //     // 向回调发送工具调用消息
          //   //     await streamCallback.onMessage(
          //   //       {
          //   //         taskId: context.taskId,
          //   //         agentName: agentNode.name,
          //   //         nodeId: agentNode.id,
          //   //         type: "tool_use",
          //   //         toolId: toolCall.toolCallId,
          //   //         toolName: toolCall.toolName,
          //   //         params: toolCall.args,
          //   //       },
          //   //       agentContext
          //   //     );
          //   //   }
          //   // }
          //
          //   // 使用清理后的文本显示到界面上
          //   const cleanText = agent.cleanToolCallsText(streamText);
          //   console.log("[DEBUG]清理后的文本: ", cleanText);
          //   await streamCallback.onMessage(
          //     {
          //       taskId: context.taskId,
          //       agentName: agentNode.name,
          //       nodeId: agentNode.id,
          //       type: "text",
          //       streamId,
          //       streamDone: false,
          //       text: cleanText,
          //     },
          //     agentContext
          //   );
          // } else {
          //   // 原始流程，如果不是 Agent 实例
          //   await streamCallback.onMessage(
          //     {
          //       taskId: context.taskId,
          //       agentName: agentNode.name,
          //       nodeId: agentNode.id,
          //       type: "text",
          //       streamId,
          //       streamDone: false,
          //       text: streamText,
          //     },
          //     agentContext
          //   );
          // }
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
          toolParts.push({
            type: "tool-call",
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: message.params || args,
          });
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
          throw new Error("Plan Error");
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
            return callLLM(
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
  //   console.log(`[DEBUG] 解析流文本: ${streamText}`)
  //   const agent = agentChain.agent as Agent;
  //   const newToolCalls = agent.parseToolCalls(streamText);
  //   console.log(`[DEBUG] 解析到 ${newToolCalls.length} 个工具调用:`, JSON.stringify(newToolCalls));
  //   }
  } finally {
    reader.releaseLock();
  }
  // agentChain.agentResult = streamText;
  // const finalToolCalls = await parseToolCalls(streamText);
  //
  // // 如果解析出了工具调用，则添加到结果中
  // if (finalToolCalls && finalToolCalls.length > 0) {
  //     for (const call of finalToolCalls) {
  //       // 检查是否已经在工具列表中
  //       const existing = toolParts.find(tp => tp.toolName === call.toolName && JSON.stringify(tp.args) === JSON.stringify(call.args));
  //
  //       if (!existing) {
  //         toolParts.push({
  //           type: "tool-call",
  //           toolCallId: call.toolCallId,
  //           toolName: call.toolName,
  //           args: call.args,
  //         });
  //
  //         console.log(`[DEBUG] 从流中解析到工具调用: ${call.toolName}`);
  //
  //         // 向回调发送工具调用消息
  //         await streamCallback.onMessage(
  //           {
  //             taskId: context.taskId,
  //             agentName: agentNode.name,
  //             nodeId: agentNode.id,
  //             type: "tool_use",
  //             toolId: call.toolCallId,
  //             toolName: call.toolName,
  //             params: call.args,
  //           },
  //           agentContext
  //         );
  //       }
  //     }
  //   }
  //
  //   // 如果解析出了工具调用，则清理文本中的工具调用标记
  // const cleanText = await cleanToolCallsText(streamText);
  //
  //   // 调试日志：记录解析到的工具调用
  // console.log(`[DEBUG] 解析到 ${toolParts.length} 个工具调用:`,
  //     JSON.stringify(toolParts.map(t => ({ name: t.toolName, args: t.args }))));
  //
  // if (toolParts.length > 0) {
  //     return [
  //       // 只有在清理后的文本非空时才返回文本部分
  //       ...(cleanText.trim() ? [{ type: "text", text: cleanText } as LanguageModelV1TextPart] : []),
  //       ...toolParts, // 始终返回解析出的工具调用
  //     ];
  //   }

  // 如果没有解析到工具调用，或者不是Agent实例，则只返回文本
  return streamText
    ? [{ type: "text", text: streamText } as LanguageModelV1TextPart]
    : [];
}


export async function parseToolCalls(text: string): Promise<{     toolName: string;     args: any;     toolCallId: string; }[]> {
    const toolCalls: Array<{toolName: string, args: any, toolCallId: string}> = [];

    if (text.trim().length === 0) {
      return toolCalls;
    }

    // 首先从文本中提取所有的函数名
    const functionRegex = /<function>\s*([\w_]+)\s*<\/function>/g;
    let functionMatches: Array<{toolName: string, position: number}> = [];
    let functionMatch: RegExpExecArray | null;

    while ((functionMatch = functionRegex.exec(text)) !== null) {
      const toolName = functionMatch[1].trim();
      const position = functionMatch.index;
      functionMatches.push({ toolName, position });
    }

    // 然后从文本中提取所有的参数
    const argsRegex = /<args>([\s\S]*?)<\/args>/g;
    let argsMatches: Array<{argsText: string, position: number}> = [];
    let argsMatch: RegExpExecArray | null;

    while ((argsMatch = argsRegex.exec(text)) !== null) {
      const argsText = argsMatch[1].trim();
      const position = argsMatch.index;
      argsMatches.push({ argsText, position });
    }

    // 尝试匹配函数名和参数，通常函数名在前，参数紧跟着
    const combinedMatches: Array<{toolName: string, argsText: string}> = [];

    for (const funcMatch of functionMatches) {
      // 找到第一个在函数名之后的参数
      const nextArgs = argsMatches.find(arg => arg.position > funcMatch.position);

      if (nextArgs) {
        combinedMatches.push({
          toolName: funcMatch.toolName,
          argsText: nextArgs.argsText
        });

        // 从候选中移除已使用的参数，防止重复匹配
        argsMatches = argsMatches.filter(arg => arg !== nextArgs);
      } else {
        // 如果没有找到匹配的参数，使用空对象
        combinedMatches.push({
          toolName: funcMatch.toolName,
          argsText: "{}"
        });
      }
    }

    // 处理每一对匹配的函数和参数
    for (const match of combinedMatches) {
      let args: any;
      try {
        args = JSON.parse(match.argsText);
      } catch (e) {
        try {
          // 尝试修复一些常见的JSON格式错误
          const fixedArgsText = match.argsText
            .replace(/'/g, '"')  // 将单引号替换为双引号
            .replace(/\s*([\w]+)\s*:/g, '"$1":')  // 为没有引号的键名添加引号
            .replace(/,\s*}/g, '}');  // 删除末尾多余的逗号

          args = JSON.parse(fixedArgsText);
        } catch (fixError) {
          // 如果修复后仍无法解析，使用空对象
          args = {};
        }
      }

      // 生成唯一的工具调用ID
      const toolCallId = `tool-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      // 添加到结果集
      toolCalls.push({
        toolCallId,
        toolName: match.toolName,
        args,
      });

      if (match.toolName && Object.keys(args).length > 0) {
        console.log(`[INFO] 解析到工具调用: ${match.toolName}, 参数: ${JSON.stringify(args)}`);
      }
    }

    if (toolCalls.length > 0) {
      console.log(`[INFO] 共解析出 ${toolCalls.length} 个工具调用`);
    }

    return toolCalls;
  }

export async function cleanToolCallsText(text: string): Promise<string> {
  return text
    .replace(/<function>.*?<\/function>[\s\S]*?<args>[\s\S]*?<\/args>/g, "")
    .trim();
}
