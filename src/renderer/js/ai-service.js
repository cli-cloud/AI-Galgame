/**
 * AI服务管理器
 */

class AIService {
  constructor() {
    this.textConfig = null;
    this.imageConfig = null;
    this.isGenerating = false;
    this.loadSettings();

    // 监听应用设置广播更新
    if (window.electronAPI && window.electronAPI.storage && window.electronAPI.storage.onUpdate) {
      window.electronAPI.storage.onUpdate((settings) => {
        console.log('[AIService] 收到设置广播更新，重新同步配置:', settings);
        this.loadSettings();
      });
    }
  }

  /**
   * 加载AI配置
   */
  async loadSettings() {
    try {
      let settings;
      
      // 优先从 Electron 存储读取（与设置管理器保持一致）
      if (window.electronAPI && window.electronAPI.storage) {
        try {
          settings = await window.electronAPI.storage.get('appSettings');
        } catch (e) {
          console.warn('[AIService] 从Electron存储加载AI设置失败，回退localStorage:', e);
        }
      }
      
      // 回退 localStorage（新键artimeow-settings）
      if (!settings) {
        const stored = localStorage.getItem('artimeow-settings');
        settings = stored ? JSON.parse(stored) : null;
      }

      // 兼容旧键appSettings（迁移支持）
      if (!settings) {
        const legacy = localStorage.getItem('appSettings');
        settings = legacy ? JSON.parse(legacy) : {};
      }

      // 如果还是没有设置，使用空对象
      if (!settings) {
        settings = {};
      }
      
      this.textConfig = {
        type: settings.textModelType || 'openai',
        url: settings.textApiUrl || 'https://api.openai.com/v1',
        apiKey: settings.textApiKey || '',
        model: settings.textModel || 'gpt-4o-mini'
      };

      this.imageConfig = {
        type: settings.imageModelType || 'openai',
        url: settings.imageApiUrl || 'https://api.openai.com/v1',
        apiKey: settings.imageApiKey || '',
        model: settings.imageModel || 'dall-e-3',
        resolution: settings.imageResolution || '1024x1024'
      };

      console.log('[AIService] 加载AI配置成功:', {
        textConfig: {
          type: this.textConfig.type,
          url: this.textConfig.url,
          model: this.textConfig.model,
          hasApiKey: !!(this.textConfig.apiKey && this.textConfig.apiKey.trim())
        },
        imageConfig: {
          type: this.imageConfig.type,
          url: this.imageConfig.url,
          model: this.imageConfig.model,
          hasApiKey: !!(this.imageConfig.apiKey && this.imageConfig.apiKey.trim())
        },
        textConfigured: this.isConfigured(),
        imageConfigured: this.isImageConfigured()
      });
    } catch (error) {
      console.error('[AIService] 加载AI设置失败:', error);
    }
  }

  /**
   * 保存AI配置
   * @param {Object} settings - 设置对象
   */
  async saveSettings(settings) {
    try {
      // 使用与设置管理器相同的存储策略
      if (window.electronAPI && window.electronAPI.storage) {
        try {
          await window.electronAPI.storage.set('appSettings', settings);
        } catch (e) {
          console.warn('保存AI设置到Electron存储失败，回退localStorage:', e);
          // 如果Electron存储失败，回退到localStorage
          localStorage.setItem('artimeow-settings', JSON.stringify(settings));
        }
      } else {
        // 没有Electron API时直接使用localStorage
        localStorage.setItem('artimeow-settings', JSON.stringify(settings));
      }
      
      // 重新加载设置以确保同步
      await this.loadSettings();
    } catch (error) {
      console.error('保存AI设置失败:', error);
    }
  }

  /**
   * 拼接 API Endpoint，避免多余斜杠和末尾路径重复
   */
  buildEndpoint(baseUrl, defaultPath) {
    if (!baseUrl) return defaultPath;
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    if (cleanUrl.endsWith(defaultPath)) {
      return cleanUrl;
    }
    return `${cleanUrl}${defaultPath}`;
  }

  /**
   * 诊断 API 调用失败的精确原因
   */
  diagnoseApiError(error, url, model, type) {
    const message = error ? (error.message || String(error)) : '';
    const name = error ? error.name : '';

    // 1. 网络连接类错误判断
    if (
      name === 'TypeError' ||
      message.includes('Failed to fetch') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('ETIMEDOUT') ||
      message.includes('NetworkError')
    ) {
      return `❌ [网络连接故障] 无法连接到 API 服务器 (${url || '未知地址'})。\n原因：网络不可达、DNS解析失败或服务器拒绝连接。\n建议：请检查网络连接、API地址拼写是否正确，或是否需要开启/关闭代理与VPN。`;
    }

    if (name === 'AbortError' || message.includes('aborted')) {
      return `❌ [请求已取消] 请求已被取消或等待超时。`;
    }

    // 2. HTTP 401 / 403 认证错误
    if (message.includes('401') || message.includes('403') || /unauthorized|forbidden|invalid.*key|authentication/i.test(message)) {
      return `❌ [API Key 认证失败] 服务商拒绝了访问请求。\n原因：API Key 无效、已过期、拼写错误或账号缺乏该接口权限。\n建议：请检查输入的 API Key 是否正确并包含对应模型的调用权限。`;
    }

    // 3. HTTP 404 / 400 模型或路径错误
    if (message.includes('404') || /model.*not.*found|does not exist|invalid.*model|unknown.*model/i.test(message)) {
      return `❌ [模型设置错误] 服务商未找到指定的模型 (${model || '默认模型'})。\n原因：模型名称拼写错误、所选模型未部署或当前 API 路径不支持该模型。\n建议：请核对模型名称（如 gpt-4o-mini、claude-3-5-sonnet-20241022、gemini-2.0-flash 等）。`;
    }

    // 4. HTTP 429 频率与额度限制
    if (message.includes('429') || /rate.*limit|quota|exceeded/i.test(message)) {
      return `❌ [频次/额度超限] HTTP 429 请求受限。\n原因：API 调用频率过高，或 API Key 对应的账户额度/余额已用尽。\n建议：请稍后再试或充值/检查账户余额。`;
    }

    // 5. HTTP 500 / 502 / 503 / 504 服务器故障
    if (/500|502|503|504/.test(message)) {
      return `❌ [服务器内部故障] 服务商服务器异常。\n原因：API 提供商服务器发生错误或处于维护状态。\n建议：请稍后再试。`;
    }

    return `❌ [API 调用失败] ${message}`;
  }

  /**
   * 检查AI文本生成是否已配置
   */
  isConfigured() {
    if (!this.textConfig) return false;
    const { type, url, apiKey } = this.textConfig;
    const hasKey = !!(apiKey && apiKey.trim() !== '');
    const hasUrl = !!(url && url.trim() !== '');
    
    const isLocalType = ['ollama', 'llamacpp'].includes(type);
    const isLocalUrl = hasUrl && (
      url.includes('localhost') ||
      url.includes('127.0.0.1') ||
      url.includes('0.0.0.0') ||
      url.includes('::1') ||
      /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(url)
    );

    if (isLocalType || isLocalUrl) {
      return hasUrl || hasKey;
    }
    // 对于在线接口 (openai, claude, gemini, custom)
    return hasKey || (hasUrl && url !== 'https://api.openai.com/v1' && url !== 'https://api.anthropic.com/v1' && url !== 'https://generativelanguage.googleapis.com/v1beta');
  }

  /**
   * 检查图像生成是否已配置
   */
  isImageConfigured() {
    if (!this.imageConfig) return false;
    const { type, url, apiKey } = this.imageConfig;
    const hasKey = !!(apiKey && apiKey.trim() !== '');
    const hasUrl = !!(url && url.trim() !== '');

    const isLocalUrl = hasUrl && (
      url.includes('localhost') ||
      url.includes('127.0.0.1') ||
      url.includes('0.0.0.0') ||
      url.includes('::1') ||
      /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(url)
    );

    if (isLocalUrl || type === 'custom') {
      return hasUrl || hasKey;
    }
    return hasKey || (hasUrl && url !== 'https://api.openai.com/v1');
  }

  /**
   * 生成故事内容
   * @param {Object} context - 上下文信息
   * @param {Object} knowledgeBase - 知识库
   * @param {string} userChoice - 用户选择
   * @param {AbortSignal} signal - 中断信号
   */
  async generateStoryContent(context, knowledgeBase, userChoice = '', signal = null) {
    await this.loadSettings();
    console.log('[AIService] 准备生成故事内容，文本API配置:', {
      type: this.textConfig?.type,
      url: this.textConfig?.url,
      model: this.textConfig?.model,
      hasApiKey: !!(this.textConfig?.apiKey && this.textConfig?.apiKey.trim()),
      isConfigured: this.isConfigured()
    });

    if (!this.isConfigured()) {
      console.warn('[AIService] 文本生成API校验未通过（未配置或路径无效）');
      throw new Error('请先配置文本生成API');
    }

    try {
      // 检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      const prompt = await this.buildPrompt(context, knowledgeBase, userChoice);
      const maxRetries = 3;
      let lastErr = null;
      for (let i = 0; i < maxRetries; i++) {
        // 再次检查中断信号
        if (signal?.aborted) {
          throw new DOMException('Request was aborted', 'AbortError');
        }
        
        try {
          const response = await this.callTextAPI(prompt, signal);
          const parsedResponse = this.parseAIResponse(response);
          if (this.validateResponse(parsedResponse)) {
            return parsedResponse;
          }
          lastErr = new Error('AI响应缺少必填字段');
        } catch (e) {
          // 如果是中断错误，直接抛出
          if (e.name === 'AbortError') {
            throw e;
          }
          lastErr = e;
        }
      }
      throw lastErr || new Error('AI响应无效');

    } catch (error) {
      console.error('[AIService] 生成故事内容失败:', error);
      throw error;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * 生成图像并下载到本地
   * @param {string} prompt - 图像描述
   * @param {Object} options - 选项
   */
  async generateImage(prompt, options = {}) {
    await this.loadSettings();
    console.log('[AIService] 准备生成图像，图像API配置:', {
      type: this.imageConfig?.type,
      url: this.imageConfig?.url,
      model: this.imageConfig?.model,
      hasApiKey: !!(this.imageConfig?.apiKey && this.imageConfig?.apiKey.trim()),
      isConfigured: this.isImageConfigured()
    });

    if (!this.isImageConfigured()) {
      console.warn('[AIService] 图像生成API校验未通过（未配置或路径无效）');
      throw new Error('请先配置图像生成API');
    }

    const { signal } = options;

    try {
      // 检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 第一步：文本处理
      if (options.onProgress) {
        options.onProgress({ stage: '文本生成', percent: 5 });
      }

      // 第二步：图片生成（10-75%）
      if (options.onProgress) {
        options.onProgress({ stage: '图片生成', percent: 10 });
      }

      const imageUrl = await this.callImageAPI(prompt, (progressInfo) => {
        // 检查中断信号
        if (signal?.aborted) {
          throw new DOMException('Request was aborted', 'AbortError');
        }
        
        if (options.onProgress) {
          const adjustedPercent = 10 + (progressInfo.percent * 0.65); // 10-75%
          options.onProgress({ 
            stage: '图片生成', 
            percent: adjustedPercent 
          });
        }
      }, signal);

      // 再次检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 第三步：图片下载（75-100%）
      if (options.onProgress) {
        options.onProgress({ stage: '图片下载', percent: 75 });
      }

      const localPath = await this.downloadImage(imageUrl, options.projectId, options.filename, signal, options.outputDir);

      if (options.onProgress) {
        options.onProgress({ stage: '完成', percent: 100 });
      }

      return localPath;
    } catch (error) {
      console.error('生成图像失败:', error);
      throw error;
    }
  }

  /**
   * 下载图片到本地项目目录
   * @param {string} imageUrl - 图片URL
   * @param {string} projectId - 项目ID
   * @param {string} filename - 文件名（可选）
   * @param {AbortSignal} signal - 中断信号
   * @param {string} outputDir - 输出目录（可选，用于主页背景等）
   */
  async downloadImage(imageUrl, projectId, filename, signal = null, outputDir = null) {
    try {
      // 检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 生成唯一文件名
      if (!filename) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        filename = `image_${timestamp}_${random}.png`;
      }

      // 确保文件扩展名
      if (!filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
        filename += '.png';
      }

      let assetDir;
      let project = null;
      let assetPath;
      
      if (outputDir) {
        // 使用指定的输出目录（用于主页背景等）
        assetDir = outputDir;
        await window.electronAPI.fs.ensureDir(assetDir);
        assetPath = `${assetDir}/${filename}`;
      } else {
        // 获取项目asset目录
        console.log('查找项目:', projectId, '可用项目:', window.projectManager.getProjects().map(p => ({id: p.id, name: p.name})));
        
        project = window.projectManager.getProjects().find(p => p.id === projectId);
        
        // 如果找不到项目，尝试重新加载项目列表
        if (!project) {
          await window.projectManager.loadProjects();
          project = window.projectManager.getProjects().find(p => p.id === projectId);
        }
        
        if (!project) {
          console.error('项目不存在，projectId:', projectId, '所有项目:', window.projectManager.getProjects());
          // 如果仍然找不到项目，返回原始URL而不是抛出错误
          return imageUrl;
        }

        assetDir = `${project.path}/assets`;
        assetPath = await window.projectManager.getAssetPath(project, filename);
      }

      // 再次检查中断信号
      if (signal?.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
      }

      // 下载图片
      const response = await fetch(imageUrl, { signal });
      if (!response.ok) {
        throw new Error(`下载图片失败: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // 保存到本地
      if (window.electronAPI && window.electronAPI.fs) {
        try {
          await window.electronAPI.fs.ensureDir(assetPath.replace(filename, ''));
          // 使用正确的文件写入方法
          if (window.electronAPI.fs.writeFile) {
            await window.electronAPI.fs.writeFile(assetPath, uint8Array);
          } else if (window.electronAPI.writeFile) {
            await window.electronAPI.writeFile(assetPath, uint8Array);
          } else {
            throw new Error('文件写入API不可用');
          }
        } catch (fsError) {
          console.error('文件系统操作失败:', fsError);
          console.warn('文件系统API不可用，使用原始URL');
          return imageUrl;
        }
      } else {
        console.warn('文件系统API不可用，使用原始URL');
        return imageUrl;
      }

      // 根据是否使用outputDir返回不同的路径
      if (outputDir) {
        // 对于自定义输出目录，返回完整路径
        return assetPath;
      } else {
        // 对于项目资源，返回相对路径
        return `assets/${filename}`;
      }
    } catch (error) {
      console.error('下载图片失败:', error);
      throw error;
    }
  }

  /**
   * 构建提示词
   * @param {Object} context - 上下文
   * @param {Object} knowledgeBase - 知识库
   * @param {string} userChoice - 用户选择
   */
  async buildPrompt(context, knowledgeBase, userChoice) {
    const project = window.projectManager.getCurrentProject();
    // 读取角色库
    const charactersData = await window.projectManager.readCharacters(project);
    
    // 获取IoT生理数据和分析
    let iotDataSection = '';
    if (window.iotManager) {
      const iotStatus = window.iotManager.getStatus();
      console.log('🎮 获取IoT状态用于AI提示词:', iotStatus);
      
      if (iotStatus.enabled && (iotStatus.heartRate > 0 || iotStatus.sriScore > 0)) {
        iotDataSection = '\n【用户生理与情绪监测】\n';
        
        // 原始数据
        iotDataSection += '原始数据：\n';
        if (iotStatus.heartRate > 0) {
          iotDataSection += `- 实时心率: ${iotStatus.heartRate} BPM`;
          iotDataSection += iotStatus.connected ? ' (实时监测中)\n' : ' (最后记录)\n';
        }
        if (iotStatus.sriScore > 0) {
          iotDataSection += `- SRI性压抑指数: ${iotStatus.sriScore}/100\n`;
        }
        
        // 游戏模式和安全设置
        iotDataSection += '\n游戏设置：\n';
        iotDataSection += `- 游戏模式强度: ${iotStatus.gameMode || '标准模式'}\n`;
        iotDataSection += `- 心率安全目标: ${iotStatus.heartRateTarget || 120} BPM (超过此值应降低刺激)\n`;
        
        // 情绪分析（使用EmotionAnalyzer）
        if (window.emotionAnalyzer && iotStatus.heartRate > 0) {
          const currentEmotion = window.emotionAnalyzer.getCurrentEmotion();
          const emotionSummary = window.emotionAnalyzer.getEmotionSummary();
          const contentSuggestion = window.emotionAnalyzer.getContentSuggestion();
          
          // 添加三个核心指标
          if (currentEmotion) {
            iotDataSection += '\n【核心情绪指标】\n';
            iotDataSection += `- 情绪强度 (Intensity): ${currentEmotion.intensity.toFixed(0)}/100 - ${
              currentEmotion.intensity < 30 ? '低强度,用户状态平稳' :
              currentEmotion.intensity < 60 ? '中等强度,用户有一定情绪波动' :
              '高强度,用户情绪激烈'
            }\n`;
            iotDataSection += `- 唤醒程度 (Arousal): ${currentEmotion.arousal.toFixed(0)}/100 - ${
              currentEmotion.arousal < 40 ? '低唤醒,用户放松平静' :
              currentEmotion.arousal < 70 ? '中等唤醒,用户注意力集中' :
              '高唤醒,用户高度兴奋或紧张'
            }\n`;
            iotDataSection += `- 情绪效价 (Valence): ${currentEmotion.valence.toFixed(0)}/100 - ${
              currentEmotion.valence < -30 ? '负面情绪,用户可能感到不适或紧张' :
              currentEmotion.valence > 30 ? '正面情绪,用户享受当前内容' :
              '中性情绪'
            }\n`;
          }
          
          if (emotionSummary) {
            iotDataSection += '\n详细情绪分析：\n';
            iotDataSection += emotionSummary.split('\n').map(line => `- ${line}`).join('\n') + '\n';
          }
          
          if (contentSuggestion) {
            iotDataSection += `\n💡 内容适配建议: ${contentSuggestion}\n`;
          }
        } else {
          // 回退到简单心率分析
          if (iotStatus.heartRate > 0) {
            iotDataSection += '\n生理状态分析：\n';
            const hr = iotStatus.heartRate;
            let hrAnalysis = '';
            if (hr < 60) {
              hrAnalysis = '心率偏低，用户可能处于放松或平静状态';
            } else if (hr >= 60 && hr <= 80) {
              hrAnalysis = '心率正常，用户处于平稳状态';
            } else if (hr > 80 && hr <= 100) {
              hrAnalysis = '心率略高，用户可能有轻微兴奋或紧张';
            } else if (hr > 100 && hr <= 120) {
              hrAnalysis = '心率明显升高，用户处于兴奋或激动状态';
            } else {
              hrAnalysis = '心率很高，用户情绪激动或身体活跃';
            }
            iotDataSection += `- 心率状态: ${hrAnalysis}\n`;
          }
        }
        
        // IoT Manager的情绪分析数据(情绪状态、兴奋度、紧张度、参与度)
        if (window.iotManager && iotStatus.heartRate > 0) {
          const emotionalState = window.iotManager.analyzeEmotionalState();
          if (emotionalState) {
            iotDataSection += '\n【IoT实时情绪监测】\n';
            iotDataSection += `- 情绪状态: ${window.iotManager.translateEmotionalState(emotionalState.state)}\n`;
            iotDataSection += `- 兴奋度: ${emotionalState.excitement}/100 - ${
              emotionalState.excitement < 30 ? '低兴奋,用户状态平淡' :
              emotionalState.excitement < 60 ? '中等兴奋,用户有一定热情' :
              '高兴奋,用户情绪高涨'
            }\n`;
            iotDataSection += `- 紧张度: ${emotionalState.tension}/100 - ${
              emotionalState.tension < 30 ? '低紧张,用户放松' :
              emotionalState.tension < 60 ? '中等紧张,用户略有压力' :
              '高紧张,用户压力较大'
            }\n`;
            iotDataSection += `- 参与度: ${emotionalState.engagement}/100 - ${
              emotionalState.engagement < 30 ? '低参与,用户可能感到无聊' :
              emotionalState.engagement < 60 ? '中等参与,用户保持关注' :
              '高参与,用户高度投入'
            }\n`;
            
            // 心率趋势
            const trend = window.iotManager.getHeartRateTrend();
            if (trend) {
              iotDataSection += `- 心率趋势: ${window.iotManager.translateTrend(trend.trend)}\n`;
              iotDataSection += `- 平均心率: ${trend.avgRate || '--'} BPM\n`;
              iotDataSection += `- 心率范围: ${trend.minRate || '--'} - ${trend.maxRate || '--'} BPM\n`;
            }
          }
        }
        
        // SRI分析
        if (iotStatus.sriScore > 0) {
          const sri = iotStatus.sriScore;
          let sriAnalysis = '';
          let contentSuggestion = '';
          
          if (sri < 30) {
            sriAnalysis = '性压抑程度很低，用户对性话题持开放态度';
            contentSuggestion = '可以适度使用浪漫、暧昧的情节，用户接受度高';
          } else if (sri >= 30 && sri < 50) {
            sriAnalysis = '性压抑程度较低，用户对性话题比较开放';
            contentSuggestion = '可以使用含蓄的浪漫元素，避免过于直接';
          } else if (sri >= 50 && sri < 70) {
            sriAnalysis = '性压抑程度中等，用户对性话题有一定保留';
            contentSuggestion = '建议使用委婉、含蓄的表达，注重情感铺垫';
          } else if (sri >= 70 && sri < 85) {
            sriAnalysis = '性压抑程度较高，用户对性话题比较敏感';
            contentSuggestion = '应避免直接的性相关内容，重点放在情感和剧情发展上';
          } else {
            sriAnalysis = '性压抑程度很高，用户对性话题非常保守';
            contentSuggestion = '完全避免性相关暗示，专注于纯粹的情感和友谊叙事';
          }
          
          iotDataSection += `\nSRI评估：\n`;
          iotDataSection += `- ${sriAnalysis}\n`;
          iotDataSection += `- 内容建议: ${contentSuggestion}\n`;
        }
        
        // 综合状态评估
        if (iotStatus.heartRate > 0 && iotStatus.sriScore > 0) {
          const hr = iotStatus.heartRate;
          const sri = iotStatus.sriScore;
          let combinedAnalysis = '';
          
          if (hr > 100 && sri < 50) {
            combinedAnalysis = '用户情绪高涨且开放，适合推进浪漫剧情';
          } else if (hr > 100 && sri >= 50) {
            combinedAnalysis = '用户情绪激动但对亲密话题保守，建议聚焦紧张刺激的非性向剧情';
          } else if (hr <= 80 && sri < 50) {
            combinedAnalysis = '用户状态平稳且开放，可以自然地发展各类情节';
          } else if (hr <= 80 && sri >= 70) {
            combinedAnalysis = '用户平静且保守，适合温和、纯情的故事线';
          } else {
            combinedAnalysis = '用户处于中等状态，保持现有内容风格即可';
          }
          
          iotDataSection += `\n综合评估: ${combinedAnalysis}\n`;
        }
        
        // 安全提醒
        if (iotStatus.heartRate > iotStatus.heartRateTarget) {
          iotDataSection += `\n⚠️ 安全警告: 用户心率 (${iotStatus.heartRate} BPM) 已超过安全目标 (${iotStatus.heartRateTarget} BPM)，请立即降低内容刺激程度，提供平和、舒缓的情节。\n`;
        }
        
        iotDataSection += '\n请根据以上生理数据、情绪分析和游戏设置，精准调整故事内容的刺激程度、浪漫尺度和情节节奏。\n';
      }
    }
    
    // 获取前三次对话历史
    let conversationHistory = '';
    try {
      const timeline = await window.projectManager.getTimelineHistory(project.id);
      if (timeline && timeline.length > 0) {
        // 取最后3次对话记录（不包括当前正在生成的）
        const recentHistory = timeline.slice(-3);
        if (recentHistory.length > 0) {
          conversationHistory = '\n历史对话记录（最近3次）：\n';
          recentHistory.forEach((entry, index) => {
            conversationHistory += `\n第 ${recentHistory.length - index} 次对话：\n`;
            if (entry.content) {
              if (entry.content.dialogue) {
                conversationHistory += `对话: ${entry.content.dialogue}\n`;
              }
              if (entry.content.speaker) {
                conversationHistory += `说话者: ${entry.content.speaker}\n`;
              }
              if (entry.userChoice) {
                conversationHistory += `用户选择: ${entry.userChoice}\n`;
              }
              if (entry.content.chapterSummary) {
                conversationHistory += `情节概要: ${entry.content.chapterSummary}\n`;
              }
            }
          });
          conversationHistory += '\n';
        }
      }
    } catch (error) {
      console.warn('获取对话历史失败:', error);
      conversationHistory = '';
    }
    
    // 整理固定角色列表及固定视觉外观定义，确保造型稳定不乱变
    let fixedCharacterSection = '';
    if (charactersData && charactersData.characters && Object.keys(charactersData.characters).length > 0) {
      fixedCharacterSection = '\n【已知固定角色及外貌定型要求（生成内容与视觉描述时必须继承其外貌造型锚点，严禁随意改变角色造型、发型与服装）：】\n';
      Object.values(charactersData.characters).forEach(c => {
        const visual = c.visualPrompt || c.summary || '二次元动漫风格';
        fixedCharacterSection += `- ${c.name} (${c.role || '角色'}): 固定外貌造型 [${visual}]\n`;
      });
    }

    let prompt = `你是一个专业的交互式视觉小说作家。请根据以下信息继续故事发展。

项目信息：
- 名称：${project.name}
- 风格：${project.style || '不限'}
- 故事大纲：${project.summary || '待发展'}

知识库信息：
${JSON.stringify(knowledgeBase, null, 2)}

角色库：
${JSON.stringify(charactersData, null, 2)}${fixedCharacterSection}${conversationHistory}
当前情节：
${context.currentContent || '故事开始'}

${userChoice ? `用户选择：${userChoice}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 重要提醒：以下是【用户实时生理监测数据】，与游戏设定无关！
这些数据仅用于调整内容刺激程度和节奏，请勿将其混入故事情节！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${iotDataSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

请严格仅以JSON格式返回以下内容（不要包含任何解释或多余文本）：
{
  "dialogue": "本幕剧情首句台词或剧情总述（必填）",
  "speaker": "当前说话者（如：曾根美雪 / 向日葵 / 旁白）",
  "speakerEmotion": "happy|blushing|neutral|surprised|angry|sad|thinking|smug",
  "dialogues": [
    {
      "speaker": "曾根美雪",
      "text": "「……你在看什么？从刚才开始视线就一直游移不定。」",
      "emotion": "neutral"
    },
    {
      "speaker": "旁白",
      "text": "她放下了手中的书本，紫色的眼眸中带着一丝审视与探寻。",
      "emotion": "neutral"
    },
    {
      "speaker": "向日葵",
      "text": "「啊哈哈！美雪太严肃啦，明明只是普通的走神嘛～」",
      "emotion": "happy"
    },
    {
      "speaker": "向日葵",
      "text": "「对吧？今天的天气这么好，不如放学后一起去吃可丽饼吧！」",
      "emotion": "blushing"
    },
    {
      "speaker": "曾根美雪",
      "text": "「真是肤浅的提议……不过，也不是不能考虑。」",
      "emotion": "smug"
    },
    {
      "speaker": "旁白",
      "text": "夕阳穿过窗棂洒在课桌上，空气中弥漫着微妙的静谧与心动。",
      "emotion": "neutral"
    }
  ],
  "sceneChanged": false,
  "activeCharacters": [
    {
      "name": "曾根美雪",
      "position": "left",
      "expression": "neutral"
    },
    {
      "name": "向日葵",
      "position": "right",
      "expression": "happy"
    }
  ],
  "choices": [],
  "backgroundPrompt": "纯背景画面提示词（若未切换场景/未发生地点变更则填null，仅当sceneChanged为true转场时填写如：sunset empty anime classroom, highly detailed, no characters）",
  "imagePrompt": "整体场景提示词（全景备用）",
  "knowledgeUpdates": {
    "characters.角色名": "角色信息更新",
    "locations.地点名": "地点信息更新",
    "events.事件名": "事件信息"
  },
  "chapterSummary": "本章节大意（必填）",
  "charactersDelta": [
    {
      "match": {"id": "角色ID或留空", "name": "角色名或留空"},
      "op": "create|update|append-event",
      "data": {
        "id": "角色稳定ID",
        "name": "角色名",
        "summary": "角色简介",
        "visualPrompt": "固定外貌造型描述词（如：anime girl, twin tails pink hair, amber eyes, blue ribbon, school uniform）",
        "tags": ["标签1","标签2"],
        "metadata": {"身份": "学生"},
        "event": {"title": "事件标题", "desc": "事件描述"}
      }
    }
  ]
}

要求：
1. 【单次输出长篇对白序列（必须生成 6 ~ 12 句连续对话框）】：
   - AI 单次必须输出 300 ~ 600 字的饱满情节，并将其拆解为 6 ~ 12 个连贯的对白小节（dialogues 数组）！
   - 包含角色交锋对白、心理独白、环境氛围描写、动作互动与表情差分（emotion），让玩家每次生成都能按空格/点击连续阅读 6~12 句对话框！
2. 【严格控制分支选项频率（85%以上必须无选项）】：
   - Galgame 是强叙事与剧情沉浸驱动的游戏，玩家主要通过按空格或点击连贯阅读推进故事；
   - 【常态要求】：90% 的常规对白推进、日常交流、情感发展、剧情铺垫与场景过渡，**choices 必须保持为空数组 []**，严禁频繁出现碎片化无意义选项；
   - 【极罕见选项】：只有在经历了充分的剧情铺垫后，面临【关键主线分歧】、【路线抉择】或【重大转折决策】时，才在 choices 中提供 2~3 个有深度影响的选择项。
3. 【背景画面复用与异步生成】：sceneChanged 表示是否发生了场景地点切换（true/false）。如果仍在同一地点/同一房间，sceneChanged 设为 false，backgroundPrompt 设为 null（沿用上一张背景）；仅当发生转场、换地点（如放学走廊到学校天台）时，sceneChanged 设为 true 并提供新的 backgroundPrompt。
4. speaker要精确指示当前正在说话的角色姓名（旁白请填 "旁白"）。
5. activeCharacters列出当前镜头场景中出现的角色及其表情与相对位置（left/center/right）。
6. backgroundPrompt仅描述环境背景，不包含人物，实现背景与立绘独立解耦。
7. 首次出现新角色时在charactersDelta中定义其固定的visualPrompt外貌描述词。
8. 确保JSON格式正确，所有必填字段都存在；不得返回不完整JSON；
${iotDataSection ? '9. ⚠️ 生理监测数据仅用于控制内容刺激度，不要在故事中提及用户的心率或SRI数据' : ''}`;

    return prompt;
  }

  /**
   * 调用文本生成API
   * @param {string} prompt - 提示词
   * @param {AbortSignal} signal - 中断信号
   */
  async callTextAPI(prompt, signal = null) {
    const startTime = Date.now();
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.textConfig.apiKey && this.textConfig.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${this.textConfig.apiKey.trim()}`;
    }

    let requestBody;
    let endpoint;

    // 根据API类型构建请求
    switch (this.textConfig.type) {
      case 'openai':
        endpoint = this.buildEndpoint(this.textConfig.url, '/chat/completions');
        requestBody = {
          model: this.textConfig.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 2000
        };
        break;

      case 'claude':
        // Anthropic Claude API
        if (this.textConfig.apiKey && this.textConfig.apiKey.trim()) {
          headers['x-api-key'] = this.textConfig.apiKey.trim();
        }
        headers['anthropic-version'] = '2023-06-01';
        endpoint = this.buildEndpoint(this.textConfig.url, '/messages');
        requestBody = {
          model: this.textConfig.model || 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        };
        break;

      case 'gemini':
        // Google Gemini API
        if (this.textConfig.apiKey && this.textConfig.apiKey.trim()) {
          headers['x-goog-api-key'] = this.textConfig.apiKey.trim();
        }
        const rawModel = (this.textConfig.model || 'gemini-2.0-flash').trim();
        const cleanModel = rawModel.replace(/^models\//, '');
        endpoint = this.buildEndpoint(this.textConfig.url, `/models/${cleanModel}:generateContent`);
        if (this.textConfig.apiKey && this.textConfig.apiKey.trim() && !headers['x-goog-api-key']) {
          endpoint += `?key=${encodeURIComponent(this.textConfig.apiKey.trim())}`;
        }
        requestBody = {
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2000
          }
        };
        break;

      case 'ollama':
        endpoint = this.buildEndpoint(this.textConfig.url, '/api/generate');
        requestBody = {
          model: this.textConfig.model || 'qwen2.5',
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.8,
            num_predict: 2000
          }
        };
        break;

      case 'llamacpp':
        endpoint = this.buildEndpoint(this.textConfig.url, '/completion');
        requestBody = {
          prompt: prompt,
          temperature: 0.8,
          n_predict: 2000,
          stream: false
        };
        break;

      case 'custom':
        endpoint = this.buildEndpoint(this.textConfig.url, '/chat/completions');
        requestBody = {
          model: this.textConfig.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 2000
        };
        break;

      default:
        throw new Error(`不支持的文本API类型: ${this.textConfig.type}`);
    }

    console.log('[AIService] 发送文本API请求:', {
      type: this.textConfig.type,
      endpoint,
      model: this.textConfig.model,
      hasAuthHeader: !!(headers['Authorization'] || headers['x-api-key'] || headers['x-goog-api-key']),
      promptLength: prompt ? prompt.length : 0
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal // 传递中断信号
    });

    const duration = Date.now() - startTime;
    console.log(`[AIService] 文本API响应状态: ${response.status} ${response.statusText} (耗时: ${duration}ms)`);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[AIService] 文本API调用失败:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      throw new Error(`API调用失败 (${response.status}): ${errorData || response.statusText}`);
    }

    const data = await response.json();
    console.log('[AIService] 文本API返回原始数据:', data);
    
    // 灵活提取响应内容（兼容 OpenAI, Claude, Gemini, Ollama, llama.cpp 及自定义格式）
    let content;
    if (data.choices && data.choices[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else if (data.choices && data.choices[0]?.text) {
      content = data.choices[0].text;
    } else if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
      // Claude Anthropic 格式
      content = data.content[0].text;
    } else if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      // Google Gemini 格式
      content = data.candidates[0].content.parts[0].text;
    } else if (data.response !== undefined) {
      // Ollama 格式
      content = data.response;
    } else if (typeof data.content === 'string') {
      // llama.cpp 格式
      content = data.content;
    }

    if (!content && content !== '') {
      console.error('[AIService] 文本API响应中未能提取出有效内容, 数据结构为:', data);
      throw new Error('API响应中没有包含有效生成内容');
    }

    console.log(`[AIService] 文本API生成内容成功 (提取文本长度: ${content.length})`);
    return content;
  }

  /**
   * 调用图像生成API
   * @param {string} prompt - 图像描述
   * @param {Function} onProgress - 进度回调
   * @param {AbortSignal} signal - 中断信号
   */
  async callImageAPI(prompt, onProgress, signal = null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    let requestBody;
    let endpoint;

    // 获取图像分辨率
    let size = '1024x1024';
    if (this.imageConfig.resolution === 'auto') {
      const windowSize = await window.electronAPI.window.getSize();
      const ratio = windowSize[0] / windowSize[1];
      
      if (ratio > 1.5) {
        size = '1792x1024';
      } else if (ratio < 0.7) {
        size = '1024x1792';
      } else {
        size = '1024x1024';
      }
    } else {
      size = this.imageConfig.resolution;
    }

    switch (this.imageConfig.type) {
      case 'openai':
        if (this.imageConfig.apiKey && this.imageConfig.apiKey.trim()) {
          headers['Authorization'] = `Bearer ${this.imageConfig.apiKey.trim()}`;
        }
        endpoint = this.buildEndpoint(this.imageConfig.url, '/images/generations');
        requestBody = {
          model: this.imageConfig.model,
          prompt: prompt,
          n: 1,
          size: size,
          quality: 'standard',
          response_format: 'url'
        };
        break;

      case 'custom':
        if (this.imageConfig.apiKey && this.imageConfig.apiKey.trim()) {
          headers['Authorization'] = `Bearer ${this.imageConfig.apiKey.trim()}`;
        }
        endpoint = this.buildEndpoint(this.imageConfig.url, '/images/generations');
        requestBody = {
          model: this.imageConfig.model,
          prompt: prompt,
          n: 1,
          size: size,
          response_format: 'url'
        };
        break;

      default:
        throw new Error(`不支持的图像API类型: ${this.imageConfig.type}`);
    }

    console.log('[AIService] 发送图像API请求:', {
      type: this.imageConfig.type,
      endpoint,
      model: this.imageConfig.model,
      size,
      hasAuthHeader: !!headers['Authorization']
    });

    // 进度：开始请求
    if (typeof onProgress === 'function') onProgress({ stage: '开始请求', percent: 5 });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal // 传递中断信号
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`图像API调用失败: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    // 对接厂商任务制：若返回task/id/status，则轮询任务进度
    const taskId = data.task_id || data.id;
    const hasTask = taskId && (data.status || data.state || data.progress !== undefined);

    if (this.imageConfig.type === 'custom' && hasTask) {
      // 尝试构造任务查询端点：<base>/images/tasks/{id} 或 <base>/tasks/{id}
      const base = this.imageConfig.url.replace(/\/$/, '');
      const candidates = [
        `${base}/images/tasks/${taskId}`,
        `${base}/tasks/${taskId}`,
        `${base}/image/tasks/${taskId}`
      ];

      let finalUrl = null;
      let lastProgress = 10;
      if (typeof onProgress === 'function') onProgress({ stage: '已排队', percent: lastProgress });

      // 轮询最多60次（~60秒）
      for (let i = 0; i < 60; i++) {
        // 检查中断信号
        if (signal?.aborted) {
          throw new DOMException('Request was aborted', 'AbortError');
        }
        
        // 适度增长进度条，避免卡住（若响应中有progress则使用）
        await Utils.sleep(1000);
        try {
          const statusRes = await fetch(candidates[0], { 
            headers: { 'Authorization': `Bearer ${this.imageConfig.apiKey}` },
            signal 
          });
          const statusData = statusRes.ok ? await statusRes.json() : null;
          const status = statusData?.status || statusData?.state || '';
          const progress = typeof statusData?.progress === 'number' ? Math.max(lastProgress, Math.min(99, Math.round(statusData.progress))) : Math.min(95, lastProgress + 2);
          lastProgress = progress;
          if (typeof onProgress === 'function') onProgress({ stage: status || '生成中', percent: progress });

          // 解析输出URL
          const outputs = statusData?.output || statusData?.data || statusData?.result || [];
          const urlCandidate = Array.isArray(outputs) ? (outputs[0]?.url || outputs[0]) : (outputs?.url || null);
          if (status === 'succeeded' || status === 'success' || status === 'completed' || urlCandidate) {
            finalUrl = urlCandidate;
            break;
          }
        } catch (error) {
          // 如果是中断错误，直接抛出
          if (error.name === 'AbortError') {
            throw error;
          }
          // 忽略其他轮询错误，继续尝试
        }
      }

      if (finalUrl) {
        if (typeof onProgress === 'function') onProgress({ stage: '完成', percent: 100 });
        return finalUrl;
      }

      throw new Error('任务未在超时时间内完成');
    }

    // OpenAI 及各厂商通用灵活提取：支持 url, b64_json, images, output, choices (GPT-4o 多模态) 等格式
    let url = data?.data?.[0]?.url || data?.output?.[0]?.url || data?.images?.[0]?.url || data?.images?.[0] || data?.url;
    if (!url && data?.data?.[0]?.b64_json) {
      url = `data:image/png;base64,${data.data[0].b64_json}`;
    }
    if (!url && data?.choices?.[0]?.message?.content) {
      const imgMatch = data.choices[0].message.content.match(/https?:\/\/[^\s\)"']+\.(png|jpg|jpeg|webp)/i);
      if (imgMatch) {
        url = imgMatch[0];
      }
    }
    if (!url) {
      throw new Error('图像 API 响应中未提取到有效的图像 URL 或 base64 数据');
    }
    if (typeof onProgress === 'function') onProgress({ stage: '完成', percent: 100 });
    return url;
  }

  /**
   * 解析AI响应
   * @param {string} response - AI响应文本
   */
  parseAIResponse(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('AI响应为空');
    }

    let parsed = null;
    try {
      parsed = JSON.parse(response);
    } catch (error) {
      // 提取被 ```json ... ``` 包裹或大括号包裹的有效 JSON
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i) || response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const rawJson = jsonMatch[1] || jsonMatch[0];
        try {
          parsed = JSON.parse(rawJson);
        } catch (innerError) {
          console.warn('JSON提取失败，尝试修复:', innerError);
          let fixedResponse = rawJson
            .replace(/,(\s*[}\]])/g, '$1') // 移除末尾多余逗号
            .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // 给属性名添加引号
          try {
            parsed = JSON.parse(fixedResponse);
          } catch (finalError) {
            console.error('无法修复JSON:', finalError);
          }
        }
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('无法解析AI响应为有效JSON');
    }

    // 智能兜底与标准化清洗
    if (!parsed.dialogue) {
      parsed.dialogue = parsed.text || parsed.content || parsed.message || '......';
    }
    if (!parsed.chapterSummary) {
      parsed.chapterSummary = parsed.dialogue ? parsed.dialogue.substring(0, 30) : '故事进展';
    }
    if (!parsed.imagePrompt) {
      parsed.imagePrompt = parsed.backgroundPrompt || parsed.image_prompt || 'anime classroom scene, high quality';
    }
    if (!parsed.speakerEmotion) {
      parsed.speakerEmotion = parsed.emotion || parsed.activeCharacters?.[0]?.expression || 'neutral';
    }
    if (!parsed.backgroundPrompt) {
      parsed.backgroundPrompt = parsed.imagePrompt;
    }

    // 智能解析与标准化多句对白序列 dialogues (支持 6~12 句连续对话框)
    if (Array.isArray(parsed.dialogues) && parsed.dialogues.length > 0) {
      parsed.dialogues = parsed.dialogues.map(d => ({
        speaker: d.speaker || parsed.speaker || '旁白',
        text: d.text || d.dialogue || '',
        emotion: d.emotion || d.speakerEmotion || 'neutral'
      })).filter(d => d.text && d.text.trim());
    }

    // 若模型未返回 dialogues 数组或仅返回 1 条，但主 dialogue 包含长篇剧情，智能按台词/引语/句号拆分为多个连续对话框
    if (!Array.isArray(parsed.dialogues) || parsed.dialogues.length <= 1) {
      const fullText = parsed.dialogue || '';
      const splitBeats = [];
      // 按日系引号 「...」 / 中文引号 “...” / 换行 / 完整标点拆解
      const rawChunks = fullText.split(/(?<=[。！？\n])|(?=[「“])|(?<=[」”])/g);
      let buffer = '';

      for (const chunk of rawChunks) {
        const trimmed = (buffer + chunk).trim();
        if (trimmed.length >= 15 || (trimmed.startsWith('「') && trimmed.endsWith('」')) || (trimmed.startsWith('“') && trimmed.endsWith('”'))) {
          const isQuote = (trimmed.startsWith('「') && trimmed.endsWith('」')) || (trimmed.startsWith('“') && trimmed.endsWith('”'));
          splitBeats.push({
            speaker: isQuote ? (parsed.speaker || '') : '旁白',
            text: trimmed,
            emotion: parsed.speakerEmotion || 'neutral'
          });
          buffer = '';
        } else {
          buffer += chunk;
        }
      }
      if (buffer.trim()) {
        splitBeats.push({
          speaker: parsed.speaker || '旁白',
          text: buffer.trim(),
          emotion: parsed.speakerEmotion || 'neutral'
        });
      }

      if (splitBeats.length > 1) {
        parsed.dialogues = splitBeats;
      } else {
        parsed.dialogues = [{
          speaker: parsed.speaker || '',
          text: fullText || '……',
          emotion: parsed.speakerEmotion || 'neutral'
        }];
      }
    }

    // 标准化 choices 格式（兼容数组为纯文本字符串或缺属性情况）
    if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      parsed.choices = parsed.choices.map((c, i) => {
        if (typeof c === 'string') {
          return { id: i + 1, text: c, action: 'continue' };
        }
        return {
          id: c.id || (i + 1),
          text: c.text || c.title || `选项 ${i + 1}`,
          action: c.action || 'continue'
        };
      });
    } else {
      parsed.choices = [];
    }

    return parsed;
  }

  /**
   * 验证AI响应格式
   * @param {Object} response - 解析后的响应
   */
  validateResponse(response) {
    if (!response || typeof response !== 'object') {
      return false;
    }

    // 只要有 dialogue 即可通过
    if (!response.dialogue || typeof response.dialogue !== 'string') {
      return false;
    }

    // choices 允许为空数组（按空格或点击推进对白）
    if (!Array.isArray(response.choices)) {
      response.choices = [];
    }

    return true;
  }

  /**
   * 应用角色库更新
   * @param {Object} charactersData 原characters.json对象 {characters:{}}
   * @param {Array} delta charactersDelta数组
   * @returns {Object} 新characters对象
   */
  applyCharacterUpdates(charactersData, delta) {
    if (!delta || !Array.isArray(delta)) return charactersData;
    const out = Utils.deepClone(charactersData || { characters: {} });
    if (!out.characters) out.characters = {};
    for (const op of delta) {
      const match = op?.match || {};
      // 查找目标
      let targetId = null;
      if (match.id && out.characters[match.id]) {
        targetId = match.id;
      } else if (match.name) {
        const found = Object.entries(out.characters).find(([id, c]) => c.name === match.name);
        if (found) targetId = found[0];
      }

      if (op.op === 'create') {
        const id = op.data?.id || Utils.generateId();
        if (!out.characters[id]) {
          out.characters[id] = {
            id,
            name: op.data?.name || (match.name || id),
            summary: op.data?.summary || '',
            visualPrompt: op.data?.visualPrompt || op.data?.summary || `${op.data?.name || '角色'} 动漫精致造型`,
            tags: Array.isArray(op.data?.tags) ? op.data.tags : [],
            metadata: op.data?.metadata || {},
            events: []
          };
        }
        targetId = id;
      }

      if (!targetId) continue;
      const char = out.characters[targetId] || { id: targetId, name: match.name || targetId, tags: [], metadata: {}, events: [] };

      if (op.op === 'update') {
        if (op.data?.name) char.name = op.data.name;
        if (op.data?.summary) char.summary = op.data.summary;
        if (op.data?.visualPrompt && (!char.visualPrompt || char.visualPrompt.trim() === '')) {
          char.visualPrompt = op.data.visualPrompt;
        }
        if (Array.isArray(op.data?.tags)) char.tags = op.data.tags;
        if (op.data?.metadata && typeof op.data.metadata === 'object') {
          char.metadata = { ...(char.metadata||{}), ...op.data.metadata };
        }
      } else if (op.op === 'append-event' && op.data?.event) {
        const ev = op.data.event;
        char.events = char.events || [];
        char.events.push({
          timestamp: Date.now(),
          title: ev.title || '事件',
          desc: ev.desc || ''
        });
      }

      out.characters[targetId] = char;
    }
    return out;
  }

  /**
   * 测试文本API连接
   */
  async testTextAPI() {
    await this.loadSettings();
    console.log('[AIService] 开始测试文本API连接, 当前配置:', {
      type: this.textConfig?.type,
      url: this.textConfig?.url,
      model: this.textConfig?.model,
      hasApiKey: !!(this.textConfig?.apiKey && this.textConfig?.apiKey.trim()),
      isConfigured: this.isConfigured()
    });

    if (!this.isConfigured()) {
      return {
        success: false,
        message: '❌ [配置未完成] 文本API未配置（请填写有效的 API URL 或 API Key）',
        error: '请检查设置面板中的文本 API 配置'
      };
    }

    try {
      const testPrompt = '请简单回复"连接测试成功"';
      const response = await this.callTextAPI(testPrompt);
      
      if (response && response.trim().length > 0) {
        console.log('[AIService] 文本API测试连接成功，返回有效数据:', response);
        return {
          success: true,
          message: '✅ [测试成功] 已成功连接 API 并返回真实有效的生成文本！',
          response: response.trim()
        };
      } else {
        throw new Error('API 返回 200 OK，但响应数据中未能解析出有效文本内容');
      }
    } catch (error) {
      console.error('[AIService] 文本API测试连接失败:', error);
      const diagnosticMsg = this.diagnoseApiError(
        error,
        this.textConfig?.url,
        this.textConfig?.model,
        this.textConfig?.type
      );
      return {
        success: false,
        message: diagnosticMsg,
        error: error.message || String(error)
      };
    }
  }

  /**
   * 测试图像API连接
   */
  async testImageAPI() {
    await this.loadSettings();
    console.log('[AIService] 开始测试图像API连接, 当前配置:', {
      type: this.imageConfig?.type,
      url: this.imageConfig?.url,
      model: this.imageConfig?.model,
      hasApiKey: !!(this.imageConfig?.apiKey && this.imageConfig?.apiKey.trim()),
      isConfigured: this.isImageConfigured()
    });

    if (!this.isImageConfigured()) {
      return {
        success: false,
        message: '❌ [配置未完成] 图像API未配置（请填写有效的 API URL 或 API Key）',
        error: '请检查设置面板中的图像 API 配置'
      };
    }

    try {
      const testPrompt = 'a simple test image, cute cat background';
      const imageUrl = await this.callImageAPI(testPrompt);
      
      if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
        console.log('[AIService] 图像API测试连接成功，返回图像地址:', imageUrl);
        return {
          success: true,
          message: '✅ [测试成功] 已成功连接 API 并返回真实可用的图像数据！',
          imageUrl: imageUrl.trim()
        };
      } else {
        throw new Error('API 返回 200 OK，但返回的图像 URL 为空');
      }
    } catch (error) {
      console.error('[AIService] 图像API测试连接失败:', error);
      const diagnosticMsg = this.diagnoseApiError(
        error,
        this.imageConfig?.url,
        this.imageConfig?.model,
        this.imageConfig?.type
      );
      return {
        success: false,
        message: diagnosticMsg,
        error: error.message || String(error)
      };
    }
  }

  /**
   * 获取当前配置状态
   */
  getConfigStatus() {
    return {
      textConfigured: this.isConfigured(),
      imageConfigured: this.isImageConfigured(),
      isGenerating: this.isGenerating
    };
  }

  /**
   * 应用知识库更新
   * @param {Object} currentKB - 当前知识库
   * @param {Object} updates - 更新数据
   */
  applyKnowledgeUpdates(currentKB, updates) {
    if (!updates || typeof updates !== 'object') {
      return currentKB;
    }

    const updatedKB = Utils.deepClone(currentKB);

    for (const [path, value] of Object.entries(updates)) {
      if (typeof path !== 'string') continue;

      const pathParts = path.split('.');
      let current = updatedKB;

      // 创建嵌套结构
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!(part in current) || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }

      // 设置最终值
      const finalKey = pathParts[pathParts.length - 1];
      current[finalKey] = value;
    }

    return updatedKB;
  }
}

// 创建全局AI服务实例
window.aiService = new AIService();
