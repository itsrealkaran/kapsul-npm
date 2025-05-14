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
  let buildLines = [];
  const maxBuildLines = 5; // Maximum number of build output lines to show

  try {
    // First, detect project type and check if it can be built
    const projectType = projectUtils.detectProjectType();
    const useCustomConfig = customBuild.hasCustomBuildConfig();
    
    // Check if the project has a build command
    if (!buildUtils.hasBuildCommand()) {
      spinner.warn(chalk.yellow('No build command detected for this project.'));
      
      // If custom config exists but no build command is specified
      if (useCustomConfig) {
        const { shouldInitialize } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldInitialize',
            message: 'Custom configuration exists but no build command is specified. Would you like to update it?',
            default: true
          }
        ]);
        
        if (shouldInitialize) {
          spinner.stop();
          await initCustomBuild();
          console.log(chalk.blue('Please specify a build command in the custom configuration and try again.'));
          return;
        }
      } else {
        // Suggest creating a custom configuration
        const { shouldInitialize } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldInitialize',
            message: 'No build command found. Would you like to create a custom build configuration?',
            default: true
          }
        ]);
        
        if (shouldInitialize) {
          spinner.stop();
          await initCustomBuild();
          console.log(chalk.blue('Please specify a build command in the custom configuration and try again.'));
          return;
        }
      }
      
      // If user doesn't want to create/update custom config, cancel deployment
      spinner.fail(chalk.red('Deployment canceled - no build command available.'));
      console.log(chalk.yellow(`Suggestion: Add a build script to your package.json or initialize a custom build configuration.`));
      return;
    }
    
    // Execute build process with progress visualization
    spinner.text = `Building project with ${useCustomConfig ? 'custom' : 'default'} configuration...`;
    
    // Execute build with progress tracking
    const buildResult = await buildUtils.executeBuild({ 
      useCustomConfig,
      onProgress: (progress) => {
        // Update spinner text based on build step
        switch(progress.step) {
          case 'pre-build':
            spinner.text = progress.status === 'running' 
              ? 'Running pre-build commands...' 
              : 'Pre-build commands completed';
            break;
          case 'build':
            if (progress.output) {
              // Keep track of the last few lines of build output
              const lines = progress.output.split('\n').filter(line => line.trim());
              buildLines = [...buildLines, ...lines].slice(-maxBuildLines);
              
              // Update spinner text with current build status
              spinner.text = `Building: ${buildLines[buildLines.length - 1] || 'In progress...'}`;
            } else {
              spinner.text = `Building with command: ${progress.command}`;
            }
            break;
          case 'post-build':
            spinner.text = progress.status === 'running' 
              ? 'Running post-build commands...' 
              : 'Post-build commands completed';
            break;
        }
      }
    });
    
    if (!buildResult.success) {
      spinner.fail(chalk.red('Build failed!'));
      console.log(chalk.yellow('Error:'), buildResult.output);
      console.log(chalk.blue(`Build command: ${buildResult.command}`));
      
      // Validate build output
      const validation = buildUtils.validateBuildOutput(projectType, buildResult.output);
      if (!validation.success) {
        console.log(chalk.yellow('Errors identified:'));
        validation.messages.forEach((msg, i) => {
          if (i < 3) { // Limit to 3 errors
            console.log(chalk.yellow(`- ${msg}`));
          }
        });
        
        if (validation.messages.length > 3) {
          console.log(chalk.yellow(`... and ${validation.messages.length - 3} more issues`));
        }
      }
      
      // Don't allow deployment when build fails - this is a hard requirement
      console.log(chalk.red('Deployment canceled due to build failure.'));
      console.log(chalk.blue('Please fix the build issues and try again.'));
      return;
    } else {
      spinner.succeed(chalk.green('Build completed successfully!'));
      spinner.start('Preparing deployment...');
    }

    // Check for build output directory
    const outputDir = customBuild.hasCustomBuildConfig() 
      ? customBuild.loadCustomBuildConfig()?.outputDir 
      : buildMapping.getOutputDirectory(projectType);
      
    if (outputDir && !fs.existsSync(outputDir)) {
      spinner.warn(chalk.yellow(`Expected build output directory '${outputDir}' not found.`));
      
      const { shouldContinue } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldContinue',
          message: 'Build output directory is missing. Continue with deployment anyway?',
          default: false
        }
      ]);
      
      if (!shouldContinue) {
        spinner.fail(chalk.red('Deployment canceled.'));
        return;
      }
    }

    // Create build archive
    spinner.text = 'Creating deployment archive...';
    const buildFile = await createBuildArchive();

    // Upload build
    spinner.text = 'Uploading deployment...';
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
        spinner.text = `Uploading deployment... ${percentCompleted}%`;
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
  let buildLines = [];
  const maxBuildLines = 10; // Maximum number of build output lines to show
  
  try {
    const projectType = projectUtils.detectProjectType();
    // Check if project has a build command
    if (!buildUtils.hasBuildCommand()) {
      spinner.fail(chalk.red('No build command found for this project.'));
      
      // If custom config exists but no build command is specified
      const useCustomConfig = customBuild.hasCustomBuildConfig();
      if (useCustomConfig) {
        const { shouldUpdate } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldUpdate',
            message: 'Custom configuration exists but no build command is specified. Would you like to update it?',
            default: true
          }
        ]);
        
        if (shouldUpdate) {
          spinner.stop();
          await initCustomBuild();
          console.log(chalk.blue('Please specify a build command in the custom configuration and try again.'));
          return;
        }
      } else {
        // Suggest creating a custom configuration
        const { shouldInitialize } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldInitialize',
            message: 'No build command found. Would you like to create a custom build configuration?',
            default: true
          }
        ]);
        
        if (shouldInitialize) {
          spinner.stop();
          await initCustomBuild();
          console.log(chalk.blue('Please specify a build command in the custom configuration and try again.'));
          return;
        }
      }
      
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
    
    // Execute build with progress tracking
    const result = await buildUtils.executeBuild({ 
      useCustomConfig,
      onProgress: (progress) => {
        // Update spinner text based on build step
        switch(progress.step) {
          case 'pre-build':
            spinner.text = progress.status === 'running' 
              ? 'Running pre-build commands...' 
              : 'Pre-build commands completed';
            break;
          case 'build':
            if (progress.output) {
              // Keep track of the last few lines of build output
              const lines = progress.output.split('\n').filter(line => line.trim());
              buildLines = [...buildLines, ...lines].slice(-maxBuildLines);
              
              // Update spinner text with current build status
              spinner.text = `Building: ${buildLines[buildLines.length - 1] || 'In progress...'}`;
            } else {
              spinner.text = `Building with command: ${progress.command}`;
            }
            break;
          case 'post-build':
            spinner.text = progress.status === 'running' 
              ? 'Running post-build commands...' 
              : 'Post-build commands completed';
            break;
        }
      }
    });
    
    if (result.success) {
      spinner.succeed(chalk.green('Build completed successfully!'));
      console.log(chalk.blue(`Build command: ${result.command}`));
      
      // Validate build output for warnings
      const validation = buildUtils.validateBuildOutput(projectType, result.output);
      
      if (!validation.success) {
        console.log(chalk.yellow('Warnings detected in build output:'));
        validation.messages.forEach((msg, i) => {
          if (i < 5) { // Limit to 5 warnings
            console.log(chalk.yellow(`- ${msg}`));
          }
        });
        
        if (validation.messages.length > 5) {
          console.log(chalk.yellow(`... and ${validation.messages.length - 5} more warnings`));
        }
      }
      
      // Check for build output directory
      const outputDir = useCustomConfig 
        ? customBuild.loadCustomBuildConfig()?.outputDir 
        : buildMapping.getOutputDirectory(projectType);
        
      if (outputDir && !fs.existsSync(outputDir)) {
        console.log(chalk.yellow(`Warning: Expected build output directory '${outputDir}' was not created.`));
        console.log(chalk.yellow('This may indicate that the build process did not generate the expected output.'));
      } else if (outputDir) {
        console.log(chalk.green(`Build output directory: ${outputDir}`));
      }
    } else {
      spinner.fail(chalk.red('Build failed!'));
      console.log(chalk.yellow('Error:'), result.output);
      console.log(chalk.blue(`Build command: ${result.command}`));
      
      // Validate build output for errors
      const validation = buildUtils.validateBuildOutput(projectType, result.output);
      if (!validation.success) {
        console.log(chalk.yellow('Errors identified:'));
        validation.messages.forEach((msg, i) => {
          if (i < 3) { // Limit to 3 errors
            console.log(chalk.yellow(`- ${msg}`));
          }
        });
        
        if (validation.messages.length > 3) {
          console.log(chalk.yellow(`... and ${validation.messages.length - 3} more issues`));
        }
      }
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