import { Agent } from "../agent";
import { sleep } from "../common/utils";
import Chain, { AgentChain } from "./chain";
import { EkoConfig, Workflow, WorkflowAgent } from "../types";

export default class Context {
  taskId: string;
  config: EkoConfig;
  chain: Chain;
  agents: Agent[];
  controller: AbortController;
  variables: Map<string, any>;
  workflow?: Workflow;
  paused: boolean = false;
  conversation: string[] = [];

  constructor(
    taskId: string,
    config: EkoConfig,
    agents: Agent[],
    chain: Chain
  ) {
    this.taskId = taskId;
    this.config = config;
    this.agents = agents;
    this.chain = chain;
    this.variables = new Map();
    this.controller = new AbortController();
  }

  async checkAborted() {
    // this.controller.signal.throwIfAborted();
    if (this.controller.signal.aborted) {
      const error = new Error("Operation was interrupted");
      error.name = "AbortError";
      throw error;
    }
    while (this.paused) {
      await sleep(500);
      if (this.controller.signal.aborted) {
        const error = new Error("Operation was interrupted");
        error.name = "AbortError";
        throw error;
      }
    }
  }

  currentAgent(): [Agent, WorkflowAgent, AgentContext] | null {
    const agentNode = this.chain.agents[this.chain.agents.length - 1];
    if (!agentNode) {
      return null;
    }
    const agent = this.agents.filter(
      (agent) => agent.Name == agentNode.agent.name
    )[0];
    if (!agent) {
      return null;
    }
    const agentContext = agent["agentContext"] as AgentContext;
    return [agent, agentNode.agent, agentContext];
  }
}

export class AgentContext {
  agent: Agent;
  context: Context;
  agentChain: AgentChain;
  variables: Map<string, any>;
  consecutiveErrorNum: number;

  constructor(context: Context, agent: Agent, agentChain: AgentChain) {
    this.context = context;
    this.agent = agent;
    this.agentChain = agentChain;
    this.variables = new Map();
    this.consecutiveErrorNum = 0;
  }
}
