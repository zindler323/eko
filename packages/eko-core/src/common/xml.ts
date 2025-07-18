import { fixXmlTag } from "./utils";
import { DOMParser, XMLSerializer } from "xmldom";
import {
  Workflow,
  WorkflowAgent,
  WorkflowForEachNode,
  WorkflowNode,
  WorkflowTextNode,
  WorkflowWatchNode,
} from "../types/core.types";
import { buildAgentTree } from "./tree";

export function parseWorkflow(
  taskId: string,
  xml: string,
  done: boolean,
  thinking?: string
): Workflow | null {
  let _workflow: Workflow | null = null;
  try {
    if (thinking) {
      _workflow = {
        taskId: taskId,
        name: "",
        thought: thinking,
        agents: [],
        xml: xml,
      };
    }
    let sIdx = xml.indexOf("<root>");
    if (sIdx == -1) {
      return _workflow;
    }
    xml = xml.substring(sIdx);
    let eIdx = xml.indexOf("</root>");
    if (eIdx > -1) {
      xml = xml.substring(0, eIdx + 7);
    }
    if (!done) {
      xml = fixXmlTag(xml);
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    let root = doc.documentElement;
    if (root.tagName !== "root") {
      return _workflow;
    }
    const agents: WorkflowAgent[] = [];
    const thought = root.getElementsByTagName("thought")[0]?.textContent || "";
    const workflow: Workflow = {
      taskId: taskId,
      name: root.getElementsByTagName("name")[0]?.textContent || "",
      thought: thinking ? thinking + "\n" + thought : thought,
      agents: agents,
      xml: xml,
    };
    let agentsNode = root.getElementsByTagName("agents");
    let agentsNodes =
      agentsNode.length > 0 ? agentsNode[0].getElementsByTagName("agent") : [];
    for (let i = 0; i < agentsNodes.length; i++) {
      let agentNode = agentsNodes[i];
      let name = agentNode.getAttribute("name");
      if (!name) {
        break;
      }
      let index = agentNode.getAttribute("id") || i;
      let dependsOn = agentNode.getAttribute("dependsOn") || "";
      let nodes: WorkflowNode[] = [];
      let agent: WorkflowAgent = {
        name: name,
        id: getAgentId(taskId, index),
        dependsOn: dependsOn.split(",").filter(idx => idx.trim() != "").map(idx => getAgentId(taskId, idx)),
        task: agentNode.getElementsByTagName("task")[0]?.textContent || "",
        nodes: nodes,
        status: "init",
        parallel: undefined,
        xml: agentNode.toString(),
      };
      let xmlNodes = agentNode.getElementsByTagName("nodes");
      if (xmlNodes.length > 0) {
        parseWorkflowNodes(nodes, xmlNodes[0].childNodes);
      }
      agents.push(agent);
    }
    if (done) {
      let agentTree = buildAgentTree(workflow.agents);
      while (true) {
        if (agentTree.type === "normal") {
          agentTree.agent.parallel = false;
        } else {
          const parallelAgents = agentTree.agents;
          for (let i = 0; i < parallelAgents.length; i++) {
            const agentNode = parallelAgents[i];
            agentNode.agent.parallel = true;
          }
        }
        if (!agentTree.nextAgent) {
          break;
        }
        agentTree = agentTree.nextAgent;
      }
    }
    return workflow;
  } catch (e) {
    if (done) {
      throw e;
    } else {
      return _workflow;
    }
  }
}

function getAgentId(taskId: string, index: number | string) {
  return taskId + "-" + (+index < 10 ? "0" + index : index);
}

function parseWorkflowNodes(
  nodes: WorkflowNode[],
  xmlNodes: NodeListOf<ChildNode> | HTMLCollectionOf<Element>
) {
  for (let i = 0; i < xmlNodes.length; i++) {
    if (xmlNodes[i].nodeType !== 1) {
      continue;
    }
    let xmlNode = xmlNodes[i] as Element;
    switch (xmlNode.tagName) {
      case "node": {
        let node: WorkflowTextNode = {
          type: "normal",
          text: xmlNode.textContent || "",
          input: xmlNode.getAttribute("input"),
          output: xmlNode.getAttribute("output"),
        };
        nodes.push(node);
        break;
      }
      case "forEach": {
        let _nodes: WorkflowNode[] = [];
        let node: WorkflowForEachNode = {
          type: "forEach",
          items: (xmlNode.getAttribute("items") || "list") as any,
          nodes: _nodes,
        };
        let _xmlNodes = xmlNode.getElementsByTagName("node");
        if (_xmlNodes.length > 0) {
          parseWorkflowNodes(_nodes, _xmlNodes);
        }
        nodes.push(node);
        break;
      }
      case "watch": {
        let _nodes: (WorkflowTextNode | WorkflowForEachNode)[] = [];
        let node: WorkflowWatchNode = {
          type: "watch",
          event: (xmlNode.getAttribute("event") || "") as any,
          loop: xmlNode.getAttribute("loop") == "true",
          description:
            xmlNode.getElementsByTagName("description")[0]?.textContent || "",
          triggerNodes: _nodes,
        };
        let triggerNode = xmlNode.getElementsByTagName("trigger");
        if (triggerNode.length > 0) {
          parseWorkflowNodes(_nodes, triggerNode[0].childNodes);
        }
        nodes.push(node);
        break;
      }
    }
  }
}

export function buildAgentRootXml(
  agentXml: string,
  mainTaskPrompt: string,
  nodeCallback: (nodeId: number, node: Element) => void
) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(agentXml, "text/xml");
  let agentNode = doc.getElementsByTagName("agent");
  let nodesNode = doc.getElementsByTagName("nodes");
  if (nodesNode.length > 0) {
    let nodes = nodesNode[0].childNodes;
    let nodeId = 0;
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i] as any;
      if (node.nodeType == 1) {
        node.setAttribute("id", nodeId + "");
        nodeCallback && nodeCallback(nodeId, node);
        nodeId++;
      }
    }
  }
  // <root><mainTask></mainTask><currentTask></currentTask><nodes><node id="0"></node></nodes></root>
  let agentInnerHTML = getInnerXML(agentNode[0]);
  let prefix = agentInnerHTML.substring(0, agentInnerHTML.indexOf("<task>"));
  agentInnerHTML = agentInnerHTML
    .replace("<task>", "<currentTask>")
    .replace("</task>", "</currentTask>");
  const xmlPrompt = `<root>${prefix}<mainTask>${mainTaskPrompt}</mainTask>${agentInnerHTML}</root>`;
  return xmlPrompt.replace(/      /g, "  ").replace("    </root>", "</root>");
}

export function extractAgentXmlNode(
  agentXml: string,
  nodeId: number
): Element | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(agentXml, "text/xml");
  let nodesNode = doc.getElementsByTagName("nodes");
  if (nodesNode.length > 0) {
    let nodes = nodesNode[0].childNodes;
    let _nodeId = 0;
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i] as any;
      if (node.nodeType == 1) {
        if (node.getAttribute("id") == null || node.getAttribute("id") == "") {
          node.setAttribute("id", _nodeId + "");
        }
        _nodeId++;
        if (node.getAttribute("id") == nodeId + "") {
          return node;
        }
      }
    }
  }
  return null;
}

export function getInnerXML(node: Element): string {
  let result = "";
  const serializer = new XMLSerializer();
  for (let i = 0; i < node.childNodes.length; i++) {
    result += serializer.serializeToString(node.childNodes[i]);
  }
  return result;
}

export function getOuterXML(node: Element): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(node);
}

export function buildSimpleAgentWorkflow({
  taskId,
  name,
  agentName,
  task,
  taskNodes,
}: {
  taskId: string;
  name: string;
  agentName: string;
  task: string;
  taskNodes?: string[];
}): Workflow {
  if (!taskNodes || taskNodes.length == 0) {
    taskNodes = [task];
  }
  const workflow: Workflow = {
    taskId: taskId,
    name: name,
    thought: "",
    agents: [
      {
        id: taskId + "-00",
        dependsOn: [],
        name: agentName,
        task: task,
        nodes: taskNodes.map((node) => {
          return {
            type: "normal",
            text: node,
          };
        }),
        status: "init",
        parallel: false,
        xml: "",
      },
    ],
    xml: "",
  };
  workflow.taskPrompt = task;
  resetWorkflowXml(workflow);
  return workflow;
}

export function resetWorkflowXml(workflow: Workflow) {
  const agents: string[] = [];
  for (let i = 0; i < workflow.agents.length; i++) {
    const agent = workflow.agents[i];
    const agentDependsAttr = ` id="${i}" dependsOn="${(agent.dependsOn || []).filter(s => parseInt(s.split("-")[s.split("-").length - 1])).join(",")}"`;
    const nodes = agent.nodes
      .map((node) => {
        if (node.type == "forEach") {
          const forEachNodes: string[] = [];
          for (let j = 0; j < node.nodes.length; j++) {
            const _node = node.nodes[j] as WorkflowTextNode;
            const input = _node.input ? ` input="${_node.input}"` : "";
            const output = _node.output ? ` output="${_node.output}"` : "";
            forEachNodes.push(
              `          <node${input}${output}>${_node.text}</node>`
            );
          }
          return `        <forEach items="${node.items || ""}">
${forEachNodes.join("\n")}
        </forEach>`;
        } else if (node.type == "watch") {
          const watchNodes: string[] = [];
          for (let j = 0; j < node.triggerNodes.length; j++) {
            const _node = node.triggerNodes[j] as WorkflowTextNode;
            const input = _node.input ? ` input="${_node.input}"` : "";
            const output = _node.output ? ` output="${_node.output}"` : "";
            watchNodes.push(
              `            <node${input}${output}>${_node.text}</node>`
            );
          }
          return `        <watch event="${node.event || "dom"}" loop="${
            node.loop ? "true" : "false"
          }">
          <description>${node.description}</description>
          <trigger>
${watchNodes.join("\n")}
          </trigger>
        </watch>`;
        } else {
          const input = node.input ? ` input="${node.input}"` : "";
          const output = node.output ? ` output="${node.output}"` : "";
          return `        <node${input}${output}>${node.text}</node>`;
        }
      })
      .join("\n");
    const agentXml = `    <agent name="${agent.name}"${agentDependsAttr}>
      <task>${agent.task}</task>
      <nodes>
${nodes}
      </nodes>
    </agent>`;
    agent.xml = agentXml;
    agents.push(agentXml);
  }
  const xml = `<root>
  <name>${workflow.name}</name>
  <thought>${workflow.thought}</thought>
  <agents>
${agents.join("\n")}
  </agents>
</root>`;
  workflow.xml = xml;
}
