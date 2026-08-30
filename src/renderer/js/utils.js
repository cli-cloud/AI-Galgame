/**
 * 工具函数集合
 */

class Utils {
  /**
   * 格式化时间戳为可读格式
   * @param {number} timestamp - 时间戳
   * @returns {string} 格式化的时间字符串
   */
  static formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 1分钟内
      return '刚刚';
    } else if (diff < 3600000) { // 1小时内
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) { // 1天内
      return Math.floor(diff / 3600000) + '小时前';
    } else if (diff < 604800000) { // 1周内
      return Math.floor(diff / 86400000) + '天前';
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  }

  /**
   * 生成唯一ID
   * @returns {string} 唯一ID
   */
  static generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * 深拷贝对象
   * @param {any} obj - 要拷贝的对象
   * @returns {any} 拷贝后的对象
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = Utils.deepClone(obj[key]);
        }
      }
      return cloned;
    }
  }

  /**
   * 防抖函数
   * @param {Function} func - 要防抖的函数
   * @param {number} wait - 等待时间
   * @returns {Function} 防抖后的函数
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * 节流函数
   * @param {Function} func - 要节流的函数
   * @param {number} limit - 限制时间
   * @returns {Function} 节流后的函数
   */
  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * 验证JSON字符串
   * @param {string} str - JSON字符串
   * @returns {boolean} 是否为有效JSON
   */
  static isValidJSON(str) {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 安全解析JSON
   * @param {string} str - JSON字符串
   * @param {any} defaultValue - 默认值
   * @returns {any} 解析结果
   */
  static safeJSONParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.warn('JSON解析失败:', e);
      return defaultValue;
    }
  }

  /**
   * 等待指定时间
   * @param {number} ms - 等待毫秒数
   * @returns {Promise} Promise对象
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化的大小字符串
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取文件扩展名
   * @param {string} filename - 文件名
   * @returns {string} 扩展名
   */
  static getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  }

  /**
   * 截断文本
   * @param {string} text - 原文本
   * @param {number} maxLength - 最大长度
   * @param {string} suffix - 后缀
   * @returns {string} 截断后的文本
   */
  static truncateText(text, maxLength, suffix = '...') {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  /**
   * 转义HTML特殊字符
   * @param {string} text - 原文本
   * @returns {string} 转义后的文本
   */
  static escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * 验证URL格式
   * @param {string} url - URL字符串
   * @returns {boolean} 是否为有效URL
   */
  static isValidURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 随机选择数组元素
   * @param {Array} array - 数组
   * @returns {any} 随机元素
   */
  static randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * 洗牌算法
   * @param {Array} array - 数组
   * @returns {Array} 洗牌后的数组
   */
  static shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * 创建模态框
   * @param {string} id - 模态框ID
   * @returns {Object} 模态框控制对象
   */
  static createModal(id) {
    const modal = document.getElementById(id);
    if (!modal) {
      console.error(`Modal with id "${id}" not found`);
      return null;
    }

    return {
      show() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      },
      hide() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      },
      toggle() {
        if (modal.classList.contains('active')) {
          this.hide();
        } else {
          this.show();
        }
      }
    };
  }

  /**
   * 显示通知
   * @param {string} message - 消息内容
   * @param {string} type - 通知类型 (success, error, warning, info)
   * @param {number} duration - 显示时长（毫秒）
   */
  static showNotification(message, type = 'info', duration = 3000) {
    // 创建通知容器（如果不存在）
    let container = document.querySelector('.notification-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'notification-container';
      // 动态计算顶部偏移，避免与自定义标题栏重叠
      const titlebar = document.querySelector('.titlebar');
      const topOffset = (titlebar ? titlebar.clientHeight + 12 : 20) + 'px';
      container.style.cssText = `
        position: fixed;
        top: ${topOffset};
        right: 20px;
        z-index: 10000;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196f3'};
      color: white;
      padding: 12px 20px;
      margin-bottom: 10px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: auto;
      cursor: pointer;
      transform: translateX(100%);
      transition: transform 0.3s ease, opacity 0.3s ease;
      max-width: 300px;
      word-wrap: break-word;
    `;
    notification.textContent = message;

  // 确保容器top始终跟随标题栏高度，避免重叠
  const tbar = document.querySelector('.titlebar');
  const topAgain = (tbar ? tbar.clientHeight + 12 : 20) + 'px';
  container.style.top = topAgain;

  // 添加到容器
  container.appendChild(notification);

    // 显示动画
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);

    const closeNow = () => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    };

    // 点击关闭
    notification.addEventListener('click', closeNow);

    // 自动关闭
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentNode) {
          closeNow();
        }
      }, duration);
    }

    // 返回关闭句柄，便于手动收起
    return { close: closeNow };
  }

  /** 全局遮罩（全屏模糊/加载） */
  static showGlobalOverlay(text = '处理中...') {
    let overlay = document.getElementById('global-overlay');
    if (!overlay) return;
    const txt = overlay.querySelector('.overlay-text');
    if (txt) txt.textContent = text;
    overlay.classList.remove('hidden');
  }

  static hideGlobalOverlay() {
    const overlay = document.getElementById('global-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  }

  /**
   * 验证配置对象
   * @param {Object} config - 配置对象
   * @param {Object} schema - 配置模式
   * @returns {Object} 验证结果
   */
  static validateConfig(config, schema) {
    const errors = [];
    const warnings = [];

    for (const key in schema) {
      const rule = schema[key];
      const value = config[key];

      // 检查必填字段
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`字段 "${key}" 是必填的`);
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        // 检查类型
        if (rule.type && typeof value !== rule.type) {
          errors.push(`字段 "${key}" 类型错误，期望 ${rule.type}，实际 ${typeof value}`);
        }

        // 检查URL格式
        if (rule.format === 'url' && !Utils.isValidURL(value)) {
          errors.push(`字段 "${key}" URL格式无效`);
        }

        // 检查字符串长度
        if (rule.type === 'string') {
          if (rule.minLength && value.length < rule.minLength) {
            errors.push(`字段 "${key}" 长度不能小于 ${rule.minLength}`);
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            errors.push(`字段 "${key}" 长度不能大于 ${rule.maxLength}`);
          }
        }

        // 检查数值范围
        if (rule.type === 'number') {
          if (rule.min !== undefined && value < rule.min) {
            errors.push(`字段 "${key}" 不能小于 ${rule.min}`);
          }
          if (rule.max !== undefined && value > rule.max) {
            errors.push(`字段 "${key}" 不能大于 ${rule.max}`);
          }
        }

        // 检查枚举值
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`字段 "${key}" 值无效，允许的值: ${rule.enum.join(', ')}`);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 创建拖拽排序功能
   * @param {HTMLElement} container - 容器元素
   * @param {Function} onSort - 排序回调函数
   */
  static createSortable(container, onSort) {
    let draggedElement = null;
    let placeholder = null;

    container.addEventListener('dragstart', (e) => {
      if (!e.target.draggable) return;
      draggedElement = e.target;
      e.target.style.opacity = '0.5';
      
      // 创建占位符
      placeholder = document.createElement('div');
      placeholder.className = 'sort-placeholder';
      placeholder.style.cssText = `
        height: ${e.target.offsetHeight}px;
        background: rgba(102, 126, 234, 0.2);
        border: 2px dashed rgba(102, 126, 234, 0.5);
        border-radius: 8px;
        margin: ${getComputedStyle(e.target).margin};
      `;
    });

    container.addEventListener('dragend', (e) => {
      if (e.target === draggedElement) {
        e.target.style.opacity = '';
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }
        draggedElement = null;
        placeholder = null;
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedElement) return;

      const afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(placeholder);
      } else {
        container.insertBefore(placeholder, afterElement);
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!draggedElement || !placeholder) return;

      const afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(draggedElement);
      } else {
        container.insertBefore(draggedElement, afterElement);
      }

      if (onSort) {
        const items = Array.from(container.children).filter(child => 
          child !== placeholder && child.draggable
        );
        onSort(items);
      }
    });

    function getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('[draggable="true"]')]
        .filter(el => el !== draggedElement);

      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
  }
}

// 全局暴露Utils
window.Utils = Utils;
