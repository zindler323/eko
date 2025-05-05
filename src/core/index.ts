import {
  EkoConfig,
  EkoResult,
  HumanCallback,
  Workflow,
} from "../types/core.types";
import { Agent } from "../agent";
import { Planner } from "./plan";
import Chain, { AgentChain } from "./chain";
import Context, { AgentContext } from "./context";
import { mergeAgents, uuidv4 } from "../common/utils";

export class Eko {
  private config: EkoConfig;
  private taskMap: Map<string, Context>;

  constructor(config: EkoConfig) {
    this.config = config;
    this.taskMap = new Map();
  }

  public async generate(taskPrompt: string, taskId: string = uuidv4()): Promise<Workflow> {
    const agents = [...(this.config.agents || [])];
    let chain: Chain = new Chain(taskPrompt);
    let context = new Context(taskId, this.config, agents, chain);
    try {
      this.taskMap.set(taskId, context);
      if (this.config.a2aClient) {
        let a2aList = await this.config.a2aClient.listAgents(taskPrompt);
        context.agents = mergeAgents(context.agents, a2aList);
      }
      let planner = new Planner(context, taskId);
      context.workflow = await planner.plan(taskPrompt);
      return context.workflow;
    } catch (e) {
      this.deleteTask(taskId);
      throw e;
    }
  }

  public async modify(taskId: string, modifyTaskPrompt: string): Promise<Workflow> {
    let context = this.taskMap.get(taskId);
    if (!context) {
      return await this.generate(modifyTaskPrompt, taskId);
    }
    if (this.config.a2aClient) {
      let a2aList = await this.config.a2aClient.listAgents(modifyTaskPrompt);
      context.agents = mergeAgents(context.agents, a2aList);
    }
    let planner = new Planner(context, taskId);
    context.workflow = await planner.replan(modifyTaskPrompt);
    return context.workflow;
  }

  public async execute(taskId: string): Promise<EkoResult> {
    let context = this.getTask(taskId);
    if (!context) {
      throw new Error("The task does not exist");
    }
    try {
      return this.doRunWorkflow(context);
    } catch (e: any) {
      return {
        success: false,
        stopReason: e?.name == "AbortError" ? "abort" : "error",
        result: e,
      };
    } finally {
      this.deleteTask(taskId);
    }
  }

  public async run(taskPrompt: string, taskId: string = uuidv4()): Promise<EkoResult> {
    await this.generate(taskPrompt, taskId);
    return await this.execute(taskId);
  }

  private async doRunWorkflow(context: Context): Promise<EkoResult> {
    let agents = context.agents as Agent[];
    let workflow = context.workflow as Workflow;
    if (!workflow || workflow.agents.length == 0) {
      throw new Error("Workflow error");
    }
    let agentMap = agents.reduce((map, item) => {
      map[item.Name] = item;
      return map;
    }, {} as { [key: string]: Agent & { result?: any } });
    let lastResult;
    for (let i = 0; i < workflow.agents.length; i++) {
      context.checkAborted();
      let agentNode = workflow.agents[i];
      let agent = agentMap[agentNode.name];
      if (!agent) {
        throw new Error("Unknown Agent: " + agentNode.name);
      }
      let agentChain = new AgentChain(agentNode);
      context.chain.push(agentChain);
      agent.result = await agent.run(context, agentChain);
      lastResult = agent.result;
    }
    // TODO 超过2个Agent时需要引入任务调度Agent和结果输出。
    return {
      success: true,
      stopReason: "done",
      result: lastResult,
    };
  }

  public getTask(taskId: string): Context | undefined {
    return this.taskMap.get(taskId);
  }

  public deleteTask(taskId: string): boolean {
    return this.taskMap.delete(taskId);
  }

  public abortTask(taskId: string): boolean {
    let context = this.taskMap.get(taskId);
    if (context) {
      context.controller.abort();
      return true;
    } else {
      return false;
    }
  }

  public addAgent(agent: Agent): void {
    this.config.agents = this.config.agents || [];
    this.config.agents.push(agent);
  }
}

export class WebSimpleHumanCallback implements HumanCallback {
  async onInitWorkflow(
    taskId: string,
    workflow: Workflow,
    chain: Chain
  ): Promise<boolean> {
    return true;
  }
  async onHumanInput(
    agentContext: AgentContext,
    _prompt: string
  ): Promise<string> {
    if (typeof prompt == "function") {
      return prompt(_prompt) || "";
    }
    return "";
  }
  async onHumanConfirm(
    agentContext: AgentContext,
    prompt: string
  ): Promise<boolean> {
    if (typeof confirm == "function") {
      return confirm(prompt);
    }
    return true;
  }
}
