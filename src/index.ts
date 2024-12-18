import { WebSearch } from './extension/tools/web_search';
import { EkoConfig, EkoInvokeParam, Tool, Workflow, ExecutionContext } from './types';

/**
 * Eko core
 */
export class Eko {
  constructor(config: EkoConfig) {
    // TODO ...
  }

  public async invoke(str: string, param?: EkoInvokeParam): Promise<Workflow> {
    throw Error('Not implemented');
  }

  public registerTool(tool: Tool): void {
    throw Error('Not implemented');
  }

  public async pub(event: string): Promise<any> {
    throw Error('Not implemented');
  }

  public async testWebSearch(query: string, maxResults: number = 5): Promise<any> {
    let webSearch = new WebSearch();
    let context = {
      variables: {},
      tools: {},
    } as ExecutionContext;
    return await webSearch.execute(context, { query, maxResults });
  }
}
