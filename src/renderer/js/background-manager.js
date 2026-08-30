/**
 * 主页背景管理器
 */
class BackgroundManager {
  constructor() {
    this.currentBackground = null;
    this.settings = {
      enabled: false,
      blur: 0,
      opacity: 0.8,
      prompt: ''
    };
    this.isGenerating = false;
    this.init();
  }

  async init() {
    // 加载保存的背景设置
    await this.loadSettings();
    // 应用背景设置
    this.applyBackground();
  }

  /**
   * 加载背景设置
   */
  async loadSettings() {
    try {
      if (window.electronAPI && window.electronAPI.store) {
        const savedSettings = await window.electronAPI.store.get('homepage-background');
        if (savedSettings) {
          this.settings = { ...this.settings, ...savedSettings };
        }
      }
    } catch (error) {
      console.warn('加载背景设置失败:', error);
    }
  }

  /**
   * 保存背景设置
   */
  async saveSettings() {
    try {
      if (window.electronAPI && window.electronAPI.store) {
        await window.electronAPI.store.set('homepage-background', this.settings);
      }
    } catch (error) {
      console.warn('保存背景设置失败:', error);
    }
  }

  /**
   * 生成背景图片
   * @param {string} prompt - 提示词
   * @param {Function} onProgress - 进度回调
   */
  async generateBackground(prompt, onProgress = null) {
    if (this.isGenerating) {
      throw new Error('正在生成背景，请稍候...');
    }

    if (!prompt || !prompt.trim()) {
      throw new Error('请输入背景描述');
    }

    // 检查AI配置
    const aiStatus = window.aiService?.getConfigStatus?.();
    if (!aiStatus || !aiStatus.imageConfigured) {
      throw new Error('请先在设置中配置AI图像生成API');
    }

    this.isGenerating = true;

    try {
      // 构建优化后的提示词
      const optimizedPrompt = `${prompt.trim()}, high quality, detailed, artistic, wallpaper style, wide aspect ratio, beautiful lighting, professional composition`;

      // 生成唯一文件名
      const timestamp = Date.now();
      const filename = `homepage_bg_${timestamp}.png`;

      // 使用应用数据目录而不是项目目录
      const appDataDir = await window.electronAPI.path.getUserData();
      const backgroundsDir = `${appDataDir}/backgrounds`;
      await window.electronAPI.fs.ensureDir(backgroundsDir);

      // 调用AI生成图片
      const result = await window.aiService.generateImage(optimizedPrompt, {
        projectId: 'homepage', // 特殊标识
        filename: filename,
        outputDir: backgroundsDir, // 指定输出目录
        onProgress: (progress) => {
          if (onProgress) {
            onProgress(progress);
          }
        }
      });

      if (result) {
        // 构建完整路径
        const fullPath = `${backgroundsDir}/${filename}`;
        const fileUrl = window.PathUtils.toFileUrl(fullPath);
        
        // 更新背景设置
        this.currentBackground = fileUrl;
        this.settings.prompt = prompt;
        this.settings.enabled = true;

        // 保存设置
        await this.saveSettings();

        // 应用新背景
        this.applyBackground();

        return fileUrl;
      } else {
        throw new Error('图片生成失败');
      }

    } catch (error) {
      console.error('生成背景失败:', error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * 设置背景图片（从文件）
   * @param {string} filePath - 文件路径
   */
  async setBackgroundFromFile(filePath) {
    try {
      if (!filePath) {
        throw new Error('文件路径为空');
      }

      // 验证文件存在
      if (!(await window.electronAPI.fs.exists(filePath))) {
        throw new Error('文件不存在');
      }

      // 转换为file://协议URL
      const fileUrl = window.PathUtils.toFileUrl(filePath);
      
      // 更新设置
      this.currentBackground = fileUrl;
      this.settings.enabled = true;
      this.settings.prompt = `自定义背景: ${filePath.split('/').pop()}`;

      // 保存并应用
      await this.saveSettings();
      this.applyBackground();

      return fileUrl;
    } catch (error) {
      console.error('设置背景文件失败:', error);
      throw error;
    }
  }

  /**
   * 应用背景设置到页面
   */
  applyBackground() {
    const mainScreen = document.getElementById('main-screen');
    if (!mainScreen) return;

    // 移除现有背景元素
    const existingBg = document.getElementById('homepage-background');
    if (existingBg) {
      existingBg.remove();
    }

    if (this.settings.enabled && this.currentBackground) {
      // 创建背景元素
      const bgElement = document.createElement('div');
      bgElement.id = 'homepage-background';
      bgElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: url('${this.currentBackground}');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        opacity: ${this.settings.opacity};
        filter: blur(${this.settings.blur}px);
        z-index: -2;
        pointer-events: none;
      `;

      // 插入到主屏幕开始位置
      mainScreen.insertBefore(bgElement, mainScreen.firstChild);
    }
  }

  /**
   * 更新背景设置
   * @param {Object} newSettings - 新设置
   */
  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    this.applyBackground();
  }

  /**
   * 移除背景
   */
  async removeBackground() {
    this.currentBackground = null;
    this.settings.enabled = false;
    await this.saveSettings();
    this.applyBackground();
  }

  /**
   * 获取当前设置
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * 获取当前背景URL
   */
  getCurrentBackground() {
    return this.currentBackground;
  }

  /**
   * 获取生成状态
   */
  isGeneratingBackground() {
    return this.isGenerating;
  }
}

// 创建全局实例
window.backgroundManager = new BackgroundManager();
