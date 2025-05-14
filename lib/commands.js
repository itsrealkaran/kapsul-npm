const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const Conf = require('conf');

const config = new Conf({
  projectName: 'kapsul'
});

const API_URL = 'http://localhost:3000';

async function login() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Enter your email:',
      default: 'admin@example.com'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your password:',
      default: 'admin123'
    }
  ]);

  const spinner = ora('Logging in...').start();

  try {
    const response = await axios.post(`${API_URL}/auth/login`, answers);
    config.set('token', response.data.token);
    spinner.succeed(chalk.green('Successfully logged in!'));
  } catch (error) {
    spinner.fail(chalk.red('Login failed: ' + (error.response?.data?.error || error.message)));
    throw error;
  }
}

async function createBuildArchive() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(path.join(process.cwd(), 'build.zip'));
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', () => resolve('build.zip'));
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory('.', false);
    archive.finalize();
  });
}

async function deploy() {
  // Check if logged in
  const token = config.get('token');
  if (!token) {
    console.log(chalk.yellow('You need to login first.'));
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

    const response = await axios.post(`${API_URL}/deploy`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${config.get('token')}`
      }
    });

    // Cleanup
    fs.unlinkSync(buildFile);

    spinner.succeed(chalk.green('Deployment successful!'));
    console.log(chalk.blue('Details:'), response.data);
  } catch (error) {
    spinner.fail(chalk.red('Deployment failed: ' + (error.response?.data?.error || error.message)));
    throw error;
  }
}

module.exports = {
  login,
  deploy
}; 