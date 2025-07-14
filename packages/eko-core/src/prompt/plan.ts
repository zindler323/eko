import config from "../config";
import Context from "../core/context";
import { AGENT_NAME as chat_agent_name } from "../agent/chat";

const PLAN_SYSTEM_TEMPLATE = `
You are {name}, an autonomous AI Agent Planner.
Current datetime: {datetime}

## Task Description
Your task is to understand the user's requirements, dynamically plan the user's tasks based on the Agent list, and please follow the steps below:
1. Understand the user's requirements.
2. Analyze the Agents that need to be used based on the user's requirements.
3. Generate the Agent calling plan based on the analysis results.
4. About agent name, please do not arbitrarily fabricate non-existent agent names.
5. You only need to provide the steps to complete the user's task, key steps only, no need to be too detailed.
6. Please strictly follow the output format and example output.
7. The output language should follow the language corresponding to the user's task.

## Agent list
{agents}

## Output Rules and Format
ChatAgent don't output the <thought></thought>
<root>
  <name>Task Name</name>
  <thought>Your thought process on user demand planning</thought>
  <!-- Multiple Agents work together to complete the task -->
  <agents>
    <!-- The required Agent, where the name can only be an available name in the Agent list -->
    <agent name="Agent name">
      <!-- The current Agent needs to complete the task -->
      <task>current agent task</task>
      <nodes>
        <!-- Nodes support input/output variables for parameter passing and dependency handling in multi-agent collaboration. -->
        <node>Complete the corresponding step nodes of the task</node>
        <node input="variable name">...</node>
        <node output="variable name">...</node>
        <!-- When including duplicate tasks, \`forEach\` can be used -->
        <forEach items="list or variable name">
          <node>forEach step node</node>
        </forEach>
        <!-- When you need to monitor changes in webpage DOM elements, you can use \`Watch\`, the loop attribute specifies whether to listen in a loop or listen once. -->
        <watch event="dom" loop="true">
          <description>Monitor task description</description>
          <trigger>
            <node>Trigger step node</node>
            <node>...</node>
          </trigger>
        </watch>
      </nodes>
    </agent>
  </agents>
</root>

{example_prompt}
`;

const PLAN_CHAT_EXAMPLE = `User: hello.
Output result:
<root>
  <name>Chat</name>
  <!-- <thought>Alright, the user wrote "hello". That's pretty straightforward. I need to respond in a friendly and welcoming manner.</thought> -->
  <agents>
    <!-- Chat agents can exist without the <task> and <nodes> nodes. -->
    <agent name="Chat"></agent>
  </agents>
</root>`;

const PLAN_EXAMPLE_LIST = [
  `User: Open Boss Zhipin, find 10 operation positions in Chengdu, and send a personal introduction to the recruiters based on the page information.
Output result:
<root>
  <name>Submit resume</name>
  <thought>OK, now the user requests me to create a workflow that involves opening the Boss Zhipin website, finding 10 operation positions in Chengdu, and sending personal resumes to the recruiters based on the job information.</thought>
  <agents>
    <agent name="Browser">
      <task>Open Boss Zhipin, find 10 operation positions in Chengdu, and send a personal introduction to the recruiters based on the page information.</task>
      <nodes>
        <node>Open Boss Zhipin, enter the job search page</node>
        <node>Set the regional filter to Chengdu and search for operational positions.</node>
        <node>Brows the job list and filter out 10 suitable operation positions.</node>
        <forEach items="list">
          <node>Analyze job requirements</node>
          <node>Send a self-introduction to the recruiter</node>
        </forEach>
      </nodes>
    </agent>
  </agents>
</root>`,
  `User: Every morning, help me collect the latest AI news, summarize it, and send it to the "AI Daily Morning Report" group chat on WeChat.
Output result:
<root>
  <name>AI Daily Morning Report</name>
  <thought>OK, the user needs to collect the latest AI news every morning, summarize it, and send it to a WeChat group named "AI Daily Morning Report" This requires automation, including the steps of data collection, processing, and distribution.</thought>
  <agents>
    <agent name="Timer">
      <task>Timing: every morning</task>
    </agent>
    <agent name="Browser">
      <task>Search for the latest updates on AI</task>
      <nodes>
        <node>Open Google</node>
        <node>Search for the latest updates on AI</node>
        <forEach items="list">
          <node>View Details</node>
        </forEach>
        <node output="summaryInfo">Summarize search information</node>
      </nodes>
    </agent>
    <agent name="Computer">
      <task>Send a message to the WeChat group chat "AI Daily Morning Report"</task>
      <nodes>
        <node>Open WeChat</node>
        <node>Search for the "AI Daily Morning Report" chat group</node>
        <node input="summaryInfo">Send summary message</node>
      </nodes>
    </agent>
  </agents>
</root>`,
  `User: Access the Google team's organization page on GitHub, extract all developer accounts from the team, and compile statistics on the countries and regions where these developers are located.
Output result:
<root>
  <name>Statistics of Google Team Developers' Geographic Distribution</name>
  <thought>Okay, I need to first visit GitHub, then find Google's organization page on GitHub, extract the team member list, and individually visit each developer's homepage to obtain location information for each developer. This requires using a browser to complete all operations.</thought>
  <agents>
    <agent name="Browser">
      <task>Visit Google GitHub Organization Page and Analyze Developer Geographic Distribution</task>
      <nodes>
        <node>Visit https://github.com/google</node>
        <node>Click "People" tab to view team members</node>
        <node>Scroll the page to load all developer information</node>
        <node output="developers">Extract all developer account information</node>
        <forEach items="developers">
          <node>Visit developer's homepage</node>
          <node>Extract developer's location information</node>
        </forEach>
        <node>Compile and analyze the geographic distribution data of all developers</node>
      </nodes>
    </agent>
  </agents>
</root>`,
  `User: Open Discord to monitor messages in Group A, and automatically reply when new messages are received.
Output result:
<root>
  <name>Automatic reply to Discord messages</name>
  <thought>OK, monitor the chat messages in Discord group A and automatically reply.</thought>
  <agents>
    <agent name="Browser">
      <task>Open Group A in Discord</task>
      <nodes>
        <node>Open Discord page</node>
        <node>Find and open Group A</node>
        <watch event="dom" loop="true">
          <description>Monitor new messages in group chat</description>
          <trigger>
            <node>Analyze message content</node>
            <node>Automatic reply to new messages</node>
          </trigger>
        </watch>
      </nodes>
    </agent>
  </agents>
</root>`,
];

const PLAN_USER_TEMPLATE = `
User Platform: {platform}
Task Description: {task_prompt}
`;

const PLAN_USER_TASK_WEBSITE_TEMPLATE = `
User Platform: {platform}
Task Website: {task_website}
Task Description: {task_prompt}
`;

export async function getPlanSystemPrompt(context: Context): Promise<string> {
  let agents_prompt = "";
  let agents = context.agents;
  for (let i = 0; i < agents.length; i++) {
    let agent = agents[i];
    let tools = await agent.loadTools(context);
    agents_prompt +=
      `<agent name="${agent.Name}">\n` +
      `Description: ${agent.PlanDescription || agent.Description}\n` +
      "Tools:\n" +
      tools
        .filter((tool) => !tool.noPlan)
        .map((tool) => `  - ${tool.name}: ${tool.planDescription || tool.description || ""}`)
        .join("\n") +
      "\n</agent>\n\n";
  }
  let example_prompt = "";
  let hasChatAgent =
    context.agents.filter((a) => a.Name == chat_agent_name).length > 0;
  const example_list = hasChatAgent
    ? [PLAN_CHAT_EXAMPLE, ...PLAN_EXAMPLE_LIST]
    : [...PLAN_EXAMPLE_LIST];
  for (let i = 0; i < example_list.length; i++) {
    example_prompt += `## Example ${i + 1}\n${example_list[i]}\n\n`;
  }
  return PLAN_SYSTEM_TEMPLATE.replace("{name}", config.name)
    .replace("{agents}", agents_prompt.trim())
    .replace("{datetime}", new Date().toLocaleString())
    .replace("{example_prompt}", example_prompt)
    .trim();
}

export function getPlanUserPrompt(
  task_prompt: string,
  task_website?: string,
  ext_prompt?: string,
): string {
  let prompt = "";
  if (task_website) {
    prompt = PLAN_USER_TASK_WEBSITE_TEMPLATE.replace("{task_prompt}", task_prompt)
      .replace("{platform}", config.platform)
      .replace("{task_website}", task_website);
  } else {
    prompt = PLAN_USER_TEMPLATE.replace("{task_prompt}", task_prompt)
      .replace("{platform}", config.platform);
  }
  prompt = prompt.trim();
  if (ext_prompt) {
    prompt += `\n${ext_prompt.trim()}`;
  }
  return prompt;
}
