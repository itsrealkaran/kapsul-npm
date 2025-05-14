# Kapsul

A CLI tool for building and deploying Next.js, Express, and Node.js projects.

## Installation

```bash
pnpm install -g kapsul
```

## Usage

### First-time Setup

```bash
npx kapsul login
```

### Deploy a Project

Simply run in your project directory:

```bash
npx kapsul
```

This will:
1. Build your project
2. Create a deployment package
3. Upload it to the deployment server

## Project Support

- Next.js projects
- Express applications
- Node.js applications

## Commands

- `npx kapsul` - Deploy the current project
- `npx kapsul login` - Login to Kapsul
- `npx kapsul --version` - Show version number

## Development

1. Clone the repository
2. Install dependencies:
```bash
pnpm install
```

3. Link the package locally:
```bash
pnpm link --global
```

## Testing

```bash
pnpm test
```


## License

MIT 