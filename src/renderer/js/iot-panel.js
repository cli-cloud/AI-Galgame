/**
 * IoT面板控制器
 */
class IoTPanelController {
  constructor() {
    this.chartInstance = null;
    this.updateInterval = null;
    this.init();
  }

  async init() {
    await window.iotManager.waitUntilReady();

    // 加载IoT管理器状态
    const status = window.iotManager.getStatus();
    
    // 初始化UI
    document.getElementById('iotEnabled').checked = status.enabled;
    document.getElementById('deviceIP').value = status.deviceIP || '';
    document.getElementById('gameMode').value = status.gameMode;
    document.getElementById('gameModeValue').textContent = status.gameMode;
    document.getElementById('heartRateTarget').value = status.heartRateTarget;
    document.getElementById('targetValue').textContent = status.heartRateTarget;
    
    // 体感控制设置
    document.getElementById('gestureEnabled').checked = status.gestureEnabled ?? true;
    document.getElementById('gestureThreshold').value = status.gestureThreshold ?? 2.0;
    document.getElementById('gestureThresholdValue').textContent = (status.gestureThreshold ?? 2.0).toFixed(1);
    document.getElementById('gestureMaxInterval').value = status.gestureMaxInterval ?? 800;
    document.getElementById('gestureIntervalValue').textContent = status.gestureMaxInterval ?? 800;
    document.getElementById('gestureDebounceInterval').value = status.gestureDebounceInterval ?? 200;
    document.getElementById('gestureDebounceValue').textContent = status.gestureDebounceInterval ?? 200;
    
    // 更新SRI显示
  await this.updateSRIDisplay();
    
    // 更新连接状态
  await this.updateConnectionStatus();
    
    // 初始化图表
    this.initChart();
    
    // 刷新串口列表
    await this.refreshSerialPorts();
    
    // 绑定事件
    this.bindEvents();
    
    // 监听IoT事件
    window.iotManager.on('heartrate', (data) => {
      this.updateHeartRateDisplay(data);
    });
    
    window.iotManager.on('connect', () => {
      this.updateConnectionStatus();
    });
    
    window.iotManager.on('disconnect', () => {
      this.updateConnectionStatus();
    });
    
    // 监听SRI数据更新（来自测试窗口）
    if (window.electronAPI && window.electronAPI.ipc) {
      window.electronAPI.ipc.on('sri-data-updated', (data) => {
        console.log('收到SRI数据更新通知:', data);
        this.updateSRIDisplay();
      });
    }
    
    // 开始定时更新
    this.startUpdates();
  }

  bindEvents() {
    // 标签切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // IoT启用开关
    document.getElementById('iotEnabled').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      window.iotManager.setEnabled(enabled);

      if (!enabled) {
        await this.disconnect();
      } else {
        await window.iotManager.ensureConnection();
        await this.updateConnectionStatus();
        Utils.showNotification('IoT功能已启用', 'success');
      }
    });

    // 游戏模式滑块
    document.getElementById('gameMode').addEventListener('input', (e) => {
      document.getElementById('gameModeValue').textContent = e.target.value;
    });

    // 心率目标滑块
    document.getElementById('heartRateTarget').addEventListener('input', (e) => {
      document.getElementById('targetValue').textContent = e.target.value;
    });

    // 体感控制开关
    document.getElementById('gestureEnabled').addEventListener('change', (e) => {
      window.iotManager.setGestureEnabled(e.target.checked);
      Utils.showNotification(
        `体感控制已${e.target.checked ? '启用' : '禁用'}`, 
        'success'
      );
    });

    // 体感阈值滑块
    document.getElementById('gestureThreshold').addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('gestureThresholdValue').textContent = value.toFixed(1);
    });
    
    document.getElementById('gestureThreshold').addEventListener('change', (e) => {
      const value = parseFloat(e.target.value);
      window.iotManager.setGestureThreshold(value);
      Utils.showNotification(`体感阈值已设置为 ${value.toFixed(1)}g`, 'success');
    });

    // 体感时间间隔滑块
    document.getElementById('gestureMaxInterval').addEventListener('input', (e) => {
      document.getElementById('gestureIntervalValue').textContent = e.target.value;
    });
    
    document.getElementById('gestureMaxInterval').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      window.iotManager.setGestureMaxInterval(value);
      Utils.showNotification(`体感时间间隔已设置为 ${value}ms`, 'success');
    });

    // 体感降噪间隔滑块
    document.getElementById('gestureDebounceInterval').addEventListener('input', (e) => {
      document.getElementById('gestureDebounceValue').textContent = e.target.value;
    });
    
    document.getElementById('gestureDebounceInterval').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      window.iotManager.setGestureDebounceInterval(value);
      Utils.showNotification(`体感降噪间隔已设置为 ${value}ms`, 'success');
    });

    // 设备IP
    document.getElementById('deviceIP').addEventListener('change', (e) => {
      window.iotManager.setDeviceIP(e.target.value);
    });

    // 串口选择
    document.getElementById('serialPort').addEventListener('change', (e) => {
      window.iotManager.setSerialConfig(e.target.value, parseInt(document.getElementById('baudRate').value, 10));
    });

    // 波特率选择
    document.getElementById('baudRate').addEventListener('change', (e) => {
      const currentPort = document.getElementById('serialPort').value;
      window.iotManager.setSerialConfig(currentPort, parseInt(e.target.value, 10));
    });
  }

  switchTab(tabName) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 更新内容显示
    document.querySelectorAll('.tab-pane').forEach(pane => {
      if (pane.id === tabName) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });
  }

  async connectWebSocket() {
    const ip = document.getElementById('deviceIP').value.trim();
    
    if (!ip) {
      Utils.showNotification('请输入设备IP地址', 'error');
      return;
    }

    Utils.showGlobalOverlay('正在连接设备...');

    try {
  await window.iotManager.connectWebSocket(ip);
      Utils.hideGlobalOverlay();
      Utils.showNotification('WebSocket连接成功！', 'success');
      const toggle = document.getElementById('iotEnabled');
      if (toggle) {
        toggle.checked = true;
      }
  await this.updateConnectionStatus();
    } catch (error) {
      Utils.hideGlobalOverlay();
      Utils.showNotification('连接失败: ' + error.message, 'error');
    }
  }

  async connectSerial() {
    const port = document.getElementById('serialPort').value;
    const baudRate = parseInt(document.getElementById('baudRate').value, 10) || 115200;

    if (!port) {
      Utils.showNotification('请选择串口', 'error');
      return;
    }

    Utils.showGlobalOverlay('正在连接串口...');

    try {
  await window.iotManager.connectSerial(port, baudRate);
      Utils.hideGlobalOverlay();
      Utils.showNotification('串口连接成功！', 'success');
      const toggle = document.getElementById('iotEnabled');
      if (toggle) {
        toggle.checked = true;
      }
  await this.updateConnectionStatus();
    } catch (error) {
      Utils.hideGlobalOverlay();
      Utils.showNotification('连接失败: ' + error.message, 'error');
    }
  }

  async disconnect() {
  await window.iotManager.disconnect();
    window.iotManager.setEnabled(false);
    const toggle = document.getElementById('iotEnabled');
    if (toggle) {
      toggle.checked = false;
    }
  await this.updateConnectionStatus();
    Utils.showNotification('已断开连接', 'info');
  }

  async refreshSerialPorts() {
    await window.iotManager.waitUntilReady();

    const select = document.getElementById('serialPort');
    select.innerHTML = '<option value="">扫描中...</option>';

    try {
      const ports = await window.electronAPI.ipc.invoke('iot-list-serial-ports');
      
      select.innerHTML = '<option value="">选择串口...</option>';
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = `${port.path}${port.manufacturer ? ' - ' + port.manufacturer : ''}`;
        select.appendChild(option);
      });

      const status = window.iotManager.getStatus();
      const savedPort = status.serialPort;
      if (savedPort) {
        select.value = savedPort;
      }

      const baudSelect = document.getElementById('baudRate');
      const savedBaud = status.serialBaudRate || 115200;
      if (baudSelect) {
        baudSelect.value = savedBaud.toString();
      }

      if (ports.length === 0) {
        select.innerHTML = '<option value="">未找到串口设备</option>';
      }
    } catch (error) {
      console.error('获取串口列表失败:', error);
      select.innerHTML = '<option value="">获取失败</option>';
    }
  }

  async updateConnectionStatus() {
    await window.iotManager.waitUntilReady();
    const status = window.iotManager.getStatus();
    const statusDiv = document.getElementById('connectionStatus');

    if (status.connected) {
      statusDiv.innerHTML = `
        <div class="status-icon connected">
          <i class="fa fa-circle-check"></i>
        </div>
        <div class="status-text">
          <h3>已连接</h3>
          <p>${status.connectionType === 'websocket' ? 
            `WebSocket - ${status.deviceIP}` : 
            `串口 - ${status.serialPort}${status.serialBaudRate ? ' @ ' + status.serialBaudRate + 'bps' : ''}`
          }</p>
        </div>
      `;
    } else {
      statusDiv.innerHTML = `
        <div class="status-icon disconnected">
          <i class="fa fa-circle-xmark"></i>
        </div>
        <div class="status-text">
          <h3>未连接</h3>
          <p>请选择连接方式</p>
        </div>
      `;
    }
  }

  updateHeartRateDisplay(data) {
    // 更新当前心率
    document.getElementById('currentHR').textContent = data.bpm || '--';
    
    // 更新手指检测状态
    const fingerStatus = document.getElementById('fingerStatus');
    if (data.fingerDetected) {
      fingerStatus.innerHTML = '<i class="fa fa-hand"></i> 检测到手指';
      fingerStatus.style.color = '#28a745';
    } else {
      fingerStatus.innerHTML = '<i class="fa fa-hand"></i> 等待检测...';
      fingerStatus.style.color = '#6c757d';
    }

    // 更新图表
    this.updateChart(data.bpm);

    // 更新统计数据
    this.updateStatistics();

    // 更新情绪分析
    this.updateEmotionAnalysis();
  }

  initChart() {
    const canvas = document.getElementById('heartRateChart');
    const ctx = canvas.getContext('2d');
    
    this.chartData = {
      labels: [],
      data: []
    };

    // 简单的canvas图表绘制
    this.drawChart(ctx);
  }

  updateChart(bpm) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    this.chartData.labels.push(timeStr);
    this.chartData.data.push(bpm);

    // 保持最近60个数据点
    if (this.chartData.labels.length > 60) {
      this.chartData.labels.shift();
      this.chartData.data.shift();
    }

    // 重绘图表
    const canvas = document.getElementById('heartRateChart');
    const ctx = canvas.getContext('2d');
    this.drawChart(ctx);
  }

  drawChart(ctx) {
    const canvas = ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 背景
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    if (this.chartData.data.length === 0) {
      // 显示暂无数据
      ctx.fillStyle = '#999';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', width / 2, height / 2);
      return;
    }

    // 计算数据范围
    const minBPM = Math.min(...this.chartData.data, 50);
    const maxBPM = Math.max(...this.chartData.data, 100);
    const range = maxBPM - minBPM;

    // 绘制网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (height - 2 * padding) * i / 5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      // Y轴标签
      const value = Math.round(maxBPM - range * i / 5);
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(value, padding - 10, y + 4);
    }

    // 绘制折线
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();

    this.chartData.data.forEach((bpm, index) => {
      const x = padding + (width - 2 * padding) * index / (this.chartData.data.length - 1 || 1);
      const y = height - padding - (height - 2 * padding) * (bpm - minBPM) / (range || 1);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // 绘制数据点
    this.chartData.data.forEach((bpm, index) => {
      const x = padding + (width - 2 * padding) * index / (this.chartData.data.length - 1 || 1);
      const y = height - padding - (height - 2 * padding) * (bpm - minBPM) / (range || 1);

      ctx.fillStyle = '#667eea';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  updateStatistics() {
    const trend = window.iotManager.getHeartRateTrend();
    
    document.getElementById('avgHR').textContent = trend.avgRate || '--';
    document.getElementById('maxHR').textContent = trend.maxRate || '--';
    document.getElementById('minHR').textContent = trend.minRate || '--';
    document.getElementById('trendHR').textContent = window.iotManager.translateTrend(trend.trend);
  }

  updateEmotionAnalysis() {
    const emotional = window.iotManager.analyzeEmotionalState();
    
    document.getElementById('emotionState').textContent = 
      window.iotManager.translateEmotionalState(emotional.state);
    
    // 更新进度条
    this.setEmotionBar('excitementBar', 'excitementPercent', emotional.excitement);
    this.setEmotionBar('tensionBar', 'tensionPercent', emotional.tension);
    this.setEmotionBar('engagementBar', 'engagementPercent', emotional.engagement);
    
    // 输出调试信息(可选)
    if (emotional._debug) {
      console.log('📊 情绪分析调试信息:', {
        情绪状态: emotional.state,
        兴奋度: emotional.excitement,
        紧张度: emotional.tension,
        参与度: emotional.engagement,
        当前心率: emotional.heartRate,
        基线心率: emotional._debug.baselineHR,
        标准差: emotional._debug.stdDev,
        心率范围: emotional._debug.hrRange,
        方差: emotional._debug.variance
      });
    }
  }

  setEmotionBar(barId, percentId, value) {
    const bar = document.getElementById(barId);
    const percent = document.getElementById(percentId);
    
    bar.style.width = value + '%';
    percent.textContent = value + '%';

    // 根据数值设置颜色
    if (value < 30) {
      bar.style.backgroundColor = '#28a745';
    } else if (value < 70) {
      bar.style.backgroundColor = '#ffc107';
    } else {
      bar.style.backgroundColor = '#dc3545';
    }
  }

  saveGameSettings() {
    const gameMode = parseInt(document.getElementById('gameMode').value);
    const heartRateTarget = parseInt(document.getElementById('heartRateTarget').value);
    const gestureThreshold = parseFloat(document.getElementById('gestureThreshold').value);
    const gestureMaxInterval = parseInt(document.getElementById('gestureMaxInterval').value);
    const gestureDebounceInterval = parseInt(document.getElementById('gestureDebounceInterval').value);

    window.iotManager.setGameMode(gameMode);
    window.iotManager.setHeartRateTarget(heartRateTarget);
    window.iotManager.setGestureThreshold(gestureThreshold);
    window.iotManager.setGestureMaxInterval(gestureMaxInterval);
    window.iotManager.setGestureDebounceInterval(gestureDebounceInterval);

    Utils.showNotification('游戏设置已保存！', 'success');
  }
  async startSRITest() {
    try {
      // 打开SRI测试窗口
      await window.electronAPI.window.openSRITest();
    } catch (error) {
      console.error('打开SRI测试失败:', error);
      Utils.showNotification('无法打开测试窗口', 'error');
    }
  }

  async updateSRIDisplay() {
    // 重新加载最新的SRI结果（确保显示持久化数据）
    await window.iotManager.loadSRIResult();
    
    const status = window.iotManager.getStatus();
    
    if (status.sriTested && status.sriScore > 0) {
      document.getElementById('sriScoreDisplay').textContent = status.sriScore;
      document.getElementById('sriLevelDisplay').textContent = 
        window.iotManager.getSRILevel();
      
      // 如果有详细维度数据，也显示
      if (window.iotManager.sriScores) {
        const scores = window.iotManager.sriScores;
        console.log('📊 SRI详细数据:', {
          总分: scores.total,
          情感压抑: scores.emotional,
          生理压抑: scores.physical,
          社交压抑: scores.social
        });
      }
      
      console.log('✅ SRI分数已加载并显示:', status.sriScore);
    } else {
      document.getElementById('sriScoreDisplay').textContent = '--';
      document.getElementById('sriLevelDisplay').textContent = '未测试';
      console.log('ℹ️ 尚未进行SRI测试');
    }
  }
  startUpdates() {
    // 每秒更新一次显示
    this.updateInterval = setInterval(() => {
      if (window.iotManager.connected) {
        // 刷新统计和情绪分析
        this.updateStatistics();
        this.updateEmotionAnalysis();
      }
    }, 1000);
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// 创建全局实例
let iotPanel;

window.addEventListener('DOMContentLoaded', () => {
  iotPanel = new IoTPanelController();
});

window.addEventListener('beforeunload', () => {
  if (iotPanel) {
    iotPanel.destroy();
  }
});

// 监听SRI测试完成事件
if (window.electronAPI && window.electronAPI.ipc) {
  window.electronAPI.ipc.on('sri-test-updated', () => {
    if (iotPanel) {
      iotPanel.updateSRIDisplay();
    }
  });
}
