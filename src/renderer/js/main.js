/**
 * 主页面逻辑
 */

class App {
  constructor() {
    this.currentScreen = 'main';
    this.init();
  }

  async init() {
    // 等待所有服务初始化
    await this.waitForServices();
    
    // 加载并应用设置
    await this.loadAndApplySettings();
    
    // 设置事件监听器
    this.setupEventListeners();
    
    // 初始化IoT UI控制
    await this.setupIoTUI();

    // 监听主题实时预览更新（来自设置窗口）
    if (window.electronAPI && window.electronAPI.theme && window.electronAPI.theme.onUpdate) {
      window.electronAPI.theme.onUpdate((settings) => {
        if (settings.backgroundGradient) {
          const gradient = settings.backgroundGradient;
          const root = document.documentElement;
          root.style.setProperty('--gradient-primary', gradient);
          root.style.setProperty('--gradient-accent', gradient.replace(/135deg/, '315deg')); // 反向渐变
        }
        if (settings.color) this.applyThemeColor(settings.color);
        if (settings.mode) this.applyThemeMode(settings.mode);
      });
    }

    // 监听存储变化（设置保存时同步）
    window.addEventListener('storage', (e) => {
      if (e.key === 'artimeow-settings' && e.newValue) {
        try {
          const settings = JSON.parse(e.newValue);
          this.applySettingsToMainWindow(settings);
        } catch (error) {
          console.warn('解析设置更新失败:', error);
        }
      }
    });
    
    // 渲染项目列表
    await this.renderProjectsList();
    
    // 初始化图标雨背景
    this.initIconRain();
    
    // 获取应用版本
    await this.loadAppVersion();
    
    // 初始化背景音乐（延迟到所有组件加载完成）
    setTimeout(() => {
      if (!this.backgroundMusic) {
        this.initBackgroundMusic();
      }
      
      // 应用启动后自动播放背景音乐（如果有播放列表且启用自动播放）
      setTimeout(() => {
        if (this.backgroundMusic && this.backgroundMusic.settings.autoPlay && this.backgroundMusic.playlist.length > 0) {
          console.log('应用启动，开始自动播放背景音乐');
          this.playTrackByIndex(0);
        }
      }, 500); // 再延迟0.5秒确保音乐系统完全初始化
    }, 1000); // 延迟1秒确保界面完全加载
    
    console.log('ArtiMeow AI GalGamer RT 已启动');
  }

  /**
   * 等待所有服务初始化
   */
  async waitForServices() {
    // 等待项目管理器初始化
    while (!window.projectManager || !window.projectManager.dataDir) {
      await Utils.sleep(100);
    }

    // 等待AI服务初始化
    while (!window.aiService) {
      await Utils.sleep(100);
    }

    // 等待游戏引擎初始化
    while (!window.gameEngine) {
      await Utils.sleep(100);
    }

    // 等待时间线管理器初始化
    while (!window.timeline) {
      await Utils.sleep(100);
    }
    
    // 等待IoT管理器初始化
    while (!window.iotManager) {
      await Utils.sleep(100);
    }
    console.log('✅ 所有服务已就绪，包括IoT管理器');
  }

  /**
   * 加载并应用设置
   */
  async loadAndApplySettings() {
    try {
      let settings;
      
      // 尝试从Electron存储加载
      if (window.electronAPI && window.electronAPI.storage) {
        try {
          settings = await window.electronAPI.storage.get('appSettings');
        } catch (e) {
          console.warn('从Electron存储加载设置失败，使用localStorage:', e);
        }
      }
      
      // 如果Electron存储失败，使用localStorage
      if (!settings) {
        settings = JSON.parse(localStorage.getItem('artimeow-settings') || '{}');
      }
      
      // 应用渐变背景设置
      if (settings.backgroundGradient) {
        const { startColor, endColor, direction } = settings.backgroundGradient;
        const gradient = `linear-gradient(${direction || '135deg'}, ${startColor || '#667eea'}, ${endColor || '#764ba2'})`;
        const root = document.documentElement;
        root.style.setProperty('--gradient-primary', gradient);
        root.style.setProperty('--gradient-accent', `linear-gradient(${direction || '135deg'}, ${endColor || '#764ba2'}, ${startColor || '#667eea'})`);
      }
      
      // 应用主题模式与颜色（主窗口也生效）
      if (settings.theme || settings.themeMode) {
        const theme = settings.theme || settings.themeMode;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.remove('theme-light', 'theme-dark');
        if (theme === 'light') document.body.classList.add('theme-light');
        else if (theme === 'dark') document.body.classList.add('theme-dark');
        else document.body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
      }
      
      if (settings.themeColor) {
        const colorMap = {
          purple: { primary: '#667eea', secondary: '#764ba2' },
          blue: { primary: '#4facfe', secondary: '#00f2fe' },
          green: { primary: '#43e97b', secondary: '#38f9d7' },
          orange: { primary: '#fa709a', secondary: '#fee140' },
          // 柔雾粉
          pink: { primary: '#fce1ec', secondary: '#f7b1c3' },
          red: { primary: '#ff9a9e', secondary: '#fecfef' }
        };
        const colors = colorMap[settings.themeColor] || colorMap.purple;
        const root = document.documentElement;
        root.style.setProperty('--primary-color', colors.primary);
        root.style.setProperty('--secondary-color', colors.secondary);
        // 只有在没有自定义背景渐变时才应用主题颜色渐变
        if (!settings.backgroundGradient) {
          root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`);
          root.style.setProperty('--gradient-accent', `linear-gradient(135deg, ${colors.secondary}, ${colors.primary})`);
        }
      }

      // 应用全屏设置
      if (settings.fullscreenMode) {
        await window.electronAPI.window.setFullscreen(true);
        // 设置CSS类以正确处理覆盖层
        const titlebar = document.querySelector('.titlebar');
        if (titlebar) {
          titlebar.style.display = 'none';
          document.body.classList.add('fullscreen-mode');
        }
      } else {
        // 确保非全屏时移除CSS类
        const titlebar = document.querySelector('.titlebar');
        if (titlebar) {
          titlebar.style.display = 'flex';
          document.body.classList.remove('fullscreen-mode');
        }
      }
      
      // 应用窗口大小设置
      if (settings.windowResolution && settings.windowResolution !== 'fullscreen') {
        const [width, height] = settings.windowResolution.split('x').map(Number);
        if (width && height) {
          // 注意：这里暂时无法直接设置窗口大小，需要在主进程中处理
          // 可以发送IPC消息到主进程设置窗口大小
        }
      }
      
      // 应用AI设置
      if (window.aiService) {
        await window.aiService.loadSettings();
      }

      // 应用对话皮肤
      if (settings.dialogueSkin) {
        const b = document.body;
        b.classList.remove('skin-paper','skin-neon','skin-cyber');
        if (settings.dialogueSkin === 'paper') b.classList.add('skin-paper');
        if (settings.dialogueSkin === 'neon') b.classList.add('skin-neon');
        if (settings.dialogueSkin === 'cyber') b.classList.add('skin-cyber');
      }

  // 强制游戏风界面
  document.body.classList.add('mode-game');
      
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 标题栏按钮事件
    const minimizeBtn = document.getElementById('minimize-btn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        window.electronAPI.window.minimize();
      });
    }

    const maximizeBtn = document.getElementById('maximize-btn');
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => {
        window.electronAPI.window.maximize();
      });
    }

    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        window.electronAPI.window.close();
      });
    }

    // 设置按钮
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        window.electronAPI.openSettings();
      });
    }

    // 主界面 IoT 面板按钮（Dock栏）
    const mainIotPanelBtn = document.getElementById('main-iot-panel-btn');
    if (mainIotPanelBtn) {
      mainIotPanelBtn.addEventListener('click', async () => {
        await window.electronAPI.window.openIoTPanel();
      });
    }

    // 主界面 IoT 面板按钮（Header）
    const mainIotPanelBtnHeader = document.getElementById('main-iot-panel-btn-header');
    if (mainIotPanelBtnHeader) {
      mainIotPanelBtnHeader.addEventListener('click', async () => {
        await window.electronAPI.window.openIoTPanel();
      });
    }

    // 英雄区块按钮
    const heroNew = document.getElementById('hero-new-project');
    if (heroNew) {
      heroNew.addEventListener('click', () => this.openCreateProjectModal());
    }
    const heroImport = document.getElementById('hero-import-project');
    if (heroImport) {
      heroImport.addEventListener('click', async () => {
        await window.projectManager.importProject();
        await this.renderProjectsList();
      });
    }
    const heroSettings = document.getElementById('hero-open-settings');
    if (heroSettings) {
      heroSettings.addEventListener('click', () => window.electronAPI.openSettings());
    }

    // 新建项目按钮
    const newProjectBtn = document.getElementById('new-project-btn');
    if (newProjectBtn) {
      newProjectBtn.addEventListener('click', () => this.showNewProjectModal());
    }

    // 导入项目按钮
    const importBtn = document.getElementById('import-project-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => this.importProject());
    }

    // 项目表单提交
    const saveProjectBtn = document.getElementById('save-project-btn');
    if (saveProjectBtn) {
      saveProjectBtn.addEventListener('click', () => this.saveProject());
    }

    // I'm Feeling Lucky按钮
    const luckyProjectBtn = document.getElementById('lucky-project-btn');
    if (luckyProjectBtn) {
      luckyProjectBtn.addEventListener('click', () => this.generateLuckyProject());
    }

    // 菜单事件监听
    window.electronAPI.onMenuAction((event, data) => {
      switch (event) {
        case 'menu-new-project':
          this.showNewProjectModal();
          break;
        case 'menu-open-project':
          this.importProject();
          break;
        case 'menu-about':
          this.showAboutModal();
          break;
      }
    });

    // 模态框外点击关闭
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeAllModals();
      }
    });

    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // 底部控制栏事件
    const bottomNewProjectBtn = document.getElementById('bottom-new-project-btn');
    if (bottomNewProjectBtn) {
      bottomNewProjectBtn.addEventListener('click', () => this.showNewProjectModal());
    }

    const bgMusicBtn = document.getElementById('bg-music-btn');
    if (bgMusicBtn) {
      bgMusicBtn.addEventListener('click', () => this.showBackgroundMusicModal());
    }

    const bottomSettingsBtn = document.getElementById('bottom-settings-btn');
    if (bottomSettingsBtn) {
      bottomSettingsBtn.addEventListener('click', () => {
        window.electronAPI.openSettings();
      });
    }

    // 游戏界面音乐按钮
    const gameMusicBtn = document.getElementById('game-music-btn');
    if (gameMusicBtn) {
      gameMusicBtn.addEventListener('click', () => this.showBackgroundMusicModal());
    }
  }

  /**
   * 渲染项目列表
   */
  async renderProjectsList(filterText = '') {
    // 防止重复调用
    if (this._renderingProjects) {
      return;
    }
    this._renderingProjects = true;

    const projectsGrid = document.getElementById('projects-grid');
    const emptyState = document.getElementById('empty-state');
    
    if (!projectsGrid || !emptyState) {
      this._renderingProjects = false;
      return;
    }

    try {
      // 加载项目列表
      await window.projectManager.loadProjects();
      let projects = window.projectManager.getProjects();
      
      // 按最后游玩时间排序（最新的在前）
      projects.sort((a, b) => {
        const aTime = new Date(a.lastPlayed || a.lastModified || a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.lastPlayed || b.lastModified || b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime; // 降序，最新的在前
      });
      
      // 过滤
      if (filterText && typeof filterText === 'string') {
        const q = filterText.trim().toLowerCase();
        projects = projects.filter(p =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.summary || '').toLowerCase().includes(q)
        );
      }

      // 清空现有内容
      projectsGrid.innerHTML = '';

      // 安装全局封面生成进度监听（仅安装一次）
      if (!this._imageProgressHandler) {
    this._imageProgressHandler = (evt) => {
          const d = evt.detail || {};
          const card = projectsGrid.querySelector(`.project-card[data-project-id="${d.projectId}"]`);
          if (!card) return;
          const coverEl = card.querySelector('.project-cover');
          const stageEl = card.querySelector('.cover-stage');
          const placeholder = card.querySelector('.cover-placeholder');
          if (!coverEl || !stageEl || !placeholder) return;
          if (d.done && d.url) {
            placeholder.classList.add('hidden');
            coverEl.style.backgroundImage = `url('${d.url.replace(/"/g, '\\"')}')`;
            coverEl.classList.add('has-image');
          } else {
            placeholder.classList.remove('hidden');
            stageEl.textContent = `封面生成中 · ${d.stage || ''}`;
          }
        };
        window.addEventListener('image-progress', this._imageProgressHandler);
      }

      if (projects.length === 0) {
        // 显示空状态
        emptyState.style.display = 'block';
        projectsGrid.style.display = 'none';
      } else {
        // 隐藏空状态，显示项目网格
        emptyState.style.display = 'none';
        projectsGrid.style.display = 'grid';

        // 渲染项目卡片
        for (const project of projects) {
          const projectCard = await this.createProjectCard(project);
          projectsGrid.appendChild(projectCard);
        }
      }

    } catch (error) {
      console.error('渲染项目列表失败:', error);
      Utils.showNotification('加载项目列表失败', 'error');
    } finally {
      this._renderingProjects = false;
    }
  }

  /**
   * 创建项目卡片
   */
  async createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.setAttribute('data-project-id', project.id);

    // 获取最后游玩时间，如果没有则显示最后修改时间
    const lastPlayedTime = project.lastPlayed || project.lastModified || project.updatedAt;
    const lastPlayed = Utils.formatTime(new Date(lastPlayedTime).getTime());
    const description = Utils.truncateText(project.description || '暂无描述', 100);
    const createdAtStr = project.createdAt ? new Date(project.createdAt).toLocaleDateString('zh-CN') : '';

    card.innerHTML = `
      <div class="project-cover">
        <div class="project-cover-overlay"></div>
        <div class="badge-row">
          <span class="badge status"><i class="fa fa-circle-play"></i> 进行中</span>
          <span class="badge created" title="创建时间">新建于 ${Utils.escapeHtml(createdAtStr)}</span>
        </div>
        <div class="cover-placeholder">
          <div class="dot-pulse"></div>
          <div class="cover-stage">封面生成中...</div>
        </div>
      </div>
      <div class="card-body">
        <h3>${Utils.escapeHtml(project.name)}</h3>
        <div class="description">${Utils.escapeHtml(description)}</div>
        <div class="project-meta">
          <span class="last-modified" title="最后游玩时间">${lastPlayed}</span>
          <span class="version">v${project.version || '1.0.0'}</span>
        </div>
        <div class="project-actions">
          <button class="btn btn-primary btn-sm" onclick="app.startGame('${project.id}')">
            <i class="fa fa-play"></i>
            开始游戏
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.showProjectMenu(event, '${project.id}')">
            <i class="fa fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>
    `;

    // 点击项目封面或卡片主体显示综合介绍（但排除按钮点击）
    card.addEventListener('click', (event) => {
      // 如果点击的是按钮或按钮内的元素，则不显示项目详情
      const isButton = event.target.closest('.btn') || event.target.closest('.project-actions');
      if (!isButton) {
        window.projectDetails.showProjectOverview(project.id);
      }
    });

    // 双击启动游戏
    card.addEventListener('dblclick', (event) => {
      // 同样排除按钮区域的双击
      const isButton = event.target.closest('.btn') || event.target.closest('.project-actions');
      if (!isButton) {
        this.startGame(project.id);
      }
    });

    // 异步加载封面
    try {
      const coverUrl = await window.projectManager.getProjectCover(project);
      const coverEl = card.querySelector('.project-cover');
      const placeholder = card.querySelector('.cover-placeholder');
      const stageEl = card.querySelector('.cover-stage');
      const dot = card.querySelector('.dot-pulse');
      
      if (coverUrl && coverEl) {
        // 有现有封面，直接应用
        coverEl.style.backgroundImage = `url('${coverUrl.replace(/"/g, '\\"')}')`;
        coverEl.classList.add('has-image');
        if (placeholder) placeholder.classList.add('hidden');
      } else if (placeholder) {
        // 没有封面，检查是否能生成
        placeholder.classList.remove('hidden');
        try {
          const cfg = window.aiService?.getConfigStatus?.();
          if (!cfg?.imageConfigured) {
            if (stageEl) stageEl.textContent = '未配置图像API';
            if (dot) dot.style.display = 'none';
          } else {
            // 触发封面生成，使用事件监听器来处理进度和结果
            if (stageEl) stageEl.textContent = '正在生成封面...';
            if (dot) dot.style.display = 'block';
            
            // 生成封面但不等待完成，让事件监听器处理结果
            window.projectManager.ensureCover(project).then(generatedUrl => {
              // 封面生成完成后，检查事件监听器是否已经处理了封面应用
              // 给事件监听器足够时间处理（事件可能是异步的）
              setTimeout(() => {
                const currentCoverEl = card.querySelector('.project-cover');
                const currentPlaceholder = card.querySelector('.cover-placeholder');
                const currentStageEl = card.querySelector('.cover-stage');
                
                // 如果事件监听器没有成功应用封面，则手动刷新
                if (generatedUrl && currentCoverEl && !currentCoverEl.classList.contains('has-image')) {
                  console.log('事件监听器未应用封面，执行备用刷新:', project.id);
                  this.refreshProjectCard(project.id);
                } else if (!generatedUrl) {
                  // 生成失败，显示提示
                  if (currentStageEl) currentStageEl.textContent = '无法生成封面';
                  if (currentPlaceholder && currentPlaceholder.querySelector('.dot-pulse')) {
                    currentPlaceholder.querySelector('.dot-pulse').style.display = 'none';
                  }
                }
              }, 500); // 给事件监听器足够时间来处理
            }).catch(err => {
              console.error('封面生成失败:', err);
              const currentStageEl = card.querySelector('.cover-stage');
              const currentDot = card.querySelector('.dot-pulse');
              if (currentStageEl) currentStageEl.textContent = '封面生成失败';
              if (currentDot) currentDot.style.display = 'none';
            });
          }
        } catch (err) {
          console.error('检查图像配置失败:', err);
        }
      }
    } catch (e) {
      // 忽略封面加载错误
    }

    return card;
  }

  /**
   * 刷新单个项目卡片（用于封面更新后的局部刷新）
   */
  async refreshProjectCard(projectId) {
    try {
      const project = window.projectManager.getProjects().find(p => p.id === projectId);
      if (!project) return;

      const existingCard = document.querySelector(`[data-project-id="${projectId}"]`);
      if (!existingCard) return;

      // 获取最新的封面URL
      const coverUrl = await window.projectManager.getProjectCover(project);
      const coverEl = existingCard.querySelector('.project-cover');
      const placeholder = existingCard.querySelector('.cover-placeholder');

      if (coverUrl && coverEl) {
        // 应用新封面
        coverEl.style.backgroundImage = `url('${coverUrl.replace(/"/g, '\\"')}')`;
        coverEl.classList.add('has-image');
        if (placeholder) placeholder.classList.add('hidden');
      }
    } catch (error) {
      console.error('刷新项目卡片失败:', error);
    }
  }

  /**
   * 显示项目菜单
   */
  showProjectMenu(event, projectId) {
    event.stopPropagation();
    
  const project = window.projectManager.getProjects().find(p => p.id === projectId);
    if (!project) return;

    // 创建上下文菜单
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${event.clientY}px;
      left: ${event.clientX}px;
      background: var(--background-dark);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      z-index: 1000;
      min-width: 150px;
      overflow: hidden;
    `;

    const menuItems = [
      { text: '开始游戏', icon: 'fa fa-play', action: () => this.startGame(projectId) },
      { text: '编辑信息', icon: 'fa fa-pen', action: () => this.editProject(projectId) },
      { text: '打开目录', icon: 'fa fa-folder-open', action: () => this.openProjectFolder(projectId) },
      { text: '复制项目', icon: 'fa fa-copy', action: () => this.duplicateProject(projectId) },
      { text: '导出项目', icon: 'fa fa-up-right-from-square', action: () => this.exportProject(projectId) },
      { text: '删除项目', icon: 'fa fa-trash', action: () => this.deleteProject(projectId), danger: true }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = `context-menu-item ${item.danger ? 'danger' : ''}`;
      menuItem.style.cssText = `
        padding: 10px 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background-color 0.15s ease;
        color: ${item.danger ? '#f44336' : 'var(--text-primary)'};
      `;
      
      menuItem.innerHTML = `
        <i class="${item.icon}" style="font-size: 14px;"></i>
        <span>${item.text}</span>
      `;

      menuItem.addEventListener('click', () => {
        item.action();
        if (menu.parentNode) {
          document.body.removeChild(menu);
        }
      });

      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = item.danger ? 
          'rgba(244, 67, 54, 0.2)' : 
          'var(--surface-hover)';
      });

      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });

      menu.appendChild(menuItem);
    });

    // 添加到页面
    document.body.appendChild(menu);

    // 视口内位置修正
    const adjustPosition = () => {
      const rect = menu.getBoundingClientRect();
      let top = rect.top;
      let left = rect.left;
      const pad = 8;
      if (rect.right > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - rect.width - pad);
      }
      if (rect.bottom > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - rect.height - pad);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };
    // 下一帧调整，确保能测到尺寸
    requestAnimationFrame(adjustPosition);

    // 点击外部关闭菜单
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && menu.parentNode) {
        document.body.removeChild(menu);
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 10);
  }

  /**
   * 启动游戏
   */
  async startGame(projectId) {
    try {
      // 检查AI配置
      const aiStatus = window.aiService.getConfigStatus();
      if (!aiStatus.textConfigured) {
        const shouldConfigure = confirm('文本生成API未配置，是否现在配置？');
        if (shouldConfigure) {
          window.electronAPI.openSettings();
          return;
        }
      }

      if (!aiStatus.imageConfigured) {
        const shouldConfigure = confirm('图像生成API未配置，游戏将无法生成背景图。是否现在配置？');
        if (shouldConfigure) {
          window.electronAPI.openSettings();
          return;
        }
      }

      // 更新最后游玩时间
      const project = window.projectManager.getProjects().find(p => p.id === projectId);
      if (project) {
        project.lastPlayed = new Date().toISOString();
        await window.projectManager.saveProject(project);
        // 刷新项目列表以更新显示的时间
        await this.renderProjectsList();
      }

      // 启动游戏
      await window.gameEngine.startGame(projectId);
      
    } catch (error) {
      console.error('启动游戏失败:', error);
      Utils.showNotification('启动游戏失败', 'error');
    }
  }

  // 打开图谱面板：解析KB与角色，生成可交互图
  async openGraphPanel() {
    try {
      const projects = window.projectManager.getProjects();
      if (!projects || projects.length === 0) return Utils.showNotification('没有可用项目', 'warning');
      const p = projects[0]; // 先选第一个项目，后续可增加项目选择
      const kb = await window.projectManager.readKnowledgeBase(p);
      const cs = await window.projectManager.readCharacters(p);
      const timeline = await window.projectManager.getTimelineHistory(p.id);

      // 构造节点与边：角色、地点、时间线节点
      const nodes = [];
      const edges = [];
      const addNode = (id, label, type) => { nodes.push({ data: { id, label, type } }); };
      const addEdge = (from, to, label) => { edges.push({ data: { id: `${from}->${to}-${Math.random().toString(36).slice(2,6)}`, source: from, target: to, label } }); };

      // 角色
      for (const [id, c] of Object.entries(cs?.characters || {})) {
        addNode(`char:${id}`, c.name || id, 'character');
      }
      // 地点
      for (const key of Object.keys(kb?.locations || {})) {
        addNode(`loc:${key}`, key, 'location');
      }
      // 时间线节点
      timeline.forEach((n, idx) => {
        addNode(`node:${n.id}`, `节点${idx + 1}`, 'timeline');
        // 事件关联角色（若对话里出现角色名，简单匹配）
        const text = (n.content?.dialogue || '') + ' ' + (n.content?.chapterSummary || '');
        for (const [id, c] of Object.entries(cs?.characters || {})) {
          const name = c.name || '';
          if (name && text.includes(name)) {
            addEdge(`char:${id}`, `node:${n.id}`, '出现');
          }
        }
      });

      // 渲染 Cytoscape 图（若未加载则懒加载）
      const el = document.getElementById('graph-canvas');
      if (el) {
        el.innerHTML = '';
        const ensureCy = async () => {
          if (window.cytoscape) return window.cytoscape;
          await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/cytoscape@3.27.0/dist/cytoscape.min.js';
            s.onload = resolve;
            s.onerror = resolve; // 失败走降级
            document.head.appendChild(s);
          });
          return window.cytoscape;
        };

        const cyLib = await ensureCy();
        const cy = cyLib ? cyLib({
          container: el,
          elements: { nodes, edges },
          style: [
            { selector: 'node', style: {
              'label': 'data(label)',
              'color': '#e5e7eb',
              'text-outline-color': '#1f2937',
              'text-outline-width': 2,
              'background-color': '#64748b',
              'border-color': '#93c5fd',
              'border-width': 1,
              'font-size': 12
            }},
            { selector: 'node[type="character"]', style: { 'background-color': '#60a5fa' }},
            { selector: 'node[type="location"]', style: { 'background-color': '#34d399' }},
            { selector: 'node[type="timeline"]', style: { 'background-color': '#f59e0b' }},
            { selector: 'edge', style: {
              'curve-style': 'bezier',
              'width': 2,
              'line-color': 'rgba(255,255,255,0.35)',
              'target-arrow-color': 'rgba(255,255,255,0.5)',
              'target-arrow-shape': 'triangle',
              'label': 'data(label)',
              'font-size': 10,
              'color': '#cbd5e1',
              'text-background-color': 'rgba(0,0,0,0.4)',
              'text-background-opacity': 1,
              'text-background-shape': 'roundrectangle',
              'text-background-padding': 2
            }}
          ],
          layout: { name: 'cose', animate: true, fit: true, padding: 20 }
        }) : null;
        if (cy) {
          cy.on('tap', 'node', (evt) => {
            const d = evt.target.data();
            if (d.type === 'timeline' && d.id && d.id.startsWith('node:')) {
              const nodeId = d.id.slice(5);
              window.timeline.selectNode(nodeId);
            }
          });
        } else {
          el.innerHTML = '<div class="text-muted" style="padding:8px">图引擎未加载</div>';
        }
      }

      const panel = document.getElementById('graph-panel');
      if (panel) panel.classList.add('active');
    } catch (e) {
      console.warn('打开图谱失败', e);
      Utils.showNotification('图谱生成失败', 'error');
    }
  }

  // 打开里程碑面板：基于章节summary抽取卡片
  async openMilestonesPanel() {
    try {
      const projects = window.projectManager.getProjects();
      if (!projects || projects.length === 0) return Utils.showNotification('没有可用项目', 'warning');
      const p = projects[0];
      const timeline = await window.projectManager.getTimelineHistory(p.id);
      const body = document.getElementById('milestones-body');
      if (!body) return;
      body.innerHTML = '';

      const cards = timeline.map((n, idx) => ({
        idx: idx + 1,
        time: Utils.formatTime(n.timestamp || Date.now()),
        summary: n.content?.chapterSummary || '',
        text: n.content?.dialogue || ''
      })).filter(c => c.summary);

      if (cards.length === 0) {
        body.innerHTML = '<div class="text-muted">暂无可用里程碑（章节摘要会自动填充到这里）</div>';
      } else {
        for (const c of cards) {
          const div = document.createElement('div');
          div.className = 'milestone-card';
          div.innerHTML = `<div><strong>第${c.idx}章</strong> · <span class="text-muted">${Utils.escapeHtml(c.time)}</span></div>
            <div style="margin-top:4px;">${Utils.escapeHtml(c.summary)}</div>`;
          body.appendChild(div);
        }
      }

      const panel = document.getElementById('milestones-panel');
      if (panel) panel.classList.add('active');
    } catch (e) {
      console.warn('打开里程碑失败', e);
      Utils.showNotification('加载里程碑失败', 'error');
    }
  }

  /**
   * 显示新建项目模态框
   */
  showNewProjectModal() {
    const modal = document.getElementById('project-modal');
    const title = document.getElementById('project-modal-title');
    const form = document.getElementById('project-form');
    const saveBtn = document.getElementById('save-project-btn');

    if (modal && title && form && saveBtn) {
      title.textContent = '新建项目';
      form.reset();
      saveBtn.textContent = '创建';
      saveBtn.setAttribute('data-action', 'create');
      modal.classList.add('active');
    }
  }

  /**
   * 编辑项目
   */
  editProject(projectId) {
    const project = window.projectManager.getProjects().find(p => p.id === projectId);
    if (!project) return;

    const modal = document.getElementById('project-modal');
    const title = document.getElementById('project-modal-title');
    const form = document.getElementById('project-form');
    const saveBtn = document.getElementById('save-project-btn');

    if (modal && title && form && saveBtn) {
      title.textContent = '编辑项目';
      
      // 填充表单
      document.getElementById('project-name').value = project.name;
      document.getElementById('project-description').value = project.description || '';
      document.getElementById('project-style').value = project.style || '';
      document.getElementById('project-summary').value = project.summary || '';

      saveBtn.textContent = '保存';
      saveBtn.setAttribute('data-action', 'edit');
      saveBtn.setAttribute('data-project-id', projectId);
      modal.classList.add('active');
    }
  }

  /**
   * 保存项目
   */
  async saveProject() {
    const saveBtn = document.getElementById('save-project-btn');
    const action = saveBtn.getAttribute('data-action');
    const projectId = saveBtn.getAttribute('data-project-id');

    // 收集表单数据
    const projectData = {
      name: document.getElementById('project-name').value.trim(),
      description: document.getElementById('project-description').value.trim(),
      style: document.getElementById('project-style').value.trim(),
      summary: document.getElementById('project-summary').value.trim()
    };

    // 验证数据
    if (!projectData.name) {
      Utils.showNotification('请输入项目名称', 'error');
      return;
    }

    try {
      saveBtn.classList.add('loading');
      saveBtn.disabled = true;

      if (action === 'create') {
        // 创建新项目
        await window.projectManager.createProject(projectData);
      } else if (action === 'edit') {
        // 编辑现有项目（这里需要实现编辑功能）
        Utils.showNotification('编辑功能待实现', 'warning');
      }

      // 关闭模态框
      this.closeAllModals();

      // 重新渲染项目列表
      await this.renderProjectsList();

    } catch (error) {
      console.error('保存项目失败:', error);
      Utils.showNotification('保存项目失败', 'error');
    } finally {
      saveBtn.classList.remove('loading');
      saveBtn.disabled = false;
    }
  }

  /**
   * I'm Feeling Lucky - 自动生成项目
   */
  async generateLuckyProject() {
    // 检查AI配置
    const aiStatus = window.aiService?.getConfigStatus?.();
    if (!aiStatus || !aiStatus.textConfigured) {
      Utils.showNotification('请先在设置中配置AI文本生成API', 'warning');
      return;
    }

    const luckyBtn = document.getElementById('lucky-project-btn');
    const formElements = [
      document.getElementById('project-name'),
      document.getElementById('project-description'), 
      document.getElementById('project-style'),
      document.getElementById('project-summary')
    ];

    try {
      // 禁用所有表单元素
      formElements.forEach(el => {
        if (el) el.disabled = true;
      });
      
      // 设置按钮为加载状态
      luckyBtn.disabled = true;
      luckyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在生成...';

      // 生成随机数防止缓存
      const randomSeed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      // 构建Lucky生成提示词
      const luckyPrompt = `请为我生成一个创意独特的视觉小说/恋爱游戏项目概念。请生成包含以下字段的JSON格式内容：

{
  "name": "项目名称",
  "description": "项目简介（50字内）", 
  "style": "项目风格描述（包含氛围、角色特点、美术风格等）",
  "summary": "故事大纲（详细的背景设定和主要情节走向）"
}

要求：
1. 风格多样化，可以是校园恋爱、奇幻冒险、科幻未来、古风武侠、现代都市、悬疑推理等任意类型
2. 角色设定要有特色，情节要有吸引力
3. 描述要生动有趣，让人想要深入了解
4. 确保内容原创且积极向上

随机种子：${randomSeed}

请直接返回JSON格式的内容，不需要其他说明。`;

      // 调用AI生成
      console.log('调用AI生成Lucky项目，提示词:', luckyPrompt);
      const response = await window.aiService.callTextAPI(luckyPrompt);

      // 解析AI响应
      let projectData;
      console.log('AI响应:', response);
      
      // 尝试直接解析响应（如果是字符串）
      try {
        if (typeof response === 'string') {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            projectData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('未找到JSON格式内容');
          }
        } else {
          throw new Error('响应格式无效');
        }
      } catch (parseError) {
        console.warn('解析AI响应JSON失败，使用默认结构:', parseError);
        const responseText = typeof response === 'string' ? response : JSON.stringify(response);
        
        // 生成随机项目名称
        const randomNames = [
          '梦幻之旅', '星辰物语', '心动时刻', '青春物语', '命运之轮',
          '夏日回忆', '樱花飞舞', '月光传说', '彩虹之约', '时光倒流',
          '魔法学院', '冒险日记', '恋爱进行时', '奇迹降临', '浪漫邂逅',
          '追梦少年', '花开时节', '星空下的约定', '温暖的回忆', '青春不散场'
        ];
        const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];
        
        projectData = {
          name: randomName,
          description: responseText.substring(0, 100),
          style: '创意风格',
          summary: responseText
        };
      }

      // 填充表单字段
      if (projectData.name) {
        document.getElementById('project-name').value = projectData.name;
      }
      if (projectData.description) {
        document.getElementById('project-description').value = projectData.description;
      }
      if (projectData.style) {
        document.getElementById('project-style').value = projectData.style;
      }
      if (projectData.summary) {
        document.getElementById('project-summary').value = projectData.summary;
      }

      Utils.showNotification('Lucky项目已生成！你可以继续编辑或直接创建', 'success');

    } catch (error) {
      console.error('生成Lucky项目失败:', error);
      Utils.showNotification('生成失败，请稍后重试', 'error');
    } finally {
      // 恢复表单元素
      formElements.forEach(el => {
        if (el) el.disabled = false;
      });
      
      // 恢复按钮状态
      luckyBtn.disabled = false;
      luckyBtn.innerHTML = '<i class="fas fa-dice"></i> I\'m Feeling Lucky';
    }
  }

  /**
   * 复制项目
   */
  async duplicateProject(projectId) {
    try {
      Utils.showNotification('正在复制项目...', 'info', 0);
      await window.projectManager.duplicateProject(projectId);
      await this.renderProjectsList();
    } catch (error) {
      console.error('复制项目失败:', error);
    }
  }

  /**
   * 导出项目
   */
  async exportProject(projectId) {
    try {
      Utils.showNotification('正在导出项目...', 'info', 0);
      await window.projectManager.exportProject(projectId);
    } catch (error) {
      console.error('导出项目失败:', error);
    }
  }

  /**
   * 打开项目目录
   */
  async openProjectFolder(projectId) {
    try {
      const project = window.projectManager.getProjects().find(p => p.id === projectId);
      if (!project) {
        Utils.showNotification('项目不存在', 'error');
        return;
      }

      const projectPath = await window.projectManager.getProjectPath(project.id);
      if (!await window.electronAPI.fs.exists(projectPath)) {
        Utils.showNotification('项目目录不存在', 'error');
        return;
      }

      await window.electronAPI.shell.showInFolder(projectPath);
      Utils.showNotification('已在文件管理器中打开项目目录', 'success');
    } catch (error) {
      console.error('打开项目目录失败:', error);
      Utils.showNotification('打开项目目录失败', 'error');
    }
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId) {
    const project = window.projectManager.getProjects().find(p => p.id === projectId);
    if (!project) return;

    // 使用自定义确认对话框
    const confirmed = await this.showConfirmDialog(
      '确认删除项目',
      `确定要删除项目"${project.name}"吗？\n\n项目将被移到回收站，不会被永久删除。`,
      '删除',
      'danger'
    );
    
    if (!confirmed) return;

    try {
      // 显示删除进度
      Utils.showNotification('正在删除项目...', 'info', 0);
      
      // 异步删除项目
      await window.projectManager.deleteProject(projectId);
      
      // 立即从UI中移除项目，不等待重新渲染整个列表
      const projectElement = document.querySelector(`[data-project-id="${projectId}"]`);
      if (projectElement) {
        projectElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        projectElement.style.opacity = '0';
        projectElement.style.transform = 'scale(0.9)';
        setTimeout(() => {
          projectElement.remove();
        }, 300);
      }
      
      Utils.showNotification('项目已删除', 'success');
    } catch (error) {
      console.error('删除项目失败:', error);
      Utils.showNotification('删除项目失败: ' + error.message, 'error');
    }
  }

  /**
   * 导入项目
   */
  async importProject() {
    try {
      Utils.showNotification('正在导入项目...', 'info', 0);
      const projectId = await window.projectManager.importProject();
      
      if (projectId) {
        await this.renderProjectsList();
      }
    } catch (error) {
      console.error('导入项目失败:', error);
    }
  }

  /**
   * 加载故事流图
   */
  async loadOverviewGraph() {
    const graphCanvas = document.getElementById('overview-graph-canvas');
    if (!graphCanvas) return;

    try {
      const projects = window.projectManager.getProjects();
      if (!projects || projects.length === 0) {
        graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">没有可用项目</div>';
        return;
      }

      const project = projects[0]; // 当前项目
      const kb = await window.projectManager.readKnowledgeBase(project);
      const characters = await window.projectManager.readCharacters(project);
      const timeline = await window.projectManager.getTimelineHistory(project.id);

      graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">正在加载故事流图...</div>';

      // 构建节点和边（同之前的逻辑）
      const nodes = [];
      const edges = [];

      // 添加角色节点
      Object.entries(characters?.characters || {}).forEach(([id, char]) => {
        nodes.push({
          data: { id: `char:${id}`, label: char.name || id, type: 'character' }
        });
      });

      // 添加场景节点
      Object.keys(kb?.locations || {}).forEach(location => {
        nodes.push({
          data: { id: `loc:${location}`, label: location, type: 'location' }
        });
      });

      // 添加时间线节点
      timeline.forEach((node, idx) => {
        nodes.push({
          data: { id: `node:${node.id}`, label: `第${idx + 1}章`, type: 'timeline' }
        });
      });

      // 创建关系边
      timeline.forEach(node => {
        const text = (node.content?.dialogue || '') + ' ' + (node.content?.chapterSummary || '');
        
        // 角色关系
        Object.entries(characters?.characters || {}).forEach(([id, char]) => {
          if (char.name && text.includes(char.name)) {
            edges.push({
              data: {
                id: `char-${id}-node-${node.id}`,
                source: `char:${id}`,
                target: `node:${node.id}`,
                label: '出现'
              }
            });
          }
        });
      });

      // 检查是否有cytoscape库
      if (typeof window.cytoscape === 'undefined') {
        // 尝试加载库
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'vendor/cytoscape/cytoscape.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        } catch (error) {
          graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">图表库加载失败</div>';
          return;
        }
      }

      if (window.cytoscape) {
        graphCanvas.innerHTML = '';
        // 容器仍需存在且在文档中
        if (!graphCanvas || !document.body.contains(graphCanvas)) {
          return;
        }
        
        // 确保至少有一些节点，否则cytoscape可能出错
        if (nodes.length === 0) {
          graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">暂无内容可显示</div>';
          return;
        }

        try {
          // 获取计算后的CSS变量值
          const computedStyle = getComputedStyle(document.documentElement);
          const primaryColor = computedStyle.getPropertyValue('--primary-color').trim() || '#667eea';
          
          const cy = window.cytoscape({
            container: graphCanvas,
            elements: { nodes, edges },
            style: [
              {
                selector: 'node',
                style: {
                  'label': 'data(label)',
                  'color': '#e5e7eb',
                  'text-outline-color': '#1f2937',
                  'text-outline-width': 2,
                  'background-color': '#64748b',
                  'border-color': '#93c5fd',
                  'border-width': 2,
                  'font-size': 12,
                  'width': 30,
                  'height': 30
                }
              },
              {
                selector: 'node[type="character"]',
                style: { 'background-color': '#60a5fa' }
              },
              {
                selector: 'node[type="location"]',
                style: { 'background-color': '#34d399' }
              },
              {
                selector: 'node[type="timeline"]',
                style: { 'background-color': primaryColor }
              },
              {
                selector: 'edge',
                style: {
                  'curve-style': 'bezier',
                  'width': 2,
                  'line-color': 'rgba(255,255,255,0.35)',
                  'target-arrow-color': 'rgba(255,255,255,0.5)',
                  'target-arrow-shape': 'triangle',
                  'label': 'data(label)',
                  'font-size': 10,
                  'color': '#cbd5e1'
                }
              }
            ],
            layout: {
              name: 'cose',
              animate: true,
              fit: true,
              padding: 20
            }
          });
          
          // 若实例创建失败则给出友好提示
          if (!cy) {
            graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">图表实例创建失败</div>';
          }
        } catch (error) {
          console.error('Cytoscape实例化错误:', error);
          graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">图表渲染失败</div>';
        }
      } else {
        graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">图表引擎未加载</div>';
      }

    } catch (error) {
      console.error('加载故事流图失败:', error);
      graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">加载故事流图失败</div>';
    }
  }

  /**
   * 加载综合介绍中的章节里程碑
   */
  async loadOverviewMilestones() {
    const milestonesContent = document.getElementById('overview-milestones-content');
    if (!milestonesContent) return;

    try {
      const projects = window.projectManager.getProjects();
      if (!projects || projects.length === 0) {
        milestonesContent.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">没有可用项目</div>';
        return;
      }

      const project = projects[0]; // 当前项目
      const timeline = await window.projectManager.getTimelineHistory(project.id);

      const milestones = await Promise.all(timeline.map(async (node, idx) => {
        let backgroundUrl = null;
        
        // 处理背景图片路径
        if (node.content?.backgroundUrl) {
          if (node.content.backgroundUrl.startsWith('assets/')) {
            // 转换相对路径为完整路径
            const filename = node.content.backgroundUrl.replace('assets/', '');
            const fullPath = await window.projectManager.getAssetPath(project, filename);
            backgroundUrl = window.PathUtils.toFileUrl(fullPath);
          } else if (node.content.backgroundUrl.startsWith('file://') || node.content.backgroundUrl.startsWith('http')) {
            // 已经是完整URL
            backgroundUrl = node.content.backgroundUrl;
          }
        }

        return {
          idx: idx + 1,
          time: Utils.formatTime(node.timestamp || Date.now()),
          summary: node.content?.chapterSummary || '',
          text: node.content?.dialogue || '',
          backgroundUrl: backgroundUrl
        };
      }));

      // 过滤出有摘要的章节
      const validMilestones = milestones.filter(m => m.summary);

      // 如果有章节，为第一章获取项目封面（如果没有背景的话）
      if (validMilestones.length > 0 && !validMilestones[0].backgroundUrl) {
        const projectCover = await window.projectManager.getProjectCover(project);
        if (projectCover) {
          validMilestones[0].backgroundUrl = projectCover;
          validMilestones[0].isProjectCover = true;
        }
      }

      if (validMilestones.length === 0) {
        milestonesContent.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">暂无章节里程碑<br><small>章节摘要会自动填充到这里</small></div>';
        return;
      }

      let html = '';
      validMilestones.forEach(milestone => {
        // 处理背景图片显示
        let imageHtml = '';
        if (milestone.backgroundUrl) {
          const imageTitle = milestone.isProjectCover ? '项目封面' : `第${milestone.idx}章背景`;
          imageHtml = `
            <div class="milestone-image" title="${imageTitle}">
              <img src="${milestone.backgroundUrl}" alt="${imageTitle}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'image-placeholder\\'><i class=\\'fa fa-image\\'></i><span>图片加载失败</span></div>'">
              <div class="image-overlay">${imageTitle}</div>
            </div>
          `;
        } else {
          imageHtml = `
            <div class="milestone-image placeholder" title="暂无背景图">
              <div class="image-placeholder">
                <i class="fa fa-image"></i>
                <span>暂无背景图</span>
              </div>
            </div>
          `;
        }

        const chapterTitle = milestone.idx === 1 && milestone.isProjectCover ? '故事的开始' : `第${milestone.idx}章`;
        
        html += `
          <div class="milestone-card">
            ${imageHtml}
            <div class="milestone-content">
              <div class="milestone-header">
                <strong>${chapterTitle}</strong>
                <span class="milestone-time">${Utils.escapeHtml(milestone.time)}</span>
              </div>
              <div class="milestone-summary">${Utils.escapeHtml(milestone.summary)}</div>
            </div>
          </div>
        `;
      });

      milestonesContent.innerHTML = html;

    } catch (error) {
      console.error('加载章节里程碑失败:', error);
      milestonesContent.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">加载章节里程碑失败</div>';
    }
  }

  /**
   * 显示关于对话框
   */
  async showAboutModal() {
    const modal = document.getElementById('about-modal');
    
    try {
      // 获取版本信息
      const version = await window.electronAPI.getAppVersion();
      const versions = await window.electronAPI.getVersions();
      const appPath = await window.electronAPI.getAppPath();
      
      // 填充版本信息
      const versionEl = document.getElementById('app-version');
      const pathEl = document.getElementById('app-path');
      const nodeVersionEl = document.getElementById('node-version');
      const electronVersionEl = document.getElementById('electron-version');
      const chromeVersionEl = document.getElementById('chrome-version');
      
      if (versionEl) versionEl.textContent = version;
      if (pathEl) pathEl.textContent = appPath;
      if (nodeVersionEl) nodeVersionEl.textContent = versions.node;
      if (electronVersionEl) electronVersionEl.textContent = versions.electron;
      if (chromeVersionEl) chromeVersionEl.textContent = versions.chrome;
      
    } catch (error) {
      console.warn('获取应用信息失败:', error);
    }

    if (modal) {
      modal.classList.add('active');
    }
  }

  /**
   * 加载应用版本
   */
  async loadAppVersion() {
    try {
      const version = await window.electronAPI.getAppVersion();
      const versionElements = document.querySelectorAll('#app-version');
      versionElements.forEach(el => {
        el.textContent = version;
      });
    } catch (error) {
      console.warn('获取应用版本失败:', error);
    }
  }

  /**
   * 关闭所有模态框
   */
  closeAllModals() {
    const modals = document.querySelectorAll('.modal.active');
    modals.forEach(modal => {
      modal.classList.remove('active');
    });
  }

  // 主题应用（与设置页保持一致）
  applyThemeColor(colorName) {
    const colorMap = {
      purple: { primary: '#667eea', secondary: '#764ba2' },
      blue: { primary: '#4facfe', secondary: '#00f2fe' },
      green: { primary: '#43e97b', secondary: '#38f9d7' },
      orange: { primary: '#fa709a', secondary: '#fee140' },
  // 柔雾粉
  pink: { primary: '#fce1ec', secondary: '#f7b1c3' },
      red: { primary: '#ff9a9e', secondary: '#fecfef' }
    };
    const colors = colorMap[colorName] || colorMap.purple;
    const root = document.documentElement;
    root.style.setProperty('--primary-color', colors.primary);
    root.style.setProperty('--secondary-color', colors.secondary);
    root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`);
    root.style.setProperty('--gradient-accent', `linear-gradient(135deg, ${colors.secondary}, ${colors.primary})`);
  }

  applyThemeMode(mode) {
    const body = document.body;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    body.classList.remove('theme-light', 'theme-dark');
    if (mode === 'light') body.classList.add('theme-light');
    else if (mode === 'dark') body.classList.add('theme-dark');
    else body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
  }

  /**
   * 初始化图标雨背景效果
   */
  initIconRain() {
    const container = document.getElementById('icon-rain-container');
    if (!container) return;

    // Font Awesome 图标数组（选择一些好看的游戏、文学相关图标）
    const icons = [
      'fas fa-gamepad', 'fas fa-book', 'fas fa-heart', 'fas fa-star',
      'fas fa-music', 'fas fa-film', 'fas fa-palette', 'fas fa-magic-wand-sparkles',
      'fas fa-feather', 'fas fa-gem', 'fas fa-crown', 'fas fa-dice',
      'far fa-lightbulb', 'far fa-paper-plane', 'far fa-bookmark', 'far fa-moon',
      'fas fa-code', 'fas fa-robot', 'fas fa-sparkles', 'fas fa-wand-magic',
      'fas fa-theater-masks', 'fas fa-scroll', 'fas fa-quill-pen',
      'fas fa-dragon', 'fas fa-cat', 'fas fa-paw', 'fas fa-fire',
      'fas fa-snowflake', 'fas fa-leaf', 'fas fa-tree', 'fas fa-mountain',
      'far fa-sun', 'fas fa-cloud', 'fas fa-bolt', 'fas fa-rainbow',
      'fas fa-key', 'fas fa-lock', 'fas fa-compass', 'fas fa-map',
      'fas fa-telescope', 'fas fa-atom', 'fas fa-dna', 'fas fa-flask',
      'far fa-circle', 'far fa-square', 'far fa-heart', 'far fa-star'
    ];

    // 创建图标雨
    this.iconRainInterval = setInterval(() => {
      this.createRainIcon(container, icons);
    }, 500); // 从800ms改为500ms，增加密度

    // 页面可见性变化时管理动画
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 页面不可见时暂停动画
        if (this.iconRainInterval) {
          clearInterval(this.iconRainInterval);
          this.iconRainInterval = null;
        }
      } else {
        // 页面可见时恢复动画
        if (!this.iconRainInterval) {
          this.iconRainInterval = setInterval(() => {
            this.createRainIcon(container, icons);
          }, 500);
        }
      }
    });
  }

  /**
   * 创建单个雨滴图标
   */
  createRainIcon(container, icons) {
    const icon = document.createElement('i');
    const randomIcon = icons[Math.floor(Math.random() * icons.length)];
    icon.className = `rain-icon ${randomIcon}`;

    // 随机样式变体
    const variants = ['small', 'medium', 'large'];
    const speeds = ['slow', 'fast'];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const speed = Math.random() < 0.3 ? speeds[Math.floor(Math.random() * speeds.length)] : '';
    
    if (variant) icon.classList.add(variant);
    if (speed) icon.classList.add(speed);

    // 随机水平位置
    icon.style.left = Math.random() * 100 + '%';
    
    // 随机延迟（让图标不是同时出现）
    icon.style.animationDelay = Math.random() * 2 + 's';

    container.appendChild(icon);

    // 动画结束后移除元素
    setTimeout(() => {
      if (icon.parentNode) {
        icon.parentNode.removeChild(icon);
      }
    }, 12000); // 足够长的时间确保动画完成
  }

  /**
   * 显示背景音乐模态框
   */
  showBackgroundMusicModal() {
    const modal = document.getElementById('bg-music-modal');
    if (modal) {
      modal.classList.add('active');
      // 初始化背景音乐功能（如果还没有初始化）
      if (!this.backgroundMusic) {
        this.initBackgroundMusic();
      }
    }
  }

  /**
   * 初始化背景音乐功能
   */
  initBackgroundMusic() {
    this.backgroundMusic = {
      audio: null,
      playlist: [],
      currentIndex: -1,
      isPlaying: false,
      settings: {
        loopMode: 'playlist', // none, single, playlist - 默认为列表循环
        playMode: 'order', // order, random
        audioEngine: 'electron',
        autoPlay: true,
        volume: 0.5
      }
    };

    // 根据平台过滤音频引擎选项
    this.filterAudioEngineOptions();

    // 绑定控制按钮事件
    this.setupMusicControls();
    
    // 从本地存储加载设置和播放列表
    this.loadMusicSettings();
    
    // 初始化音乐可视化器
    this.musicVisualizer = new window.MusicVisualizer();
    
    // 注意：不在这里自动播放，而是在应用完全初始化后
  }

  /**
   * 根据平台过滤音频引擎选项
   */
  filterAudioEngineOptions() {
    const audioEngineSelect = document.getElementById('audio-engine-select');
    if (!audioEngineSelect) return;

    const isWindows = window.PathUtils && window.PathUtils.isWindows ? window.PathUtils.isWindows() : false;
    
    if (!isWindows) {
      // 非Windows系统，移除DirectSound和WASAPI选项
      const directSoundOption = audioEngineSelect.querySelector('option[value="directsound"]');
      const wasapiOption = audioEngineSelect.querySelector('option[value="wasapi"]');
      
      if (directSoundOption) {
        directSoundOption.remove();
      }
      if (wasapiOption) {
        wasapiOption.remove();
      }
      
      console.log('非Windows系统，已隐藏DirectSound和WASAPI音频引擎选项');
    }
  }

  /**
   * 设置音乐控制事件
   */
  setupMusicControls() {
    // 播放按钮
    const playBtn = document.getElementById('music-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.playMusic());
    }

    // 暂停按钮
    const pauseBtn = document.getElementById('music-pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.pauseMusic());
    }

    // 停止按钮
    const stopBtn = document.getElementById('music-stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => this.stopMusic());
    }

    // 下一首按钮
    const nextBtn = document.getElementById('music-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextTrack());
    }

    // 音量滑块
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        this.setVolume(volume);
        document.getElementById('volume-value').textContent = e.target.value + '%';
      });
    }

    // 添加音乐按钮
    const addMusicBtn = document.getElementById('add-music-btn');
    if (addMusicBtn) {
      addMusicBtn.addEventListener('click', () => this.addMusicFile());
    }

    // 清空播放列表
    const clearBtn = document.getElementById('clear-playlist-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearPlaylist());
    }

    // 导入/导出播放列表
    const importBtn = document.getElementById('import-playlist-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => this.importPlaylist());
    }

    const exportBtn = document.getElementById('export-playlist-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportPlaylist());
    }

    // 设置变更监听
    const loopSelect = document.getElementById('loop-mode-select');
    if (loopSelect) {
      loopSelect.addEventListener('change', (e) => {
        this.backgroundMusic.settings.loopMode = e.target.value;
        this.saveMusicSettings();
      });
    }

    const playModeSelect = document.getElementById('play-mode-select');
    if (playModeSelect) {
      playModeSelect.addEventListener('change', (e) => {
        this.backgroundMusic.settings.playMode = e.target.value;
        this.saveMusicSettings();
      });
    }

    const audioEngineSelect = document.getElementById('audio-engine-select');
    if (audioEngineSelect) {
      audioEngineSelect.addEventListener('change', (e) => {
        this.backgroundMusic.settings.audioEngine = e.target.value;
        this.saveMusicSettings();
        
        // 立即应用音频引擎切换
        this.applyAudioEngine(e.target.value);
        Utils.showNotification(`已切换到 ${e.target.selectedOptions[0].text} 音频引擎`, 'success');
      });
    }

    const autoPlayCheck = document.getElementById('auto-play-check');
    if (autoPlayCheck) {
      autoPlayCheck.addEventListener('change', (e) => {
        this.backgroundMusic.settings.autoPlay = e.target.checked;
        this.saveMusicSettings();
      });
    }
  }

  /**
   * 应用音频引擎设置
   * @param {string} engine - 音频引擎类型
   */
  applyAudioEngine(engine) {
    console.log(`正在切换到音频引擎: ${engine}`);
    
    // 如果正在播放，需要重新创建音频对象
    if (this.backgroundMusic.audio && this.backgroundMusic.isPlaying) {
      const currentTime = this.backgroundMusic.audio.currentTime;
      const currentSrc = this.backgroundMusic.audio.src;
      const volume = this.backgroundMusic.audio.volume;
      
      // 暂停当前播放
      this.backgroundMusic.audio.pause();
      
      // 创建新的音频对象
      this.backgroundMusic.audio = new Audio(currentSrc);
      this.backgroundMusic.audio.volume = volume;
      this.backgroundMusic.audio.currentTime = currentTime;
      
      // 重新设置事件
      this.setupAudioEvents();
      
      // 继续播放
      this.backgroundMusic.audio.play().catch(console.error);
    }
  }

  /**
   * 播放音乐
   */
  playMusic() {
    if (!this.backgroundMusic.playlist.length) return;
    
    if (this.backgroundMusic.currentIndex === -1) {
      this.backgroundMusic.currentIndex = 0;
    }

    const currentTrack = this.backgroundMusic.playlist[this.backgroundMusic.currentIndex];
    if (!currentTrack) return;

    if (!this.backgroundMusic.audio) {
      this.backgroundMusic.audio = new Audio(currentTrack.path);
      this.backgroundMusic.audio.volume = this.backgroundMusic.settings.volume;
      this.setupAudioEvents();
    }

    this.backgroundMusic.audio.play();
    this.backgroundMusic.isPlaying = true;
    this.updatePlaybackUI();
    this.updateGameMusicButtonState();
  }

  /**
   * 暂停音乐
   */
  pauseMusic() {
    if (this.backgroundMusic.audio && !this.backgroundMusic.audio.paused) {
      this.backgroundMusic.audio.pause();
      this.backgroundMusic.isPlaying = false;
      this.updatePlaybackUI();
      this.updateControlsState();
      this.updateGameMusicButtonState();
      
      // 停止音乐可视化
      if (this.musicVisualizer) {
        this.musicVisualizer.stop();
      }
      
      console.log('音乐已暂停');
    }
  }

  /**
   * 停止音乐
   */
  stopMusic() {
    if (this.backgroundMusic.audio) {
      this.backgroundMusic.audio.pause();
      this.backgroundMusic.audio.currentTime = 0;
      this.backgroundMusic.isPlaying = false;
      this.updatePlaybackUI();
      this.updateControlsState();
      this.updateGameMusicButtonState();
      
      // 停止音乐可视化
      if (this.musicVisualizer) {
        this.musicVisualizer.stop();
      }
      
      console.log('音乐已停止');
    }
  }

  /**
   * 设置音量
   */
  setVolume(volume) {
    this.backgroundMusic.settings.volume = volume;
    if (this.backgroundMusic.audio) {
      this.backgroundMusic.audio.volume = volume;
    }
    this.saveMusicSettings();
  }

  /**
   * 下一首
   */
  nextTrack() {
    if (!this.backgroundMusic.playlist.length) return;
    
    this.backgroundMusic.currentIndex = (this.backgroundMusic.currentIndex + 1) % this.backgroundMusic.playlist.length;
    this.playTrackByIndex(this.backgroundMusic.currentIndex);
  }

  /**
   * 上一首
   */
  previousTrack() {
    if (!this.backgroundMusic.playlist.length) return;
    
    this.backgroundMusic.currentIndex = (this.backgroundMusic.currentIndex - 1 + this.backgroundMusic.playlist.length) % this.backgroundMusic.playlist.length;
    this.playTrackByIndex(this.backgroundMusic.currentIndex);
  }

  /**
   * 设置音频事件监听
   */
  setupAudioEvents() {
    if (!this.backgroundMusic.audio) return;

    this.backgroundMusic.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.backgroundMusic.audio.addEventListener('timeupdate', () => {
      this.updateProgress();
    });

    this.backgroundMusic.audio.addEventListener('loadedmetadata', () => {
      this.updatePlaybackUI();
    });
  }

  /**
   * 处理音轨结束
   */
  handleTrackEnded() {
    const { loopMode, playMode, autoPlay } = this.backgroundMusic.settings;
    
    if (loopMode === 'single') {
      // 单曲循环
      this.backgroundMusic.audio.currentTime = 0;
      this.backgroundMusic.audio.play();
      return;
    }

    if (!autoPlay) {
      this.backgroundMusic.isPlaying = false;
      this.updatePlaybackUI();
      this.updateGameMusicButtonState();
      return;
    }

    // 获取下一首
    let nextIndex = -1;
    if (playMode === 'random') {
      nextIndex = Math.floor(Math.random() * this.backgroundMusic.playlist.length);
    } else {
      nextIndex = this.backgroundMusic.currentIndex + 1;
      if (nextIndex >= this.backgroundMusic.playlist.length) {
        if (loopMode === 'playlist') {
          nextIndex = 0;
        } else {
          this.backgroundMusic.isPlaying = false;
          this.updatePlaybackUI();
          this.updateGameMusicButtonState();
          return;
        }
      }
    }

    this.playTrackByIndex(nextIndex);
  }

  /**
   * 播放指定索引的音轨
   */
  playTrackByIndex(index) {
    if (index < 0 || index >= this.backgroundMusic.playlist.length) return;

    this.backgroundMusic.currentIndex = index;
    const track = this.backgroundMusic.playlist[index];
    
    console.log('准备播放音乐:', track);
    
    try {
      if (this.backgroundMusic.audio) {
        // 设置新的音频源
        if (track.file) {
          // 如果有原始文件对象，使用blob URL
          this.backgroundMusic.audio.src = URL.createObjectURL(track.file);
          console.log('使用blob URL播放:', track.name);
        } else if (track.path) {
          // 使用路径工具处理文件路径
          const audioSrc = window.PathUtils.toFileUrl(track.path);
          this.backgroundMusic.audio.src = audioSrc;
          console.log('使用文件路径播放:', audioSrc);
        } else {
          console.error('无法播放曲目：缺少文件路径和文件对象', track);
          return;
        }
        
        this.backgroundMusic.audio.load();
        this.backgroundMusic.audio.play().catch(error => {
          console.error('播放失败:', error);
          // 如果当前播放方式失败，尝试blob URL
          if (track.file) {
            console.log('尝试使用blob URL作为备用方案');
            this.backgroundMusic.audio.src = URL.createObjectURL(track.file);
            this.backgroundMusic.audio.load();
            return this.backgroundMusic.audio.play();
          }
        });
      } else {
        // 创建新的Audio对象
        let audioSrc;
        if (track.file) {
          audioSrc = URL.createObjectURL(track.file);
          console.log('创建新Audio对象，使用blob URL:', track.name);
        } else if (track.path) {
          audioSrc = window.PathUtils.toFileUrl(track.path);
          console.log('创建新Audio对象，使用文件路径:', audioSrc);
        } else {
          console.error('无法播放曲目：缺少文件路径和文件对象', track);
          return;
        }
        
        this.backgroundMusic.audio = new Audio(audioSrc);
        this.backgroundMusic.audio.volume = this.backgroundMusic.settings.volume;
        this.setupAudioEvents();
        this.backgroundMusic.audio.play().catch(error => {
          console.error('播放失败:', error);
          if (track.file && !audioSrc.startsWith('blob:')) {
            // 尝试使用blob URL
            console.log('尝试使用blob URL作为备用方案');
            this.backgroundMusic.audio.src = URL.createObjectURL(track.file);
            this.backgroundMusic.audio.load();
            return this.backgroundMusic.audio.play();
          }
        });
      }

      this.backgroundMusic.isPlaying = true;
      this.updatePlaybackUI();
      this.updatePlaylistUI();
      this.updateGameMusicButtonState();
      this.updatePlaybackMetadata();
      
      // 启动音乐可视化
      if (this.musicVisualizer) {
        this.musicVisualizer.start();
      }
    } catch (error) {
      console.error('设置音频源失败:', error);
      // 尝试播放下一首
      this.nextTrack();
    }
  }

  /**
   * 添加音乐文件
   */
  async addMusicFile() {
    try {
      console.log('开始添加音乐文件...');
      
      const files = await window.electronAPI.showOpenDialog({
        title: '选择音乐文件',
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }
        ],
        properties: ['openFile', 'multiSelections']
      });

      if (files && !files.canceled && files.filePaths.length > 0) {
        console.log('选择了音乐文件:', files.filePaths);
        
        for (const filePath of files.filePaths) {
          const fileName = window.PathUtils.getFileName(filePath);
          const track = {
            name: window.PathUtils.removeExtension(fileName),
            path: filePath,
            fileName: fileName,
            duration: 0 // 将在播放时获取
          };
          this.backgroundMusic.playlist.push(track);
          console.log('添加音乐文件到播放列表:', track);
        }
        
        this.updatePlaylistUI();
        this.saveMusicSettings();
        this.updateControlsState();
        Utils.showNotification(`已添加 ${files.filePaths.length} 首音乐`, 'success');
      } else {
        console.log('用户取消了音乐文件选择');
      }
    } catch (error) {
      console.error('添加音乐文件失败:', error);
      Utils.showNotification('添加音乐文件失败: ' + error.message, 'error');
    }
  }

  /**
   * 清空播放列表
   */
  clearPlaylist() {
    this.stopMusic();
    this.backgroundMusic.playlist = [];
    this.backgroundMusic.currentIndex = -1;
    this.updatePlaylistUI();
    this.updateControlsState();
    this.saveMusicSettings();
  }

  /**
   * 导入播放列表
   */
  async importPlaylist() {
    try {
      // 检查electron API是否可用
      if (!window.electronAPI || !window.electronAPI.dialog) {
        // 如果API不可用，使用HTML5文件选择器
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.m3u,.pls,.csv,.json';
        
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          try {
            const content = await file.text();
            const ext = file.name.split('.').pop().toLowerCase();
            
            let playlist = [];
            if (ext === 'json') {
              playlist = JSON.parse(content);
            } else if (ext === 'csv') {
              // 简单的CSV解析
              const lines = content.split('\n').filter(line => line.trim());
              playlist = lines.map(line => {
                const [name, path] = line.split(',').map(s => s.trim().replace(/"/g, ''));
                return { name, path, fileName: path.split('/').pop().split('\\').pop() };
              });
            }
            
            this.backgroundMusic.playlist = [...this.backgroundMusic.playlist, ...playlist];
            this.updatePlaylistUI();
            this.updateControlsState();
            this.saveMusicSettings();
          } catch (error) {
            console.error('解析播放列表失败:', error);
          }
        };
        
        input.click();
        return;
      }

      const file = await window.electronAPI.dialog.showOpenDialog({
        title: '导入播放列表',
        filters: [
          { name: '播放列表文件', extensions: ['m3u', 'pls', 'csv', 'json'] }
        ],
        properties: ['openFile']
      });

      if (file && !file.canceled && file.filePaths.length > 0) {
        const content = await window.electronAPI.fs.readFile(file.filePaths[0], 'utf-8');
        const ext = file.filePaths[0].split('.').pop().toLowerCase();
        
        let playlist = [];
        if (ext === 'json') {
          playlist = JSON.parse(content);
        } else if (ext === 'csv') {
          // 简单的CSV解析
          const lines = content.split('\n').filter(line => line.trim());
          playlist = lines.map(line => {
            const [name, path] = line.split(',').map(s => s.trim().replace(/"/g, ''));
            return { name, path, fileName: path.split('/').pop().split('\\').pop() };
          });
        }
        
        this.backgroundMusic.playlist = [...this.backgroundMusic.playlist, ...playlist];
        this.updatePlaylistUI();
        this.updateControlsState();
        this.saveMusicSettings();
      }
    } catch (error) {
      console.error('导入播放列表失败:', error);
    }
  }

  /**
   * 导出播放列表
   */
  async exportPlaylist() {
    try {
      // 检查electron API是否可用
      if (!window.electronAPI || !window.electronAPI.dialog) {
        // 如果API不可用，使用浏览器下载
        const content = JSON.stringify(this.backgroundMusic.playlist, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'playlist.json';
        a.click();
        
        URL.revokeObjectURL(url);
        return;
      }

      const file = await window.electronAPI.dialog.showSaveDialog({
        title: '导出播放列表',
        defaultPath: 'playlist.json',
        filters: [
          { name: 'JSON文件', extensions: ['json'] },
          { name: 'CSV文件', extensions: ['csv'] }
        ]
      });

      if (file && !file.canceled && file.filePath) {
        const ext = file.filePath.split('.').pop().toLowerCase();
        let content = '';
        
        if (ext === 'json') {
          content = JSON.stringify(this.backgroundMusic.playlist, null, 2);
        } else if (ext === 'csv') {
          content = this.backgroundMusic.playlist.map(track => 
            `"${track.name}","${track.path}"`
          ).join('\n');
        }
        
        await window.electronAPI.fs.writeFile(file.filePath, content);
      }
    } catch (error) {
      console.error('导出播放列表失败:', error);
    }
  }

  /**
   * 更新播放控制UI
   */
  updatePlaybackUI() {
    const currentTrackInfo = document.getElementById('current-track-info');
    if (!currentTrackInfo) return;

    const trackName = currentTrackInfo.querySelector('.track-name');
    const progressTime = currentTrackInfo.querySelector('.progress-time');

    if (this.backgroundMusic.currentIndex >= 0) {
      const track = this.backgroundMusic.playlist[this.backgroundMusic.currentIndex];
      trackName.textContent = track ? track.name : '暂无播放';
    } else {
      trackName.textContent = '暂无播放';
    }

    this.updateProgress();
  }

  /**
   * 更新进度条
   */
  updateProgress() {
    const progressFill = document.querySelector('.progress-fill');
    const progressTime = document.querySelector('.progress-time');
    
    if (this.backgroundMusic.audio && progressFill && progressTime) {
      const current = this.backgroundMusic.audio.currentTime;
      const duration = this.backgroundMusic.audio.duration || 0;
      const percentage = duration ? (current / duration) * 100 : 0;
      
      progressFill.style.width = percentage + '%';
      progressTime.textContent = `${this.formatTime(current)} / ${this.formatTime(duration)}`;
    }
  }

  /**
   * 更新播放列表UI
   */
  updatePlaylistUI() {
    const playlist = document.getElementById('playlist');
    if (!playlist) return;

    if (this.backgroundMusic.playlist.length === 0) {
      playlist.innerHTML = `
        <div class="empty-playlist">
          <i class="fas fa-music opacity-50"></i>
          <p>播放列表为空</p>
          <p class="text-muted">点击"添加音乐"来添加音频文件</p>
        </div>
      `;
    } else {
      playlist.innerHTML = this.backgroundMusic.playlist.map((track, index) => `
        <div class="playlist-item ${index === this.backgroundMusic.currentIndex ? 'active' : ''}" 
             data-index="${index}">
          <div class="track-info">
            <div class="track-name">${track.name}</div>
            <div class="track-path">${track.fileName}</div>
          </div>
          <div class="track-actions">
            <button class="btn-small play-track" data-index="${index}" title="播放">
              <i class="fas fa-play"></i>
            </button>
            <button class="btn-small remove-track" data-index="${index}" title="移除">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('');

      // 绑定播放列表项目事件
      playlist.querySelectorAll('.play-track').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.closest('button').dataset.index);
          this.playTrackByIndex(index);
        });
      });

      playlist.querySelectorAll('.remove-track').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.closest('button').dataset.index);
          this.removeTrack(index);
        });
      });
    }
  }

  /**
   * 移除音轨
   */
  removeTrack(index) {
    if (index === this.backgroundMusic.currentIndex) {
      this.stopMusic();
    }
    
    this.backgroundMusic.playlist.splice(index, 1);
    
    if (this.backgroundMusic.currentIndex > index) {
      this.backgroundMusic.currentIndex--;
    } else if (this.backgroundMusic.currentIndex === index) {
      this.backgroundMusic.currentIndex = -1;
    }

    this.updatePlaylistUI();
    this.updateControlsState();
    this.saveMusicSettings();
  }

  /**
   * 更新控制按钮状态
   */
  updateControlsState() {
    const playBtn = document.getElementById('music-play-btn');
    const pauseBtn = document.getElementById('music-pause-btn');
    const stopBtn = document.getElementById('music-stop-btn');
    const nextBtn = document.getElementById('music-next-btn');
    
    const hasPlaylist = this.backgroundMusic.playlist.length > 0;
    const isPlaying = this.backgroundMusic.isPlaying;
    const hasAudio = this.backgroundMusic.audio !== null;
    
    if (playBtn) {
      playBtn.disabled = !hasPlaylist || isPlaying;
      playBtn.style.opacity = (!hasPlaylist || isPlaying) ? '0.5' : '1';
    }
    if (pauseBtn) {
      pauseBtn.disabled = !hasPlaylist || !isPlaying;
      pauseBtn.style.opacity = (!hasPlaylist || !isPlaying) ? '0.5' : '1';
    }
    if (stopBtn) {
      stopBtn.disabled = !hasPlaylist || !hasAudio;
      stopBtn.style.opacity = (!hasPlaylist || !hasAudio) ? '0.5' : '1';
    }
    if (nextBtn) {
      nextBtn.disabled = !hasPlaylist;
      nextBtn.style.opacity = !hasPlaylist ? '0.5' : '1';
    }

    // 更新游戏界面音乐按钮状态
    this.updateGameMusicButtonState();
  }

  /**
   * 更新游戏界面音乐按钮状态
   */
  updateGameMusicButtonState() {
    const gameMusicBtn = document.getElementById('game-music-btn');
    if (gameMusicBtn) {
      if (this.backgroundMusic && this.backgroundMusic.isPlaying) {
        gameMusicBtn.classList.add('playing');
        gameMusicBtn.title = '背景音乐 (播放中)';
      } else {
        gameMusicBtn.classList.remove('playing');
        gameMusicBtn.title = '背景音乐';
      }
    }
    
    // 更新主页音乐按钮状态
    const mainMusicBtn = document.getElementById('bg-music-btn');
    if (mainMusicBtn) {
      if (this.backgroundMusic && this.backgroundMusic.isPlaying) {
        mainMusicBtn.classList.add('playing');
      } else {
        mainMusicBtn.classList.remove('playing');
      }
    }
  }

  /**
   * 应用音频引擎设置
   */
  applyAudioEngine(engine) {
    console.log(`应用音频引擎: ${engine}`);
    
    // 如果当前正在播放，重新创建音频对象以应用新引擎
    if (this.backgroundMusic.isPlaying && this.backgroundMusic.audio) {
      const wasPlaying = !this.backgroundMusic.audio.paused;
      const currentTime = this.backgroundMusic.audio.currentTime;
      const currentTrack = this.backgroundMusic.playlist[this.backgroundMusic.currentIndex];
      
      if (currentTrack && wasPlaying) {
        // 暂停当前播放
        this.backgroundMusic.audio.pause();
        
        // 重新创建音频对象
        let audioSrc;
        if (currentTrack.file) {
          audioSrc = URL.createObjectURL(currentTrack.file);
        } else if (currentTrack.path) {
          audioSrc = window.PathUtils.toFileUrl(currentTrack.path);
        }
        
        if (audioSrc) {
          this.backgroundMusic.audio = new Audio(audioSrc);
          this.backgroundMusic.audio.volume = this.backgroundMusic.settings.volume;
          this.backgroundMusic.audio.currentTime = currentTime;
          this.setupAudioEvents();
          
          // 重新开始播放
          this.backgroundMusic.audio.play().catch(error => {
            console.error('重新播放失败:', error);
          });
        }
      }
    }
    
    // 更新播放信息显示
    this.updatePlaybackMetadata();
  }
  async updatePlaybackMetadata() {
    const currentTrack = this.backgroundMusic.playlist[this.backgroundMusic.currentIndex];
    if (!currentTrack) return;

    // 更新文件名
    const filenameEl = document.getElementById('metadata-filename');
    if (filenameEl) {
      filenameEl.textContent = currentTrack.fileName || '未知文件';
    }

    // 更新音频引擎
    const engineEl = document.getElementById('metadata-engine');
    if (engineEl) {
      const engineNames = {
        'electron': 'Electron默认',
        'directsound': 'DirectSound',
        'wasapi': 'WASAPI'
      };
      engineEl.textContent = engineNames[this.backgroundMusic.settings.audioEngine] || 'Electron默认';
    }

    // 从实际音频文件获取真实技术参数
    const bitdepthEl = document.getElementById('metadata-bitdepth');
    const samplerateEl = document.getElementById('metadata-samplerate');
    
    if (currentTrack.path && window.electronAPI && window.electronAPI.audio) {
      try {
        // 使用music-metadata库获取真实音频信息
        const result = await window.electronAPI.audio.getMetadata(currentTrack.path);
        
        if (result.success && result.data) {
          const metadata = result.data;
          
          if (bitdepthEl) {
            const bitsPerSample = metadata.bitsPerSample;
            if (bitsPerSample && bitsPerSample > 0) {
              bitdepthEl.textContent = `${bitsPerSample}位`;
            } else {
              // 根据编码格式推断
              const codec = metadata.codec?.toLowerCase() || '';
              if (codec.includes('flac')) {
                bitdepthEl.textContent = '16-24位 (FLAC)';
              } else if (codec.includes('mp3')) {
                bitdepthEl.textContent = '16位 (MP3)';
              } else if (codec.includes('aac') || codec.includes('m4a')) {
                bitdepthEl.textContent = '16位 (AAC)';
              } else {
                bitdepthEl.textContent = '16位 (默认)';
              }
            }
          }
          
          if (samplerateEl) {
            const sampleRate = metadata.sampleRate;
            if (sampleRate && sampleRate > 0) {
              samplerateEl.textContent = `${(sampleRate / 1000).toFixed(1)} kHz`;
            } else {
              samplerateEl.textContent = '44.1 kHz (默认)';
            }
          }
          
          // 如果有额外信息，也可以存储起来用于显示
          currentTrack.metadata = metadata;
          
        } else {
          // 如果解析失败，显示错误信息
          if (bitdepthEl) bitdepthEl.textContent = '解析失败';
          if (samplerateEl) samplerateEl.textContent = '解析失败';
          console.warn('音频元数据解析失败:', result.error);
        }
      } catch (error) {
        // 网络或其他错误
        if (bitdepthEl) bitdepthEl.textContent = '获取失败';
        if (samplerateEl) samplerateEl.textContent = '获取失败';
        console.error('获取音频元数据时出错:', error);
      }
    } else {
      // 没有文件路径或API不可用
      if (bitdepthEl) bitdepthEl.textContent = '未知';
      if (samplerateEl) samplerateEl.textContent = '未知';
    }
  }

  /**
   * 格式化时间
   */
  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * 加载音乐设置
   */
  loadMusicSettings() {
    try {
      const saved = localStorage.getItem('artimeow-music-settings');
      if (saved) {
        const data = JSON.parse(saved);
        this.backgroundMusic.settings = { ...this.backgroundMusic.settings, ...data.settings };
        this.backgroundMusic.playlist = data.playlist || [];
        
        // 应用设置到UI
        const loopSelect = document.getElementById('loop-mode-select');
        if (loopSelect) loopSelect.value = this.backgroundMusic.settings.loopMode;
        
        const playModeSelect = document.getElementById('play-mode-select');
        if (playModeSelect) playModeSelect.value = this.backgroundMusic.settings.playMode;
        
        const audioEngineSelect = document.getElementById('audio-engine-select');
        if (audioEngineSelect) audioEngineSelect.value = this.backgroundMusic.settings.audioEngine;
        
        const autoPlayCheck = document.getElementById('auto-play-check');
        if (autoPlayCheck) autoPlayCheck.checked = this.backgroundMusic.settings.autoPlay;
        
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
          volumeSlider.value = this.backgroundMusic.settings.volume * 100;
          document.getElementById('volume-value').textContent = Math.round(this.backgroundMusic.settings.volume * 100) + '%';
        }

        this.updatePlaylistUI();
        this.updateControlsState();
      }
    } catch (error) {
      console.error('加载音乐设置失败:', error);
    }
  }

  /**
   * 保存音乐设置
   */
  saveMusicSettings() {
    try {
      // 确保播放列表中的track对象包含完整信息
      const playlistToSave = this.backgroundMusic.playlist.map(track => ({
        name: track.name,
        path: track.path,
        fileName: track.fileName,
        duration: track.duration || 0,
        // 不保存file对象，因为它无法序列化
        // 但保留路径信息以便重新加载时使用
      }));

      const data = {
        settings: this.backgroundMusic.settings,
        playlist: playlistToSave
      };
      localStorage.setItem('artimeow-music-settings', JSON.stringify(data));
      console.log('音乐设置已保存:', data);
    } catch (error) {
      console.error('保存音乐设置失败:', error);
    }
  }

  /**
   * 应用设置到主窗口
   */
  applySettingsToMainWindow(settings) {
    if (!settings) return;

    // 应用渐变背景
    if (settings.backgroundGradient) {
      const { startColor, endColor, direction } = settings.backgroundGradient;
      const gradient = `linear-gradient(${direction || '135deg'}, ${startColor || '#667eea'}, ${endColor || '#764ba2'})`;
      const root = document.documentElement;
      root.style.setProperty('--gradient-primary', gradient);
      root.style.setProperty('--gradient-accent', `linear-gradient(${direction || '135deg'}, ${endColor || '#764ba2'}, ${startColor || '#667eea'})`);
    }

    // 应用主题模式
    if (settings.theme) {
      this.applyThemeMode(settings.theme);
    }

    // 应用主题颜色（如果没有自定义渐变）
    if (settings.themeColor && !settings.backgroundGradient) {
      this.applyThemeColor(settings.themeColor);
    }

    // 应用全屏模式标题栏设置
    if (settings.hasOwnProperty('fullscreenMode')) {
      const titlebar = document.querySelector('.titlebar');
      if (titlebar) {
        if (settings.fullscreenMode) {
          titlebar.style.display = 'none'; // 全屏时隐藏
          document.body.classList.add('fullscreen-mode');
        } else {
          titlebar.style.display = 'flex'; // 非全屏时显示
          document.body.classList.remove('fullscreen-mode');
        }
      }
    }
  }

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} message - 消息
   * @param {string} confirmText - 确认按钮文本
   * @param {string} type - 类型 ('danger', 'warning', 'primary')
   * @returns {Promise<boolean>} 用户是否确认
   */
  showConfirmDialog(title, message, confirmText = '确认', type = 'primary') {
    return new Promise((resolve) => {
      // 创建对话框元素
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog-overlay';
      dialog.innerHTML = `
        <div class="confirm-dialog">
          <div class="confirm-dialog-header">
            <h3>${title}</h3>
          </div>
          <div class="confirm-dialog-body">
            <p>${message.replace(/\n/g, '<br>')}</p>
          </div>
          <div class="confirm-dialog-actions">
            <button class="btn btn-secondary cancel-btn">取消</button>
            <button class="btn btn-${type} confirm-btn">${confirmText}</button>
          </div>
        </div>
      `;

      // 添加样式
      const style = document.createElement('style');
      style.textContent = `
        .confirm-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        .confirm-dialog {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-radius: 16px;
          padding: 0;
          max-width: 400px;
          width: 90%;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .confirm-dialog-header {
          padding: 24px 24px 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }
        .confirm-dialog-header h3 {
          margin: 0 0 16px 0;
          color: #2c3e50;
          font-size: 20px;
          font-weight: 600;
        }
        .confirm-dialog-body {
          padding: 24px;
        }
        .confirm-dialog-body p {
          margin: 0;
          color: #555;
          line-height: 1.6;
          font-size: 16px;
        }
        .confirm-dialog-actions {
          padding: 0 24px 24px;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        .confirm-dialog .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        .confirm-dialog .btn-secondary {
          background: rgba(108, 117, 125, 0.1);
          color: #6c757d;
          border: 1px solid rgba(108, 117, 125, 0.2);
        }
        .confirm-dialog .btn-secondary:hover {
          background: rgba(108, 117, 125, 0.2);
        }
        .confirm-dialog .btn-danger {
          background: rgba(220, 53, 69, 0.9);
          color: #ffffff;
        }
        .confirm-dialog .btn-danger:hover {
          background: rgba(220, 53, 69, 1);
          transform: translateY(-1px);
        }
      `;
      document.head.appendChild(style);

      // 添加到页面
      document.body.appendChild(dialog);

      // 绑定事件
      const cancelBtn = dialog.querySelector('.cancel-btn');
      const confirmBtn = dialog.querySelector('.confirm-btn');

      const cleanup = () => {
        document.body.removeChild(dialog);
        document.head.removeChild(style);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      confirmBtn.onclick = () => {
        cleanup();
        resolve(true);
      };

      // ESC键取消
      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(false);
          document.removeEventListener('keydown', handleKeydown);
        }
      };
      document.addEventListener('keydown', handleKeydown);
    });
  }

  /**
   * 设置IoT UI控制
   */
  async setupIoTUI() {
    console.log('🔧 开始设置IoT UI...');
    
    // 检查IoT管理器是否存在
    if (!window.iotManager) {
      console.warn('⚠️ IoT管理器未初始化，跳过IoT UI设置');
      return;
    }

    console.log('✅ IoT管理器已找到，等待就绪...');

    // 等待IoT管理器就绪
    await window.iotManager.waitUntilReady();
    console.log('✅ IoT管理器已就绪');
    
    const status = window.iotManager.getStatus();
    console.log('📊 当前IoT状态:', status);
    console.log('📊 连接状态:', status.connected);
    
    // 立即更新初始可见性
    this.updateIoTVisibility(status.connected);
    
    // 监听连接状态变化
    window.iotManager.on('connect', () => {
      console.log('🔌 IoT连接事件触发');
      this.updateIoTVisibility(true);
    });
    
    window.iotManager.on('disconnect', () => {
      console.log('🔌 IoT断开事件触发');
      this.updateIoTVisibility(false);
    });
    
    // 监听心率数据更新
    window.iotManager.on('heartrate', (data) => {
      console.log('💓 收到心率数据:', data);
      // IoT管理器发送的是 data.bpm，不是 data.heartRate
      this.updateMainHeartRateDisplay(data.bpm || data.heartRate);
    });

    // 主界面心率显示按钮点击
    const mainHrDisplay = document.getElementById('main-heart-rate-display');
    if (mainHrDisplay) {
      console.log('✅ 找到主界面心率显示按钮');
      mainHrDisplay.addEventListener('click', () => {
        this.toggleMainHRChart();
      });
    } else {
      console.warn('⚠️ 未找到主界面心率显示按钮 #main-heart-rate-display');
    }

    // 心率图表关闭按钮
    const closeChartBtn = document.getElementById('main-hr-chart-close');
    if (closeChartBtn) {
      console.log('✅ 找到心率图表关闭按钮');
      closeChartBtn.addEventListener('click', () => {
        const panel = document.getElementById('main-hr-chart-panel');
        if (panel) panel.style.display = 'none';
      });
    } else {
      console.warn('⚠️ 未找到心率图表关闭按钮 #main-hr-chart-close');
    }

    // 开始绘制心率曲线
    this.startHRChartDrawing();
    
    console.log('✅ IoT UI设置完成');
  }

  /**
   * 更新IoT UI可见性 - 只控制心率显示按钮
   */
  updateIoTVisibility(connected) {
    console.log(`🔄 更新IoT UI可见性: ${connected ? '显示' : '隐藏'}`);
    console.log(`   参数类型: ${typeof connected}, 值: ${connected}`);
    
    // 主界面心率显示按钮 - 使用class控制可见性(避免CSS !important覆盖)
    const mainHrDisplay = document.getElementById('main-heart-rate-display');
    if (mainHrDisplay) {
      if (connected) {
        mainHrDisplay.classList.add('visible');
      } else {
        mainHrDisplay.classList.remove('visible');
      }
      console.log(`  ✅ 主界面心率显示: ${connected ? '已添加' : '已移除'} .visible 类`);
      
      // 验证实际计算样式
      const computedStyle = window.getComputedStyle(mainHrDisplay);
      console.log(`  🔍 实际计算样式 display = "${computedStyle.display}"`);
    } else {
      console.warn('  ⚠️ 未找到 #main-heart-rate-display');
    }
    
    // 游戏界面心率显示按钮 - 使用class控制可见性
    const gameHrBtn = document.getElementById('game-heart-rate-btn');
    if (gameHrBtn) {
      if (connected) {
        gameHrBtn.classList.add('visible');
      } else {
        gameHrBtn.classList.remove('visible');
      }
      console.log(`  ✅ 游戏界面心率显示: ${connected ? '已添加' : '已移除'} .visible 类`);
      
      // 验证实际计算样式
      const computedStyle = window.getComputedStyle(gameHrBtn);
      console.log(`  🔍 实际计算样式 display = "${computedStyle.display}"`);
    } else {
      console.warn('  ⚠️ 未找到 #game-heart-rate-btn');
    }
  }

  /**
   * 更新主界面心率显示
   */
  updateMainHeartRateDisplay(bpm) {
    console.log(`💓 更新心率显示: ${bpm} BPM`);
    
    // 主界面心率值
    const hrValue = document.getElementById('main-hr-value');
    const hrDisplay = document.getElementById('main-heart-rate-display');
    
    if (hrValue) {
      hrValue.textContent = bpm || '--';
      console.log(`  ✅ 主界面心率值已更新: ${hrValue.textContent}`);
    } else {
      console.warn('  ⚠️ 未找到 #main-hr-value');
    }
    
    if (hrDisplay) {
      if (bpm && bpm > 0) {
        hrDisplay.classList.add('active');
        console.log('  ✅ 主界面心率显示激活（添加动画）');
      } else {
        hrDisplay.classList.remove('active');
        console.log('  ℹ️ 主界面心率显示未激活');
      }
    } else {
      console.warn('  ⚠️ 未找到 #main-heart-rate-display');
    }

    // 游戏界面心率值
    const gameHrValue = document.getElementById('game-hr-value');
    const gameHrBtn = document.getElementById('game-heart-rate-btn');
    
    if (gameHrValue) {
      gameHrValue.textContent = bpm || '--';
      console.log(`  ✅ 游戏界面心率值已更新: ${gameHrValue.textContent}`);
    }
    
    if (gameHrBtn) {
      if (bpm && bpm > 0) {
        gameHrBtn.classList.add('active');
        console.log('  ✅ 游戏界面心率显示激活');
      } else {
        gameHrBtn.classList.remove('active');
        console.log('  ℹ️ 游戏界面心率显示未激活');
      }
    }
  }

  /**
   * 切换主界面心率图表显示
   */
  toggleMainHRChart() {
    const panel = document.getElementById('main-hr-chart-panel');
    if (panel) {
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'block';
    }
  }

  /**
   * 开始心率曲线绘制
   */
  startHRChartDrawing() {
    const canvas = document.getElementById('main-hr-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    setInterval(() => {
      this.drawHRChart(ctx);
    }, 1000); // 每秒更新一次
  }

  /**
   * 绘制心率曲线
   */
  drawHRChart(context) {
    const canvas = context.canvas;
    const width = canvas.width;
    const height = canvas.height;
    
    // 清空画布
    context.clearRect(0, 0, width, height);
    
    // 获取心率历史数据
    let hrHistory = [];
    if (window.emotionAnalyzer && typeof window.emotionAnalyzer.getHeartRateHistory === 'function') {
      hrHistory = window.emotionAnalyzer.getHeartRateHistory();
    } else if (window.iotManager && window.iotManager.heartRateHistory) {
      hrHistory = window.iotManager.heartRateHistory.map(item => ({
        value: item.bpm,
        timestamp: item.timestamp
      }));
    }
    
    if (!hrHistory || hrHistory.length === 0) {
      context.fillStyle = '#999';
      context.font = '14px Arial';
      context.textAlign = 'center';
      context.fillText('暂无数据', width / 2, height / 2);
      return;
    }
    
    // 计算数据范围
    const hrValues = hrHistory.map(item => typeof item === 'object' ? (item.value || item.bpm) : item);
    const minHR = Math.min(...hrValues);
    const maxHR = Math.max(...hrValues);
    const range = maxHR - minHR || 10;
    
    const padding = 10;
    const chartHeight = height - 2 * padding;
    const chartWidth = width - 2 * padding;
    
    // 绘制网格线
    context.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    context.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight / 5) * i;
      context.beginPath();
      context.moveTo(padding, y);
      context.lineTo(width - padding, y);
      context.stroke();
    }
    
    // 绘制心率曲线
    context.strokeStyle = '#f093fb';
    context.lineWidth = 2;
    context.beginPath();
    
    const step = chartWidth / Math.max(hrValues.length - 1, 1);
    hrValues.forEach((hr, index) => {
      const x = padding + index * step;
      const normalizedValue = (hr - minHR) / range;
      const y = height - padding - (normalizedValue * chartHeight);
      
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    
    context.stroke();
    
    // 填充渐变
    context.lineTo(width - padding, height - padding);
    context.lineTo(padding, height - padding);
    context.closePath();
    
    const gradient = context.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, 'rgba(240, 147, 251, 0.3)');
    gradient.addColorStop(1, 'rgba(240, 147, 251, 0.05)');
    context.fillStyle = gradient;
    context.fill();
    
    // 绘制数据点
    context.fillStyle = '#f093fb';
    hrValues.forEach((hr, index) => {
      const x = padding + index * step;
      const normalizedValue = (hr - minHR) / range;
      const y = height - padding - (normalizedValue * chartHeight);
      
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.fill();
    });
    
    // 更新情绪和趋势显示
    if (window.emotionAnalyzer) {
      const emotionState = window.emotionAnalyzer.getCurrentEmotion();
      const emotionNameEl = document.getElementById('main-hr-emotion');
      const emotionTrendEl = document.getElementById('main-hr-trend');
      
      if (emotionNameEl && emotionState) {
        // 情绪名称映射
        const emotionNames = {
          'very_calm': '非常平静',
          'calm': '平静',
          'neutral': '中性',
          'interested': '感兴趣',
          'excited': '兴奋',
          'very_excited': '非常兴奋',
          'intense': '强烈'
        };
        emotionNameEl.textContent = emotionNames[emotionState.emotion] || '未知';
      }
      
      if (emotionTrendEl && emotionState) {
        const trendIcon = emotionState.trend === 'rising' ? '↑' : 
                         emotionState.trend === 'falling' ? '↓' : '→';
        emotionTrendEl.textContent = trendIcon;
      }
    }
  }
}

// 全局函数（供HTML调用）
function closeProjectModal() {
  const modal = document.getElementById('project-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function closeAboutModal() {
  const modal = document.getElementById('about-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function closeProjectOverviewModal() {
  window.projectDetails.closeProjectOverview();
}

function openGitHubRepo() {
  if (window.electronAPI && window.electronAPI.shell) {
    window.electronAPI.shell.openExternal('https://github.com/B5-Software/ArtiMeow-AIGalGamerRT');
  }
}

// 为了在HTML中调用而暴露的全局函数
window.renderProjectsList = async function() {
  if (window.app) {
    await window.app.renderProjectsList();
  }
};

window.closeBgMusicModal = function() {
  const modal = document.getElementById('bg-music-modal');
  if (modal) {
    modal.classList.remove('active');
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  // 搜索过滤
  const search = document.getElementById('project-search');
  if (search) {
    let t = null;
    search.addEventListener('input', (e) => {
      clearTimeout(t);
      const val = e.target.value || '';
      t = setTimeout(() => {
        if (window.app) window.app.renderProjectsList(val);
      }, 150);
    });
  }
});

// 防止页面刷新
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
  }
  if (e.key === 'F5') {
    e.preventDefault();
  }
});

// 防止右键菜单（可选）
document.addEventListener('contextmenu', (e) => {
  // 在生产模式下禁用右键菜单
  // 检查是否有开发者工具可用来判断是否为开发模式
  const isDev = window.electronAPI && window.electronAPI.isDev;
  if (!isDev) {
    e.preventDefault();
  }
});
