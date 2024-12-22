import { EkoConfig, EkoInvokeParam, Tool, Workflow } from '../types';

/**
 * Eko core
 */
export default class Eko {
  constructor(config: EkoConfig) {
    // TODO ...
  }

  public async invoke(str: string, param?: EkoInvokeParam): Promise<Workflow> {
    throw Error('Not implemented');
  }

  public registerTool(tool: Tool<any, any>): void {
    throw Error('Not implemented');
  }

}