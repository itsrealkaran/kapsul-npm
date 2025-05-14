const fs = require('fs');
const path = require('path');
const projectUtils = require('./project');
const packageManagerUtils = require('./packageManager');
const buildUtils = require('./build');

/**
 * Project-specific build configurations
 */
const PROJECT_BUILD_CONFIGS = {
  next: {
    defaultCommand: 'next build',
    outputDir: '.next',
    requiredDeps: ['next'],
    configFiles: ['next.config.js', 'next.config.ts', 'next.config.mjs'],
    environmentVars: ['NODE_ENV', 'NEXT_PUBLIC_'],
    successIndicators: ['.next/build-manifest.json']
  },
  express: {
    defaultCommand: 'tsc',
    outputDir: 'dist',
    requiredDeps: ['express'],
    configFiles: ['tsconfig.json'],
    environmentVars: ['NODE_ENV', 'PORT'],
    successIndicators: ['dist/index.js', 'dist/server.js', 'dist/app.js']
  },
  node: {
    defaultCommand: 'tsc',
    outputDir: 'dist',
    requiredDeps: [],
    configFiles: ['tsconfig.json'],
    environmentVars: ['NODE_ENV'],
    successIndicators: ['dist/index.js', 'dist/main.js']
  }
};

/**
 * Get the build configuration for a specific project type
 * @param {string} projectType - The project type ('next', 'express', 'node', 'unknown')
 * @returns {Object} The build configuration for the project type
 */
function getBuildConfig(projectType) {
  return PROJECT_BUILD_CONFIGS[projectType] || {
    defaultCommand: 'npm run build',
    outputDir: 'dist',
    requiredDeps: [],
    configFiles: [],
    environmentVars: ['NODE_ENV'],
    successIndicators: []
  };
}

/**
 * Get the expected output directory for a project type
 * @param {string} projectType - The project type ('next', 'express', 'node', 'unknown')
 * @returns {string} The expected output directory
 */
function getOutputDirectory(projectType) {
  // First check if there's a custom output directory in tsconfig.json
  if (projectUtils.isTypeScriptProject()) {
    try {
      const tsConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
      if (tsConfig.compilerOptions && tsConfig.compilerOptions.outDir) {
        return tsConfig.compilerOptions.outDir;
      }
    } catch (error) {
      // Ignore tsconfig.json errors
    }
  }
  
  // Check for project-specific output directory
  const config = getBuildConfig(projectType);
  return config.outputDir;
}

/**
 * Check if a project has all required dependencies for building
 * @param {string} projectType - The project type ('next', 'express', 'node', 'unknown')
 * @returns {Object} Object with status and missing dependencies
 */
function checkRequiredDependencies(projectType) {
  try {
    if (!fs.existsSync('package.json')) {
      return { 
        success: false, 
        missing: [], 
        message: 'No package.json found' 
      };
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = { 
      ...packageJson.dependencies || {}, 
      ...packageJson.devDependencies || {} 
    };
    
    const config = getBuildConfig(projectType);
    const missing = config.requiredDeps.filter(dep => !dependencies[dep]);
    
    return {
      success: missing.length === 0,
      missing,
      message: missing.length > 0 
        ? `Missing required dependencies: ${missing.join(', ')}` 
        : 'All required dependencies are installed'
    };
  } catch (error) {
    return { 
      success: false, 
      missing: [], 
      message: `Error checking dependencies: ${error.message}` 
    };
  }
}

/**
 * Check if required configuration files exist for the project type
 * @param {string} projectType - The project type ('next', 'express', 'node', 'unknown')
 * @returns {Object} Object with status and missing config files
 */
function checkConfigFiles(projectType) {
  const config = getBuildConfig(projectType);
  
  // Check if any of the config files exist
  const missing = config.configFiles.filter(file => !fs.existsSync(file));
  const anyExists = config.configFiles.some(file => fs.existsSync(file));
  
  // For TypeScript projects, check if tsconfig.json exists
  if (projectUtils.isTypeScriptProject() && !fs.existsSync('tsconfig.json')) {
    missing.push('tsconfig.json');
  }
  
  return {
    success: anyExists || config.configFiles.length === 0,
    missing,
    message: !anyExists && config.configFiles.length > 0
      ? `Missing configuration files: ${missing.join(', ')}`
      : 'Configuration files check passed'
  };
}

/**
 * Check if a build was successful based on output files
 * @param {string} projectType - The project type ('next', 'express', 'node', 'unknown')
 * @returns {boolean} True if the build appears to be successful
 */
function isBuildSuccessful(projectType) {
  const config = getBuildConfig(projectType);
  
  // Check if any of the success indicators exist
  return config.successIndicators.some(file => fs.existsSync(file));
}

/**
 * Get environment variables needed for the build
 * @param {string} projectType - The project type ('next', 'express', 'node', 'unknown')
 * @returns {string[]} Array of environment variable names or prefixes
 */
function getRequiredEnvironmentVars(projectType) {
  const config = getBuildConfig(projectType);
  return config.environmentVars || ['NODE_ENV'];
}

/**
 * Get a specific build command with appropriate flags for the project type
 * @param {string} projectType - The project type ('next', 'express', 'node', 'unknown')
 * @param {Object} options - Build options
 * @param {boolean} options.production - Whether to build for production
 * @param {boolean} options.analyze - Whether to enable bundle analysis
 * @param {string} options.outDir - Custom output directory
 * @returns {string} The customized build command
 */
function getCustomBuildCommand(projectType, options = {}) {
  const packageManager = packageManagerUtils.detectPackageManager();
  const baseCommand = buildUtils.getBuildCommandForProject(projectType, packageManager);
  
  // Add project-specific flags
  switch (projectType) {
    case 'next':
      let nextCommand = baseCommand;
      
      // Add production flag
      if (options.production) {
        nextCommand += ' --production';
      }
      
      // Add analyze flag
      if (options.analyze) {
        nextCommand += ' --analyze';
      }
      
      return nextCommand;
      
    case 'express':
    case 'node':
      if (projectUtils.isTypeScriptProject()) {
        let tscCommand = baseCommand;
        
        // Add output directory if specified
        if (options.outDir) {
          tscCommand += ` --outDir ${options.outDir}`;
        }
        
        return tscCommand;
      }
      return baseCommand;
      
    default:
      return baseCommand;
  }
}

module.exports = {
  PROJECT_BUILD_CONFIGS,
  getBuildConfig,
  getOutputDirectory,
  checkRequiredDependencies,
  checkConfigFiles,
  isBuildSuccessful,
  getRequiredEnvironmentVars,
  getCustomBuildCommand
}; 