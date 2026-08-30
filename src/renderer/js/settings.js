/**
 * 设置页面逻辑
 */

class SettingsManager {
  constructor() {
    this.settings = {};
    this.isLoading = false;
    this.init();
  }

  async init() {
    // 初始化AI服务
    if (typeof AIService !== 'undefined') {
      window.aiService = new AIService();
    }
    
    // 首先加载并应用设置
    await this.applySettings();
    
    this.setupEventListeners();
    this.populateSettings();
    this.setupTabs();
    await this.loadVersionInfo(); // 加载版本信息
  }

  /**
   * 加载设置（返回设置对象，不直接操作DOM）
   */
  async loadSettings() {
    try {
      let savedSettings;
      
      // 优先从 Electron 存储读取
      if (window.electronAPI && window.electronAPI.storage) {
        try {
          savedSettings = await window.electronAPI.storage.get('appSettings');
        } catch (e) {
          console.warn('从Electron存储加载设置失败，回退localStorage:', e);
        }
      }
      
      // 回退 localStorage（新键）
      if (!savedSettings) {
        const stored = localStorage.getItem('artimeow-settings');
        savedSettings = stored ? JSON.parse(stored) : null;
      }

      // 合并旧键（迁移自 appSettings）
      try {
        const legacy = localStorage.getItem('appSettings');
        if (legacy) {
          const legacyObj = JSON.parse(legacy);
          savedSettings = { ...(legacyObj || {}), ...(savedSettings || {}) };
        }
      } catch {}
      
      const merged = this.sanitizeSettings({ ...this.getDefaultSettings(), ...(savedSettings || {}) });

      // 附加运行时路径信息
      if (window.electronAPI && window.electronAPI.getDataDir) {
        try {
          merged.dataLocation = await window.electronAPI.getDataDir();
        } catch {}
      }

      return merged;
    } catch (error) {
      console.error('加载设置失败:', error);
      return this.getDefaultSettings();
    }
  }

  /** 清洗设置对象：把 'undefined'/'null' 字符串和 null 转为空或默认 */
  /** 清洗设置对象：把 'undefined'/'null' 字符串和 null 转为空或默认 */
  sanitizeSettings(obj) {
    const cleaned = { ...obj };
    const cleanStr = (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') {
        const t = v.trim().toLowerCase();
        if (t === 'undefined' || t === 'null') return '';
      }
      return v;
    };

    cleaned.textModelType = cleanStr(cleaned.textModelType) || 'openai';
    
    // 文本模型预设映射
    const textDefaultsMap = {
      openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      claude: { url: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-20241022' },
      gemini: { url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
      ollama: { url: 'http://localhost:11434', model: 'qwen2.5' },
      llamacpp: { url: 'http://localhost:8080', model: 'default' },
      custom: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    };
    const textDef = textDefaultsMap[cleaned.textModelType] || textDefaultsMap.openai;

    cleaned.textApiUrl = cleanStr(cleaned.textApiUrl) || textDef.url;
    cleaned.textApiKey = cleanStr(cleaned.textApiKey);
    cleaned.textModel = cleanStr(cleaned.textModel) || textDef.model;

    cleaned.imageModelType = cleanStr(cleaned.imageModelType) || 'openai';
    cleaned.imageApiUrl = cleanStr(cleaned.imageApiUrl) || 'https://api.openai.com/v1';
    cleaned.imageApiKey = cleanStr(cleaned.imageApiKey);
    cleaned.imageModel = cleanStr(cleaned.imageModel) || 'dall-e-3';
    cleaned.imageResolution = cleanStr(cleaned.imageResolution) || '1024x1024';

    cleaned.windowResolution = cleanStr(cleaned.windowResolution) || '1280x720';
    cleaned.customWidth = parseInt(cleanStr(cleaned.customWidth)) || 1280;
    cleaned.customHeight = parseInt(cleanStr(cleaned.customHeight)) || 720;
    cleaned.fullscreenMode = !!cleaned.fullscreenMode;
    cleaned.themeMode = cleanStr(cleaned.themeMode) || 'system';
    cleaned.dialogueSkin = cleanStr(cleaned.dialogueSkin) || 'default';
    cleaned.textOpacity = Math.min(100, Math.max(0, parseInt(cleanStr(cleaned.textOpacity)) || 90));

    // 渐变
    cleaned.backgroundGradient = cleaned.backgroundGradient || {};
    cleaned.backgroundGradient.startColor = cleanStr(cleaned.backgroundGradient.startColor) || '#fce1ec';
    cleaned.backgroundGradient.endColor = cleanStr(cleaned.backgroundGradient.endColor) || '#f7b1c3';
    cleaned.backgroundGradient.direction = cleanStr(cleaned.backgroundGradient.direction) || '135deg';

    // 数据位置
    cleaned.dataLocation = cleanStr(cleaned.dataLocation);

    return cleaned;
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 保存设置
    const saveBtn = document.getElementById('save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await this.saveSettings(true); // 参数 true 表示手动保存，总是关闭窗口
      });
    }

    // 文本模型类型切换 -> 自动填充默认 URL 与默认 Model 预设
    const textModelTypeSelect = document.getElementById('text-model-type');
    if (textModelTypeSelect) {
      textModelTypeSelect.addEventListener('change', (e) => {
        const type = e.target.value;
        const textDefaultsMap = {
          openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
          claude: { url: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-20241022' },
          gemini: { url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
          ollama: { url: 'http://localhost:11434', model: 'qwen2.5' },
          llamacpp: { url: 'http://localhost:8080', model: 'default' },
          custom: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
        };
        const preset = textDefaultsMap[type] || textDefaultsMap.openai;
        const urlInput = document.getElementById('text-api-url');
        const modelInput = document.getElementById('text-model');

        const allUrls = Object.values(textDefaultsMap).map(p => p.url);
        const allModels = Object.values(textDefaultsMap).map(p => p.model);

        if (urlInput) {
          urlInput.placeholder = preset.url;
          const currentUrl = urlInput.value.trim();
          if (!currentUrl || allUrls.includes(currentUrl)) {
            urlInput.value = preset.url;
          }
        }
        if (modelInput) {
          modelInput.placeholder = preset.model;
          const currentModel = modelInput.value.trim();
          if (!currentModel || allModels.includes(currentModel)) {
            modelInput.value = preset.model;
          }
        }

        // 自动保存
        this.saveSettings(false);
      });
    }

    // 自动保存设置（当 Key、URL、模型改变或停止输入时自动触发保存）
    const autoSaveElements = document.querySelectorAll(
      '#text-model-type, #text-api-url, #text-api-key, #text-model, ' +
      '#image-model-type, #image-api-url, #image-api-key, #image-model, #image-resolution, ' +
      '#window-resolution, #custom-width, #custom-height, #fullscreen-mode, ' +
      '#theme-mode, #dialogue-skin, #text-opacity'
    );

    let debounceTimer = null;
    const triggerAutoSaveDebounced = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        await this.saveSettings(false);
      }, 300);
    };

    autoSaveElements.forEach(element => {
      element.addEventListener('change', async () => {
        await this.saveSettings(false);
      });
      element.addEventListener('blur', async () => {
        await this.saveSettings(false);
      });
      if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'password' || element.type === 'url')) {
        element.addEventListener('input', triggerAutoSaveDebounced);
      }
    });

    // 取消设置
    const cancelBtn = document.getElementById('cancel-settings');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancelSettings());
    }

    // 重置设置
    const resetBtn = document.getElementById('reset-settings');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetSettings());
    }

    // 测试API
    const testTextBtn = document.getElementById('test-text-api');
    if (testTextBtn) {
      testTextBtn.addEventListener('click', () => this.testTextAPI());
    }

    const testImageBtn = document.getElementById('test-image-api');
    if (testImageBtn) {
      testImageBtn.addEventListener('click', () => this.testImageAPI());
    }

    // 窗口分辨率变化
    const resolutionSelect = document.getElementById('window-resolution');
    if (resolutionSelect) {
      resolutionSelect.addEventListener('change', (e) => {
        const customDiv = document.getElementById('custom-resolution');
        if (e.target.value === 'custom') {
          customDiv.classList.remove('hidden');
        } else {
          customDiv.classList.add('hidden');
        }
      });
    }

    // 全屏模式实时切换
    const fullscreenCheckbox = document.getElementById('fullscreen-mode');
    if (fullscreenCheckbox) {
      fullscreenCheckbox.addEventListener('change', async (e) => {
        try {
          await window.electronAPI.window.setFullscreen(e.target.checked);
          console.log('全屏模式已', e.target.checked ? '启用' : '禁用');
          
          // 控制标题栏显示/隐藏
          const titlebar = document.querySelector('.titlebar');
          if (titlebar) {
            if (e.target.checked) {
              titlebar.style.display = 'none'; // 全屏时隐藏
            } else {
              titlebar.style.display = 'flex'; // 非全屏时显示
            }
            console.log('标题栏已', e.target.checked ? '隐藏' : '显示');
          }
        } catch (error) {
          console.error('切换全屏模式失败:', error);
          // 失败时恢复原状态
          e.target.checked = !e.target.checked;
        }
      });
    }

    // 透明度滑块
    const opacitySlider = document.getElementById('text-opacity');
    const opacityValue = document.getElementById('opacity-value');
    if (opacitySlider && opacityValue) {
      opacitySlider.addEventListener('input', (e) => {
        opacityValue.textContent = e.target.value + '%';
      });
    }

    // 主题颜色选择
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
      option.addEventListener('click', () => {
        // 移除其他选中状态
        colorOptions.forEach(o => o.classList.remove('selected'));
        // 添加当前选中状态
        option.classList.add('selected');
        // 立即应用主题色
        const color = option.dataset.color;
        this.applyThemeColor(color);
        // 广播到主窗口实时预览
        if (window.electronAPI && window.electronAPI.theme) {
          window.electronAPI.theme.update({ color });
        }
      });
    });

    // 主题模式即时预览
    const themeModeSelect = document.getElementById('theme-mode');
    if (themeModeSelect) {
      themeModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        this.applyThemeMode(mode);
        if (window.electronAPI && window.electronAPI.theme) {
          window.electronAPI.theme.update({ mode });
        }
      });
    }

    // 数据位置更改
    const changeLocationBtn = document.getElementById('change-data-location');
    if (changeLocationBtn) {
      changeLocationBtn.addEventListener('click', () => this.changeDataLocation());
    }

    // 数据管理
    const backupBtn = document.getElementById('backup-data');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => this.backupData());
    }

    const restoreBtn = document.getElementById('restore-data');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => this.restoreData());
    }

    // 背景渐变控制
    const gradientStart = document.getElementById('gradient-start');
    const gradientEnd = document.getElementById('gradient-end');
    const gradientDirection = document.getElementById('gradient-direction');
    
    if (gradientStart) {
      gradientStart.addEventListener('input', () => this.updateGradientPreview());
    }
    if (gradientEnd) {
      gradientEnd.addEventListener('input', () => this.updateGradientPreview());
    }
    if (gradientDirection) {
      gradientDirection.addEventListener('change', () => this.updateGradientPreview());
    }

    // 快捷渐变选择
    const gradientPresets = document.querySelectorAll('.gradient-preset');
    gradientPresets.forEach(preset => {
      preset.addEventListener('click', () => {
        const startColor = preset.dataset.start;
        const endColor = preset.dataset.end;
        if (gradientStart) gradientStart.value = startColor;
        if (gradientEnd) gradientEnd.value = endColor;
        this.updateGradientPreview();
      });
    });

    // 主页背景设置
    const homepageBgEnabled = document.getElementById('homepage-bg-enabled');
    const homepageBgSettings = document.getElementById('homepage-bg-settings');
    const homepageBgOpacity = document.getElementById('homepage-bg-opacity');
    const homepageBgOpacityValue = document.getElementById('homepage-bg-opacity-value');
    const homepageBgBlur = document.getElementById('homepage-bg-blur');
    const homepageBgBlurValue = document.getElementById('homepage-bg-blur-value');
    const generateHomepageBg = document.getElementById('generate-homepage-bg');
    const uploadHomepageBg = document.getElementById('upload-homepage-bg');
    const removeHomepageBg = document.getElementById('remove-homepage-bg');

    if (homepageBgEnabled) {
      homepageBgEnabled.addEventListener('change', (e) => {
        if (homepageBgSettings) {
          homepageBgSettings.classList.toggle('hidden', !e.target.checked);
        }
        this.updateHomepageBackground();
      });
    }

    if (homepageBgOpacity && homepageBgOpacityValue) {
      homepageBgOpacity.addEventListener('input', (e) => {
        homepageBgOpacityValue.textContent = e.target.value + '%';
        this.updateHomepageBackground();
      });
    }

    if (homepageBgBlur && homepageBgBlurValue) {
      homepageBgBlur.addEventListener('input', (e) => {
        homepageBgBlurValue.textContent = e.target.value + 'px';
        this.updateHomepageBackground();
      });
    }

    if (generateHomepageBg) {
      generateHomepageBg.addEventListener('click', () => this.generateHomepageBackground());
    }

    if (uploadHomepageBg) {
      uploadHomepageBg.addEventListener('click', () => this.uploadHomepageBackground());
    }

    if (removeHomepageBg) {
      removeHomepageBg.addEventListener('click', () => this.removeHomepageBackground());
    }
  }

  /**
   * 设置标签切换
   */
  setupTabs() {
    const navLinks = document.querySelectorAll('.nav-link');
    const panels = document.querySelectorAll('.settings-panel');

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        
        const targetTab = link.getAttribute('data-tab');
        
        // 更新导航状态
        navLinks.forEach(nav => nav.classList.remove('active'));
        link.classList.add('active');

        // 更新面板状态
        panels.forEach(panel => panel.classList.remove('active'));
        const targetPanel = document.getElementById(targetTab);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  /**
   * 填充设置表单
   */
  populateSettings() {
    // AI配置
    this.setFormValue('text-model-type', this.settings.textModelType);
    this.setFormValue('text-api-url', this.settings.textApiUrl);
    this.setFormValue('text-api-key', this.settings.textApiKey);
    this.setFormValue('text-model', this.settings.textModel);
    
    this.setFormValue('image-model-type', this.settings.imageModelType);
    this.setFormValue('image-api-url', this.settings.imageApiUrl);
    this.setFormValue('image-api-key', this.settings.imageApiKey);
    this.setFormValue('image-model', this.settings.imageModel);
    this.setFormValue('image-resolution', this.settings.imageResolution);

    // 显示设置
    this.setFormValue('window-resolution', this.settings.windowResolution);
    this.setFormValue('custom-width', this.settings.customWidth);
    this.setFormValue('custom-height', this.settings.customHeight);
    this.setCheckboxValue('fullscreen-mode', this.settings.fullscreenMode);
    this.setFormValue('theme-mode', this.settings.themeMode);
    this.setFormValue('text-opacity', this.settings.textOpacity);
    this.setFormValue('dialogue-skin', this.settings.dialogueSkin || 'default');

    // 渐变背景设置
    if (this.settings.backgroundGradient) {
      this.setFormValue('gradient-start', this.settings.backgroundGradient.startColor);
      this.setFormValue('gradient-end', this.settings.backgroundGradient.endColor);
      this.setFormValue('gradient-direction', this.settings.backgroundGradient.direction);
    }

    // 主页背景设置
    if (this.settings.homepageBackground) {
      this.setCheckboxValue('homepage-bg-enabled', this.settings.homepageBackground.enabled);
      this.setFormValue('homepage-bg-opacity', this.settings.homepageBackground.opacity);
      this.setFormValue('homepage-bg-blur', this.settings.homepageBackground.blur);
      this.setFormValue('homepage-bg-prompt', this.settings.homepageBackground.prompt);
      
      // 更新显示值
      const opacityValue = document.getElementById('homepage-bg-opacity-value');
      if (opacityValue) {
        opacityValue.textContent = this.settings.homepageBackground.opacity + '%';
      }
      
      const blurValue = document.getElementById('homepage-bg-blur-value');
      if (blurValue) {
        blurValue.textContent = this.settings.homepageBackground.blur + 'px';
      }
      
      // 显示/隐藏设置区域
      const homepageBgSettings = document.getElementById('homepage-bg-settings');
      if (homepageBgSettings) {
        homepageBgSettings.classList.toggle('hidden', !this.settings.homepageBackground.enabled);
      }
    }

    // 数据位置
    this.setFormValue('data-location', this.settings.dataLocation);

    // 设置主题颜色选择器
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
      option.classList.remove('selected');
      if (option.dataset.color === this.settings.themeColor) {
        option.classList.add('selected');
      }
    });

    // 更新渐变预览
    if (this.updateGradientPreview) {
      this.updateGradientPreview();
    }

    // 更新透明度显示
    const opacityValue = document.getElementById('opacity-value');
    if (opacityValue) {
      opacityValue.textContent = (this.settings.textOpacity || 90) + '%';
    }

    // 自定义分辨率显示控制
    const customDiv = document.getElementById('custom-resolution');
    if (this.settings.windowResolution === 'custom') {
      customDiv.classList.remove('hidden');
    } else {
      customDiv.classList.add('hidden');
    }
  }

  /**
   * 设置表单值
   */
  setFormValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      if (value !== undefined && value !== null) {
        element.value = value;
      }
    }
  }

  /**
   * 设置复选框值
   */
  setCheckboxValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
      if (typeof value === 'boolean') {
        element.checked = value;
      }
    }
  }

  /**
   * 获取表单值
   */
  getFormValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
  }

  /**
   * 获取复选框值
   */
  getCheckboxValue(id) {
    const element = document.getElementById(id);
    return element ? element.checked : false;
  }

  /**
   * 收集设置数据
   */
  collectSettings() {
    // 采集前把界面里可能的 'undefined' 字符串清洗为 ''
    const cs = {
      // AI配置
      textModelType: this.getFormValue('text-model-type'),
      textApiUrl: this.getFormValue('text-api-url'),
      textApiKey: this.getFormValue('text-api-key'),
      textModel: this.getFormValue('text-model'),
      
      imageModelType: this.getFormValue('image-model-type'),
      imageApiUrl: this.getFormValue('image-api-url'),
      imageApiKey: this.getFormValue('image-api-key'),
      imageModel: this.getFormValue('image-model'),
      imageResolution: this.getFormValue('image-resolution'),
      
      // 显示设置
      windowResolution: this.getFormValue('window-resolution'),
      customWidth: parseInt(this.getFormValue('custom-width')) || 1280,
      customHeight: parseInt(this.getFormValue('custom-height')) || 720,
      fullscreenMode: this.getCheckboxValue('fullscreen-mode'),
      textSize: this.getFormValue('text-size'),
      textOpacity: parseInt(this.getFormValue('text-opacity')) || 85,
      smoothAnimations: this.getCheckboxValue('smooth-animations'),
  dialogueSkin: this.getFormValue('dialogue-skin') || 'default',
  uiMode: this.getFormValue('ui-mode') || 'standard',
      
      // 主页背景设置
      homepageBackground: {
        enabled: this.getCheckboxValue('homepage-bg-enabled'),
        opacity: parseInt(this.getFormValue('homepage-bg-opacity')) || 80,
        blur: parseInt(this.getFormValue('homepage-bg-blur')) || 0,
        prompt: this.getFormValue('homepage-bg-prompt') || ''
      },
      
      // 通用设置
      autoSave: this.getCheckboxValue('auto-save'),
      autoSaveInterval: parseInt(this.getFormValue('auto-save-interval')) || 5,
      confirmChoices: this.getCheckboxValue('confirm-choices'),
      dataLocation: this.settings.dataLocation // 保持原有的数据位置
    };
    return this.sanitizeSettings({ ...this.settings, ...cs });
  }

  /**
   * 保存设置
   * @param {boolean} forceClose - 是否强制关闭窗口（手动保存时为true，自动保存时为false）
   */
  async saveSettings(forceClose = false) {
    if (this.isLoading) return;

    try {
      this.isLoading = true;
      const saveBtn = document.getElementById('save-settings');
      if (saveBtn) {
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;
      }

      // 收集设置数据
      const newSettings = this.collectSettings();
      console.log('[SettingsManager] 保存应用设置:', {
        textModelType: newSettings.textModelType,
        textApiUrl: newSettings.textApiUrl,
        textModel: newSettings.textModel,
        hasTextApiKey: !!(newSettings.textApiKey && newSettings.textApiKey.trim()),
        imageModelType: newSettings.imageModelType,
        imageApiUrl: newSettings.imageApiUrl,
        imageModel: newSettings.imageModel,
        hasImageApiKey: !!(newSettings.imageApiKey && newSettings.imageApiKey.trim())
      });

      // 获取当前设置以比较变化
      let currentSettings = {};
      try {
        if (window.electronAPI && window.electronAPI.storage) {
          currentSettings = await window.electronAPI.storage.get('appSettings') || {};
        } else {
          currentSettings = JSON.parse(localStorage.getItem('artimeow-settings') || '{}');
        }
      } catch (e) {
        currentSettings = {};
      }

      // 检查是否有窗口/分辨率/全屏相关设置变化
      const windowSettingsChanged = (
        newSettings.fullscreenMode !== currentSettings.fullscreenMode ||
        newSettings.windowResolution !== currentSettings.windowResolution ||
        newSettings.customWidth !== currentSettings.customWidth ||
        newSettings.customHeight !== currentSettings.customHeight
      );

      // 验证设置
      const validation = this.validateSettings(newSettings);
      if (!validation.valid) {
        Utils.showNotification(`设置验证失败: ${validation.errors.join(', ')}`, 'error');
        return;
      }

      // 使用与loadSettings相同的存储策略
      // 优先保存到 Electron 存储
      if (window.electronAPI && window.electronAPI.storage) {
        try {
          await window.electronAPI.storage.set('appSettings', newSettings);
        } catch (e) {
          console.warn('保存设置到Electron存储失败，回退localStorage:', e);
          // 如果Electron存储失败，回退到localStorage
          localStorage.setItem('artimeow-settings', JSON.stringify(newSettings));
        }
      } else {
        // 没有Electron API时直接使用localStorage
        localStorage.setItem('artimeow-settings', JSON.stringify(newSettings));
      }
      
      // 兼容旧键（保持向后兼容）
      try {
        localStorage.setItem('appSettings', JSON.stringify(newSettings));
      } catch (e) {
        console.warn('保存兼容性设置失败:', e);
      }
      
      this.settings = newSettings;

      // 应用设置到AI服务
      if (window.aiService) {
        await window.aiService.saveSettings(newSettings);
      }

      // 应用窗口设置
      await this.applyWindowSettings(newSettings);

  // 应用对话皮肤（以 body class 切换）
  this.applyDialogueSkin(newSettings.dialogueSkin);
  this.applyUiMode(newSettings.uiMode);

      Utils.showNotification('设置保存成功！', 'success');

      // 手动保存时总是关闭窗口，自动保存时只有窗口设置变化才关闭
      if (forceClose || windowSettingsChanged) {
        setTimeout(() => {
          window.close();
        }, 1000);
      }

    } catch (error) {
      console.error('保存设置失败:', error);
      Utils.showNotification('保存设置失败', 'error');
    } finally {
      this.isLoading = false;
      const saveBtn = document.getElementById('save-settings');
      if (saveBtn) {
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
      }
    }
  }

  /**
   * 取消设置
   */
  cancelSettings() {
    window.close();
  }

  /**
   * 重置设置
   */
  resetSettings() {
    const confirmed = confirm('确定要重置所有设置为默认值吗？这个操作无法撤销。');
    if (confirmed) {
      this.settings = this.getDefaultSettings();
      this.populateSettings();
      Utils.showNotification('设置已重置为默认值', 'info');
    }
  }

  /**
   * 验证设置
   */
  validateSettings(settings) {
    const errors = [];

    // 验证URL格式
    if (settings.textApiUrl && !Utils.isValidURL(settings.textApiUrl)) {
      errors.push('文本API URL格式无效');
    }

    if (settings.imageApiUrl && !Utils.isValidURL(settings.imageApiUrl)) {
      errors.push('图像API URL格式无效');
    }

    // 验证数值范围
    if (settings.customWidth < 800 || settings.customWidth > 4000) {
      errors.push('自定义宽度应在800-4000之间');
    }

    if (settings.customHeight < 600 || settings.customHeight > 3000) {
      errors.push('自定义高度应在600-3000之间');
    }

    if (settings.textOpacity < 50 || settings.textOpacity > 95) {
      errors.push('文本透明度应在50-95之间');
    }

    if (settings.autoSaveInterval < 1 || settings.autoSaveInterval > 60) {
      errors.push('自动保存间隔应在1-60分钟之间');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 应用窗口设置
   */
  async applyWindowSettings(settings) {
    try {
      // 应用全屏模式
      await window.electronAPI.window.setFullscreen(settings.fullscreenMode);

      // 如果不是全屏模式，应用窗口大小
      if (!settings.fullscreenMode && settings.windowResolution !== 'auto') {
        let width, height;

        if (settings.windowResolution === 'custom') {
          width = settings.customWidth;
          height = settings.customHeight;
        } else {
          [width, height] = settings.windowResolution.split('x').map(n => parseInt(n));
        }

        // 设置窗口大小
        const result = await window.electronAPI.window.setSize(width, height);
        console.log('窗口大小已设置:', result);
      }

    } catch (error) {
      console.warn('应用窗口设置失败:', error);
    }
  }

  /**
   * 测试文本API
   */
  async testTextAPI() {
    const testBtn = document.getElementById('test-text-api');
    if (!testBtn) return;

    try {
      testBtn.classList.add('loading');
      testBtn.disabled = true;

      // 临时应用当前设置
      const currentSettings = this.collectSettings();
      if (window.aiService) {
        await window.aiService.saveSettings(currentSettings);
        const result = await window.aiService.testTextAPI();
        this.showTestResult('text', result);
      } else {
        this.showTestResult('text', {
          success: false,
          message: 'AI服务未初始化',
          error: 'AI服务未初始化'
        });
      }

    } catch (error) {
      this.showTestResult('text', {
        success: false,
        message: `测试失败: ${error.message}`,
        error: error.message
      });
    } finally {
      testBtn.classList.remove('loading');
      testBtn.disabled = false;
    }
  }

  /**
   * 测试图像API
   */
  async testImageAPI() {
    const testBtn = document.getElementById('test-image-api');
    if (!testBtn) return;

    try {
      testBtn.classList.add('loading');
      testBtn.disabled = true;

      // 临时应用当前设置
      const currentSettings = this.collectSettings();
      if (window.aiService) {
        await window.aiService.saveSettings(currentSettings);
        const result = await window.aiService.testImageAPI();
        this.showTestResult('image', result);
      } else {
        this.showTestResult('image', {
          success: false,
          message: 'AI服务未初始化',
          error: 'AI服务未初始化'
        });
      }

    } catch (error) {
      this.showTestResult('image', {
        success: false,
        message: `测试失败: ${error.message}`,
        error: error.message
      });
    } finally {
      testBtn.classList.remove('loading');
      testBtn.disabled = false;
    }
  }

  /**
   * 显示测试结果
   */
  showTestResult(type, result) {
    const modal = Utils.createModal('test-modal');
    const title = document.getElementById('test-modal-title');
    const content = document.getElementById('test-result');

    if (title) {
      title.textContent = `${type === 'text' ? '文本' : '图像'} API 测试结果`;
    }

    if (content) {
      content.className = `test-result ${result.success ? 'success' : 'error'}`;
      
      const formattedMsg = (result.message || '').replace(/\n/g, '<br>');
      let html = `<div style="font-size: 15px; line-height: 1.6; margin-bottom: 12px;"><strong>${formattedMsg}</strong></div>`;
      
      if (result.response) {
        const respText = typeof result.response === 'string' ? result.response : JSON.stringify(result.response, null, 2);
        html += `<div style="margin-top: 10px;"><strong>真实返回的测试数据：</strong><pre style="background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto;">${respText}</pre></div>`;
      }
      
      if (result.imageUrl) {
        html += `<div style="margin-top: 10px;"><strong>真实返回的图像地址：</strong><div style="font-size: 12px; word-break: break-all; margin-bottom: 8px;"><a href="${result.imageUrl}" target="_blank">${result.imageUrl}</a></div><img src="${result.imageUrl}" alt="测试图像" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);"></div>`;
      }
      
      if (result.error && result.error !== result.message) {
        html += `<div style="margin-top: 10px; color: #888; font-size: 12px;"><strong>错误堆栈详情：</strong><pre style="background: rgba(0,0,0,0.03); padding: 8px; border-radius: 4px; font-size: 11px; white-space: pre-wrap; word-break: break-all;">${result.error}</pre></div>`;
      }

      content.innerHTML = html;
    }

    modal.show();
  }

  /**
   * 更改数据位置
   */
  async changeDataLocation() {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: '选择数据存储位置',
        properties: ['openDirectory', 'createDirectory']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const newLocation = result.filePaths[0];
        
        const confirmed = confirm(`确定要将数据位置更改为：${newLocation}？\n\n现有数据需要手动迁移。`);
        if (confirmed) {
          this.settings.dataLocation = newLocation;
          this.setFormValue('data-location', newLocation);
          Utils.showNotification('数据位置已更新，请保存设置', 'info');
        }
      }

    } catch (error) {
      console.error('更改数据位置失败:', error);
      Utils.showNotification('更改数据位置失败', 'error');
    }
  }

  /**
   * 备份数据
   */
  async backupData() {
    try {
      const result = await window.electronAPI.showSaveDialog({
        title: '备份数据',
        defaultPath: `ArtiMeow-Backup-${new Date().toISOString().split('T')[0]}.zip`,
        filters: [
          { name: 'ZIP文件', extensions: ['zip'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        const backupBtn = document.getElementById('backup-data');
        if (backupBtn) {
          backupBtn.disabled = true;
          backupBtn.textContent = '备份中...';
        }

        try {
          this.showNotification('开始备份数据...', 'info');
          
          const backupResult = await window.electronAPI.zip.backupData(result.filePath);
          
          if (backupResult.success) {
            this.showNotification('数据备份完成！', 'success');
          } else {
            this.showNotification(`备份失败: ${backupResult.message}`, 'error');
          }
        } finally {
          if (backupBtn) {
            backupBtn.disabled = false;
            backupBtn.textContent = '备份数据';
          }
        }
      }

    } catch (error) {
      console.error('备份数据失败:', error);
      this.showNotification('备份数据失败', 'error');
    }
  }

  /**
   * 恢复数据
   */
  async restoreData() {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: '恢复数据',
        filters: [
          { name: 'ZIP文件', extensions: ['zip'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const confirmed = confirm('恢复数据将覆盖现有数据，确定要继续吗？\n\n建议在恢复前先备份当前数据。');
        if (confirmed) {
          const restoreBtn = document.getElementById('restore-data');
          if (restoreBtn) {
            restoreBtn.disabled = true;
            restoreBtn.textContent = '恢复中...';
          }

          try {
            this.showNotification('开始恢复数据...', 'info');
            
            const restoreResult = await window.electronAPI.zip.restoreData(result.filePaths[0]);
            
            if (restoreResult.success) {
              this.showNotification('数据恢复完成！请重启应用以生效。', 'success');
            } else {
              this.showNotification(`恢复失败: ${restoreResult.message}`, 'error');
            }
          } finally {
            if (restoreBtn) {
              restoreBtn.disabled = false;
              restoreBtn.textContent = '恢复数据';
            }
          }
        }
      }

    } catch (error) {
      console.error('恢复数据失败:', error);
      this.showNotification('恢复数据失败', 'error');
    }
  }

  /**
   * 应用主题颜色
   */
  applyThemeColor(colorName) {
    const colorMap = {
      purple: { primary: '#667eea', secondary: '#764ba2' },
      blue: { primary: '#4facfe', secondary: '#00f2fe' },
      green: { primary: '#43e97b', secondary: '#38f9d7' },
      orange: { primary: '#fa709a', secondary: '#fee140' },
      pink: { primary: '#a8edea', secondary: '#fed6e3' },
      red: { primary: '#ff9a9e', secondary: '#fecfef' }
    };

    const colors = colorMap[colorName] || colorMap.purple;
    const root = document.documentElement;
    
    root.style.setProperty('--primary-color', colors.primary);
    root.style.setProperty('--secondary-color', colors.secondary);
    root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`);
    root.style.setProperty('--gradient-accent', `linear-gradient(135deg, ${colors.secondary}, ${colors.primary})`);
  }

  /**
   * 应用主题模式
   */
  applyThemeMode(mode) {
    const body = document.body;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // 移除现有主题类
    body.classList.remove('theme-light', 'theme-dark');
    
    if (mode === 'light') {
      body.classList.add('theme-light');
    } else if (mode === 'dark') {
      body.classList.add('theme-dark');
    } else if (mode === 'system') {
      // 跟随系统
      body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
    }

    // 广播到主窗口实时预览
    if (window.electronAPI && window.electronAPI.theme) {
      window.electronAPI.theme.update({ mode });
    }
  }

  /** 应用对话皮肤：body上添加 skin-xxx 类 */
  applyDialogueSkin(skin) {
    const b = document.body;
    b.classList.remove('skin-paper','skin-neon','skin-cyber');
    if (skin === 'paper') b.classList.add('skin-paper');
    if (skin === 'neon') b.classList.add('skin-neon');
    if (skin === 'cyber') b.classList.add('skin-cyber');
  }

  applyTextSize(size) {
    const b = document.body;
    b.classList.remove('text-small', 'text-medium', 'text-large');
    if (size === 'small') b.classList.add('text-small');
    else if (size === 'large') b.classList.add('text-large');
    else b.classList.add('text-medium'); // 默认
  }

  applyTextOpacity(opacity) {
    document.documentElement.style.setProperty('--text-area-opacity', opacity / 100);
  }

  applySmoothAnimations(enabled) {
    const b = document.body;
    if (enabled) {
      b.classList.add('smooth-animations');
    } else {
      b.classList.remove('smooth-animations');
    }
  }

  applyUiMode(mode) {
    const b = document.body;
    b.classList.add('mode-game');
    // 可同步到主窗口预览
    if (window.electronAPI && window.electronAPI.theme) {
      window.electronAPI.theme.update({ uiMode: 'game' });
    }
  }

  /**
   * 加载版本信息
   */
  async loadVersionInfo() {
    try {
      const version = await window.electronAPI.getAppVersion();
      const versions = await window.electronAPI.getVersions();
      const appPath = await window.electronAPI.getAppPath();

      // 设置页面的版本信息
      const elements = {
        'settings-app-version': version,
        'settings-app-path': appPath,
        'settings-node-version': versions.node,
        'settings-electron-version': versions.electron,
        'settings-chrome-version': versions.chrome
      };

      Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
          element.textContent = value;
        }
      });

      // 加载依赖版本信息
      await this.loadDependencyVersions();

    } catch (error) {
      console.warn('加载版本信息失败:', error);
    }
  }

  /**
   * 加载依赖版本信息
   */
  async loadDependencyVersions() {
    try {
      if (window.electronAPI && window.electronAPI.getDependencyVersions) {
        const deps = await window.electronAPI.getDependencyVersions();
        
        // 更新依赖版本显示
        const depElements = {
          'dep-axios-version': deps.axios || '未安装',
          'dep-fs-extra-version': deps['fs-extra'] || '未安装',
          'dep-yauzl-version': deps.yauzl || '未安装',
          'dep-yazl-version': deps.yazl || '未安装',
          'dep-electron-version': deps.electron || '未安装',
          'dep-uuid-version': deps.uuid || '未安装'
        };

        Object.entries(depElements).forEach(([id, value]) => {
          const element = document.getElementById(id);
          if (element) {
            element.textContent = value;
          }
        });
      } else {
        // 如果API不可用，显示默认值
        const fallbackDeps = {
          'dep-axios-version': '^1.11.0',
          'dep-fs-extra-version': '^11.3.1',
          'dep-yauzl-version': '^3.2.0',
          'dep-yazl-version': '^3.3.1',
          'dep-electron-version': '^38.0.0',
          'dep-uuid-version': '^10.0.0'
        };

        Object.entries(fallbackDeps).forEach(([id, value]) => {
          const element = document.getElementById(id);
          if (element) {
            element.textContent = value;
          }
        });
      }
    } catch (error) {
      console.warn('加载依赖版本失败:', error);
      // 设置错误提示
      const depIds = ['dep-axios-version', 'dep-fs-extra-version', 'dep-yauzl-version', 'dep-yazl-version', 'dep-electron-version', 'dep-uuid-version'];
      depIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.textContent = '获取失败';
        }
      });
    }
  }

  /**
   * 更新渐变预览
   */
  updateGradientPreview() {
    const preview = document.getElementById('gradient-preview');
    const startColor = document.getElementById('gradient-start')?.value || '#667eea';
    const endColor = document.getElementById('gradient-end')?.value || '#764ba2';
    const direction = document.getElementById('gradient-direction')?.value || '135deg';

    if (preview) {
      const gradient = `linear-gradient(${direction}, ${startColor}, ${endColor})`;
      preview.style.background = gradient;

      // 实时应用到页面背景
      const root = document.documentElement;
      root.style.setProperty('--gradient-primary', gradient);
      root.style.setProperty('--gradient-accent', `linear-gradient(${direction}, ${endColor}, ${startColor})`);
      
      // 广播到主窗口
      if (window.electronAPI && window.electronAPI.theme) {
        window.electronAPI.theme.update({ 
          backgroundGradient: gradient 
        });
      }
    }
  }

  /**
   * 收集所有设置
   */
  collectSettings() {
    return {
      // AI设置
      textModelType: document.getElementById('text-model-type')?.value || 'openai',
      textApiUrl: document.getElementById('text-api-url')?.value || 'https://api.openai.com/v1',
      textApiKey: document.getElementById('text-api-key')?.value || '',
      textModel: document.getElementById('text-model')?.value || 'gpt-4o-mini',
      
      imageModelType: document.getElementById('image-model-type')?.value || 'openai',
      imageApiUrl: document.getElementById('image-api-url')?.value || 'https://api.openai.com/v1',
      imageApiKey: document.getElementById('image-api-key')?.value || '',
      imageModel: document.getElementById('image-model')?.value || 'dall-e-3',
      imageResolution: document.getElementById('image-resolution')?.value || '1024x1024',
      
      // 显示设置
      windowResolution: document.getElementById('window-resolution')?.value || '1280x720',
      customWidth: parseInt(document.getElementById('custom-width')?.value) || 1280,
      customHeight: parseInt(document.getElementById('custom-height')?.value) || 720,
      fullscreenMode: document.getElementById('fullscreen-mode')?.checked || false,
      
      // 主题设置
      themeMode: document.getElementById('theme-mode')?.value || 'system',
      backgroundGradient: {
        startColor: document.getElementById('gradient-start')?.value || '#667eea',
        endColor: document.getElementById('gradient-end')?.value || '#764ba2',
        direction: document.getElementById('gradient-direction')?.value || '135deg'
      },
      
      // 对话设置
      dialogueSkin: document.getElementById('dialogue-skin')?.value || 'default',
      textOpacity: parseInt(document.getElementById('text-opacity')?.value) || 90,
      
      // 数据管理设置
      dataLocation: document.getElementById('data-location')?.value || ''
    };
  }

  /**
   * 应用设置到界面
   */
  async applySettings(settings = null) {
    if (!settings) {
      settings = await this.loadSettings();
    }
    // 先写入实例，避免后续读取 undefined
    this.settings = settings;

    // 应用AI设置
    if (settings.textModelType) {
      const textModelTypeSelect = document.getElementById('text-model-type');
      if (textModelTypeSelect) textModelTypeSelect.value = settings.textModelType;
    }

    if (settings.textApiUrl) {
      const textApiUrlInput = document.getElementById('text-api-url');
      if (textApiUrlInput) textApiUrlInput.value = settings.textApiUrl;
    }

    if (settings.textApiKey) {
      const textApiKeyInput = document.getElementById('text-api-key');
      if (textApiKeyInput) textApiKeyInput.value = settings.textApiKey;
    }

    if (settings.textModel) {
      const textModelInput = document.getElementById('text-model');
      if (textModelInput) textModelInput.value = settings.textModel;
    }

    if (settings.imageModelType) {
      const imageModelTypeSelect = document.getElementById('image-model-type');
      if (imageModelTypeSelect) imageModelTypeSelect.value = settings.imageModelType;
    }

    if (settings.imageApiUrl) {
      const imageApiUrlInput = document.getElementById('image-api-url');
      if (imageApiUrlInput) imageApiUrlInput.value = settings.imageApiUrl;
    }

    if (settings.imageApiKey) {
      const imageApiKeyInput = document.getElementById('image-api-key');
      if (imageApiKeyInput) imageApiKeyInput.value = settings.imageApiKey;
    }

    if (settings.imageModel) {
      const imageModelInput = document.getElementById('image-model');
      if (imageModelInput) imageModelInput.value = settings.imageModel;
    }

    if (settings.imageResolution) {
      const imageResolutionSelect = document.getElementById('image-resolution');
      if (imageResolutionSelect) imageResolutionSelect.value = settings.imageResolution;
    }

    // 应用显示设置
    if (settings.windowResolution) {
      const windowResolutionSelect = document.getElementById('window-resolution');
      if (windowResolutionSelect) windowResolutionSelect.value = settings.windowResolution;
    }

    if (settings.customWidth) {
      const customWidthInput = document.getElementById('custom-width');
      if (customWidthInput) customWidthInput.value = settings.customWidth;
    }

    if (settings.customHeight) {
      const customHeightInput = document.getElementById('custom-height');
      if (customHeightInput) customHeightInput.value = settings.customHeight;
    }

    if (settings.fullscreenMode !== undefined) {
      const fullscreenCheckbox = document.getElementById('fullscreen-mode');
      if (fullscreenCheckbox) fullscreenCheckbox.checked = settings.fullscreenMode;
    }

    // 应用主题设置
    if (settings.themeMode) {
      const themeModeSelect = document.getElementById('theme-mode');
      if (themeModeSelect) themeModeSelect.value = settings.themeMode;
    }

    // 应用渐变背景设置
    if (settings.backgroundGradient) {
      const { startColor, endColor, direction } = settings.backgroundGradient;
      
      const startPicker = document.getElementById('gradient-start');
      const endPicker = document.getElementById('gradient-end');
      const directionSelect = document.getElementById('gradient-direction');
      
      if (startPicker) startPicker.value = startColor;
      if (endPicker) endPicker.value = endColor;
      if (directionSelect) directionSelect.value = direction;
      
  this.updateGradientPreview();
    }

    // 应用对话设置
    if (settings.dialogueSkin) {
      const dialogueSkinSelect = document.getElementById('dialogue-skin');
      if (dialogueSkinSelect) dialogueSkinSelect.value = settings.dialogueSkin;
      this.applyDialogueSkin(settings.dialogueSkin);
    }

    if (settings.textSize) {
      const textSizeSelect = document.getElementById('text-size');
      if (textSizeSelect) textSizeSelect.value = settings.textSize;
      this.applyTextSize(settings.textSize);
    }

    if (settings.textOpacity !== undefined) {
      const textOpacitySlider = document.getElementById('text-opacity');
      const opacityValue = document.getElementById('opacity-value');
      if (textOpacitySlider) textOpacitySlider.value = settings.textOpacity;
      if (opacityValue) opacityValue.textContent = settings.textOpacity + '%';
      this.applyTextOpacity(settings.textOpacity);
    }

    if (settings.smoothAnimations !== undefined) {
      const smoothAnimationsCheck = document.getElementById('smooth-animations');
      if (smoothAnimationsCheck) smoothAnimationsCheck.checked = settings.smoothAnimations;
      this.applySmoothAnimations(settings.smoothAnimations);
    }

    // 应用数据管理设置
    if (settings.dataLocation) {
      const dataLocationInput = document.getElementById('data-location');
      if (dataLocationInput) dataLocationInput.value = settings.dataLocation;
    }
  }

  

  /**
   * 保存设置
   * @param {boolean} forceClose - 是否强制关闭窗口（手动保存时为true，自动保存时为false）
   */
  async saveSettings(forceClose = false) {
    try {
      const newSettings = this.collectSettings();
      
      // 获取当前设置以比较变化
      let currentSettings = {};
      try {
        if (window.electronAPI && window.electronAPI.storage) {
          currentSettings = await window.electronAPI.storage.get('appSettings') || {};
        } else {
          currentSettings = JSON.parse(localStorage.getItem('artimeow-settings') || '{}');
        }
      } catch (e) {
        currentSettings = {};
      }
      
      // 检查是否有窗口/分辨率/全屏相关设置变化
      const windowSettingsChanged = (
        newSettings.fullscreenMode !== currentSettings.fullscreenMode ||
        newSettings.windowResolution !== currentSettings.windowResolution ||
        newSettings.customWidth !== currentSettings.customWidth ||
        newSettings.customHeight !== currentSettings.customHeight
      );
      
      // 写入 Electron 存储（优先）
      if (window.electronAPI && window.electronAPI.storage) {
        await window.electronAPI.storage.set('appSettings', newSettings);
      }
      // 同步写入 localStorage 以支持 storage 事件与向后兼容
      localStorage.setItem('artimeow-settings', JSON.stringify(newSettings));

      // 应用窗口设置到当前窗口
      await this.applyWindowSettings(newSettings);

      // 显示保存成功提示
      this.showNotification('设置已保存', 'success');
      
      // 手动保存时总是关闭窗口，自动保存时只有窗口设置变化才关闭
      if (forceClose || windowSettingsChanged) {
        setTimeout(() => window.close(), 400);
      }
      
      return newSettings;
    } catch (error) {
      console.error('保存设置失败:', error);
      this.showNotification('保存设置失败', 'error');
      throw error;
    }
  }

  /**
   * 获取默认设置
   */
  getDefaultSettings() {
    return {
      // AI设置
      textModelType: 'openai',
      textApiUrl: 'https://api.openai.com/v1',
      textApiKey: '',
      textModel: 'gpt-4o-mini',
      
      imageModelType: 'openai',
      imageApiUrl: 'https://api.openai.com/v1',
      imageApiKey: '',
      imageModel: 'dall-e-3',
      imageResolution: '1024x1024',
      
      // 显示设置
      windowResolution: '1280x720',
      customWidth: 1280,
      customHeight: 720,
      fullscreenMode: false,
      
      // 主题设置
      themeMode: 'system',
      backgroundGradient: {
        // 柔雾粉：#fce1ec → #f7b1c3
        startColor: '#fce1ec',
        endColor:   '#f7b1c3',
        direction: '135deg'
      },
      
      // 对话设置
      dialogueSkin: 'default',
      textOpacity: 90,
      
      // 数据管理
      dataLocation: ''
    };
  }

  /**
   * 显示通知
   */
  showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 添加样式
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      color: var(--text-primary);
      font-size: 14px;
      min-width: 200px;
      animation: slideIn 0.3s ease-out;
    `;
    
    // 根据类型设置不同颜色
    if (type === 'success') {
      notification.style.borderColor = '#28a745';
      notification.style.color = '#28a745';
    } else if (type === 'error') {
      notification.style.borderColor = '#dc3545';
      notification.style.color = '#dc3545';
    }
    
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => {
          notification.remove();
        }, 300);
      }
    }, 3000);
  }

  /**
   * 应用渐变预设
   */
  applyGradientPreset(preset) {
    const presets = {
      'pink': { start: '#ff9a9e', end: '#fecfef', direction: '135deg' },
      'blue': { start: '#667eea', end: '#764ba2', direction: '135deg' },
      'purple': { start: '#8360c3', end: '#2ebf91', direction: '135deg' },
      'sunset': { start: '#fa709a', end: '#fee140', direction: '135deg' },
      'ocean': { start: '#2196f3', end: '#21cbf3', direction: '135deg' },
      'forest': { start: '#11998e', end: '#38ef7d', direction: '135deg' }
    };

    const config = presets[preset];
    if (config) {
      const startPicker = document.getElementById('gradient-start');
      const endPicker = document.getElementById('gradient-end');
      const directionSelect = document.getElementById('gradient-direction');
      
      if (startPicker) startPicker.value = config.start;
      if (endPicker) endPicker.value = config.end;
      if (directionSelect) directionSelect.value = config.direction;
      
      this.updateGradientPreview();
    }
  }

  /**
   * 取消设置更改
   */
  async cancelSettings() {
    // 取消即关闭设置窗口
    window.close();
  }

  /**
   * 重置设置到默认值
   */
  async resetSettings() {
    if (confirm('确定要重置所有设置到默认值吗？')) {
      const defaultSettings = this.getDefaultSettings();
      await this.applySettings(defaultSettings);
      this.showNotification('已重置为默认设置', 'success');
    }
  }

  /**
   * 应用主题颜色
   */
  applyThemeColor(color) {
    const root = document.documentElement;
    
    const colors = {
      blue: { primary: '#3b82f6', secondary: '#1e40af' },
      purple: { primary: '#8b5cf6', secondary: '#6d28d9' },
      green: { primary: '#10b981', secondary: '#047857' },
      pink: { primary: '#ec4899', secondary: '#be185d' },
      orange: { primary: '#f97316', secondary: '#ea580c' }
    };

    const colorConfig = colors[color];
    if (colorConfig) {
      root.style.setProperty('--accent-primary', colorConfig.primary);
      root.style.setProperty('--accent-secondary', colorConfig.secondary);
    }
  }

  /**
   * 应用主题模式
   */
  applyThemeMode(mode) {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
  }

  /**
   * 测试文本API
   */
  async testTextAPI() {
    this.showNotification('正在测试文本API...', 'info');
    // 这里可以添加实际的API测试逻辑
    setTimeout(() => {
      this.showNotification('文本API测试成功', 'success');
    }, 2000);
  }

  /**
   * 测试图像API
   */
  async testImageAPI() {
    this.showNotification('正在测试图像API...', 'info');
    // 这里可以添加实际的API测试逻辑
    setTimeout(() => {
      this.showNotification('图像API测试成功', 'success');
    }, 2000);
  }

  /**
   * 更改数据位置
   */
  async changeDataLocation() {
    this.showNotification('数据位置更改功能待实现', 'info');
  }

  /**
   * 备份数据
   */
  async backupData() {
    this.showNotification('正在备份数据...', 'info');
    // 这里可以添加实际的数据备份逻辑
    setTimeout(() => {
      this.showNotification('数据备份完成', 'success');
    }, 2000);
  }

  /**
   * 恢复数据
   */
  async restoreData() {
    this.showNotification('数据恢复功能待实现', 'info');
  }
}

// 关闭测试模态框
function closeTestModal() {
  const modal = Utils.createModal('test-modal');
  modal.hide();
}

// 打开GitHub仓库
function openGitHubRepo() {
  if (window.electronAPI && window.electronAPI.shell) {
    window.electronAPI.shell.openExternal('https://github.com/B5-Software/ArtiMeow-AIGalGamerRT');
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  window.settingsManager = new SettingsManager();
});

// 监听窗口关闭事件
window.addEventListener('beforeunload', (e) => {
  // 检查是否有未保存的更改
  if (window.settingsManager && window.settingsManager.hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '有未保存的更改，确定要关闭吗？';
    return e.returnValue;
  }
});

// 扩展SettingsManager的原型以添加主页背景方法
if (typeof SettingsManager !== 'undefined') {
  /**
   * 更新主页背景设置
   */
  SettingsManager.prototype.updateHomepageBackground = async function() {
    if (!window.backgroundManager) return;
    
    try {
      const enabled = this.getCheckboxValue('homepage-bg-enabled');
      const opacity = parseInt(this.getFormValue('homepage-bg-opacity')) || 80;
      const blur = parseInt(this.getFormValue('homepage-bg-blur')) || 0;
      
      await window.backgroundManager.updateSettings({
        enabled: enabled,
        opacity: opacity / 100, // 转换为0-1范围
        blur: blur
      });
    } catch (error) {
      console.error('更新主页背景设置失败:', error);
    }
  };

  /**
   * 生成主页背景
   */
  SettingsManager.prototype.generateHomepageBackground = async function() {
    if (!window.backgroundManager) {
      this.showNotification('背景管理器未加载', 'error');
      return;
    }

    const prompt = this.getFormValue('homepage-bg-prompt');
    if (!prompt || !prompt.trim()) {
      this.showNotification('请输入背景描述', 'warning');
      return;
    }

    const generateBtn = document.getElementById('generate-homepage-bg');
    if (!generateBtn) return;

    const originalText = generateBtn.innerHTML;
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

    try {
      await window.backgroundManager.generateBackground(prompt, (progress) => {
        if (progress && progress.stage) {
          generateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${progress.stage}`;
        }
      });

      this.showNotification('主页背景生成成功！', 'success');
      
      // 自动启用背景
      this.setCheckboxValue('homepage-bg-enabled', true);
      const homepageBgSettings = document.getElementById('homepage-bg-settings');
      if (homepageBgSettings) {
        homepageBgSettings.classList.remove('hidden');
      }

    } catch (error) {
      console.error('生成主页背景失败:', error);
      this.showNotification(`生成失败: ${error.message}`, 'error');
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = originalText;
    }
  };

  /**
   * 上传主页背景
   */
  SettingsManager.prototype.uploadHomepageBackground = async function() {
    if (!window.backgroundManager) {
      this.showNotification('背景管理器未加载', 'error');
      return;
    }

    try {
      // 使用Electron文件选择对话框
      if (window.electronAPI && window.electronAPI.dialog) {
        const result = await window.electronAPI.dialog.showOpenDialog({
          title: '选择背景图片',
          filters: [
            { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }
          ],
          properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
          const filePath = result.filePaths[0];
          await window.backgroundManager.setBackgroundFromFile(filePath);
          
          this.showNotification('主页背景设置成功！', 'success');
          
          // 自动启用背景
          this.setCheckboxValue('homepage-bg-enabled', true);
          const homepageBgSettings = document.getElementById('homepage-bg-settings');
          if (homepageBgSettings) {
            homepageBgSettings.classList.remove('hidden');
          }
        }
      } else {
        this.showNotification('文件选择功能不可用', 'error');
      }
    } catch (error) {
      console.error('上传主页背景失败:', error);
      this.showNotification(`上传失败: ${error.message}`, 'error');
    }
  };

  /**
   * 移除主页背景
   */
  SettingsManager.prototype.removeHomepageBackground = async function() {
    if (!window.backgroundManager) return;

    try {
      await window.backgroundManager.removeBackground();
      this.showNotification('主页背景已移除', 'success');
      
      // 自动禁用背景
      this.setCheckboxValue('homepage-bg-enabled', false);
      const homepageBgSettings = document.getElementById('homepage-bg-settings');
      if (homepageBgSettings) {
        homepageBgSettings.classList.add('hidden');
      }
    } catch (error) {
      console.error('移除主页背景失败:', error);
      this.showNotification('移除背景失败', 'error');
    }
  };
}
