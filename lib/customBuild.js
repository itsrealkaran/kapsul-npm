const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const buildMapping = require('./buildMapping');
const buildUtils = require('./build');
const projectUtils = require('./project');

/**
 * Path to the custom build configuration file
 */
const CUSTOM_BUILD_CONFIG_FILE = '.kapsul.build.json';

/**
 * Default custom build configuration template
 */
const DEFAULT_CUSTOM_CONFIG = {
  buildCommand: "",
  outputDir: "",
  environmentVars: [],
  successIndicators: [],
  preBuildCommands: [],
  postBuildCommands: [],
  exclude: ["node_modules", ".git"],
  include: [],
  compressionFormat: "" // Will be determined automatically if empty
};

/**
 * Check if a custom build configuration exists
 * @returns {boolean} True if a custom build config exists
 */
function hasCustomBuildConfig() {
  return fs.existsSync(CUSTOM_BUILD_CONFIG_FILE);
}

/**
 * Load the custom build configuration
 * @returns {Object|null} The custom build config or null if not found
 */
function loadCustomBuildConfig() {
  try {
    if (hasCustomBuildConfig()) {
      const config = JSON.parse(fs.readFileSync(CUSTOM_BUILD_CONFIG_FILE, 'utf8'));
      return config;
    }
    return null;
  } catch (error) {
    console.error(chalk.red(`Error loading custom build config: ${error.message}`));
    return null;
  }
}

/**
 * Create a default custom build configuration file
 * @param {string} projectType - The detected project type
 * @returns {boolean} True if the file was created successfully
 */
function createDefaultCustomBuildConfig(projectType = null) {
  try {
    // If project type is provided, use it to generate a better default config
    let config = { ...DEFAULT_CUSTOM_CONFIG };
    
    if (projectType) {
      const buildConfig = buildMapping.getBuildConfig(projectType);
      const packageManager = require('./packageManager').detectPackageManager();
      
      config.buildCommand = buildUtils.getBuildCommandForProject(projectType, packageManager);
      config.outputDir = buildConfig.outputDir;
      config.environmentVars = buildConfig.environmentVars;
      config.successIndicators = buildConfig.successIndicators;
      
      // Set recommended compression format based on project type
      if (projectType === 'node' || projectType === 'express') {
        config.compressionFormat = 'tar.gz';
      } else if (projectType === 'next') {
        config.compressionFormat = 'zip';
      }
    }
    
    fs.writeFileSync(
      CUSTOM_BUILD_CONFIG_FILE,
      JSON.stringify(config, null, 2),
      'utf8'
    );
    
    return true;
  } catch (error) {
    console.error(chalk.red(`Error creating custom build config: ${error.message}`));
    return false;
  }
}

/**
 * Merge custom build config with default project config
 * @param {string} projectType - The detected project type
 * @returns {Object} The merged build configuration
 */
function getMergedBuildConfig(projectType) {
  const defaultConfig = buildMapping.getBuildConfig(projectType);
  const customConfig = loadCustomBuildConfig();
  
  if (!customConfig) {
    return defaultConfig;
  }
  
  // Merge the configs, with custom config taking precedence
  return {
    ...defaultConfig,
    ...customConfig,
    // For arrays, merge them if both exist
    environmentVars: [
      ...(defaultConfig.environmentVars || []),
      ...(customConfig.environmentVars || [])
    ].filter((value, index, self) => self.indexOf(value) === index), // Remove duplicates
    successIndicators: [
      ...(defaultConfig.successIndicators || []),
      ...(customConfig.successIndicators || [])
    ].filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates
  };
}

/**
 * Get the build command from custom config or fall back to default
 * @param {string} projectType - The detected project type
 * @param {string} packageManager - The detected package manager
 * @returns {string} The build command to use
 */
function getCustomBuildCommand(projectType, packageManager) {
  const customConfig = loadCustomBuildConfig();
  
  if (customConfig && customConfig.buildCommand) {
    return customConfig.buildCommand;
  }
  
  return buildUtils.getBuildCommandForProject(projectType, packageManager);
}

/**
 * Run pre-build commands if defined in custom config
 * @returns {Promise<boolean>} True if all pre-build commands succeeded
 */
async function runPreBuildCommands() {
  const customConfig = loadCustomBuildConfig();
  
  if (!customConfig || !customConfig.preBuildCommands || !customConfig.preBuildCommands.length) {
    return true;
  }
  
  try {
    const { execSync } = require('child_process');
    
    for (const command of customConfig.preBuildCommands) {
      console.log(chalk.blue(`Running pre-build command: ${command}`));
      execSync(command, { stdio: 'inherit' });
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red(`Error running pre-build commands: ${error.message}`));
    return false;
  }
}

/**
 * Run post-build commands if defined in custom config
 * @returns {Promise<boolean>} True if all post-build commands succeeded
 */
async function runPostBuildCommands() {
  const customConfig = loadCustomBuildConfig();
  
  if (!customConfig || !customConfig.postBuildCommands || !customConfig.postBuildCommands.length) {
    return true;
  }
  
  try {
    const { execSync } = require('child_process');
    
    for (const command of customConfig.postBuildCommands) {
      console.log(chalk.blue(`Running post-build command: ${command}`));
      execSync(command, { stdio: 'inherit' });
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red(`Error running post-build commands: ${error.message}`));
    return false;
  }
}

/**
 * Get file patterns to include/exclude during deployment
 * @returns {Object} Object with include and exclude patterns
 */
function getDeploymentPatterns() {
  const customConfig = loadCustomBuildConfig();
  
  if (!customConfig) {
    return {
      include: [],
      exclude: ["node_modules", ".git", ".github", "coverage", "tests", "test", "*.log", "build.zip"]
    };
  }
  
  return {
    include: customConfig.include || [],
    exclude: customConfig.exclude || ["node_modules", ".git"]
  };
}

/**
 * Validate the custom build configuration
 * @returns {Object} Validation result with success flag and messages
 */
function validateCustomBuildConfig() {
  const customConfig = loadCustomBuildConfig();
  
  if (!customConfig) {
    return { 
      success: false, 
      messages: ["No custom build configuration found"] 
    };
  }
  
  const messages = [];
  
  // Check if build command is valid
  if (!customConfig.buildCommand) {
    messages.push("No build command specified");
  }
  
  // Check if output directory is valid
  if (customConfig.outputDir && !fs.existsSync(customConfig.outputDir)) {
    messages.push(`Output directory '${customConfig.outputDir}' does not exist`);
  }
  
  // Validate compression format if specified
  if (customConfig.compressionFormat && 
      !['zip', 'tar.gz', 'tar'].includes(customConfig.compressionFormat)) {
    messages.push(`Invalid compression format: ${customConfig.compressionFormat}. Supported formats are: zip, tar.gz, tar`);
  }
  
  return {
    success: messages.length === 0,
    messages
  };
}

module.exports = {
  CUSTOM_BUILD_CONFIG_FILE,
  hasCustomBuildConfig,
  loadCustomBuildConfig,
  createDefaultCustomBuildConfig,
  getMergedBuildConfig,
  getCustomBuildCommand,
  runPreBuildCommands,
  runPostBuildCommands,
  getDeploymentPatterns,
  validateCustomBuildConfig
}; 