const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const configManager = require('./config');
const customBuild = require('./customBuild');
const projectUtils = require('./project');
const buildUtils = require('./build');

// Helper function for handling API errors
function handleApiError(error, operation) {
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const message = error.response.data?.error || error.response.statusText;
    
    switch (status) {
      case 401:
        // Unauthorized - token might be invalid
        configManager.clearToken();
        return `Authentication failed: ${message}. Please login again.`;
      case 403:
        return `Access denied: ${message}`;
      case 404:
        return `Resource not found: ${message}`;
      case 429:
        return `Rate limit exceeded. Please try again later.`;
      case 500:
      case 502:
      case 503:
      case 504:
        return `Server error: ${message}. Please try again later.`;
      default:
        return `Error during ${operation}: ${message}`;
    }
  } else if (error.request) {
    // Request was made but no response received
    return `Network error: Could not connect to the server. Please check your internet connection.`;
  } else {
    // Error in setting up the request
    return `Error: ${error.message}`;
  }
}

async function login() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Enter your email:',
      default: configManager.getEmail() || 'admin@example.com'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your password:',
      mask: '*'
    }
  ]);

  const spinner = ora('Logging in...').start();

  try {
    const response = await axios.post(`${configManager.getApiUrl()}/auth/login`, answers);
    
    if (response.data?.token) {
      configManager.setToken(response.data.token);
      configManager.setEmail(answers.email);
      spinner.succeed(chalk.green('Successfully logged in!'));
    } else {
      spinner.fail(chalk.red('Login failed: Server did not return a valid token'));
      throw new Error('Invalid server response');
    }
  } catch (error) {
    const errorMessage = handleApiError(error, 'login');
    spinner.fail(chalk.red(errorMessage));
    throw new Error(errorMessage);
  }
}

async function logout() {
  try {
    configManager.clearToken();
    console.log(chalk.green('Successfully logged out'));
    return true;
  } catch (error) {
    console.error(chalk.red(`Logout failed: ${error.message}`));
    return false;
  }
}

// Create build archive with custom configuration support
async function createBuildArchive() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(path.join(process.cwd(), 'build.zip'));
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', () => resolve('build.zip'));
    archive.on('error', reject);
    
    // Add warning for large archives
    archive.on('progress', (progress) => {
      if (progress.fs.processedBytes > 50 * 1024 * 1024) { // 50 MB
        console.log(chalk.yellow('Warning: Creating a large deployment archive...'));
      }
    });

    archive.pipe(output);
    
    // Get exclude/include patterns from custom config if available
    let patterns = {
      exclude: [
        'node_modules', 
        '.git', 
        '.github',
        'coverage',
        'tests',
        'test',
        '*.log',
        'build.zip'
      ],
      include: []
    };
    
    if (customBuild.hasCustomBuildConfig()) {
      patterns = customBuild.getDeploymentPatterns();
    }
    
    // Add files based on include/exclude patterns
    archive.glob('**/*', {
      ignore: patterns.exclude,
      dot: true
    });
    
    // Explicitly include files from the include patterns
    if (patterns.include && patterns.include.length > 0) {
      patterns.include.forEach(pattern => {
        archive.glob(pattern, { dot: true });
      });
    }
    
    archive.finalize();
  });
}

async function deploy() {
  // Check if logged in
  if (!configManager.getToken()) {
    console.log(chalk.yellow('You need to login first.'));
    await login();
  } else if (!configManager.isTokenValid()) {
    console.log(chalk.yellow('Your session has expired. Please login again.'));
    await login();
  }

  const spinner = ora('Preparing build...').start();

  try {
    // Create build archive
    spinner.text = 'Creating build archive...';
    const buildFile = await createBuildArchive();

    // Upload build
    spinner.text = 'Uploading build...';
    const formData = new FormData();
    formData.append('build', fs.createReadStream(buildFile));

    const response = await axios.post(`${configManager.getApiUrl()}/deploy`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${configManager.getToken()}`
      },
      // Add upload progress
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        spinner.text = `Uploading build... ${percentCompleted}%`;
      }
    });

    // Cleanup
    fs.unlinkSync(buildFile);

    spinner.succeed(chalk.green('Deployment successful!'));
    console.log(chalk.blue('Details:'), response.data);
  } catch (error) {
    const errorMessage = handleApiError(error, 'deployment');
    spinner.fail(chalk.red(errorMessage));
    throw new Error(errorMessage);
  }
}

// Show stored configuration (non-sensitive)
function showConfig() {
  console.log(chalk.blue('Current Configuration:'));
  console.log(chalk.green('API URL:'), configManager.getApiUrl());
  console.log(chalk.green('Logged in as:'), configManager.getEmail() || 'Not logged in');
  console.log(chalk.green('Session valid:'), configManager.isTokenValid() ? 'Yes' : 'No');
}

// Update configuration
async function updateConfig() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiUrl',
      message: 'Enter API URL:',
      default: configManager.getApiUrl()
    }
  ]);

  configManager.setApiUrl(answers.apiUrl);
  console.log(chalk.green('Configuration updated successfully!'));
  showConfig();
}

/**
 * Initialize a custom build configuration
 */
async function initCustomBuild() {
  const projectType = projectUtils.detectProjectType();
  
  console.log(chalk.blue(`Initializing custom build configuration for ${chalk.bold(projectType)} project...`));
  
  // Check if config already exists
  if (customBuild.hasCustomBuildConfig()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `A custom build configuration already exists. Overwrite it?`,
        default: false
      }
    ]);
    
    if (!overwrite) {
      console.log(chalk.yellow('Custom build configuration initialization canceled.'));
      return;
    }
  }
  
  // Create default config based on project type
  const success = customBuild.createDefaultCustomBuildConfig(projectType);
  
  if (success) {
    console.log(chalk.green(`Custom build configuration created at ${chalk.bold(customBuild.CUSTOM_BUILD_CONFIG_FILE)}`));
    console.log(chalk.blue('You can now edit this file to customize your build process.'));
  } else {
    console.error(chalk.red('Failed to create custom build configuration.'));
  }
}

/**
 * Build the project using custom or default configuration
 */
async function build() {
  const spinner = ora('Building project...').start();
  
  try {
    // Check if project has a build command
    if (!buildUtils.hasBuildCommand()) {
      spinner.fail(chalk.red('No build command found for this project.'));
      console.log(chalk.yellow(`Suggestion: ${buildUtils.suggestBuildCommand()}`));
      return;
    }
    
    // Check if using custom config
    const useCustomConfig = customBuild.hasCustomBuildConfig();
    if (useCustomConfig) {
      spinner.text = 'Building project with custom configuration...';
      
      // Validate custom config
      const validation = customBuild.validateCustomBuildConfig();
      if (!validation.success) {
        spinner.fail(chalk.red('Invalid custom build configuration:'));
        validation.messages.forEach(msg => console.log(chalk.yellow(`- ${msg}`)));
        return;
      }
    }
    
    // Execute build
    spinner.text = `Building project with ${useCustomConfig ? 'custom' : 'default'} configuration...`;
    const result = await buildUtils.executeBuild({ useCustomConfig });
    
    if (result.success) {
      spinner.succeed(chalk.green('Build completed successfully!'));
      console.log(chalk.blue(`Build command: ${result.command}`));
    } else {
      spinner.fail(chalk.red('Build failed!'));
      console.log(chalk.yellow('Error:'), result.output);
      console.log(chalk.blue(`Build command: ${result.command}`));
    }
  } catch (error) {
    spinner.fail(chalk.red(`Build failed: ${error.message}`));
  }
}

module.exports = {
  login,
  logout,
  deploy,
  showConfig,
  updateConfig,
  initCustomBuild,
  build
}; 