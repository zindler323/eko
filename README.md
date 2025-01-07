# Eko

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://example.com/build-status) [![Version](https://img.shields.io/badge/version-1.0.5-yellow.svg)](https://eko.fellou.ai/docs/release/versions/)

**Eko** is a revolutionary framework designed to empower developers and users alike to program their browser and operating system using natural language. With seamless integration of browser APIs, OS-level capabilities, and cutting-edge AI tools like Claude 3.5, Eko redefines how we interact with technology, making it intuitive, powerful, and accessible.

## Key Features

- **Natural Language Programming**: Transform human instructions into e- **Natural Language Programming**: Convert natural language task descriptions into executable workflows, making agent development more intuitive
- **Two-Layer Execution Model**: Separate offline planning from online execution, making agent decisions more structured and explainable
- **Comprehensive Tooling**: Rich built-in tools for browser automation, computer control, file operations, and web interactions
- **Hybrid Drive System:** Combine LLM capabilities with developer control, enabling "human in the loop" and allowing interference at multiple levels of granularity
- **Event-Driven Automation:** Trigger workflows based on browser or system events
- **Environment Flexibility**: Work across different environments ( [Browser Extension](/docs/browseruse/browser-extension), [Web](/docs/browseruse/browser-web), [Node.js](/docs/computeruse/computer-node), [Next-Gen AI Browser Fellou](/docs/computeruse/computer-fellou) ) with consistent APIs

## Quickstart

```bash
npm install @eko-ai/eko
```

> The following code is for reference only. For detailed usage, please refer to the [Eko Quickstart guide](https://eko.fellou.ai/docs/getting-started/quickstart/).

```typescript
import { Eko } from '@eko-ai/eko';

const eko = new Eko({
  apiKey: 'your_anthropic_api_key',
});

// Example: Browser automation
const extWorkflow = await eko.generate("Search for 'Eko framework' on Google and save the first result");
await eko.execute(extWorkflow);

// Example: System operation
const sysWorkflow = await eko.generate("Create a new folder named 'reports' and move all PDF files there");
await eko.execute(sysWorkflow);

```

## Use Cases

- Browser automation and web scraping
- System file and process management
- Workflow automation
- Data processing and organization
- GUI automation
- Multi-step task orchestration

## Documentation

Visit our [documentation site](https://eko.fellou.ai/docs) for:

- Getting started guide
- API reference
- Usage examples
- Best practices
- Configuration options

## Development Environments

Eko can be used in multiple environments:

- Browser Extension
- Web Applications
- Node.js Applications
- [Fellou AI Browser](https://fellou.ai)

## Community and Support

- Report issues on [GitHub Issues](https://github.com/FellouAI/eko/issues)
- Contribute tools and improvements
- Share your use cases and feedback
- Join our community discussions

## Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for details on:

- Setting up the development environment
- Code style guidelines
- Submission process
- Tool development
- Use case optimization

## License

Eko is released under the MIT License. See the [LICENSE](LICENSE) file for details.
