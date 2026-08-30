/**
 * 路径处理工具函数
 */

/**
 * 检测当前平台
 * @returns {string} 平台类型: 'win32', 'darwin', 'linux'
 */
function getPlatform() {
  if (typeof window.electronAPI !== 'undefined' && window.electronAPI.getPlatform) {
    return window.electronAPI.getPlatform();
  }
  // 浏览器环境下的简单检测
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('win')) return 'win32';
  if (userAgent.includes('mac')) return 'darwin';
  return 'linux';
}

/**
 * 将本地文件路径转换为file://协议的URL
 * @param {string} filePath - 本地文件路径
 * @returns {string} file://协议的URL
 */
function toFileUrl(filePath) {
  if (!filePath) return '';
  
  // 如果已经是file://协议，直接返回
  if (filePath.startsWith('file://')) {
    return filePath;
  }
  
  // 如果是blob或http/https URL，直接返回
  if (filePath.startsWith('blob:') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  
  const platform = getPlatform();
  
  if (platform === 'win32') {
    // Windows路径处理
    if (filePath.match(/^[a-zA-Z]:/)) {
      // Windows绝对路径，转换为file://协议
      const normalizedPath = filePath.replace(/\\/g, '/');
      return `file:///${normalizedPath}`;
    }
  } else {
    // Unix-like系统 (macOS, Linux)
    if (filePath.startsWith('/')) {
      // 绝对路径
      return `file://${filePath}`;
    }
  }
  
  // 处理其他路径格式
  const normalizedPath = filePath.replace(/\\/g, '/');
  return platform === 'win32' ? `file:///${normalizedPath}` : `file://${normalizedPath}`;
}

/**
 * 规范化路径分隔符（根据平台）
 * @param {string} path - 路径
 * @returns {string} 规范化后的路径
 */
function normalizePath(path) {
  if (!path) return '';
  const platform = getPlatform();
  
  if (platform === 'win32') {
    // Windows使用反斜杠
    return path.replace(/\//g, '\\');
  } else {
    // Unix-like系统使用正斜杠
    return path.replace(/\\/g, '/');
  }
}

/**
 * 从完整路径中提取文件名
 * @param {string} filePath - 完整路径
 * @returns {string} 文件名
 */
function getFileName(filePath) {
  if (!filePath) return '';
  return filePath.split('/').pop().split('\\').pop();
}

/**
 * 移除文件扩展名
 * @param {string} fileName - 文件名
 * @returns {string} 无扩展名的文件名
 */
function removeExtension(fileName) {
  if (!fileName) return '';
  return fileName.replace(/\.[^/.]+$/, '');
}

/**
 * 检查是否为Windows平台
 * @returns {boolean} 是否为Windows
 */
function isWindows() {
  return getPlatform() === 'win32';
}

// 导出到全局作用域
window.PathUtils = {
  toFileUrl,
  normalizePath,
  getFileName,
  removeExtension,
  getPlatform,
  isWindows
};
