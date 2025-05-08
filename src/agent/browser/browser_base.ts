import { LanguageModelV1Prompt } from "@ai-sdk/provider";
import { Agent } from "../base";
import { sleep } from "../../common/utils";
import { AgentContext } from "../../core/context";
import { ToolExecuter, ToolResult, IMcpClient } from "../../types";

export default abstract class BaseBrowserAgent extends Agent {
  protected abstract screenshot(agentContext: AgentContext): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
  }>;

  protected abstract navigate_to(
    agentContext: AgentContext,
    url: string
  ): Promise<{
    url: string;
    title?: string;
  }>;

  protected async go_back(agentContext: AgentContext): Promise<void> {
    await this.execute_script(
      agentContext,
      () => {
        return (window as any).navigation.back();
      },
      []
    );
    await sleep(200);
  }

  protected async extract_content(agentContext: AgentContext): Promise<string> {
    let content = await this.execute_script(
      agentContext,
      () => {
        return (window as any).document.body.innerText
          .replaceAll(/\n+/g, "\n")
          .replaceAll(/ +/g, " ")
          .trim();
      },
      []
    );
    let pageInfo = await this.get_current_page(agentContext);
    return `title: ${pageInfo.title}\npage_url: ${pageInfo.url}\npage_content: \n${content}`;
  }

  protected async controlMcpTools(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    loopNum: number
  ): Promise<{ mcpTools: boolean; mcpParams?: Record<string, unknown> }> {
    let url = (await this.get_current_page(agentContext)).url;
    let lastUrl = agentContext.variables.get("lastUrl");
    agentContext.variables.set("lastUrl", url);
    return {
      mcpTools: loopNum == 0 || url != lastUrl,
      mcpParams: {
        environment: "browser",
        browser_url: url,
      },
    };
  }

  protected toolExecuter(mcpClient: IMcpClient, name: string): ToolExecuter {
    return {
      execute: async (args, agentContext): Promise<ToolResult> => {
        let result = await mcpClient.callTool({
          name: name,
          arguments: args,
          extInfo: {
            taskId: agentContext.context.taskId,
            nodeId: agentContext.agentChain.agent.id,
            environment: "browser",
            agent_name: agentContext.agent.Name,
            browser_url: agentContext.variables.get("lastUrl"),
          }
        });
        if (
          result.extInfo &&
          result.extInfo["javascript"] &&
          result.content[0].type == "text"
        ) {
          let script = result.content[0].text;
          let params = JSON.stringify(args);
          let runScript = `${script};execute(${params})`;
          let scriptResult = await this.execute_mcp_script(
            agentContext,
            runScript
          );
          let resultText;
          if (
            typeof scriptResult == "string" ||
            typeof scriptResult == "number"
          ) {
            resultText = scriptResult + "";
          } else {
            resultText = scriptResult
              ? JSON.stringify(scriptResult)
              : "Successful";
          }
          return {
            content: [
              {
                type: "text",
                text: resultText,
              },
            ],
          };
        }
        return result;
      },
    };
  }

  protected async get_current_page(agentContext: AgentContext): Promise<{
    url: string;
    title?: string;
    tabId?: string;
    windowId?: string;
  }> {
    return await this.execute_script(
      agentContext,
      () => {
        return {
          url: (window as any).location.href,
          title: (window as any).document.title,
        };
      },
      []
    );
  }

  protected abstract execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any>;

  protected async execute_mcp_script(
    agentContext: AgentContext,
    script: string
  ): Promise<string | number | Record<string, any> | undefined> {
    return;
  }
}
