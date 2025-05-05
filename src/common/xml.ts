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

export function parseWorkflow(
  taskId: string,
  xml: string,
  done: boolean
): Workflow | null {
  try {
    let sIdx = xml.indexOf("<root>");
    if (sIdx == -1) {
      return null;
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
      return null;
    }
    let agents: WorkflowAgent[] = [];
    const workflow: Workflow = {
      taskId: taskId,
      name: root.getElementsByTagName("name")[0]?.textContent || "",
      thought: root.getElementsByTagName("thought")[0]?.textContent || "",
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
      let nodes: WorkflowNode[] = [];
      let agent: WorkflowAgent = {
        name: name,
        id: taskId + "-" + (i < 10 ? "0" + i : i),
        task: agentNode.getElementsByTagName("task")[0]?.textContent || "",
        nodes: nodes,
        xml: agentNode.toString(),
      };
      let xmlNodes = agentNode.getElementsByTagName("nodes");
      if (xmlNodes.length > 0) {
        parseWorkflowNodes(nodes, xmlNodes[0].childNodes);
      }
      agents.push(agent);
    }
    return workflow;
  } catch (e) {
    if (done) {
      throw e;
    } else {
      return null;
    }
  }
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
  return `<root>${prefix}<mainTask>${mainTaskPrompt}</mainTask>${agentInnerHTML}</root>`;
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
    for (let i = 0; i < nodes.length; i++) {
      let node = nodes[i] as any;
      if (node.nodeType == 1 && node.getAttribute("id") == nodeId + "") {
        return node;
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
