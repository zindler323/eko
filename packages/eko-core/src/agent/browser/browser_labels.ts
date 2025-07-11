import { AgentContext } from "../../core/context";
import * as memory from "../../memory";
import { run_build_dom_tree } from "./build_dom_tree";
import { BaseBrowserAgent, AGENT_NAME } from "./browser_base";
import {
  LanguageModelV1ImagePart,
  LanguageModelV1Prompt,
  LanguageModelV1FunctionTool,
  LanguageModelV1TextPart,
} from "@ai-sdk/provider";
import { Tool, ToolResult, IMcpClient, StreamCallback } from "../../types";
import { mergeTools, sleep, toImage } from "../../common/utils";
import {RetryLanguageModel} from "../../llm";
import { callLLM } from "../base";

export default abstract class BaseBrowserLabelsAgent extends BaseBrowserAgent {
  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    const openAIDescription = `You are a browser operation agent, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.
* For the first visit, please call the \`navigate_to\` or \`current_page\` tool first. After that, each of your actions will return a screenshot of the page and structured element information, both of which have been specially processed.
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
   - Use scroll to find elements you are looking for, When extracting content, prioritize using extract_page_content, only scroll when you need to load more content`;
    const claudeDescription = `You are a browser operation agent, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.
* For the first visit, please call the \`navigate_to\` or \`current_page\` tool first. After that, each of your actions will return a screenshot of the page and structured element information, both of which have been specially processed.
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
   - Use scroll to locate the elements you are looking for. When extracting content, prioritize using extract_page_content; scroll as needed to load more content.
   - Use the select_option tool when you need to fill dropdown selections in forms.
   - Do not attempt to bypass login or language selection pop-ups to operate the page.
* TASK COMPLETION:
   - Use the finish action as the last action as soon as the ultimate task is complete
   - Dont use "finish" before you are done with everything the user asked you, except you reach the last step of max_steps.
   - If you reach your last step, use the finish action even if the task is not fully finished. Provide all the information you have gathered so far. If the ultimate task is completely finished set success to true. If not everything the user asked for is completed set success in finish to false!
   - Only call finish after the last step.
   - Don't hallucinate actions
   - Make sure you include everything you found out for the ultimate task in the finish text parameter. Do not just say you are finished, but include the requested information of the task.
* TOOL USE GUIDANCE:
    - Evaluate concisely previous actions (success or fail, consistent with the task goal) based on the screenshot before proceeding to the next step. Format: 👍 Eval:
    - Think concisely about what you should do next to reach the goal. Format: 🎯 Next goal:
    - If the element is not structured as an interactive element, try performing a visual click or input on the element. This action should only be done when the element is clearly visible in the screenshot, not just listed in the element index.
    - Always use the mouse scroll wheel to locate the element when you have the element index but the element is not visible in the current window’s screenshot.
    - Don't keep using the same tool to do the same thing over and over if it's not working. Also, don't repeat the last tool unless something has changed.
    - If the plan says to use a specific tool, go with that one first. If it does not work, then try something else.
    - When dealing with filters, make sure to check if there are any elements on the page which can filter with. Try to use those first. Only look for other methods if there’s no filter or dropdown available.
    - When the action involves purchasing, payment, placing orders, or entering/collecting sensitive personal information (like phone numbers, addresses, passwords, etc.), always use the confirm tool and wait for the user to take action. The subsequent steps should depend on the user’s clicks.
    
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
  ): Promise<void> {
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
  ): Promise<void> {
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
      let page_content = await this.extract_page_content(agentContext);
      return (
        "The current page content has been extracted, latest page content:\n" +
        page_content
      );
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
          "Extract the text content of the current webpage, please use this tool to obtain webpage data.",
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
    const pseudoHtmlDescription = "The latest screenshot and element indexes are shown separately below. Please note that the element indexes are obtained by capturing the DOM elements of the entire page, while the screenshot only displays the current window. You should consider both pieces of information when deciding the next step.\n"
    let lastTool = this.lastToolResult(messages);
    if (
      lastTool &&
      lastTool.toolName !== "extract_page_content" &&
      lastTool.toolName !== "get_all_tabs" &&
      lastTool.toolName !== "variable_storage"
    ) {
      await sleep(700);
      let image_contents: LanguageModelV1ImagePart[] = [];
      if (await this.double_screenshots(agentContext, messages, tools)) {
        let imageResult = await this.screenshot(agentContext);
        let image = toImage(imageResult.imageBase64);
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
            text: pseudoHtmlDescription + result.pseudoHtml,
          },
        ],
      });
    }
    await super.handleMessages(agentContext, messages, tools);
    this.handlePseudoHtmlText(messages, pseudoHtmlDescription);
  }

  protected async activeCompressContext(
    agentContext: AgentContext,
    rlm: RetryLanguageModel,
    messages: LanguageModelV1Prompt,
    tools: LanguageModelV1FunctionTool[]
  ) {
    await memory.activeCompressContext(agentContext, rlm, messages, tools)
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
        content: "You are a task summarizer. Please provide a concise structured summary in the following format without Markdown:\n\n🎯 Task: [User's specific task requirements]\n📋 Plan: [Execution plan and steps]\n✅ Progress: [Detailed completion status for each step, e.g.: Step1 ✓ Step2 ✗ Step3 ✓]\n📝 Summary: [Main results, concise description]\n⚠️ Notes: [Exceptions or issues, omit if none]\n\nPlease keep output concise and detailed progress for each step.",
      },
      ...messages,
      {
        role: "user",
        content: [{ type: "text" as const, text: "Please provide a concise structured summary following the format above based on the conversation context." }]
      }
    ];

    // 直接调用callLLM，让上层处理流式输出
    const results = await callLLM(
      agentContext,
      rlm,
      summaryMessages,
      [], // 不需要工具
      false, // noCompress
      undefined, // toolChoice
      false, // retry
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
          line =
            line.substring(0, sIdx) +
            line.substring(eIdx + 1).trim();
        }
        return line.replace('" >', '">').replace(" >", ">");
      })
      .join("\n");
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
    return getVisibleArea(b) - getVisibleArea(a);
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
