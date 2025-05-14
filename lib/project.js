const fs = require('fs');
const path = require('path');

/**
 * Detect the type of project in the current directory
 * @returns {string} 'next', 'express', 'node', or 'unknown'
 */
function detectProjectType() {
  try {
    // Check if package.json exists
    if (!fs.existsSync('package.json')) {
      return 'unknown';
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = { 
      ...packageJson.dependencies || {}, 
      ...packageJson.devDependencies || {} 
    };

    // Check for Next.js project
    if (dependencies.next || fs.existsSync('next.config.js')) {
      return 'next';
    }

    // Check for Express project
    if (dependencies.express) {
      return 'express';
    }

    // If no specific framework is detected but it has a package.json, it's a Node.js project
    return 'node';
  } catch (error) {
    console.error('Error detecting project type:', error.message);
    return 'unknown';
  }
}

/**
 * Get project name from package.json
 * @returns {string} Project name or null if not found
 */
function getProjectName() {
  try {
    if (!fs.existsSync('package.json')) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.name || null;
  } catch (error) {
    console.error('Error getting project name:', error.message);
    return null;
  }
}

/**
 * Check if a given file exists in the project
 * @param {string} filename - The file to check
 * @returns {boolean} True if the file exists
 */
function hasFile(filename) {
  return fs.existsSync(path.join(process.cwd(), filename));
}

/**
 * Get project version from package.json
 * @returns {string} Project version or null if not found
 */
function getProjectVersion() {
  try {
    if (!fs.existsSync('package.json')) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.version || null;
  } catch (error) {
    console.error('Error getting project version:', error.message);
    return null;
  }
}

module.exports = {
  detectProjectType,
  getProjectName,
  getProjectVersion,
  hasFile
}; 