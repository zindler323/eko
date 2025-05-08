import { AgentContext, BaseBrowserLabelsAgent } from "@eko-ai/eko";
import {
  chromium,
  Browser,
  Page,
  ElementHandle,
  BrowserContext,
} from "playwright";

export default class BrowserAgent extends BaseBrowserLabelsAgent {

  private browser: Browser | null = null;
  private browser_context: BrowserContext | null = null;
  private current_page: Page | null = null;

  protected async screenshot(
    agentContext: AgentContext
  ): Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png" }> {
    let page = await this.currentPage();
    let screenshotBuffer = await page.screenshot({
      fullPage: false,
      type: "jpeg",
      quality: 60,
    });
    let base64 = screenshotBuffer.toString("base64");
    return {
      imageType: "image/jpeg",
      imageBase64: base64,
    };
  }

  protected async navigate_to(
    agentContext: AgentContext,
    url: string
  ): Promise<{
    url: string;
    title?: string;
  }> {
    let page = await this.open_url(agentContext, url);
    return {
      url: page.url(),
      title: await page.title(),
    };
  }

  protected async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean
  ): Promise<void> {
    try {
      let elementHandle = await this.get_element(index, true);
      await elementHandle.fill("");
      await elementHandle.fill(text);
      if (enter) {
        await elementHandle.press("Enter");
        await this.sleep(200);
      }
    } catch (e) {
      await super.input_text(agentContext, index, text, enter);
    }
  }

  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number,
    button: "left" | "right" | "middle"
  ): Promise<void> {
    try {
      let elementHandle = await this.get_element(index, true);
      await elementHandle.click({
        button,
        clickCount: num_clicks,
        force: true,
      });
    } catch (e) {
      await super.click_element(agentContext, index, num_clicks, button);
    }
  }

  protected async hover_to_element(
    agentContext: AgentContext,
    index: number
  ): Promise<void> {
    try {
      let elementHandle = await this.get_element(index, true);
      elementHandle.hover({ force: true });
    } catch (e) {
      await super.hover_to_element(agentContext, index);
    }
  }

  protected async execute_script(
    agentContext: AgentContext,
    func: (...args: any[]) => void,
    args: any[]
  ): Promise<any> {
    let page = await this.currentPage();
    return await page.evaluate(func, args);
  }

  private async open_url(
    agentContext: AgentContext,
    url: string
  ): Promise<Page> {
    if (!this.browser) {
      this.current_page = null;
      this.browser_context = null;
      this.browser = await chromium.launch({
        headless: false,
        args: ["--no-sandbox"],
      });
    }
    if (!this.browser_context) {
      this.current_page = null;
      this.browser_context = await this.browser.newContext();
    }
    const page: Page = await this.browser_context.newPage();
    // await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setViewportSize({ width: 1536, height: 864 });
    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 15000,
      });
      await page.waitForLoadState("load", { timeout: 10000 });
    } catch (e) {
      if ((e + "").indexOf("Timeout") == -1) {
        throw e;
      }
    }
    this.current_page = page;
    return page;
  }

  private async currentPage(): Promise<Page> {
    if (this.current_page == null) {
      throw new Error("There is no page, please call navigate_to first");
    }
    let page = this.current_page as Page;
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
    } catch (e) {}
    return page;
  }

  private async get_element(
    index: number,
    findInput?: boolean
  ): Promise<ElementHandle> {
    let page = await this.currentPage();
    return await page.evaluateHandle(
      (params: any) => {
        let element = (window as any).get_highlight_element(params.index);
        if (element && params.findInput) {
          if (
            element.tagName != "INPUT" &&
            element.tagName != "TEXTAREA" &&
            element.childElementCount != 0
          ) {
            element =
              element.querySelector("input") ||
              element.querySelector("textarea") ||
              element;
          }
        }
        return element;
      },
      { index, findInput }
    );
  }

  private sleep(time: number): Promise<void> {
    return new Promise((resolve) => setTimeout(() => resolve(), time));
  }
}
