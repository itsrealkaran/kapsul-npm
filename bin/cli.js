#!/usr/bin/env node

const { program } = require('commander');
const { 
  login, 
  logout, 
  deploy, 
  showConfig, 
  updateConfig,
  initCustomBuild,
  build
} = require('../lib/commands');
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

// Login command
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

// Logout command
program
  .command('logout')
  .description('Logout from Kapsul')
  .action(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error.message);
      process.exit(1);
    }
  });

// Config commands
program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    try {
      showConfig();
    } catch (error) {
      console.error('Error showing configuration:', error.message);
      process.exit(1);
    }
  });

program
  .command('config:set')
  .description('Update configuration settings')
  .action(async () => {
    try {
      await updateConfig();
    } catch (error) {
      console.error('Error updating configuration:', error.message);
      process.exit(1);
    }
  });

// Build commands
program
  .command('build')
  .description('Build your project')
  .action(async () => {
    try {
      await build();
    } catch (error) {
      console.error('Build failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('build:init')
  .description('Initialize a custom build configuration')
  .action(async () => {
    try {
      await initCustomBuild();
    } catch (error) {
      console.error('Custom build initialization failed:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv); 