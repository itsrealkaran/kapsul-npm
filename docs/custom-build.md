# Custom Build Configuration

Kapsul allows you to customize the build process for your projects using a `.kapsul.build.json` configuration file. This document explains how to set up and use custom build configurations.

## Getting Started

To initialize a custom build configuration, run:

```bash
kapsul build:init
```

This will create a `.kapsul.build.json` file in your project root with default settings based on your project type.

## Configuration Options

The `.kapsul.build.json` file supports the following options:

| Option | Type | Description |
|--------|------|-------------|
| `buildCommand` | String | The command to run for building your project |
| `outputDir` | String | The directory where build artifacts are generated |
| `environmentVars` | Array | Environment variables needed for the build |
| `successIndicators` | Array | Files that should exist after a successful build |
| `preBuildCommands` | Array | Commands to run before the main build command |
| `postBuildCommands` | Array | Commands to run after the main build command |
| `exclude` | Array | Glob patterns for files to exclude from deployment |
| `include` | Array | Glob patterns for files to explicitly include in deployment |
| `compressionFormat` | String | Compression format for deployment artifacts (zip, tar.gz, tar) |

## Example Configurations

### Next.js Project

```json
{
  "buildCommand": "next build",
  "outputDir": ".next",
  "environmentVars": ["NODE_ENV", "NEXT_PUBLIC_API_URL"],
  "successIndicators": [".next/build-manifest.json"],
  "preBuildCommands": ["npm run lint"],
  "postBuildCommands": ["npm run test"],
  "exclude": ["node_modules", ".git", "tests", "*.log"],
  "include": [],
  "compressionFormat": "zip"
}
```

### Express Project with TypeScript

```json
{
  "buildCommand": "tsc",
  "outputDir": "dist",
  "environmentVars": ["NODE_ENV", "PORT"],
  "successIndicators": ["dist/index.js", "dist/server.js"],
  "preBuildCommands": ["npm run clean"],
  "postBuildCommands": ["npm run copy-assets"],
  "exclude": ["node_modules", ".git", "src", "tests"],
  "include": ["public", "config"],
  "compressionFormat": "tar.gz"
}
```

## Building with Custom Configuration

Once you've set up your custom build configuration, you can build your project using:

```bash
kapsul build
```

Kapsul will automatically detect and use your custom configuration.

## Deployment with Custom Configuration

When deploying with `kapsul deploy`, your custom build configuration will be used for both building and determining which files to include in the deployment package.

## Advanced Usage

### Pre-build and Post-build Commands

You can specify commands to run before and after the main build process:

```json
{
  "preBuildCommands": [
    "npm run clean",
    "npm run generate-types"
  ],
  "postBuildCommands": [
    "npm run copy-assets",
    "npm run optimize-images"
  ]
}
```

### Custom Include/Exclude Patterns

Control exactly which files are included in your deployment:

```json
{
  "exclude": [
    "node_modules",
    ".git",
    "tests",
    "*.log",
    "src/**/*.spec.js"
  ],
  "include": [
    "dist",
    "public",
    "config/*.json"
  ]
}
```

### Compression Formats

Kapsul supports multiple compression formats for deployment:

- **zip**: Default for Next.js projects, good general-purpose compression
- **tar.gz**: Better compression ratio, default for Node.js and Express projects
- **tar**: Minimal compression, useful when you need to preserve file permissions

```json
{
  "compressionFormat": "tar.gz"
}
```

If not specified, Kapsul will automatically choose the optimal format based on your project type.

## Troubleshooting

If you encounter issues with your custom build configuration:

1. Validate that your build command works when run directly in the terminal
2. Check if all required environment variables are set
3. Verify that the output directory exists after building
4. Run `kapsul build` to see detailed error messages 