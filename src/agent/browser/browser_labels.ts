import { AGENT_NAME } from ".";
import BaseBrowserAgent from "./browser_base";
import { AgentContext } from "../../core/context";
import { Tool, ToolResult, IMcpClient } from "../../types";
import { run_build_dom_tree } from "./build_dom_tree";
import { LanguageModelV1Prompt } from "@ai-sdk/provider";
import { mergeTools, sleep, toImage } from "../../common/utils";

export default abstract class BaseBrowserLabelsAgent extends BaseBrowserAgent {
  constructor(llms?: string[], ext_tools?: Tool[], mcpClient?: IMcpClient) {
    const description = `You are a browser operation agent, use structured commands to interact with the browser.
* This is a browser GUI interface where you need to analyze webpages by taking screenshot and page element structures, and specify action sequences to complete designated tasks.
* For the first visit, please call the \`navigate_to\` or \`current_page\` tool first. After that, each of your actions will return a screenshot of the page and structured element information, both of which have been specially processed.
* Screenshot description:
  - Screenshot are used to understand page layouts, with labeled bounding boxes corresponding to element indexes. Each bounding box and its label share the same color, with labels typically positioned in the top-right corner of the box.
  - Screenshot help verify element positions and relationships. Labels may sometimes overlap, so extracted elements are used to verify the correct elements.
  - In addition to screenshot, simplified information about interactive elements is returned, with element indexes corresponding to those in the screenshot.
  - This tool can ONLY screenshot the VISIBLE content. If a complete content is required, use 'extract_content' instead.
  - If the webpage content hasn't loaded, please use the \`wait\` tool to allow time for the content to load.
* ELEMENT INTERACTION:
   - Only use indexes that exist in the provided element list
   - Each element has a unique index number (e.g., "[33]:<button>")
   - Elements marked with "[]:" are non-interactive (for context only)
* ERROR HANDLING:
   - If no suitable elements exist, use other functions to complete the task
   - If stuck, try alternative approaches, don't refuse tasks
   - Handle popups/cookies by accepting or closing them
   - Use scroll to find elements you are looking for
   - When extracting content, prioritize using extract_content, only scroll when you need to load more content`;
    const _tools_ = [] as Tool[];
    super({
      name: AGENT_NAME,
      description: description,
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
    amount: number
  ): Promise<void> {
    await this.execute_script(
      agentContext,
      (amount) => {
        let viewportHeight =
          window.innerHeight ||
          document.documentElement.clientHeight ||
          document.body.clientHeight;
        let y = Math.max(20, Math.min(viewportHeight / 10, 200));
        window.scrollBy(0, y * amount);
      },
      [amount]
    );
    await sleep(200);
  }

  protected async hover_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    await this.execute_script(agentContext, hover_to, [{ index }]);
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
      await sleep(50);
      let screenshot = await this.screenshot(agentContext);
      let pseudoHtml = element_result.element_str;
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
        description: "Get the information of the current webpage",
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
              description: "press the Enter key",
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
      {
        name: "scroll_mouse_wheel",
        description: "Scroll the mouse wheel at current position",
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
          },
          required: ["amount", "direction"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(async () => {
            let amount = args.amount as number;
            await this.scroll_mouse_wheel(
              agentContext,
              args.direction == "up" ? -amount : amount
            );
          });
        },
      },
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
        name: "extract_content",
        description: "Extract the text content of the current webpage, obtain webpage data through this tool.",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.extract_content(agentContext)
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
              maximum: 2000,
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

  protected async handleMessages(
    agentContext: AgentContext,
    messages: LanguageModelV1Prompt
  ): Promise<void> {
    let lastTool = this.lastToolResult(messages);
    if (
      lastTool &&
      lastTool.toolName !== "extract_content" &&
      lastTool.toolName !== "get_all_tabs" &&
      lastTool.toolName !== "variable_storage"
    ) {
      await sleep(300);
      let result = await this.screenshot_and_html(agentContext);
      let image = toImage(result.imageBase64);
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            image: image,
            mimeType: result.imageType,
          },
          {
            type: "text",
            text:
              "This is the latest screenshot and page element information.\nindex and element:\n" +
              result.pseudoHtml,
          },
        ],
      });
    }
    super.handleMessages(agentContext, messages);
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
