const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Detect which package manager is used in the project
 * @returns {'npm'|'pnpm'|'yarn'|'bun'|'unknown'} The detected package manager
 */
function detectPackageManager() {
  // Check for lockfiles
  if (fs.existsSync('pnpm-lock.yaml')) {
    return 'pnpm';
  }
  
  if (fs.existsSync('yarn.lock')) {
    return 'yarn';
  }
  
  if (fs.existsSync('bun.lockb')) {
    return 'bun';
  }
  
  if (fs.existsSync('package-lock.json')) {
    return 'npm';
  }
  
  // Check for packageManager field in package.json
  try {
    if (fs.existsSync('package.json')) {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      if (packageJson.packageManager) {
        if (packageJson.packageManager.startsWith('pnpm')) {
          return 'pnpm';
        }
        if (packageJson.packageManager.startsWith('yarn')) {
          return 'yarn';
        }
        if (packageJson.packageManager.startsWith('bun')) {
          return 'bun';
        }
        if (packageJson.packageManager.startsWith('npm')) {
          return 'npm';
        }
      }
    }
  } catch (error) {
    // Ignore package.json errors
  }
  
  // Check if any package managers are globally installed
  try {
    // Try to check which package managers are installed globally
    const checkForCmd = (cmd) => {
      try {
        execSync(`${cmd} --version`, { stdio: 'ignore' });
        return true;
      } catch (error) {
        return false;
      }
    };
    
    // Check in order of preference
    if (checkForCmd('pnpm')) {
      return 'pnpm';
    }
    
    if (checkForCmd('yarn')) {
      return 'yarn';
    }
    
    if (checkForCmd('bun')) {
      return 'bun';
    }
    
    // npm is usually available as it comes with Node.js
    return 'npm';
  } catch (error) {
    // Default to npm if detection fails
    return 'npm';
  }
}

/**
 * Get the install command for the specified package manager
 * @param {string} packageManager - The package manager to use
 * @returns {string} The install command
 */
function getInstallCommand(packageManager = 'npm') {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bun install';
    case 'npm':
    default:
      return 'npm install';
  }
}

/**
 * Get the run command for the specified package manager
 * @param {string} packageManager - The package manager to use
 * @param {string} script - The script to run
 * @returns {string} The run command
 */
function getRunCommand(packageManager = 'npm', script) {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm run ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bun run ${script}`;
    case 'npm':
    default:
      return `npm run ${script}`;
  }
}

/**
 * Get the build command for the specified package manager
 * @param {string} packageManager - The package manager to use
 * @returns {string} The build command
 */
function getBuildCommand(packageManager = 'npm') {
  return getRunCommand(packageManager, 'build');
}

/**
 * Get the test command for the specified package manager
 * @param {string} packageManager - The package manager to use
 * @returns {string} The test command
 */
function getTestCommand(packageManager = 'npm') {
  if (packageManager === 'bun') {
    return 'bun test';
  }
  return getRunCommand(packageManager, 'test');
}

/**
 * Get the dev command for the specified package manager
 * @param {string} packageManager - The package manager to use
 * @returns {string} The dev command
 */
function getDevCommand(packageManager = 'npm') {
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm run dev';
    case 'yarn':
      return 'yarn dev';
    case 'bun':
      return 'bun dev';
    case 'npm':
    default:
      return 'npm run dev';
  }
}

/**
 * Get the package add command for the specified package manager
 * @param {string} packageManager - The package manager to use
 * @param {string} packageName - The package to add
 * @param {boolean} isDev - Whether to add as a dev dependency
 * @returns {string} The add command
 */
function getAddPackageCommand(packageManager = 'npm', packageName, isDev = false) {
  const devFlag = isDev ? ' -D' : '';
  
  switch (packageManager) {
    case 'pnpm':
      return `pnpm add${devFlag} ${packageName}`;
    case 'yarn':
      return `yarn add${devFlag} ${packageName}`;
    case 'bun':
      return `bun add${devFlag} ${packageName}`;
    case 'npm':
    default:
      return `npm install${isDev ? ' --save-dev' : ''} ${packageName}`;
  }
}

/**
 * Check if a script exists in package.json
 * @param {string} scriptName - The script name to check
 * @returns {boolean} Whether the script exists
 */
function hasScript(scriptName) {
  try {
    if (fs.existsSync('package.json')) {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return !!(packageJson.scripts && packageJson.scripts[scriptName]);
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Execute a package manager command
 * @param {string} command - The command to execute
 * @returns {string|null} The command output or null if execution failed
 */
function executeCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' });
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.message);
    return null;
  }
}

module.exports = {
  detectPackageManager,
  getInstallCommand,
  getRunCommand,
  getBuildCommand,
  getTestCommand,
  getDevCommand,
  getAddPackageCommand,
  hasScript,
  executeCommand
}; 