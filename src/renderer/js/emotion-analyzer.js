/**
 * 情绪分析器
 * 基于心率数据分析用户情绪状态和波动
 */

class EmotionAnalyzer {
  constructor() {
    this.heartRateHistory = []; // 心率历史记录
    this.maxHistoryLength = 60; // 保留最近60个数据点（约3分钟，每3秒一个）
    this.baselineHeartRate = null; // 基线心率
    this.currentEmotion = null; // 当前情绪
    this.emotionHistory = []; // 情绪历史
    this.maxEmotionHistory = 20; // 保留最近20个情绪状态
    
    // 心率区间定义（基于年龄和静息心率的动态调整）
    this.hrZones = {
      veryLow: { max: 55, emotion: 'very_calm' },
      low: { min: 55, max: 65, emotion: 'calm' },
      normal: { min: 65, max: 80, emotion: 'neutral' },
      elevated: { min: 80, max: 95, emotion: 'interested' },
      high: { min: 95, max: 110, emotion: 'excited' },
      veryHigh: { min: 110, max: 130, emotion: 'very_excited' },
      extreme: { min: 130, emotion: 'intense' }
    };
  }

  /**
   * 添加心率数据点
   * @param {number} heartRate - 心率值
   * @param {number} timestamp - 时间戳（可选）
   */
  addHeartRate(heartRate, timestamp = Date.now()) {
    if (typeof heartRate !== 'number' || heartRate <= 0 || heartRate > 220) {
      console.warn('⚠️ 无效的心率数据:', heartRate);
      return;
    }

    this.heartRateHistory.push({
      value: heartRate,
      timestamp
    });

    // 限制历史记录长度
    if (this.heartRateHistory.length > this.maxHistoryLength) {
      this.heartRateHistory.shift();
    }

    // 如果有足够数据，计算基线心率
    if (this.heartRateHistory.length >= 10 && !this.baselineHeartRate) {
      this.calculateBaseline();
    }

    // 分析当前情绪
    this.analyzeEmotion();
  }

  /**
   * 计算基线心率（使用最低的25%数据的平均值）
   */
  calculateBaseline() {
    if (this.heartRateHistory.length < 10) return;

    const sortedHR = [...this.heartRateHistory]
      .map(d => d.value)
      .sort((a, b) => a - b);
    
    const lowest25Percent = sortedHR.slice(0, Math.ceil(sortedHR.length * 0.25));
    this.baselineHeartRate = lowest25Percent.reduce((sum, hr) => sum + hr, 0) / lowest25Percent.length;
    
    console.log(`📊 基线心率已计算: ${this.baselineHeartRate.toFixed(1)} BPM`);
  }

  /**
   * 分析当前情绪状态
   */
  analyzeEmotion() {
    if (this.heartRateHistory.length === 0) return null;

    const currentHR = this.heartRateHistory[this.heartRateHistory.length - 1].value;
    
    // 基础情绪判定（基于心率区间）
    let emotion = this.getEmotionFromHR(currentHR);
    
    // 计算心率变异性（HRV指标）
    const hrVariability = this.calculateHRV();
    
    // 计算心率趋势
    const trend = this.calculateTrend();
    
    // 检测情绪波动
    const volatility = this.calculateVolatility();
    
    // 综合分析
    const emotionState = {
      emotion, // 主要情绪
      intensity: this.calculateIntensity(currentHR), // 情绪强度 0-100
      arousal: this.calculateArousal(currentHR), // 唤醒度 0-100
      valence: this.estimateValence(emotion, trend), // 情绪效价（正负性）-100到100
      
      // 心率指标
      currentHR,
      baselineHR: this.baselineHeartRate,
      hrDelta: this.baselineHeartRate ? currentHR - this.baselineHeartRate : 0,
      hrVariability,
      
      // 趋势和波动
      trend, // 'rising' | 'stable' | 'falling'
      volatility, // 'low' | 'medium' | 'high'
      trendStrength: this.calculateTrendStrength(), // 0-100
      
      // 时间戳
      timestamp: Date.now()
    };

    // 记录情绪历史
    this.currentEmotion = emotionState;
    this.emotionHistory.push(emotionState);
    if (this.emotionHistory.length > this.maxEmotionHistory) {
      this.emotionHistory.shift();
    }

    return emotionState;
  }

  /**
   * 根据心率获取情绪类型
   */
  getEmotionFromHR(hr) {
    if (hr < this.hrZones.veryLow.max) return 'very_calm';
    if (hr < this.hrZones.low.max) return 'calm';
    if (hr < this.hrZones.normal.max) return 'neutral';
    if (hr < this.hrZones.elevated.max) return 'interested';
    if (hr < this.hrZones.high.max) return 'excited';
    if (hr < this.hrZones.veryHigh.max) return 'very_excited';
    return 'intense';
  }

  /**
   * 计算情绪强度（0-100）
   */
  calculateIntensity(currentHR) {
    if (!this.baselineHeartRate) {
      // 无基线时使用绝对值映射
      return Math.min(100, ((currentHR - 50) / 80) * 100);
    }
    
    // 基于与基线的偏差
    const delta = Math.abs(currentHR - this.baselineHeartRate);
    return Math.min(100, (delta / 40) * 100); // 偏差40以上为100%
  }

  /**
   * 计算唤醒度（Arousal）
   */
  calculateArousal(currentHR) {
    // 心率越高，唤醒度越高
    const minHR = 50;
    const maxHR = 140;
    return Math.min(100, Math.max(0, ((currentHR - minHR) / (maxHR - minHR)) * 100));
  }

  /**
   * 估算情绪效价（Valence）- 正负性
   */
  estimateValence(emotion, trend) {
    // 基础效价
    const emotionValence = {
      'very_calm': 20,
      'calm': 40,
      'neutral': 0,
      'interested': 60,
      'excited': 80,
      'very_excited': 70,
      'intense': 30 // 强烈情绪可能是正面也可能是负面
    };

    let valence = emotionValence[emotion] || 0;

    // 趋势调整：上升趋势增加正性，下降趋势减少正性
    if (trend === 'rising') {
      valence += 10;
    } else if (trend === 'falling') {
      valence -= 10;
    }

    // 转换为-100到100的范围
    return (valence - 50) * 2;
  }

  /**
   * 计算心率变异性（HRV）
   * 使用RMSSD（均方根差）简化算法
   */
  calculateHRV() {
    if (this.heartRateHistory.length < 5) return null;

    const recent = this.heartRateHistory.slice(-10); // 最近10个数据点
    const differences = [];
    
    for (let i = 1; i < recent.length; i++) {
      differences.push(Math.pow(recent[i].value - recent[i - 1].value, 2));
    }

    const rmssd = Math.sqrt(differences.reduce((sum, d) => sum + d, 0) / differences.length);
    
    // 分类HRV
    if (rmssd < 2) return 'very_low'; // 非常稳定
    if (rmssd < 5) return 'low'; // 稳定
    if (rmssd < 10) return 'normal'; // 正常
    if (rmssd < 15) return 'high'; // 波动
    return 'very_high'; // 剧烈波动
  }

  /**
   * 计算心率趋势
   */
  calculateTrend() {
    if (this.heartRateHistory.length < 5) return 'stable';

    const recent = this.heartRateHistory.slice(-10); // 最近10个数据点
    
    // 线性回归计算斜率
    const n = recent.length;
    const sumX = recent.reduce((sum, _, i) => sum + i, 0);
    const sumY = recent.reduce((sum, d) => sum + d.value, 0);
    const sumXY = recent.reduce((sum, d, i) => sum + i * d.value, 0);
    const sumX2 = recent.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 0.5) return 'rising';
    if (slope < -0.5) return 'falling';
    return 'stable';
  }

  /**
   * 计算趋势强度（0-100）
   */
  calculateTrendStrength() {
    if (this.heartRateHistory.length < 5) return 0;

    const recent = this.heartRateHistory.slice(-10);
    const n = recent.length;
    const sumX = recent.reduce((sum, _, i) => sum + i, 0);
    const sumY = recent.reduce((sum, d) => sum + d.value, 0);
    const sumXY = recent.reduce((sum, d, i) => sum + i * d.value, 0);
    const sumX2 = recent.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return Math.min(100, Math.abs(slope) * 20); // 斜率越大，强度越高
  }

  /**
   * 计算波动性
   */
  calculateVolatility() {
    if (this.heartRateHistory.length < 5) return 'low';

    const recent = this.heartRateHistory.slice(-10);
    const values = recent.map(d => d.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 3) return 'low';
    if (stdDev < 7) return 'medium';
    return 'high';
  }

  /**
   * 检测情绪突变
   */
  detectEmotionShift() {
    if (this.emotionHistory.length < 3) return null;

    const recent = this.emotionHistory.slice(-3);
    const emotionChange = recent[2].emotion !== recent[0].emotion;
    const intensityChange = Math.abs(recent[2].intensity - recent[0].intensity) > 20;
    const arousalChange = Math.abs(recent[2].arousal - recent[0].arousal) > 25;

    if (emotionChange || intensityChange || arousalChange) {
      return {
        type: 'shift',
        from: recent[0].emotion,
        to: recent[2].emotion,
        intensityDelta: recent[2].intensity - recent[0].intensity,
        arousalDelta: recent[2].arousal - recent[0].arousal,
        timestamp: Date.now()
      };
    }

    return null;
  }

  /**
   * 获取当前情绪状态
   */
  getCurrentEmotion() {
    return this.currentEmotion;
  }

  /**
   * 获取情绪摘要（用于AI提示词）
   */
  getEmotionSummary() {
    if (!this.currentEmotion) return null;

    const e = this.currentEmotion;
    
    // 情绪描述映射
    const emotionDescriptions = {
      'very_calm': '非常平静',
      'calm': '平静',
      'neutral': '中性',
      'interested': '感兴趣/轻微兴奋',
      'excited': '兴奋',
      'very_excited': '非常兴奋',
      'intense': '强烈情绪'
    };

    const trendDescriptions = {
      'rising': '上升中',
      'stable': '稳定',
      'falling': '下降中'
    };

    const volatilityDescriptions = {
      'low': '稳定',
      'medium': '有波动',
      'high': '剧烈波动'
    };

    let summary = `当前情绪: ${emotionDescriptions[e.emotion] || e.emotion}`;
    summary += `\n情绪强度: ${e.intensity.toFixed(0)}/100`;
    summary += `\n唤醒程度: ${e.arousal.toFixed(0)}/100`;
    summary += `\n情绪倾向: ${e.valence > 0 ? '正面' : e.valence < 0 ? '负面' : '中性'} (${e.valence.toFixed(0)})`;
    summary += `\n心率趋势: ${trendDescriptions[e.trend] || e.trend} (强度: ${e.trendStrength.toFixed(0)}%)`;
    summary += `\n情绪波动: ${volatilityDescriptions[e.volatility] || e.volatility}`;
    
    if (e.baselineHR) {
      summary += `\n当前心率: ${e.currentHR} BPM (基线: ${e.baselineHR.toFixed(1)} BPM, 偏差: ${e.hrDelta > 0 ? '+' : ''}${e.hrDelta.toFixed(1)})`;
    } else {
      summary += `\n当前心率: ${e.currentHR} BPM (基线计算中...)`;
    }

    // 检测情绪突变
    const shift = this.detectEmotionShift();
    if (shift) {
      summary += `\n⚠️ 检测到情绪变化: ${shift.from} → ${shift.to}`;
    }

    return summary;
  }

  /**
   * 获取情绪建议（用于AI内容生成）
   */
  getContentSuggestion() {
    if (!this.currentEmotion) return null;

    const e = this.currentEmotion;
    let suggestion = '';

    // 基于情绪状态的内容建议
    if (e.emotion === 'very_calm' || e.emotion === 'calm') {
      suggestion = '用户状态平静，适合深度叙事、情感铺垫或世界观构建。可以使用较长的对话和描写。';
    } else if (e.emotion === 'neutral') {
      suggestion = '用户状态中性，保持现有节奏，可以推进主线剧情或角色发展。';
    } else if (e.emotion === 'interested') {
      suggestion = '用户开始产生兴趣，适合引入新元素、揭示秘密或增加互动选项。';
    } else if (e.emotion === 'excited' || e.emotion === 'very_excited') {
      suggestion = '用户情绪高涨，适合高潮剧情、重要决策点或激动人心的场景。加快节奏，增加戏剧性。';
    } else if (e.emotion === 'intense') {
      suggestion = '用户情绪强烈，需要谨慎处理。可能是紧张、兴奋或其他强烈情绪。建议提供明确的选项让用户掌控。';
    }

    // 基于趋势调整
    if (e.trend === 'rising') {
      suggestion += ' 情绪正在上升，可以继续推进紧张或兴奋的情节。';
    } else if (e.trend === 'falling') {
      suggestion += ' 情绪正在下降，考虑放缓节奏或转向平和的内容。';
    }

    // 基于波动性调整
    if (e.volatility === 'high') {
      suggestion += ' 情绪波动剧烈，建议提供稳定的情节锚点，避免过于刺激的内容。';
    }

    return suggestion;
  }

  /**
   * 重置分析器
   */
  reset() {
    this.heartRateHistory = [];
    this.baselineHeartRate = null;
    this.currentEmotion = null;
    this.emotionHistory = [];
    console.log('🔄 情绪分析器已重置');
  }

  /**
   * 获取心率历史（用于绘制曲线）
   */
  getHeartRateHistory() {
    return this.heartRateHistory;
  }
}

// 导出单例
window.emotionAnalyzer = window.emotionAnalyzer || new EmotionAnalyzer();
