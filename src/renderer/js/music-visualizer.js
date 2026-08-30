/**
 * 音乐可视化器
 */
class MusicVisualizer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.animationId = null;
    this.isActive = false;
    this.bars = [];
    this.barCount = 80;
    this.init();
  }

  init() {
    this.createCanvas();
    this.generateBars();
  }

  createCanvas() {
    // 创建可视化容器
    const container = document.createElement('div');
    container.id = 'music-visualizer-container';
    container.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 60px;
      z-index: 100;
      pointer-events: none;
      display: none;
    `;

    // 创建canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'music-visualizer';
    this.canvas.style.cssText = `
      width: 100%;
      height: 100%;
      background: transparent;
    `;

    container.appendChild(this.canvas);
    document.body.appendChild(container);

    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();

    // 监听窗口大小变化
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const container = document.getElementById('music-visualizer-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // 重新计算条形参数
    this.generateBars();
  }

  generateBars() {
    this.bars = [];
    const containerWidth = this.canvas.width / window.devicePixelRatio;
    const barWidth = Math.max(2, containerWidth / this.barCount - 1);
    const spacing = containerWidth / this.barCount;

    for (let i = 0; i < this.barCount; i++) {
      this.bars.push({
        x: i * spacing + (spacing - barWidth) / 2,
        width: barWidth,
        height: 0,
        targetHeight: 0,
        frequency: Math.random() * 0.02 + 0.01, // 随机频率
        phase: Math.random() * Math.PI * 2, // 随机相位
        baseAmplitude: Math.random() * 0.3 + 0.1, // 基础振幅
        currentAmplitude: 0
      });
    }
  }

  start() {
    if (this.isActive) return;
    
    this.isActive = true;
    const container = document.getElementById('music-visualizer-container');
    if (container) {
      container.style.display = 'block';
    }
    
    this.animate();
    console.log('音乐可视化已启动');
  }

  stop() {
    if (!this.isActive) return;
    
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    const container = document.getElementById('music-visualizer-container');
    if (container) {
      container.style.display = 'none';
    }
    
    console.log('音乐可视化已停止');
  }

  animate() {
    if (!this.isActive) return;

    this.updateBars();
    this.draw();
    
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  updateBars() {
    const currentTime = Date.now() * 0.001; // 转换为秒
    
    this.bars.forEach((bar, index) => {
      // 模拟音频频谱数据
      const wave1 = Math.sin(currentTime * bar.frequency * 50 + bar.phase);
      const wave2 = Math.sin(currentTime * bar.frequency * 80 + bar.phase * 1.5);
      const wave3 = Math.sin(currentTime * bar.frequency * 30 + bar.phase * 0.7);
      
      // 组合多个波形创造更自然的效果
      const combined = (wave1 + wave2 * 0.5 + wave3 * 0.3) / 1.8;
      
      // 添加低音、中音、高音的不同特征
      let amplitudeMultiplier = 1;
      if (index < this.barCount * 0.2) {
        // 低音区域 - 更稳重的变化
        amplitudeMultiplier = 0.8 + Math.sin(currentTime * 2) * 0.3;
      } else if (index > this.barCount * 0.7) {
        // 高音区域 - 更活跃的变化
        amplitudeMultiplier = 0.6 + Math.sin(currentTime * 5 + index * 0.1) * 0.4;
      } else {
        // 中音区域 - 中等变化
        amplitudeMultiplier = 0.7 + Math.sin(currentTime * 3 + index * 0.05) * 0.35;
      }
      
      bar.targetHeight = Math.abs(combined) * bar.baseAmplitude * amplitudeMultiplier * 50;
      
      // 平滑过渡
      const lerpFactor = 0.1;
      bar.height += (bar.targetHeight - bar.height) * lerpFactor;
    });
  }

  draw() {
    if (!this.ctx) return;

    const canvasHeight = this.canvas.height / window.devicePixelRatio;
    
    // 清空画布
    this.ctx.clearRect(0, 0, this.canvas.width / window.devicePixelRatio, canvasHeight);

    // 绘制频谱条
    this.bars.forEach(bar => {
      const height = Math.max(2, bar.height);
      const y = canvasHeight - height;
      
      // 创建渐变
      const gradient = this.ctx.createLinearGradient(0, y, 0, canvasHeight);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.3)');
      
      this.ctx.fillStyle = gradient;
      
      // 绘制圆角矩形
      this.ctx.beginPath();
      this.ctx.roundRect(bar.x, y, bar.width, height, bar.width / 2);
      this.ctx.fill();
      
      // 添加发光效果
      this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
      this.ctx.shadowBlur = 3;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    });
  }

  destroy() {
    this.stop();
    const container = document.getElementById('music-visualizer-container');
    if (container) {
      container.remove();
    }
  }
}

// 将可视化器添加到全局作用域
window.MusicVisualizer = MusicVisualizer;
