import Log from "../common/log";
import Context from "./context";
import { RetryLanguageModel } from "../llm";
import { parseWorkflow } from "../common/xml";
import { Workflow } from "../types/core.types";
import { LLMRequest } from "../types/llm.types";
import { getPlanSystemPrompt, getPlanUserPrompt } from "../prompt/plan";
import {
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  LanguageModelV1TextPart,
} from "@ai-sdk/provider";

export class Planner {
  private taskId: string;
  private context: Context;

  constructor(context: Context, taskId?: string) {
    this.context = context;
    this.taskId = taskId || context.taskId;
  }

  async plan(
    taskPrompt: string | LanguageModelV1TextPart,
    saveHistory: boolean = true
  ): Promise<Workflow> {
    let taskPromptStr;
    let userPrompt: LanguageModelV1TextPart;
    if (typeof taskPrompt === "string") {
      taskPromptStr = taskPrompt;
      userPrompt = {
        type: "text",
        text: getPlanUserPrompt(
          taskPrompt,
          this.context.variables.get("task_website"),
          this.context.variables.get("plan_ext_prompt")
        ),
      };
    } else {
      userPrompt = taskPrompt;
      taskPromptStr = taskPrompt.text || "";
    }
    const messages: LanguageModelV1Prompt = [
      {
        role: "system",
        content:
          this.context.variables.get("plan_sys_prompt") ||
          (await getPlanSystemPrompt(this.context)),
      },
      {
        role: "user",
        content: [userPrompt],
      },
    ];
    return await this.doPlan(taskPromptStr, messages, saveHistory);
  }

  async replan(
    taskPrompt: string,
    saveHistory: boolean = true
  ): Promise<Workflow> {
    const chain = this.context.chain;
    if (chain.planRequest && chain.planResult) {
      const messages: LanguageModelV1Prompt = [
        ...chain.planRequest.messages,
        {
          role: "assistant",
          content: [{ type: "text", text: chain.planResult }],
        },
        {
          role: "user",
          content: [{ type: "text", text: taskPrompt }],
        },
      ];
      return await this.doPlan(taskPrompt, messages, saveHistory);
    } else {
      return this.plan(taskPrompt, saveHistory);
    }
  }

  private async doPlan(
    taskPrompt: string,
    messages: LanguageModelV1Prompt,
    saveHistory: boolean
  ): Promise<Workflow> {
    const config = this.context.config;
    const rlm = new RetryLanguageModel(config.llms, config.planLlms);
    const request: LLMRequest = {
      maxTokens: 4096,
      temperature: 0.7,
      messages: messages,
      abortSignal: this.context.controller.signal,
    };
    const result = await rlm.callStream(request);
    const reader = result.stream.getReader();
    let streamText = "";
    let thinkingText = "";
    try {
      while (true) {
        await this.context.checkAborted(true);
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        let chunk = value as LanguageModelV1StreamPart;
        if (chunk.type == "error") {
          Log.error("Plan, LLM Error: ", chunk);
          throw new Error("LLM Error: " + chunk.error);
        }
        if (chunk.type == "reasoning") {
          thinkingText += chunk.textDelta || "";
        }
        if (chunk.type == "text-delta") {
          streamText += chunk.textDelta || "";
        }
        if (config.callback) {
          let workflow = parseWorkflow(
            this.taskId,
            streamText,
            false,
            thinkingText
          );
          if (workflow) {
            await config.callback.onMessage({
              taskId: this.taskId,
              agentName: "Planer",
              type: "workflow",
              streamDone: false,
              workflow: workflow as Workflow,
            });
          }
        }
      }
    } finally {
      reader.releaseLock();
      if (Log.isEnableInfo()) {
        Log.info("Planner result: \n" + streamText);
      }
    }
    if (saveHistory) {
      const chain = this.context.chain;
      chain.planRequest = request;
      chain.planResult = streamText;
    }
    let workflow = parseWorkflow(
      this.taskId,
      streamText,
      true,
      thinkingText
    ) as Workflow;
    if (config.callback) {
      await config.callback.onMessage({
        taskId: this.taskId,
        agentName: "Planer",
        type: "workflow",
        streamDone: true,
        workflow: workflow,
      });
    }
    if (workflow.taskPrompt) {
      workflow.taskPrompt += "\n" + taskPrompt.trim();
    } else {
      workflow.taskPrompt = taskPrompt.trim();
    }
    return workflow;
  }
}
