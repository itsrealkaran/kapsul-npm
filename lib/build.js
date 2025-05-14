const fs = require('fs');
const path = require('path');
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
 * @returns {Promise<Object>} Build result with success flag and output
 */
async function executeBuild(options = {}) {
  const projectType = projectUtils.detectProjectType();
  const packageManager = packageManagerUtils.detectPackageManager();
  
  try {
    // Run pre-build commands if using custom config
    if (options.useCustomConfig || customBuild.hasCustomBuildConfig()) {
      await customBuild.runPreBuildCommands();
    }
    
    // Get the appropriate build command
    const buildCommand = detectBuildCommand();
    
    // Execute the build command
    const { execSync } = require('child_process');
    const output = execSync(buildCommand, { 
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    
    // Run post-build commands if using custom config
    if (options.useCustomConfig || customBuild.hasCustomBuildConfig()) {
      await customBuild.runPostBuildCommands();
    }
    
    // Check if build was successful
    const success = hasBuildCommand() && 
      (customBuild.hasCustomBuildConfig() ? 
        customBuild.validateCustomBuildConfig().success : 
        true);
    
    return {
      success,
      output,
      command: buildCommand
    };
  } catch (error) {
    return {
      success: false,
      output: error.message,
      command: detectBuildCommand(),
      error
    };
  }
}

module.exports = {
  detectBuildCommand,
  getBuildCommandForProject,
  getNextBuildCommand,
  getNodeBuildCommand,
  hasBuildCommand,
  suggestBuildCommand,
  executeBuild
}; 