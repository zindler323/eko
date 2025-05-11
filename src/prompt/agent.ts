import { Agent } from "../agent";
import config from "../config";
import Context from "../core/context";
import { buildAgentRootXml } from "../common/xml";
import { WorkflowAgent } from "../types/core.types";
import { TOOL_NAME as foreach_task } from "../tools/foreach_task";
import { TOOL_NAME as watch_trigger } from "../tools/watch_trigger";
import { TOOL_NAME as human_interact } from "../tools/human_interact";
import { TOOL_NAME as variable_storage } from "../tools/variable_storage";
import { TOOL_NAME as task_node_status } from "../tools/task_node_status";
import { Tool } from "../types";

const AGENT_SYSTEM_TEMPLATE = `
You are {name}, an autonomous AI agent for {agent} agent.
UTC datetime: {datetime}

# Task Description
{description}
{prompt}

# User input task instructions
<root>
  <!-- Main task, completed through the collaboration of multiple Agents -->
  <mainTask>main task</mainTask>
  <!-- The tasks that the current agent needs to complete, the current agent only needs to complete the currentTask -->
  <currentTask>specific task</currentTask>
  <!-- Complete the corresponding step nodes of the task -->
  <nodes>
    <!-- node supports input/output variables to pass dependencies -->
    <node input="variable name" output="variable name" status="todo / done">task step node</node>{nodePrompt}
  </nodes>
</root>
`;

const HUMAN_PROMPT = `
* HUMAN INTERACT
During the task execution process, you can use the \`${human_interact}\` tool to interact with humans, please call it in the following situations:
- When performing dangerous operations such as deleting files, confirmation from humans is required
- When encountering obstacles while accessing websites, such as requiring user login, you need to request human assistance
- When requesting login, please only call the function when a login dialog box is clearly displayed.
- Try not to use the \`${human_interact}\` tool
`;

const VARIABLE_PROMPT = `
* VARIABLE STORAGE
If you need to read and write the input/output variables in the node, require the use of the \`${variable_storage}\` tool.
`;

const FOR_EACH_NODE = `
    <!-- duplicate task node, items support list and variable -->
    <forEach items="list or variable name">
      <node>forEach item step node</node>
    </forEach>
`;

const FOR_EACH_PROMPT = `
\`forEach\`: repetitive tasks, when executing to the forEach node, require the use of the \`${foreach_task}\` tool.
`;

const WATCH_NODE = `
    <!-- monitor task node, the loop attribute specifies whether to listen in a loop or listen once -->
    <watch event="dom or file" loop="true">
      <description>Monitor task description</description>
      <trigger>
        <node>Trigger step node</node>
        <node>...</node>
      </trigger>
    </watch>
`;

const WATCH_PROMPT = `
\`watch\`: monitor changes in webpage DOM or file content, when executing to the watch node, require the use of the \`${watch_trigger}\` tool.
`;

export function getAgentSystemPrompt(
  agent: Agent,
  agentNode: WorkflowAgent,
  context: Context,
  tools?: Tool[],
  extSysPrompt?: string
): string {
  let prompt = extSysPrompt || "";
  let nodePrompt = "";
  let agentNodeXml = agentNode.xml;
  let hasWatch = agentNodeXml.indexOf("</watch>") > -1;
  let hasForEach = agentNodeXml.indexOf("</forEach>") > -1;
  let hasHumanTool =
    (tools || agent.Tools).filter((tool) => tool.name == human_interact).length > 0;
  let hasVariable =
    agentNodeXml.indexOf("input=") > -1 ||
    agentNodeXml.indexOf("output=") > -1 ||
    (tools || agent.Tools).filter((tool) => tool.name == variable_storage).length > 0;
  if (hasHumanTool) {
    prompt += HUMAN_PROMPT;
  }
  if (hasVariable) {
    prompt += VARIABLE_PROMPT;
  }
  if (hasForEach) {
    prompt += FOR_EACH_PROMPT;
    nodePrompt += FOR_EACH_NODE;
  }
  if (hasWatch) {
    prompt += WATCH_PROMPT;
    nodePrompt += WATCH_NODE;
  }
  return AGENT_SYSTEM_TEMPLATE
    .replace("{name}", config.name)
    .replace("{agent}", agent.Name)
    .replace("{description}", agent.Description)
    .replace("{datetime}", new Date().toISOString())
    .replace("{prompt}", prompt)
    .replace("{nodePrompt}", nodePrompt)
    .trim();
}

export function getAgentUserPrompt(
  agent: Agent,
  agentNode: WorkflowAgent,
  context: Context,
  tools?: Tool[]
): string {
  let hasTaskNodeStatusTool =
    (tools || agent.Tools).filter((tool) => tool.name == task_node_status)
      .length > 0;
  return buildAgentRootXml(
    agentNode.xml,
    context.chain.taskPrompt,
    (nodeId, node) => {
      if (hasTaskNodeStatusTool) {
        node.setAttribute("status", "todo");
      }
    }
  );
}
