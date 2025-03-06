import { LLMProviderFactory } from '../services/llm/provider-factory';
import { WorkflowGenerator } from '../services/workflow/generator';
import {
  LLMConfig,
  EkoConfig,
  EkoInvokeParam,
  LLMProvider,
  Tool,
  Workflow,
  WorkflowCallback,
  ExecutionContext,
  WorkflowResult
} from '../types';
import { ToolRegistry } from './tool-registry';

/**
 * Eko core
 */
export class Eko {
  public static tools: Map<string, Tool<any, any>> = new Map();

  private llmProvider: LLMProvider;
  private ekoConfig: EkoConfig;
  private toolRegistry = new ToolRegistry();
  private workflowGeneratorMap = new Map<Workflow, WorkflowGenerator>();

  constructor(llmConfig: LLMConfig, ekoConfig?: EkoConfig) {
    console.info("using Eko@" + process.env.COMMIT_HASH);
    console.warn("this version is POC, should not used for production");
    this.llmProvider = LLMProviderFactory.buildLLMProvider(llmConfig);
    this.ekoConfig = this.buildEkoConfig(ekoConfig);
    this.registerTools();
  }

  private buildEkoConfig(ekoConfig: Partial<EkoConfig> | undefined): EkoConfig {
    if (!ekoConfig) {
      console.warn("`ekoConfig` is missing when construct `Eko` instance");
    }
    const defaultEkoConfig: EkoConfig = {
      workingWindowId: undefined,
      chromeProxy: chrome,
      callback: undefined,
    };
    return {
      ...defaultEkoConfig,
      ...ekoConfig,
    };
  }

  private registerTools() {
    let tools = Array.from(Eko.tools.entries()).map(([_key, tool]) => tool);

    // filter human tools by callbacks
    const callback = this.ekoConfig.callback;
    if (callback) {
      const hooks = callback.hooks;

      // these tools could not work without corresponding hook
      const tool2isHookExists: { [key: string]: boolean } = {
        "human_input_text": Boolean(hooks.onHumanInputText),
        "human_input_single_choice": Boolean(hooks.onHumanInputSingleChoice),
        "human_input_multiple_choice": Boolean(hooks.onHumanInputMultipleChoice),
        "human_operate": Boolean(hooks.onHumanOperate),
      };
      tools = tools.filter(tool => {
        if (tool.name in tool2isHookExists) {
          let isHookExists = tool2isHookExists[tool.name]
          return isHookExists;
        } else {
          return true;
        }
      });
    } else {
      console.warn("`ekoConfig.callback` is missing when construct `Eko` instance.")
    }
    
    tools.forEach(tool => this.toolRegistry.registerTool(tool));
  }

  public async generate(prompt: string, param?: EkoInvokeParam): Promise<Workflow> {
    prompt = `Your ultimate task is: """${prompt}""". If you achieved your ultimate task, stop everything and use the done action in the next step to complete the task. If not, continue as usual.`;
    const json = {
      "id": "workflow_id",
      "name": prompt,
      "description": prompt,
      "nodes": [
        {
          "id": "sub_task_id",
          "type": "action",
          "action": {
            "type": "prompt",
            "name": prompt,
            "description": prompt,
            "tools": [
              "browser_use",
              "element_click",
              "extract_content",
              "find_element_position",
              "get_all_tabs",
              "open_url",
              "screenshot",
              "tab_management",
              "web_search",
              "export_file",
            ],
          },
          "dependencies": []
        },
      ],
    };
    const generator = new WorkflowGenerator(this.llmProvider, this.toolRegistry);  
    let workflow = await generator.generateWorkflowFromJson(json, this.ekoConfig);
    return workflow;
  }

  public async execute(workflow: Workflow): Promise<WorkflowResult> {
    // Inject LLM provider at workflow level
    workflow.llmProvider = this.llmProvider;

    // Process each node's action
    for (const node of workflow.nodes) {
      if (node.action.type === 'prompt') {
        // Inject LLM provider
        node.action.llmProvider = this.llmProvider;

        // Resolve tools
        node.action.tools = node.action.tools.map(tool => {
          if (typeof tool === 'string') {
            return this.toolRegistry.getTool(tool);
          }
          return tool;
        });
      }
    }

    const result = await workflow.execute(this.ekoConfig.callback);
    console.log(result);
    return result;
  }

  public async cancel(workflow: Workflow): Promise<void> {
    return await workflow.cancel();
  }


  public async modify(workflow: Workflow, prompt: string): Promise<Workflow> {
    const generator = this.workflowGeneratorMap.get(workflow) as WorkflowGenerator;
    workflow = await generator.modifyWorkflow(prompt, this.ekoConfig);
    this.workflowGeneratorMap.set(workflow, generator);
    return workflow;
  }

  private getTool(toolName: string) {
    let tool: Tool<any, any>;
    if (this.toolRegistry.hasTools([toolName])) {
      tool = this.toolRegistry.getTool(toolName);
    } else if (Eko.tools.has(toolName)) {
      tool = Eko.tools.get(toolName) as Tool<any, any>;
    } else {
      throw new Error(`Tool with name ${toolName} not found`);
    }
    return tool;
  }

  public async callTool(toolName: string, input: object, callback?: WorkflowCallback): Promise<any>;
  public async callTool(
    tool: Tool<any, any>,
    input: object,
    callback?: WorkflowCallback
  ): Promise<any>;

  public async callTool(
    tool: Tool<any, any> | string,
    input: object,
    callback?: WorkflowCallback
  ): Promise<any> {
    if (typeof tool === 'string') {
      tool = this.getTool(tool);
    }
    let context: ExecutionContext = {
      llmProvider: this.llmProvider,
      ekoConfig: this.ekoConfig,
      variables: new Map<string, unknown>(),
      tools: new Map<string, Tool<any, any>>(),
      callback,
    };
    let result = await tool.execute(context, input);
    if (tool.destroy) {
      tool.destroy(context);
    }
    return result;
  }

  public registerTool(tool: Tool<any, any>): void {
    this.toolRegistry.registerTool(tool);
  }

  public unregisterTool(toolName: string): void {
    this.toolRegistry.unregisterTool(toolName);
  }
}

export default Eko;
