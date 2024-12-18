import { EkoConfig, EkoInvokeParam, Tool, Workflow } from './types';

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
}
