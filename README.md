# Kapsul

Kapsul is a powerful command-line tool for building and deploying Next.js, Express, and Node.js projects with minimal configuration.

## Features

- **Smart Project Detection**: Automatically identifies Next.js, Express, and Node.js projects
- **Intelligent Build System**: Uses the optimal build commands for your project type
- **Custom Build Configuration**: Fine-tune your build process with `.kapsul.build.json`
- **Advanced Compression**: Optimizes deployment packages with format selection
- **Seamless Deployment**: Simple one-command deploy process for your applications

## Installation

```bash
# Using npm
npm install -g kapsul

# Using pnpm
pnpm add -g kapsul

# Using yarn
yarn global add kapsul
```

## Usage

### Quick Start

Deploy your project with a single command:

```bash
kapsul
```

This will:
1. Detect your project type
2. Build your project with optimal settings
3. Create a deployment package
4. Upload and deploy your application

### Authentication

```bash
# Login to your Kapsul account
kapsul login

# Logout from your account
kapsul logout
```

### Build Commands

```bash
# Build your project
kapsul build

# Initialize a custom build configuration
kapsul build:init
```

### Configuration

```bash
# View current configuration
kapsul config

# Update configuration settings
kapsul config:set
```

## Custom Build Configuration

Kapsul supports custom build configuration through a `.kapsul.build.json` file.

```json
{
  "buildCommand": "next build",
  "outputDir": ".next",
  "environmentVars": ["NODE_ENV", "NEXT_PUBLIC_API_URL"],
  "preBuildCommands": ["npm run lint"],
  "postBuildCommands": ["npm run test"],
  "exclude": ["node_modules", ".git", "tests"],
  "include": ["public", ".next"],
  "compressionFormat": "zip"
}
```

See [custom build documentation](docs/custom-build.md) for more details.

## Supported Project Types

- **Next.js** - Automatic detection of Next.js projects
- **Express** - Support for Express.js applications
- **Node.js** - General Node.js application support
- **TypeScript** - Native support for TypeScript projects

## Requirements

- Node.js 14 or higher
- npm, yarn, pnpm, or bun package manager

## License

MIT 