import { Agent } from "./base";
import { mergeTools } from "../common/utils";
import { AgentContext } from "../core/context";
import { Tool, ToolResult, IMcpClient } from "../types";

export const AGENT_NAME = "File";

export default abstract class BaseFileAgent extends Agent {
  constructor(
    work_path?: string,
    llms?: string[],
    ext_tools?: Tool[],
    mcpClient?: IMcpClient
  ) {
    const _tools_ = [] as Tool[];
    const prompt = work_path
      ? `Your default working path is: ${work_path}`
      : "";
    super({
      name: AGENT_NAME,
      description: `You are a file agent, handling file-related tasks such as creating, finding, reading, modifying files, etc.${prompt}`,
      tools: _tools_,
      llms: llms,
      mcpClient: mcpClient,
      planDescription:
        "File operation agent, handling file-related tasks such as creating, finding, reading, modifying files, etc.",
    });
    let init_tools = this.buildInitTools();
    if (ext_tools && ext_tools.length > 0) {
      init_tools = mergeTools(init_tools, ext_tools);
    }
    init_tools.forEach((tool) => _tools_.push(tool));
  }

  protected abstract file_list(
    agentContext: AgentContext,
    path: string
  ): Promise<string[]>;

  protected abstract file_read(
    agentContext: AgentContext,
    path: string
  ): Promise<string>;

  protected abstract file_write(
    agentContext: AgentContext,
    path: string,
    content: string,
    append: boolean
  ): Promise<void>;

  protected abstract file_str_replace(
    agentContext: AgentContext,
    path: string,
    old_str: string,
    new_str: string
  ): Promise<void>;

  protected abstract file_find_by_name(
    agentContext: AgentContext,
    path: string,
    glob: string
  ): Promise<string[]>;

  private buildInitTools(): Tool[] {
    return [
      {
        name: "file_list",
        description: "Getting a list of files in a specified directory.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File directory path",
            },
          },
          required: ["path"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_list(agentContext, args.path as string)
          );
        },
      },
      {
        name: "file_read",
        description:
          "Read file content. Use to read files or check file content.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path",
            },
          },
          required: ["path"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_read(agentContext, args.path as string)
          );
        },
      },
      {
        name: "file_write",
        description:
          "Overwrite or append content to a file. Use for creating new files, appending content, or modifying existing files.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path",
            },
            content: {
              type: "string",
              description: "Text content",
            },
            append: {
              type: "boolean",
              description: "(Optional) Whether to use append mode",
              default: false,
            },
          },
          required: ["path", "content"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_write(
              agentContext,
              args.path as string,
              args.content as string,
              (args.append || false) as boolean
            )
          );
        },
      },
      {
        name: "file_str_replace",
        description:
          "Replace specified string in a file. Use for updating specific content in files.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path",
            },
            old_str: {
              type: "string",
              description: "Original string to be replaced",
            },
            new_str: {
              type: "string",
              description: "New string to replace with",
            },
          },
          required: ["path", "old_str", "new_str"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_str_replace(
              agentContext,
              args.path as string,
              args.old_str as string,
              args.new_str as string
            )
          );
        },
      },
      {
        name: "file_find_by_name",
        description:
          "Find files by name pattern in specified directory. Use for locating files with specific naming patterns.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute path of directory to search",
            },
            glob: {
              type: "string",
              description: "Filename pattern using glob syntax wildcards",
            },
          },
          required: ["path", "glob"],
        },
        execute: async (
          args: Record<string, unknown>,
          agentContext: AgentContext
        ): Promise<ToolResult> => {
          return await this.callInnerTool(() =>
            this.file_find_by_name(
              agentContext,
              args.path as string,
              args.glob as string
            )
          );
        },
      },
    ];
  }
}
