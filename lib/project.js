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
    if (isExpressProject(dependencies)) {
      return 'express';
    }

    // Check if it's a Node.js project
    if (isNodeProject()) {
      return 'node';
    }

    // If no specific type is detected
    return 'unknown';
  } catch (error) {
    console.error('Error detecting project type:', error.message);
    return 'unknown';
  }
}

/**
 * Check if the project is a Node.js project
 * Assumes any project with package.json that isn't Next.js or Express is a generic Node.js project
 * @returns {boolean} True if it's a Node.js project
 */
function isNodeProject() {
  // Must have package.json
  if (!hasFile('package.json')) {
    return false;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    // Check for main entry point
    if (packageJson.main) {
      return hasFile(packageJson.main);
    }

    // Check for common entry point files
    const commonEntryPoints = [
      'index.js',
      'main.js',
      'app.js',
      'server.js',
      'src/index.js',
      'src/main.js',
      'src/app.js'
    ];

    for (const entryPoint of commonEntryPoints) {
      if (hasFile(entryPoint)) {
        return true;
      }
    }

    // Check for npm start script
    if (packageJson.scripts && packageJson.scripts.start) {
      return true;
    }

    // Check for package type
    if (packageJson.type === 'module' || packageJson.type === 'commonjs') {
      return true;
    }

    // Check for engines field
    if (packageJson.engines && packageJson.engines.node) {
      return true;
    }

    // If it has dependencies, it's probably a Node.js project
    if (Object.keys(packageJson.dependencies || {}).length > 0) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking Node.js project:', error.message);
    return false;
  }
}

/**
 * Get node engines specification from package.json
 * @returns {string|null} Node.js version specification or null if not found
 */
function getNodeEngineSpec() {
  try {
    if (!fs.existsSync('package.json')) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return packageJson.engines?.node || null;
  } catch (error) {
    console.error('Error getting Node.js engine spec:', error.message);
    return null;
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
 * Check if the project is an Express project
 * @param {Object} dependencies - Combined dependencies from package.json
 * @returns {boolean} True if it's an Express project
 */
function isExpressProject(dependencies) {
  // Check for express dependency
  if (dependencies.express) {
    return true;
  }

  // Check for common Express patterns in code
  const serverFiles = [
    'server.js',
    'app.js',
    'index.js',
    'src/server.js',
    'src/app.js',
    'src/index.js'
  ];

  // Look for potential Express app initialization in server files
  for (const file of serverFiles) {
    if (hasFile(file)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (
          content.includes('require(\'express\')') || 
          content.includes('require("express")') ||
          content.includes('from \'express\'') || 
          content.includes('from "express"')
        ) {
          return true;
        }
      } catch (error) {
        // Ignore file read errors
      }
    }
  }

  // Check for typical Express middleware structure
  if (hasDirectory('routes') || hasDirectory('src/routes') || 
      hasDirectory('middleware') || hasDirectory('src/middleware')) {
    return true;
  }

  return false;
}

/**
 * Detect if a project is a TypeScript project
 * @returns {boolean} True if TypeScript is used
 */
function isTypeScriptProject() {
  // Check for tsconfig.json
  if (hasFile('tsconfig.json')) {
    return true;
  }

  // Check if TypeScript is installed
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = { 
      ...packageJson.dependencies || {}, 
      ...packageJson.devDependencies || {} 
    };
    
    if (dependencies.typescript) {
      return true;
    }
    
    // Check for TS-related packages
    const tsPackages = [
      'ts-node',
      'ts-loader',
      '@types/node',
      '@types/react',
      '@typescript-eslint/parser',
      '@typescript-eslint/eslint-plugin'
    ];
    
    for (const pkg of tsPackages) {
      if (dependencies[pkg]) {
        return true;
      }
    }
    
    // Check if there are TypeScript files
    return hasTypeScriptFiles();
  } catch (error) {
    return hasTypeScriptFiles();
  }
}

/**
 * Check if the project has TypeScript files
 * @returns {boolean} True if TypeScript files are found
 */
function hasTypeScriptFiles() {
  // Common TS file locations
  const commonTsFiles = [
    'index.ts',
    'src/index.ts',
    'app.ts',
    'src/app.ts',
    'main.ts',
    'src/main.ts'
  ];
  
  for (const file of commonTsFiles) {
    if (hasFile(file)) {
      return true;
    }
  }
  
  // Check for .ts or .tsx files in common source directories
  const srcDirs = ['.', 'src', 'app', 'pages', 'components'];
  
  for (const dir of srcDirs) {
    if (hasDirectory(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            return true;
          }
        }
      } catch (error) {
        // Ignore directory read errors
      }
    }
  }
  
  return false;
}

/**
 * Detect if a project uses JSX/TSX for React or similar frameworks
 * @returns {boolean} True if JSX/TSX is used
 */
function usesJsx() {
  // Check for React in dependencies
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = { 
      ...packageJson.dependencies || {}, 
      ...packageJson.devDependencies || {} 
    };
    
    if (dependencies.react) {
      return true;
    }
  } catch (error) {
    // Ignore package.json errors
  }
  
  // Check for JSX/TSX files in common source directories
  const srcDirs = ['.', 'src', 'app', 'pages', 'components'];
  
  for (const dir of srcDirs) {
    if (hasDirectory(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.jsx') || file.endsWith('.tsx')) {
            return true;
          }
        }
      } catch (error) {
        // Ignore directory read errors
      }
    }
  }
  
  // Check for JSX in JavaScript files
  const jsFiles = ['index.js', 'app.js', 'src/index.js', 'src/app.js'];
  
  for (const file of jsFiles) {
    if (hasFile(file)) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (
          content.includes('React') && 
          (content.includes('render(') || content.includes('ReactDOM')) || 
          content.includes('<') && content.includes('/>') || 
          content.includes('import React')
        ) {
          return true;
        }
      } catch (error) {
        // Ignore file read errors
      }
    }
  }
  
  return false;
}

/**
 * Detect if a project uses ESM (ES Modules) or CommonJS
 * @returns {'esm'|'commonjs'|'mixed'|'unknown'} Module type
 */
function detectModuleType() {
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Check package.json type field
    if (packageJson.type === 'module') {
      return 'esm';
    }
    
    if (packageJson.type === 'commonjs') {
      return 'commonjs';
    }
    
    // Check for imports/requires in files
    let hasEsm = false;
    let hasCommonJs = false;
    
    const jsFiles = ['index.js', 'app.js', 'src/index.js', 'src/app.js', 'main.js', 'src/main.js'];
    
    for (const file of jsFiles) {
      if (hasFile(file)) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          if (content.includes('import ') || content.includes('export ')) {
            hasEsm = true;
          }
          if (content.includes('require(') || content.includes('module.exports')) {
            hasCommonJs = true;
          }
        } catch (error) {
          // Ignore file read errors
        }
      }
    }
    
    if (hasEsm && hasCommonJs) {
      return 'mixed';
    }
    if (hasEsm) {
      return 'esm';
    }
    if (hasCommonJs) {
      return 'commonjs';
    }
    
    // Default to CommonJS for Node.js projects
    return 'commonjs';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Get Express version if available
 * @returns {string|null} Express version or null if not found
 */
function getExpressVersion() {
  try {
    if (!fs.existsSync('package.json')) {
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = { 
      ...packageJson.dependencies || {}, 
      ...packageJson.devDependencies || {} 
    };

    return dependencies.express || null;
  } catch (error) {
    console.error('Error getting Express version:', error.message);
    return null;
  }
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
  isExpressProject,
  isNodeProject,
  isTypeScriptProject,
  hasTypeScriptFiles,
  usesJsx,
  detectModuleType,
  getNextVersion,
  getExpressVersion,
  getNodeEngineSpec,
  usesNextAppRouter
}; 