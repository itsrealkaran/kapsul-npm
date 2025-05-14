const Conf = require('conf');
const crypto = require('crypto');
const os = require('os');

// Create a machine-specific encryption key based on hardware identifiers
function generateMachineKey() {
  const machineName = os.hostname();
  const username = os.userInfo().username;
  const cpuInfo = JSON.stringify(os.cpus()[0]);
  
  return crypto
    .createHash('sha256')
    .update(`${machineName}-${username}-${cpuInfo}`)
    .digest('hex')
    .substring(0, 32); // Use first 32 chars for AES-256
}

// Encryption handlers
const machineKey = generateMachineKey();
const algorithm = 'aes-256-cbc';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(machineKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return null;
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(machineKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    return null;
  }
}

// Create secure configuration with encrypted values for sensitive data
const config = new Conf({
  projectName: 'kapsul',
  schema: {
    token: {
      type: 'string',
      default: ''
    },
    tokenExpiry: {
      type: 'number',
      default: 0
    },
    email: {
      type: 'string',
      default: ''
    },
    apiUrl: {
      type: 'string',
      default: 'http://localhost:3000'
    }
  },
  // Custom encryption for sensitive values
  beforeEach: (key, value) => {
    // Only encrypt sensitive values when saving
    if (['token', 'email'].includes(key)) {
      return encrypt(value);
    }
    return value;
  },
  // Custom decryption for sensitive values
  afterEach: (key, value) => {
    // Only decrypt sensitive values when retrieving
    if (['token', 'email'].includes(key) && value) {
      return decrypt(value);
    }
    return value;
  }
});

// Helper functions for token management
function getToken() {
  return config.get('token');
}

function isTokenValid() {
  const tokenExpiry = config.get('tokenExpiry');
  if (!tokenExpiry) return false;
  
  // Check if token is expired (allow 5 minute buffer)
  return Date.now() < tokenExpiry - (5 * 60 * 1000);
}

function setToken(token, expiresIn = '24h') {
  // Parse JWT to get expiration
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new Error('Invalid token format');
  }
  
  try {
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));
    const expiryTime = payload.exp ? payload.exp * 1000 : calculateExpiryTime(expiresIn);
    
    config.set('token', token);
    config.set('tokenExpiry', expiryTime);
    return true;
  } catch (error) {
    throw new Error('Failed to parse token: ' + error.message);
  }
}

function calculateExpiryTime(expiresIn) {
  // Parse expiresIn string like '24h', '30m', etc.
  const unit = expiresIn.slice(-1);
  const value = parseInt(expiresIn.slice(0, -1), 10);
  
  const now = Date.now();
  switch (unit) {
    case 'h': return now + value * 60 * 60 * 1000;
    case 'm': return now + value * 60 * 1000;
    case 's': return now + value * 1000;
    case 'd': return now + value * 24 * 60 * 60 * 1000;
    default: return now + 24 * 60 * 60 * 1000; // Default to 24 hours
  }
}

function clearToken() {
  config.delete('token');
  config.delete('tokenExpiry');
}

function getApiUrl() {
  return config.get('apiUrl');
}

function setApiUrl(url) {
  config.set('apiUrl', url);
}

function setEmail(email) {
  config.set('email', email);
}

function getEmail() {
  return config.get('email');
}

module.exports = {
  getToken,
  setToken,
  isTokenValid,
  clearToken,
  getApiUrl,
  setApiUrl,
  setEmail,
  getEmail,
  config
}; 