import { Log } from "@eko-ai/eko";

export async function getCdpWsEndpoint(port: number): Promise<string> {
  // Example => ws://localhost:9222/devtools/browser/{session-id}
  const response = await fetch(`http://localhost:${port}/json/version`);
  const browserInfo = await response.json();
  Log.info("browserInfo: ", browserInfo);
  return browserInfo.webSocketDebuggerUrl as string;
}