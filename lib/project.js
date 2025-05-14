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
    if (isNextProject(dependencies)) {
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
 * Check if the project is a Next.js project
 * @param {Object} dependencies - Combined dependencies from package.json
 * @returns {boolean} True if it's a Next.js project
 */
function isNextProject(dependencies) {
  // Check for next dependency
  if (dependencies.next) {
    return true;
  }

  // Check for next.config.js file
  if (hasFile('next.config.js')) {
    return true;
  }

  // Check for pages directory structure (traditional Next.js)
  if (hasDirectory('pages') && (hasFile('pages/_app.js') || hasFile('pages/_app.tsx'))) {
    return true;
  }

  // Check for app directory structure (Next.js 13+)
  if (hasDirectory('app') && (hasFile('app/layout.js') || hasFile('app/layout.tsx'))) {
    return true;
  }

  // Check for .next build directory
  if (hasDirectory('.next')) {
    return true;
  }

  return false;
}

/**
 * Get Next.js version if available
 * @returns {string|null} Next.js version or null if not found
 */
function getNextVersion() {
  try {
    if (!fs.existsSync('package.json')) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = { 
      ...packageJson.dependencies || {}, 
      ...packageJson.devDependencies || {} 
    };

    return dependencies.next || null;
  } catch (error) {
    console.error('Error getting Next.js version:', error.message);
    return null;
  }
}

/**
 * Check if the Next.js project uses the app router (Next.js 13+)
 * @returns {boolean} True if using app router
 */
function usesNextAppRouter() {
  return hasDirectory('app') && (hasFile('app/layout.js') || hasFile('app/layout.tsx'));
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
 * Check if a given directory exists in the project
 * @param {string} dirname - The directory to check
 * @returns {boolean} True if the directory exists
 */
function hasDirectory(dirname) {
  const dirPath = path.join(process.cwd(), dirname);
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
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
  hasFile,
  hasDirectory,
  isNextProject,
  getNextVersion,
  usesNextAppRouter
}; 