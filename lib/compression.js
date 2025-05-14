const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const archiver = require('archiver');
const { createGzip } = require('zlib');
const tar = require('tar');
const projectUtils = require('./project');
const customBuild = require('./customBuild');

/**
 * Compression formats supported by the system
 */
const COMPRESSION_FORMATS = {
  ZIP: 'zip',
  TAR_GZ: 'tar.gz',
  TAR: 'tar'
};

/**
 * Get the optimal compression format for the current project
 * @param {string} projectType - The type of project
 * @returns {string} The recommended compression format
 */
function getOptimalCompressionFormat(projectType) {
  // Default to ZIP for most projects
  if (customBuild.hasCustomBuildConfig()) {
    const config = customBuild.loadCustomBuildConfig();
    if (config && config.compressionFormat) {
      return config.compressionFormat;
    }
  }
  
  // For Node.js and Express projects, prefer tar.gz
  if (projectType === 'node' || projectType === 'express') {
    return COMPRESSION_FORMATS.TAR_GZ;
  }
  
  // For Next.js, prefer zip
  return COMPRESSION_FORMATS.ZIP;
}

/**
 * Get size information for a file or directory
 * @param {string} filePath - Path to the file or directory
 * @param {Object} options - Options
 * @param {boolean} options.includeNodeModules - Whether to include node_modules in size calculation
 * @returns {Object} Size information
 */
function getFileSizeInfo(filePath, options = { includeNodeModules: false }) {
  let totalSize = 0;
  let fileCount = 0;
  
  function calculateSize(itemPath) {
    const stats = fs.statSync(itemPath);
    
    if (stats.isFile()) {
      totalSize += stats.size;
      fileCount++;
    } else if (stats.isDirectory()) {
      // Skip node_modules unless explicitly included
      if (path.basename(itemPath) === 'node_modules' && !options.includeNodeModules) {
        return;
      }
      
      const files = fs.readdirSync(itemPath);
      files.forEach(file => {
        calculateSize(path.join(itemPath, file));
      });
    }
  }
  
  try {
    calculateSize(filePath);
    
    return {
      totalSize,
      fileCount,
      formattedSize: formatSize(totalSize)
    };
  } catch (error) {
    return {
      totalSize: 0,
      fileCount: 0,
      formattedSize: '0 B',
      error: error.message
    };
  }
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Create a compressed archive of the project
 * @param {Object} options - Compression options
 * @param {string} options.format - Compression format ('zip', 'tar.gz', 'tar')
 * @param {number} options.compressionLevel - Compression level (0-9)
 * @param {Array<string>} options.exclude - Patterns to exclude
 * @param {Array<string>} options.include - Patterns to include
 * @param {string} options.outputFile - Output file path
 * @param {Function} options.onProgress - Progress callback
 * @returns {Promise<string>} Path to the created archive
 */
async function createCompressedArchive(options = {}) {
  const projectType = projectUtils.detectProjectType();
  const format = options.format || getOptimalCompressionFormat(projectType);
  const compressionLevel = options.compressionLevel || 9;
  const outputFile = options.outputFile || `build.${format}`;
  
  // Get exclude/include patterns
  let patterns = {
    exclude: [
      'node_modules', 
      '.git', 
      '.github',
      'coverage',
      'tests',
      'test',
      '*.log',
      outputFile
    ],
    include: []
  };
  
  if (customBuild.hasCustomBuildConfig()) {
    patterns = customBuild.getDeploymentPatterns();
  }
  
  // Override with options if provided
  if (options.exclude) patterns.exclude = options.exclude;
  if (options.include) patterns.include = options.include;
  
  // Handle specific formats
  switch (format) {
    case COMPRESSION_FORMATS.ZIP:
      return createZipArchive(outputFile, patterns, compressionLevel, options.onProgress);
    case COMPRESSION_FORMATS.TAR_GZ:
      return createTarGzArchive(outputFile, patterns, compressionLevel, options.onProgress);
    case COMPRESSION_FORMATS.TAR:
      return createTarArchive(outputFile, patterns, options.onProgress);
    default:
      throw new Error(`Unsupported compression format: ${format}`);
  }
}

/**
 * Create a ZIP archive
 * @param {string} outputFile - Output file path
 * @param {Object} patterns - Include/exclude patterns
 * @param {number} compressionLevel - Compression level
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<string>} Path to the created archive
 */
function createZipArchive(outputFile, patterns, compressionLevel, onProgress) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(path.join(process.cwd(), outputFile));
    const archive = archiver('zip', {
      zlib: { level: compressionLevel }
    });

    output.on('close', () => resolve(outputFile));
    archive.on('error', reject);
    
    // Add progress tracking
    archive.on('progress', (progress) => {
      if (onProgress) {
        onProgress({
          format: COMPRESSION_FORMATS.ZIP,
          processed: progress.fs.processedBytes,
          entries: progress.entries.processed,
          total: progress.fs.totalBytes
        });
      }
      
      // Add warning for large archives
      if (progress.fs.processedBytes > 50 * 1024 * 1024) { // 50 MB
        console.log(chalk.yellow('Warning: Creating a large deployment archive...'));
      }
    });

    archive.pipe(output);
    
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

/**
 * Create a TAR.GZ archive
 * @param {string} outputFile - Output file path
 * @param {Object} patterns - Include/exclude patterns
 * @param {number} compressionLevel - Compression level
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<string>} Path to the created archive
 */
function createTarGzArchive(outputFile, patterns, compressionLevel, onProgress) {
  return new Promise((resolve, reject) => {
    // First create a tar file then gzip it
    const tarFile = outputFile.replace(/\.tar\.gz$/, '.tar');
    let currentSize = 0;
    let fileCount = 0;
    
    // Create tar file
    tar.c(
      {
        file: tarFile,
        cwd: process.cwd(),
        filter: (path, stat) => {
          // Skip excluded files
          if (patterns.exclude.some(pattern => {
            if (pattern.includes('*')) {
              // Handle glob patterns
              const glob = new RegExp(pattern.replace(/\*/g, '.*'));
              return glob.test(path);
            } else {
              return path.includes(pattern);
            }
          })) {
            return false;
          }
          
          // Include specific patterns
          if (patterns.include.length > 0) {
            return patterns.include.some(pattern => {
              if (pattern.includes('*')) {
                // Handle glob patterns
                const glob = new RegExp(pattern.replace(/\*/g, '.*'));
                return glob.test(path);
              } else {
                return path.includes(pattern);
              }
            });
          }
          
          return true;
        },
        onentry: (entry) => {
          fileCount++;
          if (onProgress) {
            onProgress({
              format: COMPRESSION_FORMATS.TAR,
              entries: fileCount,
              processed: currentSize
            });
          }
        }
      },
      ['./']
    ).then(() => {
      // Now gzip the tar file
      const gzip = createGzip({ level: compressionLevel });
      const source = fs.createReadStream(tarFile);
      const destination = fs.createWriteStream(outputFile);
      
      let processedBytes = 0;
      const totalBytes = fs.statSync(tarFile).size;
      
      source.on('data', (chunk) => {
        processedBytes += chunk.length;
        if (onProgress) {
          onProgress({
            format: COMPRESSION_FORMATS.TAR_GZ,
            processed: processedBytes,
            total: totalBytes
          });
        }
      });
      
      destination.on('finish', () => {
        // Clean up the temporary tar file
        fs.unlinkSync(tarFile);
        resolve(outputFile);
      });
      
      source.on('error', (err) => {
        if (fs.existsSync(tarFile)) {
          fs.unlinkSync(tarFile);
        }
        reject(err);
      });
      
      destination.on('error', (err) => {
        if (fs.existsSync(tarFile)) {
          fs.unlinkSync(tarFile);
        }
        reject(err);
      });
      
      // Pipe through gzip to the output file
      source.pipe(gzip).pipe(destination);
    }).catch(err => {
      reject(err);
    });
  });
}

/**
 * Create a TAR archive
 * @param {string} outputFile - Output file path
 * @param {Object} patterns - Include/exclude patterns
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<string>} Path to the created archive
 */
function createTarArchive(outputFile, patterns, onProgress) {
  return new Promise((resolve, reject) => {
    let fileCount = 0;
    
    tar.c(
      {
        file: outputFile,
        cwd: process.cwd(),
        filter: (path, stat) => {
          // Skip excluded files
          if (patterns.exclude.some(pattern => {
            if (pattern.includes('*')) {
              // Handle glob patterns
              const glob = new RegExp(pattern.replace(/\*/g, '.*'));
              return glob.test(path);
            } else {
              return path.includes(pattern);
            }
          })) {
            return false;
          }
          
          // Include specific patterns
          if (patterns.include.length > 0) {
            return patterns.include.some(pattern => {
              if (pattern.includes('*')) {
                // Handle glob patterns
                const glob = new RegExp(pattern.replace(/\*/g, '.*'));
                return glob.test(path);
              } else {
                return path.includes(pattern);
              }
            });
          }
          
          return true;
        },
        onentry: (entry) => {
          fileCount++;
          if (onProgress) {
            onProgress({
              format: COMPRESSION_FORMATS.TAR,
              entries: fileCount
            });
          }
        }
      },
      ['./']
    ).then(() => {
      resolve(outputFile);
    }).catch(err => {
      reject(err);
    });
  });
}

/**
 * Estimate the compressed size of a directory
 * @param {string} directory - Directory to analyze
 * @param {string} format - Compression format
 * @returns {Promise<Object>} Size information
 */
async function estimateCompressedSize(directory, format = COMPRESSION_FORMATS.ZIP) {
  // Get the original size
  const originalSize = getFileSizeInfo(directory);
  
  // Estimate the compressed size based on typical compression ratios
  let estimatedRatio;
  switch (format) {
    case COMPRESSION_FORMATS.ZIP:
      estimatedRatio = 0.4; // ZIP typically compresses to 40% of original size
      break;
    case COMPRESSION_FORMATS.TAR_GZ:
      estimatedRatio = 0.3; // TAR.GZ typically compresses to 30% of original size
      break;
    case COMPRESSION_FORMATS.TAR:
      estimatedRatio = 0.9; // TAR has minimal compression
      break;
    default:
      estimatedRatio = 0.5;
  }
  
  const estimatedSize = Math.ceil(originalSize.totalSize * estimatedRatio);
  
  return {
    originalSize: originalSize.totalSize,
    originalFormatted: originalSize.formattedSize,
    estimatedSize,
    estimatedFormatted: formatSize(estimatedSize),
    compressionRatio: `${Math.round((1 - estimatedRatio) * 100)}%`,
    fileCount: originalSize.fileCount
  };
}

module.exports = {
  COMPRESSION_FORMATS,
  getOptimalCompressionFormat,
  createCompressedArchive,
  estimateCompressedSize,
  getFileSizeInfo,
  formatSize
}; 