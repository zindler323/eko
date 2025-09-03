import {AgentContext} from "../../core/context";
import * as memory from "../../memory";
import {run_build_dom_tree} from "./optimized_dom_tree";
import {AGENT_NAME, BaseBrowserAgent} from "./browser_base";
import {LanguageModelV1FunctionTool, LanguageModelV1ImagePart, LanguageModelV1Prompt,} from "@ai-sdk/provider";
import {IMcpClient, StreamCallback, Tool, ToolResult} from "../../types";
import {mergeTools, sleep, toImage} from "../../common/utils";
import {RetryLanguageModel} from "../../llm";
import {callAgentLLM} from "../llm";

export default abstract class BaseBrowserLabelsAgent extends BaseBrowserAgent {
  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    const openAIDescription = `You are a browser operation agent, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.
* For your first visit, please start by calling either the \`navigate_to\` or \`current_page\` tool. After each action you perform, I will provide you with updated information about the current state, including page screenshots and structured element data that has been specially processed for easier analysis.
* Screenshot description:
  - Screenshot are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshot help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshot, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshot.
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_page_content' instead.
  - If the webpage content hasn't loaded, please use the \`wait\` tool to allow time for the content to load.
* ELEMENT INTERACTION:
   - Only use indexes that exist in the provided element list
   - Each element has a unique index number (e.g., "[33]:<button>")
   - Elements marked with "[]:" are non-interactive (for context only)
   - Use the latest element index, do not rely on historical outdated element indexes
* ERROR HANDLING:
   - If no suitable elements exist, use other functions to complete the task
   - If stuck, try alternative approaches, don't refuse tasks
   - Handle popups/cookies by accepting or closing them
* BROWSER OPERATION:
   - Use scroll to find elements you are looking for, When extracting content, prioritize using extract_page_content, only scroll when you need to load more content
* During execution, please output user-friendly step information. Do not output HTML-related element and index information to users, as this would cause user confusion.
`;
    const claudeDescription = `You are a browser operation agent, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.
* For the first visit, please call the \`navigate_to\` or \`current_page\` tool first，if the target url is given in the plan, try to navigate to this target url first. After that, each of your actions will return a screenshot of the page and structured element information, both of which have been specially processed.
* Screenshot description:
  - Screenshot are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshot help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshot, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshot.
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_page_content' instead.
  - If the webpage content hasn't loaded, please use the \`wait\` tool to allow time for the content to load.
* ELEMENT INTERACTION:
   - Only use indexes that exist in the provided element list
   - Each element has a unique index number (e.g., "[33]:<button>")
   - Elements marked with "[]:" are non-interactive (for context only)
   - Use the latest element index, do not rely on historical outdated element indexes
* ERROR HANDLING:
   - If no suitable elements exist, use other functions to complete the task
   - If stuck, try alternative approaches, don't refuse tasks
   - Handle popups/cookies by accepting or closing them
* BROWSER OPERATION:
   - Use scroll to find elements you are looking for, When extracting content, prioritize using extract_page_content, only scroll when you need to load more content.
   - Use the select_option tool when you need to fill dropdown selections in forms.
   - Do not attempt to bypass login or language selection pop-ups to operate the page.
* TASK COMPLETION:
   - Use the finish action as the last action as soon as the ultimate task is complete
   - Dont use "finish" before you are done with everything the user asked you, except you reach the last step of max_steps.
   - If you reach your last step, use the finish action even if the task is not fully finished. Provide all the information you have gathered so far. If the ultimate task is completely finished set success to true. If not everything the user asked for is completed set success in finish to false!
   - Only call finish after the last step.
   - Don't hallucinate actions
   - Make sure you include everything you found out for the ultimate task in the finish text parameter. Do not just say you are finished, but include the requested information of the task.
# TOOL USE GUIDANCE:
    - Concise evaluation of previous actions' success or failure based on the screenshot should guide your next step toward achieving the goal, without referencing any element indexes.
    - If the element is not structured as an interactive element, try performing a visual click or input on the element. This action should only be done when the element is clearly visible in the screenshot, not just listed in the element index.
    - If you use a tool more than twice without achieving the desired result, explore another approach to solve the problem.
    
   The output language should follow the language corresponding to the user's task.;`
    const _tools_ = [] as Tool[];
    super({
      name: AGENT_NAME,
      description: claudeDescription,
      tools: _tools_,
      llms: llms,
      mcpClient: mcpClient,
      planDescription:
        "Browser operation agent, interact with the browser using the mouse and keyboard.",
    });
    let init_tools = this.buildInitTools();
    if (ext_tools && ext_tools.length > 0) {
      init_tools = mergeTools(init_tools, ext_tools);
    }
    init_tools.forEach((tool) => _tools_.push(tool));
  }

  protected async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<any> {
    await this.execute_script(agentContext, typing, [{ index, text, enter }]);
    if (enter) {
      await sleep(200);
    }
  }

  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<any> {
    await this.execute_script(agentContext, do_click, [
      { index, num_clicks, button },
    ]);
  }

  protected async scroll_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    await this.execute_script(
      agentContext,
      (index) => {
        return (window as any)
          .get_highlight_element(index)
          .scrollIntoView({ behavior: "smooth" });
      },
      [index]
    );
    await sleep(200);
  }

  protected async scroll_mouse_wheel(
    agentContext: AgentContext,
    amount: number,
    extract_page_content: boolean
  ): Promise<any> {
    await this.execute_script(agentContext, scroll_by, [{ amount }]);
    await sleep(200);
    if (!extract_page_content) {
      const tools = this.toolUseNames(
        agentContext.agentChain.agentRequest?.messages
      );
      let scroll_count = 0;
      for (let i = tools.length - 1; i >= Math.max(tools.length - 8, 0); i--) {
        if (tools[i] == "scroll_mouse_wheel") {
          scroll_count++;
        }
      }
      if (scroll_count >= 3) {
        extract_page_content = true;
      }
    }
    if (extract_page_content) {
      let page_result = await this.extract_page_content(agentContext);
      return {
        result:
          "The current page content has been extracted, latest page content:\n" +
          "title: " +
          page_result.title +
          "\n" +
          "page_url: " +
          page_result.page_url +
          "\n" +
          "page_content: " +
          page_result.page_content,
      };
    }
  }

  protected async scroll_element(
    agentContext: AgentContext,
    index: number,
    direction: 'up' | 'down' = 'down',
  ): Promise<any> {
    await this.execute_script(
      agentContext,
      (index, direction) => {
        const $el =  (window as any)
          .get_highlight_element(index);
        if (!$el) {
          console.warn('yc:: element not found');
          return;
        }

        console.log("yc $el", $el);
        let scrollable: HTMLElement | undefined;
        function searchScrollable(ele: HTMLElement) {
          if (scrollable) return;
          if (!ele.children || !ele.children.length) return;
          if (ele.clientHeight < ele.scrollHeight && ['auto', 'scroll'].includes(getComputedStyle(ele).overflowY)) scrollable = ele;
          for (let i = 0; i < ele.children.length; i++) {
            const c = ele.children[i];
            searchScrollable(c as HTMLElement);
          }
        }
        searchScrollable($el);

        if (!scrollable) {
          console.warn('yc:: scrollable not found');
          return;
        } else {
          console.log('yc:: scrollable', scrollable);
          const delta = scrollable.clientHeight;
          scrollable.scrollBy(0, direction === 'down' ? delta : -delta);
        }
      },
      [index, direction]
    );
    await sleep(200);
  }

  protected async hover_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    await this.execute_script(agentContext, hover_to, [{ index }]);
  }

  protected async get_select_options(
    agentContext: AgentContext,
    index: number
  ): Promise<any> {
    return await this.execute_script(agentContext, get_select_options, [
      { index },
    ]);
  }

  protected async select_option(
    agentContext: AgentContext,
    index: number,
    option: string
  ): Promise<any> {
    return await this.execute_script(agentContext, select_option, [
      { index, option },
    ]);
  }

  protected async screenshot_and_html(agentContext: AgentContext): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
    pseudoHtml: string;
  }> {
    try {
      let element_result = null;
      for (let i = 0; i < 5; i++) {
        await sleep(200);
        await this.execute_script(agentContext, run_build_dom_tree, []);
        await sleep(50);
        element_result = (await this.execute_script(
          agentContext,
          () => {
            return (window as any).get_clickable_elements(true);
          },
          []
        )) as any;
        if (element_result) {
          break;
        }
      }
      await sleep(100);
      let screenshot = await this.screenshot(agentContext);
      // agentContext.variables.set("selector_map", element_result.selector_map);
      let pseudoHtml = element_result?.element_str || '';
      return {
        imageBase64: screenshot.imageBase64,
        imageType: screenshot.imageType,
        pseudoHtml: pseudoHtml,
      };
    } catch (e) {
      throw new Error("Oops! Something went wrong, and the page crashed. Please reload.");
    } finally {
      try {
        await this.execute_script(
          agentContext,
          () => {
            return (window as any).remove_highlight();
          },
          []
        );
      } catch (e) {}
    }
  }

  protected get_element_script(index: number): string {
    return `window.get_highlight_element(${index});`;
  }

  private buildInitTools(): Tool[] {
    return [
      {
        name: "navigate_to",
        description: "Navigate to a specific url",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The url to navigate to",
            },
          },
          required: ["url"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.navigate_to(agentContext, args.url as string)
          );
        },
      },
      {
        name: "current_page",
        description: "Get the information of the current webpage (url, title)",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.get_current_page(agentContext)
          );
        },
      },
      {
        name: "go_back",
        description: "Navigate back in browser history",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() => this.go_back(agentContext));
        },
      },
      {
        name: "input_text",
        description: "Input text into an element",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to input text into",
            },
            text: {
              type: "string",
              description: "The text to input",
            },
            enter: {
              type: "boolean",
              description:
                "When text input is completed, press Enter (applicable to search boxes)",
              default: false,
            },
          },
          required: ["index", "text"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.input_text(
              agentContext,
              args.index as number,
              args.text as string,
              args.enter as boolean
            )
          );
        },
      },
      {
        name: "click_element",
        description: "Click on an element by index",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to click",
            },
            num_clicks: {
              type: "number",
              description: "number of times to click the element, default 1",
            },
            button: {
              type: "string",
              description: "Mouse button type, default left",
              enum: ["left", "right", "middle"],
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.click_element(
              agentContext,
              args.index as number,
              (args.num_clicks || 1) as number,
              (args.button || "left") as any
            )
          );
        },
      },
      /*
      {
        name: "scroll_to_element",
        description: "Scroll to the element",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to input text into",
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.scroll_to_element(agentContext, args.index as number)
          );
        },
      },
      */
      {
        name: "scroll_mouse_wheel",
        description:
          "Scroll the mouse wheel at current position, only scroll when you need to load more content",
        parameters: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: "Scroll amount (up / down)",
              minimum: 1,
              maximum: 10,
            },
            direction: {
              type: "string",
              enum: ["up", "down"],
            },
            extract_page_content: {
              type: "boolean",
              default: false,
              description:
                "After scrolling is completed, whether to extract the current latest page content",
            },
          },
          required: ["amount", "direction", "extract_page_content"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(async () => {
            let amount = args.amount as number;
            await this.scroll_mouse_wheel(
              agentContext,
              args.direction == "up" ? -amount : amount,
              args.extract_page_content == true
            );
          });
        },
      },
        {
        name: "scroll_element",
        description:
          "Scroll the mouse wheel at an specific element, e.g. <div>",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to scroll",
            },
            direction: {
              type: "string",
              enum: ["up", "down"],
            },
            extract_page_content: {
              type: "boolean",
              default: false,
              description:
                "After scrolling is completed, whether to extract the current latest page content",
            },
          },
          required: [ "direction", "extract_page_content", "index"],
        }, execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(async () => {
            await this.scroll_element(
              agentContext,
              args.index as number,
              args.direction as 'up' | 'down'
            );
          });
        }},
      {
        name: "hover_to_element",
        description: "Mouse hover over the element",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to input text into",
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.hover_to_element(agentContext, args.index as number)
          );
        },
      },
      {
        name: "extract_page_content",
        description:
          "Extract the text content and image links of the current webpage, please use this tool to obtain webpage data.",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.extract_page_content(agentContext)
          );
        },
      },
      {
        name: "get_select_options",
        description:
          "Get all options from a native dropdown element (<select>).",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to select",
            },
          },
          required: ["index"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.get_select_options(agentContext, args.index as number)
          );
        },
      },
      {
        name: "select_option",
        description:
          "Select the native dropdown option, Use this after get_select_options and when you need to select an option from a dropdown.",
        parameters: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "The index of the element to select",
            },
            option: {
              type: "string",
              description: "Text option",
            },
          },
          required: ["index", "option"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.select_option(
              agentContext,
              args.index as number,
              args.option as string
            )
          );
        },
      },
      {
        name: "get_all_tabs",
        description: "Get all tabs of the current browser",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.get_all_tabs(agentContext)
          );
        },
      },
      {
        name: "switch_tab",
        description: "Switch to the specified tab page",
        parameters: {
          type: "object",
          properties: {
            tabId: {
              type: "number",
              description: "Tab ID, obtained through get_all_tabs",
            },
          },
          required: ["tabId"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.switch_tab(agentContext, args.tabId as number)
          );
        },
      },
      {
        name: "wait",
        noPlan: true,
        description: "Wait for specified duration",
        parameters: {
          type: "object",
          properties: {
            duration: {
              type: "number",
              description: "Duration in millisecond",
              default: 500,
              minimum: 200,
              maximum: 10000,
            },
          },
          required: ["duration"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            sleep((args.duration || 200) as number)
          );
        },
      },
    ];
  }

  protected async double_screenshots(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    tools: Tool[]
  ): Promise<boolean> {
    return true;
  }

  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    tools: Tool[]
  ): Promise<void> {
    // const pseudoHtmlDescription =
    // "请你先评估从当前截图中看到的执行结果是否符合预期，用拟人化的语气将看到的结果分点简洁列出，例如当执行有效时使用“太好了! 我看到...”, 或者“完美！我观察到...”, 当执行有误不符合预期，或者没有变化时使用“看起来似乎不太对，我发现...”，注意在描述元素时务必要补充元素所在的位置区域信息描述。" +
    //   "再用一句话说明接下来要执行的一个操作是什么，例如“接下来我会执行...”。注意：" +
    //   "1. 一步一步思考，从多个角度思考当前的问题。生成操作时不要被plan中的信息限制，任何可以导向最终任务要求的都可以被考虑在内。" +
    //   "2. 如果页面元素信息中有操作相关的信息，但没有编号，同时截图中也没有这个元素信息，可能是不在可视网页范围内，需要滚动直到获取到想要的元素或到达页面边界为止。" +
    //   "3. 生成的执行操作需要参考上文的评估，确保区域和描述正确。" +
    //   "4. 优先处理弹窗、浮层。如果包含信息汇总在内的全部任务都已经完成，明确表达出任务已经完成的意思。" +
    //   "5. 操作只能为工具列表相关的操作，信息汇总等非工具相关的操作请在该环节之前输出。" +
    //   "6. 不允许一次输出多个操作，即使接下来有一系列操作，只允许输出第一个。\n" +
    //   "识别说明：请仔细分辨下拉框（有灰色下拉标志）和输入框，当涉及到“选择”操作时，必须通过点击下拉框/单选框后选择最符合的选项，禁止直接向下拉框中输入文本，禁止向截图中非输入框的元素输入文本。" +
    //   "这是最新的截图和页面元素信息.\n元素和对应的index:\n"
    const observePrompt = this.getObservePrompt()
    try {
      let lastTool = this.lastToolResult(messages);
  
      // 检测连续重复工具调用
      const repeatedToolDetection = this.detectRepeatedToolUse(agentContext, messages);
      if (repeatedToolDetection.isRepeated) {
        messages.push({
          role: "user",
          content: [{
            type: "text",
            text: `I notice you've been repeatedly using the ${repeatedToolDetection.toolName} tool with similar results. This might be due to browser popup blocking. Please take the following actions:
  
            Firstly, use the human_interact request_help tool (request_checkPopup) to remind the user to check browser popup settings:
               - Visit chrome://settings/content/popups in Chrome to enable popups
               - Or check for popup blocking icon in the address bar and click to allow
            
            Based on previous messages, if the user has already enabled popups but still experiencing issues:
               - Try alternative methods that don't require opening new windows
               - Look for options to open content in the same tab
               - Consider using different tools or approaches to accomplish the task goal
            
            Please avoid repeating the same operation and find alternative paths to achieve your objective.`,
          }],
        });
        return;
      }
  
      console.log("日只能用")
      if (
        lastTool &&
        lastTool.toolName !== "extract_page_content" &&
        lastTool.toolName !== "get_all_tabs" &&
        lastTool.toolName !== "variable_storage"
      ) {
        await sleep(700);
        let image_contents: LanguageModelV1ImagePart[] = [];
        if (await this.double_screenshots(agentContext, messages, tools)) {
          const imageResult = await this.screenshot(agentContext);
          const image = toImage(imageResult.imageBase64);
          image_contents.push({
            type: "image",
            image: image,
            mimeType: imageResult.imageType,
          });
        }
  
        let result = await this.screenshot_and_html(agentContext);
        let image = toImage(result.imageBase64);
        image_contents.push({
          type: "image",
          image: image,
          mimeType: result.imageType,
        });
  
        messages.push({
          role: "user",
          content: [
            ...image_contents,
            {
              type: "text",
              text: observePrompt + "```html\n" + result.pseudoHtml + "\n```",
            },
          ],
        });
      }
    } catch (e) {
      console.warn('Error in handleMessages: ', e);
    }
    await super.handleMessages(agentContext, messages, tools);
    this.handlePseudoHtmlText(messages, observePrompt);
  }

  protected getObservePrompt() {
    return "This is the environmental information after the operation, including the latest browser screenshot and page elements. Please note that the element indexes are obtained by capturing the DOM elements of the entire page, while the screenshot only displays the current window. You should consider both pieces of information when deciding the next step. Please perform the next operation based on the environmental information. Do not output the following elements and index information in your response.\n\nIndex and elements:\n";
  }

  protected async activeCompressContext(
    agentContext: AgentContext,
    rlm: RetryLanguageModel,
    messages: LanguageModelV1Prompt,
    tools: LanguageModelV1FunctionTool[]
  ): Promise<LanguageModelV1Prompt> {
    return await memory.activeCompressContext(agentContext, rlm, messages, tools)
  }

  /**
   * 收集压缩区间中的variable数据
   * 符合要求的数据为：
   * 1. role=assistant，content中有一项type=tool-call，这一项的toolName=variable_storage，这一项的args中operation=write_variable
   * 2. role=tool，content的toolName=variable_storage，args中的operation=read_variable
   */
  private collectVariableMessages(messages: LanguageModelV1Prompt): LanguageModelV1Prompt {
    const variableMessages: any[] = [];

    for (const message of messages) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        // 检查assistant消息中的tool-call
        for (const content of message.content) {
          if (content.type === 'tool-call' &&
              content.toolName === 'variable_storage' &&
              content.args &&
              typeof content.args === 'object' &&
              'operation' in content.args &&
              content.args.operation === 'write_variable') {
            variableMessages.push(message);
          }
        }
      } else if (message.role === 'tool' && Array.isArray(message.content)) {
        // 检查tool消息中的tool-result
        for (const content of message.content) {
          if (content.type === 'tool-result' &&
              content.toolName === 'variable_storage' &&
              content.result &&
              typeof content.result === 'object' &&
              'operation' in content.result &&
              content.result.operation === 'read_variable') {
            variableMessages.push(message);
          }
        }
      }
    }

    return variableMessages;
  }


  protected async variableAggregateContext(
    agentContext: AgentContext,
    rlm: RetryLanguageModel,
    messages: LanguageModelV1Prompt
  ): Promise<LanguageModelV1Prompt> {
    // 使用 collectVariableMessages 筛选出变量相关的消息
    const variableMessages = this.collectVariableMessages(messages);
    if (variableMessages.length === 0) {
      return [];
    }
    // 收集所有变量名和值
    const allVariables: { [key: string]: any } = {};

    for (const message of variableMessages) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        // 从 assistant 消息中提取变量名
        for (const content of message.content) {
          if (content.type === 'tool-call' &&
              content.toolName === 'variable_storage' &&
              content.args &&
              typeof content.args === 'object' &&
              'operation' in content.args &&
              content.args.operation === 'write_variable') {
            // 提取变量名
            if ('name' in content.args && 'value' in content.args) {
              const varName = content.args.name as string;
              const varValue = content.args.value;
              if (varValue !== undefined) {
                allVariables[varName] = varValue;
              }
            }
          }
        }
      } else if (message.role === 'tool' && Array.isArray(message.content)) {
        // 从 tool 消息中提取变量值
        for (const content of message.content) {
          if (content.type === 'tool-result' &&
              content.toolName === 'variable_storage' &&
              content.result) {
            // 如果 result 是对象，提取其中的变量
            if (typeof content.result === 'object' && content.result !== null) {
              Object.assign(allVariables, content.result);
            }
          }
        }
      }
    }

    if (Object.keys(allVariables).length === 0) {
      return [];
    }

    // 构建两条消息，确保toolCallId长度不超过30
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 5);
    const toolCallId = `toolu_${timestamp}${randomPart}`.substring(0, 30);
    const toolResultId = `toolu_${timestamp}${randomPart}`.substring(0, 30);

    const assistantMessage = {
      role: "assistant" as const,
      content: [
        {
          type: "tool-call" as const,
          toolCallId: toolCallId,
          toolName: "variable_storage",
          args: {
            name: Object.keys(allVariables),
            operation: "read_variable"
          }
        }
      ]
    };

    const toolMessage = {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: toolResultId,
          toolName: "variable_storage",
          result: allVariables,
          isError: false
        }
      ]
    };

    // 返回新的消息数组，不修改传入的 messages
    return [assistantMessage, toolMessage];
  }

  protected async summary(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt,
    callback?: StreamCallback
  ): Promise<string> {
    // 使用初始化时的llm创建RetryLanguageModel
    const rlm = new RetryLanguageModel(
      agentContext.context.config.llms,
      this.llms
    );

    // 构建总结消息
    const summaryMessages: LanguageModelV1Prompt = [
      {
        role: "system",
        content: `The above messages are a conversation between a user and an AI assistant.
The AI assistant helped the user with their task and arrived potentially at a "Final Answer" to accomplish their task.
You are a task summarizer. Please provide a comprehensive summary in the following format without Markdown:

🎯 Progress: [Detailed completion status for each step, e.g.: Step1 ✓ Step2 ✗ Step3 ✓]
📝 Summary: [Main results, concise description. Include specific outcomes, data collected, actions completed, and final answers achieved.]
⚠️ Notes: [Exceptions or issues, omit if none]

Important guidelines for the summary:
1. **Include Final Results**: If the task was completed successfully, describe the final outcome, data collected, or answer achieved
2. **Specific Details**: Mention specific numbers, dates, URLs, file names, or other concrete information that was obtained
3. **Actions Completed**: List the key actions that were performed (e.g., "Clicked submit button", "Downloaded report", "Found 5 matching results")
4. **Data Collected**: If any information was gathered, summarize what was collected and its significance
5. **Task Status**: Clearly indicate whether the task was completed, partially completed, or failed
6. **Key Achievements**: Highlight the most important accomplishments or discoveries

Language Requirement:
The output language should follow the language corresponding to the user's task.`
      },
      ...messages,
      {
        role: "user",
        content: [{ type: "text" as const, text: "Please keep the output concise but comprehensive, ensuring that all important final results and outcomes are captured." }]
      }
    ];

    // 直接调用callLLM，让上层处理流式输出
    const results = await callAgentLLM(
      agentContext,
      rlm,
      summaryMessages,
      [], // 不需要工具
      false, // noCompress
      undefined, // toolChoice
      0,
      callback
    );

    // 提取文本结果
    const textResult = results.find(result => result.type === "text");
    return textResult ? textResult.text : "";
  }

  private handlePseudoHtmlText(
    messages: LanguageModelV1Prompt,
    pseudoHtmlDescription: string
  ) {
    for (let i = 0; i < messages.length; i++) {
      let message = messages[i];
      if (message.role !== "user" || message.content.length <= 1) {
        continue;
      }
      let content = message.content;
      for (let j = 0; j < content.length; j++) {
        let _content = content[j];
        if (
          _content.type == "text" &&
          _content.text.startsWith(pseudoHtmlDescription)
        ) {
          if (i >= 2 && i < messages.length - 3) {
            _content.text = this.removePseudoHtmlAttr(_content.text, [
              "class",
              "src",
              "href",
            ]);
          }
        }
      }
      if (
        (content[0] as any).text == "[image]" &&
        (content[1] as any).text == "[image]"
      ) {
        content.splice(0, 1);
      }
    }
  }

  private removePseudoHtmlAttr(
    pseudoHtml: string,
    remove_attrs: string[]
  ): string {
    return pseudoHtml
      .split("\n")
      .map((line) => {
        if (!line.startsWith("[") || line.indexOf("]:<") == -1) {
          return line;
        }
        line = line.substring(line.indexOf("]:<") + 2);
        for (let i = 0; i < remove_attrs.length; i++) {
          let sIdx = line.indexOf(remove_attrs[i] + '="');
          if (sIdx == -1) {
            continue;
          }
          let eIdx = line.indexOf('"', sIdx + remove_attrs[i].length + 3);
          if (eIdx == -1) {
            continue;
          }
          line = line.substring(0, sIdx) + line.substring(eIdx + 1).trim();
        }
        return line.replace('" >', '">').replace(" >", ">");
      })
      .join("\n");
  }


  protected calculateNGramSimilarity(str1: string, str2: string, n: number = 3): number {
    // 如果字符串长度小于n，直接返回精确匹配结果
    console.log("gram", str1, str2)
    // 将字符串转为小写并去除多余空白
    const text1 = str1.toLowerCase().replace(/\s+/g, ' ').trim();
    const text2 = str2.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // 生成N-gram集合
    const getNGrams = (text: string, n: number): Set<string> => {
      const ngrams = new Set<string>();
      for (let i = 0; i <= text.length - n; i++) {
        ngrams.add(text.substring(i, i + n));
      }
      return ngrams;
    };
    
    const ngrams1 = getNGrams(text1, n);
    const ngrams2 = getNGrams(text2, n);
    
    // 计算交集大小
    let intersection = 0;
    for (const ngram of ngrams1) {
      if (ngrams2.has(ngram)) {
        intersection++;
      }
    }
    
    // 计算Jaccard相似度：交集大小 / 并集大小
    const union = ngrams1.size + ngrams2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  protected detectRepeatedToolUse(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt
  ): { isRepeated: boolean; toolName: string; reason?: string } {
    // 获取最近的工具调用历史
    const toolHistory = this.toolUseNames(messages);
  
    // 如果工具调用历史不足3个，则不进行检测
    if (toolHistory.length < 3) {
      return { isRepeated: false, toolName: '' };
    }
  
    // 检查最近3次工具调用是否相同
    const lastTool = toolHistory[toolHistory.length - 1];
    const secondLastTool = toolHistory[toolHistory.length - 2];
    const thirdLastTool = toolHistory[toolHistory.length - 3];
    console.log(lastTool, secondLastTool, thirdLastTool)
    if (
      lastTool.includes("click") &&
      secondLastTool.includes("click") &&
      thirdLastTool.includes("click")
    ) {
      console.log("检测到连续点击");
      
      // 构建消息序列，关联工具调用和观察结果
      interface MessageSequence {
        toolName: string;
        toolArgs: any;
        toolResult: any;
        observation: string;
      }
      
      const sequences: MessageSequence[] = [];
      
      // 记录所有assistant消息的观察文本，用于后续匹配
      const assistantObservations: Array<{index: number; text: string}> = [];
      
      // 记录所有工具调用和结果，用于后续匹配
      const toolCalls: Array<{
        index: number; 
        toolName: string; 
        toolCallId: string; 
        args: any;
      }> = [];
      
      const toolResults: Array<{
        index: number; 
        toolCallId: string; 
        result: any;
      }> = [];
      
      // 第一步：提取所有assistant观察、工具调用和工具结果
      console.log("开始提取消息组件...");
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        console.log(`处理消息 ${i}, 角色: ${message.role}`);
        
        // 提取assistant的观察文本
        if (message.role === 'assistant' && Array.isArray(message.content)) {
          let observationText = '';
          let hasToolCall = false;
          let toolName = '';
          let toolCallId = '';
          let args = null;
          
          for (const content of message.content) {
            if (content.type === 'text') {
              observationText = content.text || '';
            } else if (content.type === 'tool-call') {
              hasToolCall = true;
              toolName = content.toolName || '';
              toolCallId = content.toolCallId || '';
              args = content.args;
            }
          }
          
          // 记录观察文本
          if (observationText) {
            console.log(`找到assistant观察文本 [${i}]: ${observationText.substring(0, 50)}...`);
            assistantObservations.push({
              index: i,
              text: observationText
            });
          }
          
          // 记录工具调用
          if (hasToolCall) {
            console.log(`找到工具调用 [${i}]: ${toolName}, ID: ${toolCallId}`);
            toolCalls.push({
              index: i,
              toolName,
              toolCallId,
              args
            });
          }
        }
        
        // 提取工具结果
        if (message.role === 'tool' && Array.isArray(message.content)) {
          for (const content of message.content) {
            if (content.type === 'tool-result') {
              console.log(`找到工具结果 [${i}]: ${content.toolName}, ID: ${content.toolCallId}`);
              toolResults.push({
                index: i,
                toolCallId: content.toolCallId || '',
                result: content.result
              });
            }
          }
        }
      }
      
      // 第二步：构建完整序列
      console.log("开始构建序列...");
      console.log(`工具调用数: ${toolCalls.length}, 工具结果数: ${toolResults.length}, 观察文本数: ${assistantObservations.length}`);
      
      // 遍历每个工具调用
      for (let i = 0; i < toolCalls.length; i++) {
        const toolCall = toolCalls[i];
        
        // 查找对应的工具结果
        const toolResult = toolResults.find(result => result.toolCallId === toolCall.toolCallId);
        
        if (toolResult) {
          // 查找下一个assistant消息中的观察文本
          // 找到当前工具结果后面的第一个assistant观察
          const nextObservation = assistantObservations.find(obs => 
            obs.index > toolResult.index
          );
          
          if (nextObservation) {
            console.log(`构建完整序列: ${toolCall.toolName} -> 结果 -> 观察: ${nextObservation.text.substring(0, 30)}...`);
            
            sequences.push({
              toolName: toolCall.toolName,
              toolArgs: toolCall.args,
              toolResult: toolResult.result,
              observation: nextObservation.text
            });
          }
        }
      }
      
      console.log(`构建了 ${sequences.length} 个序列`);
      
      // 过滤出与目标工具相关的序列
      const targetSequences = sequences.filter(seq => 
        seq.toolName === lastTool || 
        seq.toolName === secondLastTool || 
        seq.toolName === thirdLastTool
      );
      
      console.log(`找到 ${targetSequences.length} 个目标工具相关序列`);
      
      // 如果找到了至少3个相关序列，计算观察文本的相似度
      if (targetSequences.length >= 3) {
        // 取最近的3个观察结果
        const recentObservations = targetSequences.slice(-3).map(seq => seq.observation);
        
        console.log("最近3个观察文本:");
        recentObservations.forEach((obs, idx) => {
          console.log(`[${idx}]: ${obs.substring(0, 50)}...`);
        });
        
        const ngram12 = this.calculateNGramSimilarity(recentObservations[0], recentObservations[1], 2);
        const ngram23 = this.calculateNGramSimilarity(recentObservations[1], recentObservations[2], 2);
        
        console.log("观察文本相似度 NGram:", ngram12, ngram23);

        const ngramThreshold = 0.5; // N-gram相似度阈值
        
        // 如果相似度超过阈值，则认为是重复调用
        if ((ngram23 > 0.6) || (ngram12 > 0.5 && ngram23 > 0.5)) {
          return { isRepeated: true, toolName: lastTool, reason: 'similar_observations' };
        }
      } else {
        console.log("目标序列数量不足3个，无法进行相似度分析");
      }
    }
    
    return { isRepeated: false, toolName: '' };
  }
}

function typing(params: {
  index: number;
  text: string;
  enter: boolean;
}): boolean {
  let { index, text, enter } = params;
  let element = (window as any).get_highlight_element(index);
  if (!element) {
    return false;
  }
  let input: any;
  if (element.tagName == "IFRAME") {
    let iframeDoc = element.contentDocument || element.contentWindow.document;
    input =
      iframeDoc.querySelector("textarea") ||
      iframeDoc.querySelector('*[contenteditable="true"]') ||
      iframeDoc.querySelector("input");
  } else if (
    element.tagName == "INPUT" ||
    element.tagName == "TEXTAREA" ||
    element.childElementCount == 0
  ) {
    input = element;
  } else {
    input = element.querySelector("input") || element.querySelector("textarea");
    if (!input) {
      input = element.querySelector('*[contenteditable="true"]') || element;
      if (input.tagName == "DIV") {
        input =
          input.querySelector("span") || input.querySelector("div") || input;
      }
    }
  }
  input.focus && input.focus();
  if (!text && enter) {
    ["keydown", "keypress", "keyup"].forEach((eventType) => {
      const event = new KeyboardEvent(eventType, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
    });
    return true;
  }
  if (input.value == undefined) {
    input.textContent = text;
  } else {
    input.value = text;
    if (input.__proto__) {
      let value_setter = Object.getOwnPropertyDescriptor(
        input.__proto__ as any,
        "value"
      )?.set;
      value_setter && value_setter.call(input, text);
    }
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (enter) {
    ["keydown", "keypress", "keyup"].forEach((eventType) => {
      const event = new KeyboardEvent(eventType, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
    });
  }
  return true;
}

function do_click(params: {
  index: number;
  button: "left" | "right" | "middle";
  num_clicks: number;
}): boolean {
  let { index, button, num_clicks } = params;
  console.log('click_el',index)
  let element = (window as any).get_highlight_element(index);
  console.log('click_el',element)
  function simulateMouseEvent(
    eventTypes: Array<string>,
    button: 0 | 1 | 2
  ): boolean {
    let element = (window as any).get_highlight_element(index);
    if (!element) {
      return false;
    }
    for (let n = 0; n < num_clicks; n++) {
      for (let i = 0; i < eventTypes.length; i++) {
        const event = new MouseEvent(eventTypes[i], {
          view: window,
          bubbles: true,
          cancelable: true,
          button, // 0 left; 1 middle; 2 right
        });
        element.dispatchEvent(event);
      }
    }
    return true;
  }
  if (button == "right") {
    return simulateMouseEvent(["mousedown", "mouseup", "contextmenu"], 2);
  } else if (button == "middle") {
    return simulateMouseEvent(["mousedown", "mouseup", "click"], 1);
  } else {
    return simulateMouseEvent(["mousedown", "mouseup", "click"], 0);
  }
}

function hover_to(params: { index: number }): boolean {
  let element = (window as any).get_highlight_element(params.index);
  if (!element) {
    return false;
  }
  const event = new MouseEvent("mouseenter", {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  element.dispatchEvent(event);
  return true;
}

function get_select_options(params: { index: number }) {
  let element = (window as any).get_highlight_element(params.index);
  if (!element || element.tagName.toUpperCase() !== "SELECT") {
    return "Error: Not a select element";
  }
  return {
    options: Array.from(element.options).map((opt: any) => ({
      index: opt.index,
      text: opt.text.trim(),
      value: opt.value,
    })),
    name: element.name,
  };
}

function select_option(params: { index: number; option: string }) {
  let element = (window as any).get_highlight_element(params.index);
  if (!element || element.tagName.toUpperCase() !== "SELECT") {
    return "Error: Not a select element";
  }
  let text = params.option.trim();
  let option = Array.from(element.options).find(
    (opt: any) => opt.text.trim() === text
  ) as any;
  if (!option) {
    option = Array.from(element.options).find(
      (opt: any) => opt.value.trim() === text
    ) as any;
  }
  if (!option) {
    return {
      success: false,
      error: "Select Option not found",
      availableOptions: Array.from(element.options).map((o: any) =>
        o.text.trim()
      ),
    };
  }
  element.value = option.value;
  element.dispatchEvent(new Event("change"));
  return {
    success: true,
    selectedValue: option.value,
    selectedText: option.text.trim(),
  };
}

function scroll_by(params: { amount: number }) {
  const amount = params.amount;
  const documentElement = document.documentElement || document.body;
  if (documentElement.scrollHeight > window.innerHeight * 1.2) {
    const y = Math.max(
      20,
      Math.min((window.innerHeight || documentElement.clientHeight) / 10, 200)
    );
    window.scrollBy(0, y * amount);
    return;
  }

 function findNodes(element = document, nodes: any = []): Element[] {
    for (const node of Array.from(element.querySelectorAll("*"))) {
      if (node.tagName === "IFRAME" && (node as any).contentDocument) {
        findNodes((node as any).contentDocument, nodes);
      } else if (node.shadowRoot) {
        findNodes(node.shadowRoot as any, nodes)
      } else {
        nodes.push(node);
      }
    }
    return nodes;
  }

  function findScrollableElements(): Element[] {
    const allElements = findNodes();
    let elements = allElements.filter((el) => {
      const style = window.getComputedStyle(el);
      const overflowY = style.getPropertyValue("overflow-y");
      return (
        (overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight
      );
    });
    if (elements.length == 0) {
      elements = allElements.filter((el) => {
        const style = window.getComputedStyle(el);
        const overflowY = style.getPropertyValue("overflow-y");
        return (
          overflowY === "auto" ||
          overflowY === "scroll" ||
          el.scrollHeight > el.clientHeight
        );
      });
    }
    return elements;
  }

  function getVisibleArea(element: Element) {
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || documentElement.clientHeight;
    const viewportWidth = window.innerWidth || documentElement.clientWidth;
    const visibleLeft = Math.max(0, Math.min(rect.left, viewportWidth));
    const visibleRight = Math.max(0, Math.min(rect.right, viewportWidth));
    const visibleTop = Math.max(0, Math.min(rect.top, viewportHeight));
    const visibleBottom = Math.max(0, Math.min(rect.bottom, viewportHeight));
    const visibleWidth = visibleRight - visibleLeft;
    const visibleHeight = visibleBottom - visibleTop;
    return visibleWidth * visibleHeight;
  }

  function getComputedZIndex(element: Element | null) {
    while (
      element &&
      element !== document.body &&
      element !== document.body.parentElement
    ) {
      const style = window.getComputedStyle(element);
      let zIndex = style.zIndex === "auto" ? 0 : parseInt(style.zIndex) || 0;
      if (zIndex > 0) {
        return zIndex;
      }
      element = element.parentElement;
    }
    return 0;
  }

  const scrollableElements = findScrollableElements();
  if (scrollableElements.length === 0) {
    const y = Math.max(
      20,
      Math.min((window.innerHeight || documentElement.clientHeight) / 10, 200)
    );
    window.scrollBy(0, y * amount);
    return false;
  }
  const sortedElements = scrollableElements.sort((a, b) => {
    let z = getComputedZIndex(b) - getComputedZIndex(a);
    if (z > 0) {
      return 1;
    } else if (z < 0) {
      return -1;
    }
    let v = getVisibleArea(b) - getVisibleArea(a);
    if (v > 0) {
      return 1;
    } else if (v < 0) {
      return -1;
    }
    return 0;
  });
  const largestElement = sortedElements[0];
  const viewportHeight = largestElement.clientHeight;
  const y = Math.max(20, Math.min(viewportHeight / 10, 200));
  largestElement.scrollBy(0, y * amount);
  const maxHeightElement = sortedElements.sort(
    (a, b) =>
      b.getBoundingClientRect().height - a.getBoundingClientRect().height
  )[0];
  if (maxHeightElement != largestElement) {
    const viewportHeight = maxHeightElement.clientHeight;
    const y = Math.max(20, Math.min(viewportHeight / 10, 200));
    maxHeightElement.scrollBy(0, y * amount);
  }
  return true;
}

export { BaseBrowserLabelsAgent };
