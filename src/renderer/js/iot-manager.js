/**
 * IoT设备管理器 - 心率监测与情绪分析
 */
class IoTManager {
  constructor() {
    this.connected = false;
    this.enabled = false;
    this.deviceIP = '';
    this.serialPort = null;
    this.serialBaudRate = 115200;
    this.connectionType = 'websocket'; // 'websocket' 或 'serial'
    this.connecting = false;
    this.ready = false;
    this.readyPromise = null;
    this.serialDataHandler = null;
    this.serialErrorHandler = null;
    this.lastSavedSignature = null;
    this.isIoTPanelContext = typeof window !== 'undefined' && window.location && window.location.pathname && window.location.pathname.includes('iot-panel.html');
    
    // 心率数据
    this.currentHeartRate = 0;
    this.heartRateHistory = []; // 最近5分钟的数据
    this.maxHistoryLength = 300; // 5分钟 * 60秒
    this.fingerDetected = false;
    
    // SRI指数 (Sexual Repression Index)
    this.sriScore = 0; // 0-100
    this.sriTested = false;
    
    // 游戏模式设置
    this.gameMode = 5; // 1-10, 类似温度
    this.heartRateTarget = 120; // 心率目标上限
    
    // 体感控制设置
    this.gestureEnabled = true; // 体感控制开关 - 默认启用
    this.gestureThreshold = 2.0; // 合加速度阈值 (g)
    this.gestureMaxInterval = 800; // 连续摇动的最大时间间隔 (ms)
    this.gestureDebounceInterval = 200; // 手势降噪时间间隔 (ms) - 忽略过短间隔的信号
    this.gestureHistory = []; // 摇动历史记录
    this.lastGestureTime = 0; // 上次摇动时间
    this.gestureSingleTimer = null; // 单次摇动延迟计时器
    
    // WebSocket连接
    this.ws = null;
    this.wsReconnectTimer = null;
    
    // 事件监听器
    this.listeners = {
      'heartrate': [],
      'connect': [],
      'disconnect': [],
      'error': [],
      'gesture': []  // 体感事件
    };

    if (window.electronAPI && window.electronAPI.ipc) {
      this.serialDataHandler = (data) => {
        console.log('IoTManager 收到串口数据:', data);
        this.handleSerialData(data);
      };

      this.serialErrorHandler = (message) => {
        console.error('IoTManager 收到串口错误:', message);
        this.connected = false;
        this.emit('error', new Error(message));
        this.emit('disconnect');
        if (this.enabled) {
          this.ensureConnection();
        }
      };

      window.electronAPI.ipc.on('iot-settings-updated', (settings) => {
        this.applySettings(settings);
      });

      // 监听主进程连接状态变化
      window.electronAPI.iot.onConnectionStateChanged((state) => {
        console.log('📡 收到主进程连接状态更新:', state);

        const wasConnected = this.connected;
        this.connected = !!state.connected;
        this.connectionType = state.connectionType || 'none';

        if (this.connected) {
          if (!wasConnected) {
            this.emit('connect', {
              type: this.connectionType,
              source: 'main-process'
            });
          }

          if (state.lastHeartRate > 0) {
            this.heartRate = state.lastHeartRate;
            this.emit('heartrate', {
              bpm: state.lastHeartRate,
              fingerDetected: state.fingerDetected
            });
          }
        } else if (wasConnected) {
          this.heartRate = 0;
          this.emit('disconnect', {
            source: 'main-process'
          });
        }
      });

      // 监听主进程SRI分数更新
      window.electronAPI.iot.onSRIScoreUpdated((data) => {
        console.log('📊 收到主进程SRI分数更新:', data);
        this.sriScore = data.total || 0;
      });

      console.log('✅ IoTManager: 注册串口数据监听器');
      window.electronAPI.ipc.on('iot-serial-data', this.serialDataHandler);
      window.electronAPI.ipc.on('iot-serial-error', this.serialErrorHandler);
    }

    this.readyPromise = this.initialize();
  }

  async initialize() {
    await this.loadSettings();
    
    // 从主进程同步IoT连接状态
    if (window.electronAPI && window.electronAPI.iot) {
      try {
        const state = await window.electronAPI.iot.getConnectionState();
        console.log('📡 从主进程同步IoT状态:', state);
        this.connected = !!state.connected;
        this.connectionType = state.connectionType || 'none';
        if (state.lastHeartRate > 0) {
          this.heartRate = state.lastHeartRate;
        }
        if (state.lastSRI > 0) {
          this.sriScore = state.lastSRI;
        }

        if (this.connected) {
          this.emit('connect', {
            type: this.connectionType,
            source: 'initial-sync'
          });

          if (this.heartRate > 0) {
            this.emit('heartrate', {
              bpm: this.heartRate,
              fingerDetected: !!state.fingerDetected
            });
          }
        }
      } catch (error) {
        console.warn('⚠️ 同步IoT状态失败:', error);
      }
    }
    
    this.ready = true;

    if (!this.isIoTPanelContext && this.enabled) {
      this.ensureConnection();
    }
  }

  async waitUntilReady() {
    if (this.ready) return;
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    try {
      // 加载IoT基本设置
      const settings = await window.electronAPI.storage.get('iotSettings');
      if (settings && typeof settings === 'object') {
        this.enabled = settings.enabled ?? false;
        this.deviceIP = settings.deviceIP || '';
        this.serialPort = settings.serialPort || null;
        this.serialBaudRate = settings.serialBaudRate || 115200;
        this.connectionType = settings.connectionType || 'websocket';
        this.sriScore = settings.sriScore ?? 0;
        this.sriTested = settings.sriTested ?? false;
        this.gameMode = settings.gameMode ?? 5;
        this.heartRateTarget = settings.heartRateTarget ?? 120;

        if (Object.prototype.hasOwnProperty.call(settings, 'gestureEnabled')) {
          this.gestureEnabled = !!settings.gestureEnabled;
        }

        if (Object.prototype.hasOwnProperty.call(settings, 'gestureThreshold')) {
          const parsedThreshold = typeof settings.gestureThreshold === 'number'
            ? settings.gestureThreshold
            : parseFloat(settings.gestureThreshold);
          if (!Number.isNaN(parsedThreshold) && parsedThreshold > 0) {
            this.gestureThreshold = parsedThreshold;
          }
        }

        if (Object.prototype.hasOwnProperty.call(settings, 'gestureMaxInterval')) {
          const parsedInterval = typeof settings.gestureMaxInterval === 'number'
            ? settings.gestureMaxInterval
            : parseInt(settings.gestureMaxInterval, 10);
          if (!Number.isNaN(parsedInterval) && parsedInterval > 0) {
            this.gestureMaxInterval = parsedInterval;
          }
        }

        if (Object.prototype.hasOwnProperty.call(settings, 'gestureDebounceInterval')) {
          const parsedDebounce = typeof settings.gestureDebounceInterval === 'number'
            ? settings.gestureDebounceInterval
            : parseInt(settings.gestureDebounceInterval, 10);
          if (!Number.isNaN(parsedDebounce) && parsedDebounce >= 0) {
            this.gestureDebounceInterval = parsedDebounce;
          }
        }
      }

      // 加载持久化的SRI测试结果
      await this.loadSRIResult();
      
      console.log('IoT设置已加载, SRI分数:', this.sriScore, '已测试:', this.sriTested);
    } catch (error) {
      console.error('加载IoT设置失败:', error);
    }
  }

  /**
   * 加载SRI测试结果（从永久存储）
   */
  async loadSRIResult() {
    try {
      let sriData = null;
      
      // 优先从electronAPI读取
      if (window.electronAPI && window.electronAPI.storage) {
        sriData = await window.electronAPI.storage.get('sriTestResult');
      }
      
      // 降级到localStorage
      if (!sriData && typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('sriTestResult');
        if (stored) {
          sriData = JSON.parse(stored);
        }
      }
      
      if (sriData && sriData.scores) {
        this.sriScore = sriData.scores.total || 0;
        this.sriTested = true;
        
        // 如果有完整的维度数据，也保存下来
        if (sriData.scores) {
          this.sriScores = sriData.scores; // 保存完整的维度分数
        }
        
        console.log('✅ 已加载SRI测试结果:', {
          总分: this.sriScore,
          情感: sriData.scores.emotional,
          生理: sriData.scores.physical,
          社交: sriData.scores.social,
          测试时间: new Date(sriData.timestamp).toLocaleString()
        });
      } else {
        console.log('ℹ️ 未找到SRI测试结果');
      }
    } catch (error) {
      console.error('加载SRI测试结果失败:', error);
    }
  }

  /**
   * 保存设置
   */
  async saveSettings() {
    try {
      const settings = {
        enabled: this.enabled,
        deviceIP: this.deviceIP,
        serialPort: this.serialPort,
        serialBaudRate: this.serialBaudRate,
        connectionType: this.connectionType,
        sriScore: this.sriScore,
        sriTested: this.sriTested,
        gameMode: this.gameMode,
        heartRateTarget: this.heartRateTarget,
        gestureEnabled: this.gestureEnabled,
        gestureThreshold: this.gestureThreshold,
        gestureMaxInterval: this.gestureMaxInterval,
        gestureDebounceInterval: this.gestureDebounceInterval
      };
      this.lastSavedSignature = JSON.stringify(settings);
      await window.electronAPI.storage.set('iotSettings', settings);
    } catch (error) {
      console.error('保存IoT设置失败:', error);
    }
  }

  applySettings(settings) {
    if (!settings || typeof settings !== 'object') return;

    const incomingSignature = JSON.stringify(settings);
    if (this.lastSavedSignature && incomingSignature === this.lastSavedSignature) {
      this.lastSavedSignature = null;
      return;
    }

    this.lastSavedSignature = incomingSignature;

    this.enabled = settings.enabled ?? this.enabled;
    this.deviceIP = settings.deviceIP ?? this.deviceIP;
    this.serialPort = settings.serialPort ?? this.serialPort;
    this.serialBaudRate = settings.serialBaudRate ?? this.serialBaudRate;
    this.connectionType = settings.connectionType ?? this.connectionType;
    this.sriScore = settings.sriScore ?? this.sriScore;
    this.sriTested = settings.sriTested ?? this.sriTested;
    this.gameMode = settings.gameMode ?? this.gameMode;
    this.heartRateTarget = settings.heartRateTarget ?? this.heartRateTarget;
    this.gestureEnabled = settings.gestureEnabled ?? this.gestureEnabled;
    this.gestureThreshold = settings.gestureThreshold ?? this.gestureThreshold;
    this.gestureMaxInterval = settings.gestureMaxInterval ?? this.gestureMaxInterval;
    this.gestureDebounceInterval = settings.gestureDebounceInterval ?? this.gestureDebounceInterval;

    if (!this.isIoTPanelContext) {
      if (this.enabled) {
        this.ensureConnection();
      } else if (this.connected) {
        this.disconnect();
      }
    }
  }

  /**
   * 连接设备 - WebSocket方式
   */
  async connectWebSocket(ip) {
    if (!ip) {
      throw new Error('请输入设备IP地址');
    }

    this.deviceIP = ip;
    this.connectionType = 'websocket';

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `ws://${ip}:81`;
        console.log('正在连接到:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket连接成功');
          this.connected = true;
          this.enabled = true;
          this.emit('connect', { type: 'websocket', ip });
          this.saveSettings();
          resolve(true);
        };
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleDeviceData(data);
          } catch (error) {
            console.error('解析WebSocket数据失败:', error);
          }
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocket错误:', error);
          this.emit('error', error);
          reject(new Error('WebSocket连接失败'));
        };
        
        this.ws.onclose = () => {
          console.log('WebSocket连接断开');
          this.connected = false;
          this.emit('disconnect');
          
          // 自动重连
          if (this.enabled) {
            this.scheduleReconnect();
          }
        };
        
        // 超时处理
        setTimeout(() => {
          if (!this.connected) {
            this.ws.close();
            reject(new Error('连接超时'));
          }
        }, 5000);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 连接设备 - 串口方式
   */
  async connectSerial(port, baudRate = 115200) {
    await this.waitUntilReady();

    if (!port) {
      throw new Error('请选择串口');
    }

    if (this.connecting) {
      throw new Error('正在建立串口连接，请稍候');
    }

    this.connecting = true;
    this.serialPort = port;
    this.serialBaudRate = baudRate;
    this.connectionType = 'serial';

    try {
      const result = await window.electronAPI.ipc.invoke('iot-serial-connect', port, baudRate);

      if (!result || !result.success) {
        throw new Error(result && result.message ? result.message : '串口连接失败');
      }

      this.connected = true;
      this.enabled = true;

      await this.saveSettings();
      this.emit('connect', { type: 'serial', port });
      return true;
    } catch (error) {
      console.error('串口连接失败:', error);
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.serialPort && this.connected) {
      try {
        await window.electronAPI.ipc.invoke('iot-serial-disconnect');
      } catch (error) {
        console.error('断开串口失败:', error);
      }
    }

    this.connected = false;
    this.currentHeartRate = 0;
    this.fingerDetected = false;

    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    this.emit('disconnect');
  }

  /**
   * 重连调度
   */
  scheduleReconnect() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
    }

    this.wsReconnectTimer = setTimeout(() => {
      if (!this.connected && this.enabled) {
        console.log('尝试重新连接IoT设备...');
        if (this.connectionType === 'websocket' && this.deviceIP) {
          this.connectWebSocket(this.deviceIP).catch(err => {
            console.error('重连失败:', err);
          });
        }
      }
    }, 5000); // 5秒后重试
  }

  /**
   * 处理设备数据 - WebSocket
   */
  handleDeviceData(data) {
    // 忽略系统消息和调试信息
    if (data.type === 'system' || data.type === 'threshold_info') {
      if (this.isIoTPanelContext) {
        console.log('[IoT系统消息]', data);
      }
      return;
    }
    
    if (data.type === 'heartrate') {
      this.currentHeartRate = data.bpm || 0;
      this.fingerDetected = data.fingerDetected || false;
      
      // 添加到情绪分析器
      if (window.emotionAnalyzer && this.currentHeartRate > 0) {
        window.emotionAnalyzer.addHeartRate(this.currentHeartRate);
      }
      
      // 记录历史
      this.heartRateHistory.push({
        bpm: this.currentHeartRate,
        timestamp: Date.now()
      });
      
      // 限制历史长度
      if (this.heartRateHistory.length > this.maxHistoryLength) {
        this.heartRateHistory.shift();
      }
      
      // 触发事件
      this.emit('heartrate', {
        bpm: this.currentHeartRate,
        fingerDetected: this.fingerDetected,
        instant: data.instant
      });
    } else if (data.type === 'gesture') {
      // 处理体感数据
      this.handleGestureData(data);
    }
  }

  /**
   * 处理串口数据
   */
  handleSerialData(jsonData) {
    try {
      console.log('handleSerialData 处理数据:', jsonData);
      
      // 忽略系统消息(启动、日志等)
      if (jsonData.type === 'system') {
        console.log(`📋 系统消息: ${jsonData.event}`, jsonData);
        return; // 系统消息不影响游戏逻辑
      }
      
      if (jsonData.type === 'threshold_info') {
        console.log(`⚙️ 阈值信息:`, jsonData);
        return; // 阈值信息仅供参考
      }
      
      if (jsonData.type === 'heartbeat') {
        this.currentHeartRate = jsonData.heartRate || 0;
        this.fingerDetected = jsonData.fingerDetected || false;
        
        console.log(`💓 心率更新: ${this.currentHeartRate} BPM, 手指检测: ${this.fingerDetected}`);
        
        // 添加到情绪分析器
        if (window.emotionAnalyzer && this.currentHeartRate > 0) {
          window.emotionAnalyzer.addHeartRate(this.currentHeartRate);
        }
        
        // 记录历史
        this.heartRateHistory.push({
          bpm: this.currentHeartRate,
          timestamp: Date.now()
        });
        
        if (this.heartRateHistory.length > this.maxHistoryLength) {
          this.heartRateHistory.shift();
        }
        
        const eventData = {
          bpm: this.currentHeartRate,
          fingerDetected: this.fingerDetected
        };
        console.log('📢 触发 heartrate 事件:', eventData, `监听器数量: ${this.listeners.heartrate.length}`);
        this.emit('heartrate', eventData);
        
      } else if (jsonData.type === 'gesture') {
        // 处理体感数据
        console.log('🎮 收到体感数据:', jsonData);
        this.handleGestureData(jsonData);
        
      } else if (jsonData.type === 'status') {
        // 状态查询响应
        console.log('📊 设备状态:', jsonData);
      }
    } catch (error) {
      console.error('处理串口数据失败:', error);
    }
  }

  /**
   * 获取心率趋势分析
   * @returns {Object} 趋势分析结果
   */
  getHeartRateTrend() {
    if (this.heartRateHistory.length < 10) {
      return {
        trend: 'insufficient_data',
        avgRate: 0,
        minRate: 0,
        maxRate: 0,
        variance: 0
      };
    }

    const recent = this.heartRateHistory.slice(-60); // 最近1分钟
    const rates = recent.map(r => r.bpm);
    
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    
    // 计算方差
    const variance = rates.reduce((sum, rate) => {
      return sum + Math.pow(rate - avgRate, 2);
    }, 0) / rates.length;
    
    // 判断趋势
    const recentAvg = rates.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const olderAvg = rates.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    
    let trend = 'stable';
    if (recentAvg > olderAvg + 5) trend = 'rising';
    else if (recentAvg < olderAvg - 5) trend = 'falling';
    
    return {
      trend,
      avgRate: Math.round(avgRate),
      minRate,
      maxRate,
      variance: Math.round(variance * 100) / 100,
      recentAvg: Math.round(recentAvg),
      olderAvg: Math.round(olderAvg)
    };
  }

  /**
   * 分析用户情绪状态
   * @returns {Object} 情绪分析结果
   */
  analyzeEmotionalState() {
    const trend = this.getHeartRateTrend();
    
    // 如果数据不足,返回默认值
    if (trend.trend === 'insufficient_data' || this.heartRateHistory.length < 10) {
      return {
        state: 'calm',
        excitement: 0,
        tension: 0,
        engagement: 0,
        heartRate: this.currentHeartRate,
        trend: 'stable'
      };
    }
    
    // 使用动态基线(平均心率)而非固定值
    const baselineHR = trend.avgRate;
    const currentHR = this.currentHeartRate;
    
    // 计算兴奋度 (0-100)
    // 基于当前心率与平均心率的偏差百分比
    const hrDeviation = currentHR - baselineHR;
    const excitement = Math.max(0, Math.min(100, 
      (hrDeviation / baselineHR) * 200  // 偏差10%对应20%兴奋度
    ));
    
    // 计算紧张度 (0-100)
    // 基于心率变异性(方差的平方根,即标准差)
    const stdDev = Math.sqrt(trend.variance);
    // 正常心率标准差约5-15,紧张时可达20-30
    const tension = Math.max(0, Math.min(100, 
      ((stdDev - 5) / 25) * 100  // 标准差5对应0%,30对应100%
    ));
    
    // 计算参与度 (0-100)
    // 基于心率变化幅度和波动性
    const hrRange = trend.maxRate - trend.minRate;
    // 正常参与时心率范围约10-30,高度参与时可达30-50
    const engagement = Math.max(20, Math.min(100, 
      (hrRange / 40) * 100  // 范围40对应100%参与度,最低20%
    ));
    
    // 综合情绪状态判定
    let emotionalState = 'calm';
    
    if (excitement > 60 && tension > 60) {
      emotionalState = 'aroused';  // 高兴奋高紧张 = 激动
    } else if (excitement > 50 && tension < 40) {
      emotionalState = 'excited';  // 高兴奋低紧张 = 愉快兴奋
    } else if (tension > 60) {
      emotionalState = 'anxious';  // 高紧张 = 焦虑
    } else if (engagement < 30 && excitement < 30) {
      emotionalState = 'bored';    // 低参与低兴奋 = 无聊
    } else if (excitement < 30 && tension < 30) {
      emotionalState = 'calm';     // 低兴奋低紧张 = 平静
    } else {
      emotionalState = 'neutral';  // 中等状态
    }
    
    return {
      state: emotionalState,
      excitement: Math.round(excitement),
      tension: Math.round(tension),
      engagement: Math.round(engagement),
      heartRate: currentHR,
      trend: trend.trend,
      // 调试信息
      _debug: {
        baselineHR: baselineHR,
        stdDev: Math.round(stdDev * 10) / 10,
        hrRange: hrRange,
        variance: trend.variance
      }
    };
  }

  /**
   * 生成游戏提示词增强信息
   * @returns {string} LLM提示词增强部分
   */
  generateGamePromptEnhancement() {
    if (!this.enabled || !this.connected || !this.fingerDetected) {
      return '';
    }

    const emotional = this.analyzeEmotionalState();
    const trend = this.getHeartRateTrend();
    
    let prompt = '\n\n[生理状态反馈]\n';
    prompt += `用户SRI指数: ${this.sriScore}/100 (性压抑程度: ${this.getSRILevel()})\n`;
    prompt += `当前心率: ${this.currentHeartRate} BPM\n`;
    prompt += `平均心率: ${trend.avgRate} BPM\n`;
    prompt += `心率趋势: ${this.translateTrend(trend.trend)}\n`;
    prompt += `情绪状态: ${this.translateEmotionalState(emotional.state)}\n`;
    prompt += `兴奋度: ${emotional.excitement}%\n`;
    prompt += `紧张度: ${emotional.tension}%\n`;
    prompt += `参与度: ${emotional.engagement}%\n`;
    prompt += `游戏模式强度: ${this.gameMode}/10\n`;
    
    // 根据游戏模式和情绪状态给出创作建议
    prompt += '\n[创作指导]\n';
    
    if (this.gameMode >= 7) {
      prompt += '- 当前为高强度模式，创作更具刺激性和挑战性的内容\n';
    } else if (this.gameMode <= 3) {
      prompt += '- 当前为低强度模式,创作更温和舒缓的内容\n';
    }
    
    if (emotional.excitement < 30) {
      prompt += '- 用户兴奋度较低,建议增加更多刺激和惊喜元素\n';
    } else if (emotional.excitement > 70) {
      prompt += '- 用户已高度兴奋,可以适当降低刺激强度避免过度\n';
    }
    
    if (emotional.engagement < 40) {
      prompt += '- 用户参与度不足,建议增加互动性和选择的重要性\n';
    }
    
    if (this.currentHeartRate > this.heartRateTarget * 0.9) {
      prompt += `- ⚠️ 心率接近上限(${this.heartRateTarget} BPM),请降低刺激强度确保安全\n`;
    }
    
    return prompt;
  }

  /**
   * 翻译趋势
   */
  translateTrend(trend) {
    const map = {
      'rising': '上升中',
      'falling': '下降中',
      'stable': '平稳',
      'insufficient_data': '数据不足'
    };
    return map[trend] || trend;
  }

  /**
   * 翻译情绪状态
   */
  translateEmotionalState(state) {
    const map = {
      'calm': '平静',
      'neutral': '中性',
      'excited': '兴奋',
      'aroused': '激动',
      'anxious': '焦虑',
      'bored': '无聊'
    };
    return map[state] || state;
  }

  /**
   * 获取SRI等级描述
   */
  getSRILevel() {
    if (this.sriScore < 20) return '极低';
    if (this.sriScore < 40) return '低';
    if (this.sriScore < 60) return '中等';
    if (this.sriScore < 80) return '高';
    return '极高';
  }

  /**
   * 设置游戏模式
   */
  setGameMode(mode) {
    this.gameMode = Math.max(1, Math.min(10, mode));
    this.saveSettings();
  }

  /**
   * 设置心率目标上限
   */
  async ensureConnection() {
    await this.waitUntilReady();

    if (!this.enabled || this.connected || this.connecting) {
      return;
    }

    if (this.connectionType === 'serial' && this.serialPort) {
      try {
        await this.connectSerial(this.serialPort, this.serialBaudRate);
      } catch (error) {
        console.warn('自动串口连接失败:', error.message);
      }
    } else if (this.connectionType === 'websocket' && this.deviceIP) {
      try {
        await this.connectWebSocket(this.deviceIP);
      } catch (error) {
        console.warn('自动WebSocket连接失败:', error.message);
      }
    }
  }

  setHeartRateTarget(target) {
    this.heartRateTarget = Math.max(80, Math.min(180, target));
    this.saveSettings();
  }

  setDeviceIP(ipAddress) {
    this.deviceIP = (ipAddress || '').trim();
    this.saveSettings();
  }

  setSerialConfig(port, baudRate) {
    this.serialPort = port || null;
    if (baudRate) {
      this.serialBaudRate = baudRate;
    }
    this.saveSettings();
  }

  /**
   * 设置SRI分数
   */
  setSRIScore(score) {
    this.sriScore = Math.max(0, Math.min(100, score));
    this.sriTested = true;
    this.saveSettings();
  }

  /**
   * 设置体感控制开关
   */
  setGestureEnabled(enabled) {
    this.gestureEnabled = !!enabled;
    this.saveSettings();
    console.log(`🎮 体感控制${this.gestureEnabled ? '已启用' : '已禁用'}`);
  }

  /**
   * 设置体感合加速度阈值
   */
  setGestureThreshold(threshold) {
    this.gestureThreshold = Math.max(0.5, Math.min(10.0, parseFloat(threshold)));
    this.saveSettings();
    console.log(`🎮 体感阈值设置为: ${this.gestureThreshold}g`);
  }

  /**
   * 设置体感连续摇动最大时间间隔
   */
  setGestureMaxInterval(interval) {
    this.gestureMaxInterval = Math.max(200, Math.min(2000, parseInt(interval)));
    this.saveSettings();
    console.log(`🎮 体感时间间隔设置为: ${this.gestureMaxInterval}ms`);
  }

  /**
   * 设置体感降噪时间间隔
   */
  setGestureDebounceInterval(interval) {
    this.gestureDebounceInterval = Math.max(0, Math.min(1000, parseInt(interval)));
    this.saveSettings();
    console.log(`🎮 体感降噪间隔设置为: ${this.gestureDebounceInterval}ms`);
  }

  /**
   * 处理体感数据
   */
  handleGestureData(data) {
    if (!this.gestureEnabled) {
      console.log('⚠️ 体感控制未启用');
      return; // 体感控制未启用
    }

    const now = Date.now();
    const magnitude = data.magnitude || 0; // 合加速度幅度
    
    console.log(`🎮 收到体感数据: ${magnitude.toFixed(2)}g, 阈值: ${this.gestureThreshold}g`);

    // 检查是否超过阈值(设备端已做初步筛选,这里做二次确认)
    if (magnitude < this.gestureThreshold) {
      console.log(`⚠️ 体感幅度低于阈值 (${this.gestureThreshold}g), 忽略`);
      return;
    }

    // 降噪：忽略与上次摇动间隔过短的信号
    if (this.lastGestureTime > 0 && (now - this.lastGestureTime) < this.gestureDebounceInterval) {
      console.log(`⚠️ 与上次摇动间隔过短 (${now - this.lastGestureTime}ms < ${this.gestureDebounceInterval}ms), 忽略降噪`);
      return;
    }

    // 先清理过期的摇动记录
    this.gestureHistory = this.gestureHistory.filter(g => 
      now - g.timestamp <= this.gestureMaxInterval
    );

    // 检查是否在窗口期内已有摇动
    const previousGestureCount = this.gestureHistory.length;
    
    // 记录新的摇动
    this.gestureHistory.push({
      magnitude,
      timestamp: now
    });

    console.log(`📊 窗口期内摇动次数: ${previousGestureCount} → ${this.gestureHistory.length}`);

    const toleranceMs = Math.min(200, Math.max(50, Math.floor(this.gestureMaxInterval * 0.1)));

    if (previousGestureCount === 0) {
      // 这是窗口期内的第一次摇动 - 启动延迟计时器
      console.log('⏳ 第1次摇动, 启动延迟计时器等待第2次...');
      
      // 清除之前的计时器(如果有)
      if (this.gestureSingleTimer) {
        clearTimeout(this.gestureSingleTimer);
        this.gestureSingleTimer = null;
      }
      
      // 延迟触发单次摇动事件
      const firstGesture = this.gestureHistory[0];

      this.gestureSingleTimer = setTimeout(() => {
        const checkTime = Date.now();
        const remainingGestures = this.gestureHistory.filter(g => 
          checkTime - g.timestamp <= this.gestureMaxInterval + toleranceMs
        );

        console.log(`🔍 延迟检查: 最终摇动次数 = ${remainingGestures.length}`);

        if (remainingGestures.length === 1 && firstGesture) {
          // 确认为单次摇动 - 切换选项
          console.log('✅ 确认为单次摇动 → 触发选项切换');
          this.emit('gesture', {
            type: 'single',
            magnitude: firstGesture.magnitude,
            timestamp: firstGesture.timestamp
          });
        }

        // 清空历史和计时器
        this.gestureHistory = [];
        this.gestureSingleTimer = null;
      }, this.gestureMaxInterval);
      
    } else if (previousGestureCount === 1) {
      // 这是第二次摇动 - 立即触发确认
      console.log('✅ 检测到第2次摇动 → 立即触发确认');
      
      // 清除单次摇动的延迟计时器
      if (this.gestureSingleTimer) {
        clearTimeout(this.gestureSingleTimer);
        this.gestureSingleTimer = null;
      }
      
      const interval = now - this.gestureHistory[0].timestamp;
      
      this.emit('gesture', {
        type: 'double',
        magnitude,
        timestamp: now,
        interval
      });
      
      // 清空历史
      this.gestureHistory = [];
    } else {
      // 超过2次摇动 - 忽略
      console.log('⚠️ 摇动次数过多，忽略');
    }

    this.lastGestureTime = now;
  }

  /**
   * 启用/禁用IoT功能
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveSettings();
    
    if (!enabled) {
      // 面板会主动调用 disconnect，这里仅更新状态
    } else {
      this.ensureConnection();
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      connected: this.connected,
      enabled: this.enabled,
      heartRate: this.currentHeartRate,
      fingerDetected: this.fingerDetected,
      sriScore: this.sriScore,
      sriTested: this.sriTested,
      gameMode: this.gameMode,
      heartRateTarget: this.heartRateTarget,
      connectionType: this.connectionType,
      deviceIP: this.deviceIP,
      serialPort: this.serialPort,
      serialBaudRate: this.serialBaudRate,
      gestureEnabled: this.gestureEnabled,
      gestureThreshold: this.gestureThreshold,
      gestureMaxInterval: this.gestureMaxInterval,
      gestureDebounceInterval: this.gestureDebounceInterval
    };
  }

  /**
   * 事件监听
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * 移除事件监听
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('事件回调执行失败:', error);
        }
      });
    }
  }
}

// 创建全局实例
window.iotManager = new IoTManager();
