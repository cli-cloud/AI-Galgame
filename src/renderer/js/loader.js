// Neon sci-fi loader overlay with timeout retry functionality
const Loader = (() => {
  let overlay, core, progressEl, stageEl, timeEl, retryBtn;
  let startTime = 0;
  let timeoutTimer = null;
  let timeUpdateTimer = null;
  let retryCallback = null;
  let currentAbortController = null;
  const icons = ['fa-atom','fa-rocket','fa-microchip','fa-globe','fa-brain','fa-bolt','fa-satellite','fa-gear'];
  const classes = ['neon-purple','neon-green'];

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.getElementById('loading-overlay') || document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="nebula"></div>
      <div class="gridlines"></div>
      <div class="loading-core">
        <div class="ring r1"></div>
        <div class="ring r2"></div>
        <div class="core-geo"></div>
      </div>
      <div class="stage-info">
        <span class="stage">准备中</span>
        <span class="percentage">0%</span>
      </div>
      <div class="progress">
        <div class="timeout-info">
          <button class="retry-btn hidden" id="loading-retry-btn">
            <i class="fa fa-rotate-right"></i> 重试
          </button>
          <span class="elapsed-time">已用时间: 0秒</span>
        </div>
      </div>
    `;
    if (!overlay.parentNode) document.body.appendChild(overlay);
    core = overlay.querySelector('.loading-core');
    progressEl = overlay.querySelector('.percentage');
    stageEl = overlay.querySelector('.stage');
    timeEl = overlay.querySelector('.elapsed-time');
    retryBtn = overlay.querySelector('.retry-btn');
    
    // 绑定重试按钮事件
    if (retryBtn) {
      retryBtn.addEventListener('click', handleRetry);
    }
    
    spawnFloatingIcons();
    return overlay;
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function spawnFloatingIcons() {
    for (let i = 0; i < 10; i++) {
      const el = document.createElement('i');
      el.className = `fa ${icons[i % icons.length]} fa-float ${classes[i % classes.length]}`;
      // 初始化随机路径变量
      el.style.setProperty('--x0', `${rand(-120,120)}px`);
      el.style.setProperty('--y0', `${rand(-120,120)}px`);
      el.style.setProperty('--x1', `${rand(-40,40)}px`);
      el.style.setProperty('--y1', `${rand(-40,40)}px`);
      el.style.setProperty('--x2', `${rand(-120,120)}px`);
      el.style.setProperty('--y2', `${rand(-120,120)}px`);
      el.style.setProperty('--s0', rand(0.9,1.2).toFixed(2));
      el.style.setProperty('--s1', rand(1.0,1.3).toFixed(2));
      el.style.setProperty('--s2', rand(0.9,1.2).toFixed(2));
      el.style.setProperty('--r0', `${rand(-10,10).toFixed(1)}deg`);
      el.style.setProperty('--r1', `${rand(-15,15).toFixed(1)}deg`);
      el.style.setProperty('--r2', `${rand(-10,10).toFixed(1)}deg`);
      el.style.setProperty('--dur', `${rand(8,14).toFixed(1)}s`);
      core.appendChild(el);
    }
  }

  function updateElapsedTime() {
    if (!startTime || !timeEl) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    timeEl.textContent = `已用时间: ${elapsed}秒`;
    
    // 10秒后显示重试按钮
    if (elapsed >= 10 && retryBtn && retryBtn.classList.contains('hidden')) {
      retryBtn.classList.remove('hidden');
      retryBtn.classList.add('timeout-warning');
    }
  }

  function handleRetry() {
    if (currentAbortController) {
      currentAbortController.abort();
    }
    if (retryCallback && typeof retryCallback === 'function') {
      retryCallback();
    }
    // 重置状态
    reset();
  }

  function reset() {
    startTime = Date.now();
    if (retryBtn) {
      retryBtn.classList.add('hidden');
      retryBtn.classList.remove('timeout-warning');
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    if (timeUpdateTimer) {
      clearInterval(timeUpdateTimer);
      timeUpdateTimer = null;
    }
  }

  function show(onRetry = null, abortController = null) {
    ensureOverlay().classList.add('active');
    startTime = Date.now();
    retryCallback = onRetry;
    currentAbortController = abortController;
    
    reset();
    
    // 开始更新计时器
    timeUpdateTimer = setInterval(updateElapsedTime, 1000);
    updateElapsedTime(); // 立即更新一次
  }

  function hide() {
    if (overlay) overlay.classList.remove('active');
    reset();
    if (timeUpdateTimer) {
      clearInterval(timeUpdateTimer);
      timeUpdateTimer = null;
    }
  }

  function setProgress(p) { 
    if (progressEl) progressEl.textContent = `${Math.max(0, Math.min(100, Math.round(p)))}%`; 
  }

  function setStage(text) { 
    if (stageEl) stageEl.textContent = text; 
  }

  return { show, hide, setProgress, setStage };
})();

window.Loader = Loader;
