import { Eko, LLMs } from "@eko-ai/eko";
import { BrowserAgent } from "@eko-ai/eko-web";

export async function auto_test_case() {
  // Initialize LLM provider
  const llms: LLMs = {
    default: {
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      apiKey: "xxx", // TODO Your claude apiKey
      config: {
        baseURL: "https://api.anthropic.com/v1",
      },
    },
  };

  // Initialize eko
  let agents = [new BrowserAgent()];
  let eko = new Eko({ llms, agents });

  // Run: Generate workflow from natural language description
  const result = await eko.run(`
    Current login page automation test:
    1. Correct account and password are: admin / 666666 
    2. Please randomly combine usernames and passwords for testing to verify if login validation works properly, such as: username cannot be empty, password cannot be empty, incorrect username, incorrect password
    3. Finally, try to login with the correct account and password to verify if login is successful
    4. Generate test report and export
  `);

  if (result.success) {
    alert("Execution successful:\n" + result.result);
  } else {
    alert("Execution failed:\n" + result.result);
  }

}