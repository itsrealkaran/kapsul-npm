#!/usr/bin/env node

const { program } = require('commander');
const { login, deploy } = require('../lib/commands');
const pkg = require('../package.json');

program
  .version(pkg.version)
  .description('Kapsul - Build and deploy your Next.js, Express, and Node.js projects');

// Default command (just running 'kapsul')
program
  .action(async () => {
    try {
      await deploy();
    } catch (error) {
      console.error('Deployment failed:', error.message);
      process.exit(1);
    }
  });

// Additional commands
program
  .command('login')
  .description('Login to Kapsul')
  .action(async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv); 