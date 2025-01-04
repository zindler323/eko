# Eko

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://example.com/build-status) [![Version](https://img.shields.io/badge/version-0.1.0-yellow.svg)](https://example.com/version)

**Eko** is a revolutionary framework designed to empower developers and users alike to program their browser and operating system using natural language. With seamless integration of browser APIs, OS-level capabilities, and cutting-edge AI tools like Claude 3.5, Eko redefines how we interact with technology, making it intuitive, powerful, and accessible.

## Key Features

- **Natural Language Programming**: Transform human instructions into executable actions using advanced AI models
- **Cross-Platform Operation**: Run in browser extensions, web applications, or Node.js environments
- **Powerful Tooling**: Built-in tools for browser automation, OS operations, and system control
- **Flexible Integration**: Seamless integration with Claude 3.5 and other LLM models
- **Developer-Friendly**: Comprehensive TypeScript support and extensive documentation

## Quick Start

```bash
npm install @eko-ai/eko
```

```typescript
import { Eko } from '@eko-ai/eko';

const eko = new Eko({
  apiKey: 'your_anthropic_api_key',
});

// Example: Browser automation
await eko.run("Search for 'Eko framework' on Google and save the first result");

// Example: System operation
await eko.run("Create a new folder named 'reports' and move all PDF files there");
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
