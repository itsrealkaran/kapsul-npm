const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const projectUtils = require('./project');
const packageManagerUtils = require('./packageManager');
const customBuild = require('./customBuild');

/**
 * Detect the appropriate build command for the current project
 * @returns {string} The build command
 */
function detectBuildCommand() {
  // First, check if there's a custom build configuration
  if (customBuild.hasCustomBuildConfig()) {
    const projectType = projectUtils.detectProjectType();
    const packageManager = packageManagerUtils.detectPackageManager();
    return customBuild.getCustomBuildCommand(projectType, packageManager);
  }
  
  // If no custom config, use the standard detection
  const packageManager = packageManagerUtils.detectPackageManager();
  const projectType = projectUtils.detectProjectType();
  
  // Generate the appropriate build command based on the project type
  return getBuildCommandForProject(projectType, packageManager);
}

/**
 * Get the build command for a specific project type using the specified package manager
 * @param {string} projectType - The type of project ('next', 'express', 'node', 'unknown')
 * @param {string} packageManager - The package manager to use
 * @returns {string} The build command
 */
function getBuildCommandForProject(projectType, packageManager) {
  // First, check if there's a custom build script in package.json
  if (packageManagerUtils.hasScript('build')) {
    return packageManagerUtils.getBuildCommand(packageManager);
  }
  
  // If no custom build script, use project-specific defaults
  switch (projectType) {
    case 'next':
      return getNextBuildCommand(packageManager);
    case 'express':
    case 'node':
      return getNodeBuildCommand(packageManager);
    default:
      // For unknown project types, use the generic build command
      return packageManagerUtils.getBuildCommand(packageManager);
  }
}

/**
 * Get the build command for a Next.js project
 * @param {string} packageManager - The package manager to use
 * @returns {string} The build command
 */
function getNextBuildCommand(packageManager) {
  // Check if next is installed locally or globally
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm next build';
    case 'yarn':
      return 'yarn next build';
    case 'bun':
      return 'bun next build';
    case 'npm':
    default:
      return 'npx next build';
  }
}

/**
 * Get the build command for a Node.js/Express project
 * @param {string} packageManager - The package manager to use
 * @returns {string} The build command
 */
function getNodeBuildCommand(packageManager) {
  // Check if TypeScript is being used
  if (projectUtils.isTypeScriptProject()) {
    // For TypeScript projects, use TSC to compile
    if (packageManagerUtils.hasScript('tsc')) {
      return packageManagerUtils.getRunCommand(packageManager, 'tsc');
    } else {
      // Try to use globally installed TypeScript
      switch (packageManager) {
        case 'pnpm':
          return 'pnpm tsc';
        case 'yarn':
          return 'yarn tsc';
        case 'bun':
          return 'bun tsc';
        case 'npm':
        default:
          return 'npx tsc';
      }
    }
  }
  
  // For JavaScript projects, check for common build scripts
  for (const script of ['build', 'compile', 'bundle']) {
    if (packageManagerUtils.hasScript(script)) {
      return packageManagerUtils.getRunCommand(packageManager, script);
    }
  }
  
  // If no build script is found, suggest creating one
  return packageManagerUtils.getBuildCommand(packageManager);
}

/**
 * Check if the project has a valid build command
 * @returns {boolean} True if a build command is available
 */
function hasBuildCommand() {
  // Check if the package.json has a build script
  if (packageManagerUtils.hasScript('build')) {
    return true;
  }
  
  // Check for project-specific build commands
  const projectType = projectUtils.detectProjectType();
  
  switch (projectType) {
    case 'next':
      return fs.existsSync('node_modules/.bin/next') || hasGlobalNext();
    case 'express':
    case 'node':
      if (projectUtils.isTypeScriptProject()) {
        return fs.existsSync('node_modules/.bin/tsc') || hasGlobalTypeScript();
      }
      return packageManagerUtils.hasScript('build') || 
             packageManagerUtils.hasScript('compile') || 
             packageManagerUtils.hasScript('bundle');
    default:
      return false;
  }
}

/**
 * Check if Next.js is globally installed
 * @returns {boolean} True if Next.js is available globally
 */
function hasGlobalNext() {
  try {
    require('child_process').execSync('next --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if TypeScript is globally installed
 * @returns {boolean} True if TypeScript is available globally
 */
function hasGlobalTypeScript() {
  try {
    require('child_process').execSync('tsc --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Suggests a build command if none exists
 * @returns {string} Suggested build command
 */
function suggestBuildCommand() {
  const projectType = projectUtils.detectProjectType();
  const packageManager = packageManagerUtils.detectPackageManager();
  const isTypeScript = projectUtils.isTypeScriptProject();
  
  switch (projectType) {
    case 'next':
      return getNextBuildCommand(packageManager);
    case 'express':
    case 'node':
      if (isTypeScript) {
        return `Add a build script to package.json:\n"build": "tsc"`;
      } else {
        return `Add a build script to package.json:\n"build": "echo 'No build step required for pure JavaScript'"`;
      }
    default:
      return `Add a build script to package.json:\n"build": "your build command here"`;
  }
}

/**
 * Execute the build process with optional custom configuration
 * @param {Object} options - Build options
 * @param {boolean} options.useCustomConfig - Whether to use custom build configuration
 * @param {Function} options.onProgress - Callback for build progress updates
 * @returns {Promise<Object>} Build result with success flag and output
 */
async function executeBuild(options = {}) {
  const projectType = projectUtils.detectProjectType();
  const packageManager = packageManagerUtils.detectPackageManager();
  let buildOutput = '';
  
  // Set up progress tracking
  const progressCallback = options.onProgress || function() {};
  
  try {
    // Run pre-build commands if using custom config
    if (options.useCustomConfig || customBuild.hasCustomBuildConfig()) {
      progressCallback({ step: 'pre-build', status: 'running' });
      await customBuild.runPreBuildCommands();
      progressCallback({ step: 'pre-build', status: 'complete' });
    }
    
    // Get the appropriate build command
    const buildCommand = detectBuildCommand();
    
    // Execute the build command
    progressCallback({ step: 'build', status: 'running', command: buildCommand });
    
    // Use spawn instead of exec to get real-time output
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      // Split the command into command and args
      const parts = buildCommand.split(' ');
      const command = parts[0];
      const args = parts.slice(1);
      
      const buildProcess = spawn(command, args, { 
        shell: true,
        stdio: 'pipe'
      });
      
      // Track build output
      buildProcess.stdout.on('data', (data) => {
        const output = data.toString();
        buildOutput += output;
        
        // Report progress
        progressCallback({ 
          step: 'build', 
          status: 'running', 
          output: output,
          command: buildCommand
        });
      });
      
      buildProcess.stderr.on('data', (data) => {
        const output = data.toString();
        buildOutput += output;
        
        // Report progress (errors)
        progressCallback({ 
          step: 'build', 
          status: 'error', 
          output: output,
          command: buildCommand
        });
      });
      
      buildProcess.on('close', async (code) => {
        // Run post-build commands if using custom config
        if (options.useCustomConfig || customBuild.hasCustomBuildConfig()) {
          progressCallback({ step: 'post-build', status: 'running' });
          await customBuild.runPostBuildCommands();
          progressCallback({ step: 'post-build', status: 'complete' });
        }
        
        // Check if build was successful
        const success = code === 0 && 
          (customBuild.hasCustomBuildConfig() ? 
            customBuild.validateCustomBuildConfig().success : 
            true);
        
        resolve({
          success,
          output: buildOutput,
          command: buildCommand,
          code
        });
      });
      
      buildProcess.on('error', (error) => {
        reject({
          success: false,
          output: error.message,
          command: buildCommand,
          error
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      output: error.message,
      command: detectBuildCommand(),
      error
    };
  }
}

/**
 * Validate the build output to ensure it was successful
 * @param {string} projectType - The project type
 * @param {string} buildOutput - The output from the build process
 * @returns {Object} Validation result with success flag and messages
 */
function validateBuildOutput(projectType, buildOutput) {
  // Common error patterns to check for in build output
  const errorPatterns = [
    /error/i,
    /failed/i,
    /exception/i,
    /cannot find module/i,
    /not found/i
  ];
  
  // Project-specific error patterns
  const projectErrorPatterns = {
    next: [
      /error building/i,
      /failed to compile/i
    ],
    express: [],
    node: []
  };
  
  // Check for errors in the build output
  const errors = [];
  
  // Check common errors
  errorPatterns.forEach(pattern => {
    if (pattern.test(buildOutput)) {
      const lines = buildOutput.split('\n');
      for (const line of lines) {
        if (pattern.test(line)) {
          errors.push(line.trim());
          break; // Just get the first occurrence
        }
      }
    }
  });
  
  // Check project-specific errors
  if (projectErrorPatterns[projectType]) {
    projectErrorPatterns[projectType].forEach(pattern => {
      if (pattern.test(buildOutput)) {
        const lines = buildOutput.split('\n');
        for (const line of lines) {
          if (pattern.test(line)) {
            errors.push(line.trim());
            break; // Just get the first occurrence
          }
        }
      }
    });
  }
  
  return {
    success: errors.length === 0,
    messages: errors
  };
}

module.exports = {
  detectBuildCommand,
  getBuildCommandForProject,
  getNextBuildCommand,
  getNodeBuildCommand,
  hasBuildCommand,
  suggestBuildCommand,
  executeBuild,
  validateBuildOutput
}; 