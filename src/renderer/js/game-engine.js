/**
 * 游戏引擎
 */

class GameEngine {
  constructor() {
    this.currentProject = null;
    this.currentTimeline = null;
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;
    this.isWaitingForChoice = false;
    this.isGenerating = false;
    this.gameState = 'menu'; // 'menu', 'playing', 'paused'
    this.autoMode = false;
    this.skipMode = false;
    this.keyboardHandler = null;
    this.projectManager = window.projectManager; // 引用全局项目管理器
    this.hasCompletedFirstTypewriter = false; // 标记是否完成第一次打字机效果
    
    // 连续多句对白序列与后台预取队列
    this.prefetchQueue = []; // 后台预生成的对白队列（0ms延迟）
    this.isPrefetching = false;
    this.maxPrefetchDepth = 2; // 最大后台预生成深度
    this.currentDialogueBeats = []; // 当前幕次的多句对白序列
    this.currentBeatIndex = 0;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupKeyboardControls();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 返回主页按钮
    const backBtn = document.getElementById('back-to-main-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.exitGame());
    }

    // 游戏设置按钮
    const settingsBtn = document.getElementById('game-settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        window.electronAPI.openSettings();
      });
    }

    // IoT面板按钮
    // IoT面板按钮（游戏界面专用）
    const iotPanelBtn = document.getElementById('game-iot-panel-btn');
    console.log('🔍 查找 game-iot-panel-btn:', iotPanelBtn ? '找到' : '未找到');
    if (iotPanelBtn) {
      console.log('✅ 为 game-iot-panel-btn 添加点击事件监听器');
      
      // 测试：添加一个简单的点击测试
      iotPanelBtn.onclick = (e) => {
        console.log('🖱️ onclick 触发！', e);
      };
      
      iotPanelBtn.addEventListener('click', async (e) => {
        console.log('🖱️ addEventListener click 触发！', e);
        e.stopPropagation(); // 防止事件冒泡
        
        if (window.electronAPI && window.electronAPI.window && window.electronAPI.window.openIoTPanel) {
          console.log('📞 调用 openIoTPanel API');
          try {
            await window.electronAPI.window.openIoTPanel();
            console.log('✅ IoT面板打开成功');
          } catch (error) {
            console.error('❌ 打开IoT面板失败:', error);
          }
        } else {
          console.error('❌ IoT面板API未找到', {
            electronAPI: !!window.electronAPI,
            window: !!(window.electronAPI && window.electronAPI.window),
            openIoTPanel: !!(window.electronAPI && window.electronAPI.window && window.electronAPI.window.openIoTPanel)
          });
        }
      }, true); // 使用捕获阶段
    } else {
      console.error('❌ 未找到 game-iot-panel-btn 元素');
    }

    // HR实时显示按钮（游戏界面专用） - 监听 IoT 管理器的心率事件
    const hrBtn = document.getElementById('game-heart-rate-btn');
    console.log('🔍 查找 game-heart-rate-btn:', hrBtn ? '找到' : '未找到', hrBtn);
    console.log('🔍 查找 window.iotManager:', window.iotManager ? '存在' : '不存在');
    
    if (hrBtn && window.iotManager) {
      console.log('🎮 游戏引擎: 开始设置心率监听器');
      // 等待 IoT 管理器初始化完成
      window.iotManager.waitUntilReady().then(() => {
        console.log('✅ IoT管理器已准备就绪，注册心率事件监听器');
        
        // 监听心率数据更新
        window.iotManager.on('heartrate', (data) => {
          console.log('🎮 游戏引擎收到心率数据:', data);
          if (data.bpm > 0) {
            const hrValue = document.getElementById('game-hr-value');
            if (hrValue) {
              hrValue.textContent = data.bpm;
              hrBtn.classList.add('active');
              console.log(`✅ 更新游戏界面心率显示: ${data.bpm}`);
            }
          } else {
            const hrValue = document.getElementById('game-hr-value');
            if (hrValue) {
              hrValue.textContent = '--';
              hrBtn.classList.remove('active');
            }
          }
        });

        // 监听断开连接
        window.iotManager.on('disconnect', () => {
          console.log('🎮 IoT设备已断开，重置心率显示');
          const hrValue = document.getElementById('game-hr-value');
          if (hrValue) {
            hrValue.textContent = '--';
          }
          hrBtn.classList.remove('active');
        });

        // 初始化显示当前状态
        const status = window.iotManager.getStatus();
        console.log('🎮 当前IoT状态:', status);
        if (status.connected && status.heartRate > 0) {
          const hrValue = document.getElementById('game-hr-value');
          if (hrValue) {
            hrValue.textContent = status.heartRate;
            hrBtn.classList.add('active');
            console.log(`✅ 初始化显示当前心率: ${status.heartRate}`);
          }
        }
      }).catch(err => {
        console.error('❌ IoT管理器初始化失败:', err);
      });
    } else {
      console.warn('⚠️ 心率按钮或IoT管理器未找到', { hrBtn: !!hrBtn, iotManager: !!window.iotManager });
    }

    // 体感控制监听
    if (window.iotManager) {
      window.iotManager.waitUntilReady().then(() => {
        console.log('🎮 注册体感控制监听器');
        
        window.iotManager.on('gesture', (data) => {
          console.log('🎮 游戏引擎收到体感事件:', data);
          this.handleGestureControl(data);
        });
      }).catch(err => {
        console.error('❌ 注册体感监听器失败:', err);
      });
    }

    // HUD 控制: CUSTOM 输入
    const btnCustom = document.getElementById('btn-custom');
    const customBox = document.getElementById('custom-input');
    const customText = document.getElementById('custom-text');
    const customSubmit = document.getElementById('custom-submit');
    if (btnCustom && customBox && customText && customSubmit) {
      btnCustom.addEventListener('click', () => {
        customBox.classList.toggle('hidden');
        if (!customBox.classList.contains('hidden')) {
          customText.focus();
        }
      });
      const submitFn = async () => {
        const val = (customText.value || '').trim();
        if (!val) return;
        customText.value = '';
        customBox.classList.add('hidden');
        // 作为用户选择推进
        await this.generateNextContent(val);
      };
      customSubmit.addEventListener('click', submitFn);
      customText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitFn();
        }
      });
    }

    const btnSkip = document.getElementById('btn-skip');
    if (btnSkip) {
      btnSkip.addEventListener('click', () => {
        if (this.skipMode) {
          this.stopSkip();
        } else {
          this.startSkip();
        }
      });
    }

    // 鼠标点击游戏区域或对话框推进剧情（经典 Galgame 体验）
    const onAdvanceTrigger = (e) => {
      // 排除点击按钮、输入框、选项、控制栏
      if (e.target.closest('.control-btn, .hud-btn, .choice-option, .custom-input, .btn-close, .game-controls, input, button')) {
        return;
      }
      if (this.gameState !== 'playing') return;

      const dialogueText = document.getElementById('dialogue-text');
      if (dialogueText && dialogueText.dataset.typing === 'true') {
        // 若正在打字，瞬间显示完整文字
        const full = dialogueText.dataset.fullText || '';
        dialogueText.textContent = full;
        dialogueText.dataset.typing = 'false';
        if (this.currentTimeline?.content?.choices?.length > 0) {
          this.currentChoices = this.currentTimeline.content.choices;
          this.displayChoices(this.currentChoices);
          this.isWaitingForChoice = true;
        }
      } else if (!this.isWaitingForChoice && !this.isGenerating) {
        // 对白打字已结束，且不是等待选择状态，点击直接推进下一句对白
        this.continueStory();
      }
    };

    const gameArea = document.querySelector('.game-area');
    if (gameArea) {
      gameArea.addEventListener('click', onAdvanceTrigger);
    }

    // 快速存档 (Q.SAVE)
    const btnQSave = document.getElementById('btn-qsave');
    if (btnQSave) {
      btnQSave.addEventListener('click', () => this.quickSave());
    }

    // 快速读档 (Q.LOAD)
    const btnQLoad = document.getElementById('btn-qload');
    if (btnQLoad) {
      btnQLoad.addEventListener('click', () => this.quickLoad());
    }

    // 存档菜单 (SAVE)
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.openSaveModal());
    }

    // 读档菜单 (LOAD)
    const btnLoad = document.getElementById('btn-load');
    if (btnLoad) {
      btnLoad.addEventListener('click', () => this.openLoadModal());
    }

    // 自动播放 (AUTO)
    const btnAuto = document.getElementById('btn-auto');
    if (btnAuto) {
      btnAuto.addEventListener('click', () => this.toggleAutoMode());
    }

    // 对话历史 (Backlog) 按钮与控制
    const btnLog = document.getElementById('btn-log');
    if (btnLog) {
      btnLog.addEventListener('click', () => this.toggleBacklog());
    }

    const backlogClose = document.getElementById('backlog-close');
    if (backlogClose) {
      backlogClose.addEventListener('click', () => this.hideBacklog());
    }

    const backlogScrollBottom = document.getElementById('backlog-scroll-bottom');
    if (backlogScrollBottom) {
      backlogScrollBottom.addEventListener('click', () => {
        const content = document.getElementById('backlog-content');
        if (content) content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
      });
    }

    // 鼠标滚轮上滑打开历史记录（经典 Galgame 体验）
    window.addEventListener('wheel', (e) => {
      if (this.gameState !== 'playing') return;
      const backlogPanel = document.getElementById('backlog-panel');
      const isBacklogOpen = backlogPanel && !backlogPanel.classList.contains('hidden');

      if (!isBacklogOpen) {
        // 滚轮向上滚动（deltaY < -15）且未在生成中：打开历史记录
        if (e.deltaY < -15 && !this.isGenerating) {
          this.showBacklog();
        }
      } else {
        // 历史记录已打开时，如果已经在最底部且继续向下快速滚动，退出回看
        const content = document.getElementById('backlog-content');
        if (content && e.deltaY > 35) {
          const isAtBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 10;
          if (isAtBottom) {
            this.hideBacklog();
          }
        }
      }
    }, { passive: true });

    // 鼠标右键关闭历史记录
    window.addEventListener('contextmenu', (e) => {
      if (this.gameState === 'playing') {
        const backlogPanel = document.getElementById('backlog-panel');
        if (backlogPanel && !backlogPanel.classList.contains('hidden')) {
          e.preventDefault();
          this.hideBacklog();
        }
      }
    });
  }

  /**
   * 设置键盘控制
   */
  setupKeyboardControls() {
    this.keyboardHandler = (e) => {
      if (this.gameState !== 'playing') return;

      const backlogPanel = document.getElementById('backlog-panel');
      const isBacklogOpen = backlogPanel && !backlogPanel.classList.contains('hidden');

      // 历史记录面板打开时的按键处理
      if (isBacklogOpen) {
        if (e.key === 'Escape' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          this.hideBacklog();
          return;
        }
      }

      // 焦点在输入框或文本域中时不触发游戏全局快捷键
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }

      // Ctrl 键快进 (按住 Ctrl 极速快进，松开停止)
      if (e.key === 'Control' || e.ctrlKey) {
        if (!this.skipMode) {
          this.startSkip();
        }
      }

      switch (e.key) {
        case ' ': // 空格键
          e.preventDefault();
          e.stopPropagation(); // 阻止事件传播
          
          if (this.isWaitingForChoice) {
            this.selectCurrentChoice();
          } else if (!this.isGenerating) {
            // 空格跳过打字机：若正在打字，瞬间填满文本并显示选项
            const dialogueText = document.getElementById('dialogue-text');
            if (dialogueText && dialogueText.dataset.typing === 'true') {
              const full = dialogueText.dataset.fullText || '';
              dialogueText.textContent = full;
              dialogueText.dataset.typing = 'false';
              
              if (this.currentTimeline?.content?.choices?.length > 0) {
                this.currentChoices = this.currentTimeline.content.choices;
                this.displayChoices(this.currentChoices);
                this.isWaitingForChoice = true;
              }
            } else {
              this.continueStory();
            }
          }
          break;

        case 's':
        case 'S':
          e.preventDefault();
          e.stopPropagation();
          this.quickSave();
          break;

        case 'l':
        case 'L':
          e.preventDefault();
          e.stopPropagation();
          this.quickLoad();
          break;

        case 'a':
        case 'A':
          e.preventDefault();
          e.stopPropagation();
          this.toggleAutoMode();
          break;

        case 'PageUp':
          e.preventDefault();
          e.stopPropagation();
          this.showBacklog();
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.navigateChoices(-1);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.navigateChoices(1);
          }
          break;

        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (this.isWaitingForChoice) {
            this.selectCurrentChoice();
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          const saveLoadModal = document.getElementById('save-load-modal');
          if (saveLoadModal && saveLoadModal.classList.contains('active')) {
            this.closeSaveLoadModal();
          } else if (isBacklogOpen) {
            this.hideBacklog();
          } else {
            this.pauseGame();
          }
          break;
      }
    };

    this.keyUpHandler = (e) => {
      if (this.gameState !== 'playing') return;
      // 松开 Ctrl 键停止快进
      if (e.key === 'Control') {
        this.stopSkip();
      }
    };

    // 使用捕获模式，确保事件被优先处理
    document.addEventListener('keydown', this.keyboardHandler, true);
    document.addEventListener('keyup', this.keyUpHandler, true);
  }

  /**
   * 启动游戏
   * @param {string} projectId - 项目ID
   */
  async startGame(projectId) {
    try {
      // 验证参数
      if (!projectId) {
        throw new Error('项目ID不能为空');
      }

      // 禁用返回主页按钮，防止打字机效果进行中返回导致问题
      const backBtn = document.getElementById('back-to-main-btn');
      if (backBtn) {
        backBtn.disabled = true;
        backBtn.style.opacity = '0.5';
        backBtn.style.cursor = 'not-allowed';
      }

      // 切换到游戏界面
      this.switchToGameScreen();

      // 加载项目
      this.currentProject = await window.projectManager.loadProject(projectId);
      
      if (!this.currentProject) {
        throw new Error('项目加载失败');
      }

      // 加载时间线
      await window.timeline.loadTimeline(projectId);

  // 预加载知识库与角色库
  this.currentProject.knowledgeBase = await window.projectManager.readKnowledgeBase(this.currentProject);
  this.currentProject.characters = await window.projectManager.readCharacters(this.currentProject);

      // 加载当前检查点
      await this.loadCurrentCheckpoint();

      // 初始化预生成深度与队列（默认2次）
      const configuredDepth = this.currentProject.settings?.prefetchDepth;
      this.maxPrefetchDepth = configuredDepth !== undefined ? configuredDepth : 2;
      this.prefetchQueue = [];
      this.isPrefetching = false;
      console.log(`⚡ [GameEngine] 后台预生成深度已设为: ${this.maxPrefetchDepth} 次`);

      // 更新游戏状态
      this.gameState = 'playing';

      Utils.showNotification(`开始游戏：${this.currentProject.name}`, 'success');

    } catch (error) {
      console.error('启动游戏失败:', error);
      Utils.showNotification(`启动游戏失败: ${error.message}`, 'error');
      this.exitGame();
    }
  }

  /**
   * 加载当前检查点
   */
  async loadCurrentCheckpoint() {
    try {
      if (!this.currentProject.currentTimeline) {
        throw new Error('没有可用的时间线数据');
      }

      this.currentTimeline = this.currentProject.currentTimeline;
      
      // 设置背景：若检查点缓存了背景图则直接显示，否则使用默认主题背景
      if (this.currentTimeline.content.backgroundUrl) {
        console.log('加载背景图片:', this.currentTimeline.content.backgroundUrl);
        // 检查是否是本地资源路径
        let backgroundPath = this.currentTimeline.content.backgroundUrl;
        if (backgroundPath.startsWith('assets/')) {
          // 转换为项目资源路径
          const filename = backgroundPath.replace('assets/', '');
          console.log('转换资源文件名:', filename);
          backgroundPath = await this.projectManager.getAssetPath(this.currentProject, filename);
          console.log('获取完整路径:', backgroundPath);
          // 使用PathUtils转换为file://协议路径
          backgroundPath = window.PathUtils.toFileUrl(backgroundPath);
          console.log('转换file://路径:', backgroundPath);
        }
        this.setBackgroundImage(backgroundPath);
      } else {
        console.log('没有背景图片，使用默认背景');
        this.setDefaultBackground();
      }
      await this.displayContent(this.currentTimeline.content);

  // 首帧不调用图片API，避免浪费；仅当后续继续时再生成

    } catch (error) {
      console.error('加载检查点失败:', error);
      Utils.showNotification('加载游戏进度失败', 'error');
    }
  }

  /**
   * 显示内容（支持连续多句对白序列与即时后台预取）
   * @param {Object} content - 内容对象
   */
  async displayContent(content) {
    const choicesContainer = document.getElementById('choices-container');

    // 清空之前的内容
    if (choicesContainer) choicesContainer.innerHTML = '';
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;
    this.isWaitingForChoice = false;

    // 解析当前幕次的对白分段 (dialogues array 或 完整 dialogue)
    if (Array.isArray(content.dialogues) && content.dialogues.length > 0) {
      this.currentDialogueBeats = content.dialogues.map(d => ({
        speaker: d.speaker || content.speaker || '',
        text: d.text || d.dialogue || '',
        emotion: d.emotion || d.speakerEmotion || content.speakerEmotion || 'neutral'
      }));
    } else {
      this.currentDialogueBeats = [{
        speaker: content.speaker || '',
        text: content.dialogue || '……',
        emotion: content.speakerEmotion || 'neutral'
      }];
    }

    this.currentBeatIndex = 0;
    await this.playCurrentBeat(content);

    // 如果当前无需玩家做出分支选择，立即启动后台预取下一段对话
    if (!content.choices || content.choices.length === 0) {
      setTimeout(() => this.triggerPrefetch(), 300);
    }
  }

  /**
   * 播放当前对白段落中的单个 Beat
   */
  async playCurrentBeat(content) {
    const dialogueText = document.getElementById('dialogue-text');
    const nameplate = document.getElementById('nameplate');
    const spaceHint = document.getElementById('space-hint');
    const choiceHint = document.getElementById('choice-hint');

    if (!dialogueText) return;

    const beat = (this.currentDialogueBeats && this.currentDialogueBeats[this.currentBeatIndex]) || {
      speaker: content?.speaker || '',
      text: content?.dialogue || '',
      emotion: content?.speakerEmotion || 'neutral'
    };

    const isLastBeat = !this.currentDialogueBeats || this.currentBeatIndex >= this.currentDialogueBeats.length - 1;

    // 1. 更新角色名牌
    if (nameplate) {
      if (beat.speaker) {
        nameplate.classList.remove('hidden');
        nameplate.textContent = beat.speaker;
      } else {
        nameplate.classList.add('hidden');
      }
    }

    // 2. 联动角色立绘独立图层，高亮当前说话人并切换到对应情绪差分立绘
    await this.updateCharacterSpritesLayer({
      speaker: beat.speaker,
      speakerEmotion: beat.emotion,
      emotion: beat.emotion,
      activeCharacters: content?.activeCharacters || []
    });

    // 3. 打字机效果显示文字
    await this.typewriterEffect(dialogueText, beat.text || '……');

    // 4. 若为最后一句且有选择项，展示选择项；否则显示空格/点击提示
    if (isLastBeat && content?.choices && content.choices.length > 0) {
      this.currentChoices = content.choices;
      this.displayChoices(content.choices);
      this.isWaitingForChoice = true;
      if (spaceHint) spaceHint.classList.add('hidden');
      if (choiceHint) choiceHint.classList.remove('hidden');
    } else {
      this.isWaitingForChoice = false;
      if (spaceHint) spaceHint.classList.remove('hidden');
      if (choiceHint) choiceHint.classList.add('hidden');
    }
  }

  /**
   * 打字机效果显示文本
   * @param {HTMLElement} element - 目标元素
   * @param {string} text - 要显示的文本
   */
  async typewriterEffect(element, text) {
  element.textContent = '';
  element.style.opacity = '1';
  element.dataset.fullText = text;
  element.dataset.typing = 'true';

  const speed = this.skipMode ? 0 : 50; // 毫秒，跳过时为0
    let i = 0;
    
    // 标记这是第一次打字机效果
    const isFirstTypewriter = !this.hasCompletedFirstTypewriter;

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        // 检查是否被中断（用户按空格键跳过）
        if (element.dataset.typing === 'false') {
          clearInterval(timer);
          
          // 第一次打字机完成，启用返回按钮
          if (isFirstTypewriter) {
            this.hasCompletedFirstTypewriter = true;
            this.enableBackButton();
          }
          
          resolve();
          return;
        }
        
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
        } else {
          clearInterval(timer);
          element.dataset.typing = 'false';
          
          // 第一次打字机完成，启用返回按钮
          if (isFirstTypewriter) {
            this.hasCompletedFirstTypewriter = true;
            this.enableBackButton();
          }
          
          // 自动模式：文本结束后根据状态继续
          if (this.autoMode && !this.isWaitingForChoice) {
            setTimeout(() => { if (this.autoMode && !this.isGenerating) this.continueStory(); }, 700);
          }
          resolve();
        }
      }, speed);
    });
  }

  /**
   * 启用返回主页按钮
   */
  enableBackButton() {
    const backBtn = document.getElementById('back-to-main-btn');
    if (backBtn) {
      backBtn.disabled = false;
      backBtn.style.opacity = '1';
      backBtn.style.cursor = 'pointer';
      console.log('✅ 返回主页按钮已启用');
    }
  }

  /**
   * 显示选择项并启动各分支选项的后台并发预生成
   * @param {Array} choices - 选择项数组
   */
  displayChoices(choices) {
    const container = document.getElementById('choices-container');
    if (!container) return;
    container.innerHTML = '';
    container.classList.remove('hidden');

    if (!Array.isArray(choices) || choices.length === 0) {
      this.isWaitingForChoice = false;
      return;
    }

    // 重置并初始化分支预取映射
    this.branchPrefetchMap = new Map();

    choices.forEach((choice, index) => {
      const choiceDiv = document.createElement('div');
      choiceDiv.className = 'choice-option';
      const choiceText = typeof choice === 'string' ? choice : (choice.text || `选项 ${index + 1}`);
      choiceDiv.textContent = choiceText;
      choiceDiv.setAttribute('data-choice-id', (choice && choice.id) ? choice.id : (index + 1));
      choiceDiv.setAttribute('data-choice-index', index);

      // 点击事件
      choiceDiv.addEventListener('click', () => {
        this.selectChoice(index);
      });

      // 鼠标悬停事件
      choiceDiv.addEventListener('mouseenter', () => {
        this.highlightChoice(index);
      });

      container.appendChild(choiceDiv);
    });

    // 不预先高亮任何选项，只有键盘或鼠标操作时才高亮
    this.selectedChoiceIndex = -1;

    // 启动各分支后续对白的静默预生成
    this.triggerBranchPrefetch(choices);
  }

  /**
   * 后台并发预生成各个分支选项后续的故事内容（按设定深度超前全分支预载）
   */
  async triggerBranchPrefetch(choices) {
    if (!Array.isArray(choices) || choices.length === 0) return;
    if (!this.currentProject || !this.currentTimeline) return;
    if (this.maxPrefetchDepth <= 0) return;

    const baseKnowledgeBase = this.currentProject.knowledgeBase || this.currentTimeline.knowledgeBase || {};
    const depth = this.maxPrefetchDepth || 2;

    choices.forEach(async (choice, idx) => {
      const choiceText = typeof choice === 'string' ? choice : (choice.text || `选项 ${idx + 1}`);
      if (!choiceText) return;

      if (!this.branchPrefetchMap.has(choiceText)) {
        this.branchPrefetchMap.set(choiceText, []);
      }

      let currentKb = baseKnowledgeBase;
      let lastDialogue = this.currentTimeline.content?.dialogue || '';
      let lastBg = this.currentTimeline.content?.backgroundUrl || null;

      for (let step = 0; step < depth; step++) {
        // 如果玩家已经做出了选择，立即停止不必要的分支递归预生成
        if (!this.isWaitingForChoice) break;

        try {
          console.log(`⚡ [BranchPrefetch] 正在超前预生成分支【${choiceText}】第 ${step + 1}/${depth} 幕对白...`);
          const context = {
            projectName: this.currentProject.name,
            projectStyle: this.currentProject.style,
            currentContent: lastDialogue,
            knowledgeBase: currentKb,
            characters: this.currentProject.characters
          };

          const aiResponse = await window.aiService.generateStoryContent(
            context,
            currentKb,
            step === 0 ? choiceText : '',
            null
          );

          if (aiResponse && (aiResponse.dialogue || aiResponse.dialogues)) {
            const updatedKnowledgeBase = window.aiService.applyKnowledgeUpdates(
              currentKb,
              aiResponse.knowledgeUpdates
            );
            currentKb = updatedKnowledgeBase;
            lastDialogue = aiResponse.dialogue || (aiResponse.dialogues?.[0]?.text) || '';

            const targetImagePrompt = aiResponse.backgroundPrompt || aiResponse.imagePrompt;
            let backgroundUrl = lastBg;

            if (aiResponse.sceneChanged === true && targetImagePrompt) {
              try {
                const filename = `background_${Date.now()}_branch_${step}.png`;
                const localPath = await window.aiService.generateImage(targetImagePrompt, {
                  projectId: this.currentProject.id,
                  filename: filename
                });
                if (localPath) {
                  backgroundUrl = localPath;
                  lastBg = localPath;
                }
              } catch (e) {
                console.warn('分支预取背景图跳过:', e);
              }
            }

            const prefetchedNode = {
              id: Utils.generateId(),
              timestamp: Date.now(),
              content: {
                dialogue: aiResponse.dialogue,
                dialogues: aiResponse.dialogues || null,
                speaker: aiResponse.speaker,
                speakerEmotion: aiResponse.speakerEmotion || 'neutral',
                activeCharacters: aiResponse.activeCharacters || [],
                choices: aiResponse.choices || [],
                imagePrompt: targetImagePrompt,
                backgroundPrompt: aiResponse.backgroundPrompt,
                knowledgeUpdates: aiResponse.knowledgeUpdates || {},
                chapterSummary: aiResponse.chapterSummary,
                backgroundUrl: backgroundUrl,
                userChoice: step === 0 ? choiceText : ''
              },
              knowledgeBase: updatedKnowledgeBase,
              charactersDelta: aiResponse.charactersDelta || null,
              isCheckpoint: true
            };

            const branchList = this.branchPrefetchMap.get(choiceText) || [];
            branchList.push(prefetchedNode);
            this.branchPrefetchMap.set(choiceText, branchList);

            console.log(`✅ [BranchPrefetch] 分支【${choiceText}】第 ${step + 1} 幕预生成就绪！`);

            // 若本分支出现了新的子选项，则停止该分支的线性延伸
            if (aiResponse.choices && aiResponse.choices.length > 0) {
              break;
            }
          }
        } catch (err) {
          console.warn(`⚡ [BranchPrefetch] 分支【${choiceText}】预生成第 ${step + 1} 幕跳过:`, err);
          break;
        }
      }
    });
  }

  /**
   * 导航选择项
   * @param {number} direction - 方向（-1上，1下）
   */
  navigateChoices(direction) {
    if (!this.isWaitingForChoice || this.currentChoices.length === 0) return;

    const newIndex = this.selectedChoiceIndex + direction;
    
    if (newIndex >= 0 && newIndex < this.currentChoices.length) {
      this.highlightChoice(newIndex);
    }
  }

  /**
   * 高亮选择项
   * @param {number} index - 选择项索引
   */
  highlightChoice(index) {
    this.selectedChoiceIndex = index;

    const choices = document.querySelectorAll('.choice-option');
    choices.forEach((choice, i) => {
      if (i === index) {
        choice.classList.add('selected');
      } else {
        choice.classList.remove('selected');
      }
    });
  }

  /**
   * 选择当前高亮的选择项
   */
  selectCurrentChoice() {
    if (this.selectedChoiceIndex >= 0) {
      this.selectChoice(this.selectedChoiceIndex);
    }
  }

  /**
   * 选择特定选择项（命中分支预生成时 0ms 瞬间呈现，并继承该分支的多幕缓冲）
   * @param {number} index - 选择项索引
   */
  async selectChoice(index) {
    if (!this.isWaitingForChoice || 
        index < 0 || 
        index >= this.currentChoices.length ||
        this.isGenerating) {
      return;
    }

    const selectedChoice = this.currentChoices[index];
    const choiceText = typeof selectedChoice === 'string' ? selectedChoice : (selectedChoice.text || `选项 ${index + 1}`);

    try {
      // 隐藏选择项并清空之前的线性预取队列
      this.hideChoices();
      this.isWaitingForChoice = false;
      this.prefetchQueue = [];

      // 结束游戏特殊动作
      if (selectedChoice.action === 'end') {
        this.endGame();
        return;
      }

      // ⚡ 1. 检查该分支是否已由后台预生成就绪（0ms 瞬间响应！）
      if (this.branchPrefetchMap && this.branchPrefetchMap.has(choiceText)) {
        const branchNodes = this.branchPrefetchMap.get(choiceText);
        if (Array.isArray(branchNodes) && branchNodes.length > 0) {
          const prefetchedNode = branchNodes.shift();
          // 将该分支后续已预载好的多幕对白无缝移入主队列！
          this.prefetchQueue = branchNodes;
          this.branchPrefetchMap.clear();

          console.log(`⚡ [BranchPrefetch] 命中已就绪的分支【${choiceText}】，0毫秒瞬间切换！附带后续已预载缓存: ${this.prefetchQueue.length} 幕`);

          // 应用知识库和角色库增量
          if (prefetchedNode.knowledgeBase) {
            this.currentProject.knowledgeBase = prefetchedNode.knowledgeBase;
            window.projectManager.writeKnowledgeBase(this.currentProject, prefetchedNode.knowledgeBase).catch(console.warn);
          }
          if (prefetchedNode.charactersDelta) {
            const updatedCharacters = window.aiService.applyCharacterUpdates(this.currentProject.characters, prefetchedNode.charactersDelta);
            this.currentProject.characters = updatedCharacters;
            window.projectManager.writeCharacters(this.currentProject, updatedCharacters).catch(console.warn);
          }

          // 持久化时间线节点
          await window.projectManager.saveTimelineNode(prefetchedNode);
          this.currentTimeline = prefetchedNode;
          this.currentProject.currentTimeline = prefetchedNode;
          window.timeline.addNode(prefetchedNode);

          // 切换场景背景（若有）
          if (prefetchedNode.content?.backgroundUrl) {
            const fullLocalPath = `${this.currentProject.path}/${prefetchedNode.content.backgroundUrl}`;
            const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
            this.setBackgroundImage(fileUrl);
          }

          // 瞬间呈现新对白内容
          await this.displayContent(prefetchedNode.content);

          // 顺势启动新分支后续对白的后台补充预取
          setTimeout(() => this.triggerPrefetch(), 300);
          return;
        }
      }

      // ⚡ 2. 未命中预取时，按常规流程生成
      this.branchPrefetchMap?.clear();
      if (selectedChoice.action === 'continue' || !selectedChoice.action) {
        await this.generateNextContent(choiceText);
      } else {
        await this.handleCustomAction(selectedChoice);
      }

    } catch (error) {
      console.error('处理选择失败:', error);
      Utils.showNotification('处理选择失败', 'error');
      this.isWaitingForChoice = true;
      this.displayChoices(this.currentChoices);
    }
  }

  /**
   * 隐藏选择项
   */
  hideChoices() {
    const container = document.getElementById('choices-container');
    const spaceHint = document.getElementById('space-hint');
    const choiceHint = document.getElementById('choice-hint');

    container.classList.add('hidden');
    spaceHint.classList.remove('hidden');
    choiceHint.classList.add('hidden');
  }

  /**
   * 显示历史对话回看面板 (Backlog)
   */
  async showBacklog() {
    const backlogPanel = document.getElementById('backlog-panel');
    if (!backlogPanel) return;

    await this.renderBacklog();
    backlogPanel.classList.remove('hidden');

    // 自动平滑滚动到底部（最近一句话）
    const content = document.getElementById('backlog-content');
    if (content) {
      setTimeout(() => {
        content.scrollTop = content.scrollHeight;
      }, 50);
    }
  }

  /**
   * 隐藏历史对话回看面板
   */
  hideBacklog() {
    const backlogPanel = document.getElementById('backlog-panel');
    if (backlogPanel) {
      backlogPanel.classList.add('hidden');
    }
  }

  /**
   * 切换历史对话回看面板
   */
  toggleBacklog() {
    const backlogPanel = document.getElementById('backlog-panel');
    if (!backlogPanel) return;
    if (backlogPanel.classList.contains('hidden')) {
      this.showBacklog();
    } else {
      this.hideBacklog();
    }
  }

  /**
   * 渲染历史对话记录 (Backlog)
   */
  async renderBacklog() {
    const container = document.getElementById('backlog-content');
    if (!container || !this.currentProject) return;

    container.innerHTML = '';

    // 获取所有时间线历史节点
    let nodes = window.timeline?.nodes || [];
    if (!nodes || nodes.length === 0) {
      try {
        nodes = await window.projectManager.getTimelineHistory(this.currentProject.id);
      } catch (e) {
        console.warn('获取Backlog历史失败:', e);
      }
    }

    if (!nodes || nodes.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding: 50px 20px; color: var(--text-muted);">
          <i class="fa fa-book-open" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
          <p>暂无历史对话记录</p>
        </div>
      `;
      return;
    }

    nodes.forEach((node, index) => {
      const isCurrent = node.id === this.currentTimeline?.id;
      const speaker = node.content?.speaker || (node.content?.dialogue ? '旁白' : '');
      const dialogue = node.content?.dialogue || '';
      const userChoice = node.content?.userChoice || node.userChoice || '';
      const timeStr = node.timestamp ? Utils.formatTime(node.timestamp) : '';
      const chapterSummary = node.content?.chapterSummary || '';

      const itemDiv = document.createElement('div');
      itemDiv.className = `backlog-item ${isCurrent ? 'is-current' : ''}`;

      let choiceHtml = '';
      if (userChoice) {
        choiceHtml = `
          <div class="backlog-choice-badge">
            <i class="fa fa-hand-point-right"></i> 玩家选择：${Utils.escapeHtml(userChoice)}
          </div>
        `;
      }

      let summaryHtml = '';
      if (chapterSummary && chapterSummary !== '故事的开始') {
        summaryHtml = `<span class="backlog-summary-tag">第${index + 1}幕 · ${Utils.escapeHtml(chapterSummary)}</span>`;
      }

      const isNarrator = !speaker || speaker === '旁白' || speaker === '系统';

      itemDiv.innerHTML = `
        <div class="backlog-speaker-row">
          <span class="backlog-speaker ${isNarrator ? 'narrator' : ''}">
            ${isNarrator ? '<i class="fa fa-comment-dots"></i> 旁白' : `【${Utils.escapeHtml(speaker)}】`}
          </span>
          <span class="backlog-time">${Utils.escapeHtml(timeStr)}</span>
        </div>
        <div class="backlog-text">${Utils.escapeHtml(dialogue)}</div>
        ${choiceHtml}
        ${summaryHtml}
      `;

      container.appendChild(itemDiv);
    });
  }

  /**
   * 处理体感控制
   * @param {Object} gestureData - 体感数据 { type: 'single'|'double', magnitude, timestamp }
   */
  handleGestureControl(gestureData) {
    console.log('🎮 处理体感控制:', gestureData);

    // 检查体感控制是否启用
    if (window.iotManager) {
      const status = window.iotManager.getStatus();
      if (!status.gestureEnabled) {
        console.log('⚠️ 体感控制未启用，忽略体感事件');
        return;
      }
    }

    // 只在游戏进行中且等待选择时响应
    if (this.gameState !== 'playing' || !this.isWaitingForChoice) {
      console.log('⚠️ 当前状态不支持体感控制', {
        gameState: this.gameState,
        isWaitingForChoice: this.isWaitingForChoice
      });
      return;
    }

    if (gestureData.type === 'single') {
      // 单次摇动 - 切换到下一个选项(循环)
      this.switchToNextChoice();
    } else if (gestureData.type === 'double') {
      // 连续两次摇动 - 确认当前选项
      this.confirmCurrentChoice();
    }
  }

  /**
   * 切换到下一个选项(循环)
   */
  switchToNextChoice() {
    if (!this.isWaitingForChoice || this.currentChoices.length === 0) {
      return;
    }

    // 计算下一个索引(循环)
    const nextIndex = (this.selectedChoiceIndex + 1) % this.currentChoices.length;
    
    console.log(`🎮 体感切换选项: ${this.selectedChoiceIndex} → ${nextIndex}`);
    
    // 更新高亮
    this.highlightChoice(nextIndex);
    this.selectedChoiceIndex = nextIndex;

    // 视觉反馈
    Utils.showNotification(`切换至选项 ${nextIndex + 1}`, 'info');
  }

  /**
   * 确认当前选项
   */
  async confirmCurrentChoice() {
    if (!this.isWaitingForChoice || this.selectedChoiceIndex < 0) {
      console.log('⚠️ 没有可确认的选项');
      return;
    }

    console.log(`🎮 体感确认选项: ${this.selectedChoiceIndex}`);
    
    // 视觉反馈
    Utils.showNotification(`确认选项 ${this.selectedChoiceIndex + 1}`, 'success');
    
    // 执行选择
    await this.selectChoice(this.selectedChoiceIndex);
  }

  /**
   * 继续故事（优先推进当前段落Beat或消费后台预生成队列）
   */
  async continueStory() {
    if (this.isWaitingForChoice || this.isGenerating) return;

    // 1. 如果当前节点还有未播放完的多句对白，优先推进下一句
    if (this.currentDialogueBeats && this.currentBeatIndex < this.currentDialogueBeats.length - 1) {
      this.currentBeatIndex++;
      await this.playCurrentBeat(this.currentTimeline?.content || {});
      return;
    }

    // 2. 尝试从后台预生成队列中即时提取（0毫秒无缝衔接）
    if (this.prefetchQueue && this.prefetchQueue.length > 0) {
      const nextNode = this.prefetchQueue.shift();
      console.log('⚡ [Prefetch] 命中后台预生成对白，瞬间呈现！剩余预取缓存:', this.prefetchQueue.length);

      // 应用知识库和角色库增量
      if (nextNode.knowledgeBase) {
        this.currentProject.knowledgeBase = nextNode.knowledgeBase;
        window.projectManager.writeKnowledgeBase(this.currentProject, nextNode.knowledgeBase).catch(console.warn);
      }
      if (nextNode.charactersDelta) {
        const updatedCharacters = window.aiService.applyCharacterUpdates(this.currentProject.characters, nextNode.charactersDelta);
        this.currentProject.characters = updatedCharacters;
        window.projectManager.writeCharacters(this.currentProject, updatedCharacters).catch(console.warn);
      }

      // 持久化时间线节点
      await window.projectManager.saveTimelineNode(nextNode);
      this.currentTimeline = nextNode;
      this.currentProject.currentTimeline = nextNode;
      window.timeline.addNode(nextNode);

      // 切换场景背景（若有新图）
      if (nextNode.content?.backgroundUrl) {
        const fullLocalPath = `${this.currentProject.path}/${nextNode.content.backgroundUrl}`;
        const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
        this.setBackgroundImage(fileUrl);
      }

      // 瞬间渲染对白内容
      await this.displayContent(nextNode.content);

      // 异步补充预生成队列
      setTimeout(() => this.triggerPrefetch(), 300);
      return;
    }

    // 3. 如果当前后台正在预取中，等待预取完成并直接呈现（避免并发冲突与重复调用）
    if (this.isPrefetching && this.activePrefetchPromise) {
      this.showLoadingOverlay('正在载入故事内容...', '后台同步中');
      try {
        await this.activePrefetchPromise;
      } catch (e) {
        console.warn('等待后台预取完成出错:', e);
      }
      this.hideLoadingOverlay();
      if (this.prefetchQueue && this.prefetchQueue.length > 0) {
        await this.continueStory();
        return;
      }
    }

    // 4. 预取队列为空且未在预取时，同步生成并显示加载提示
    try {
      await this.generateNextContent('');
    } catch (error) {
      console.error('继续故事失败:', error);
      Utils.showNotification('继续故事失败', 'error');
    }
  }

  /**
   * 后台异步智能预生成下 1~2 次对话（玩家阅读期间静默加载，消除等待旋转圈）
   */
  async triggerPrefetch() {
    if (this.isPrefetching || this.isWaitingForChoice || this.gameState !== 'playing' || this.isGenerating) {
      return;
    }
    if (this.prefetchQueue.length >= this.maxPrefetchDepth) {
      return;
    }
    if (!this.currentProject || !this.currentTimeline) {
      return;
    }

    this.isPrefetching = true;
    this.activePrefetchPromise = (async () => {
      try {
        // 锚定最新的对话上下文
        const lastNode = this.prefetchQueue.length > 0 
          ? this.prefetchQueue[this.prefetchQueue.length - 1] 
          : this.currentTimeline;

        const knowledgeBase = this.currentProject.knowledgeBase || lastNode.knowledgeBase || {};
        const context = {
          projectName: this.currentProject.name,
          projectStyle: this.currentProject.style,
          currentContent: lastNode.content?.dialogue || '',
          knowledgeBase: knowledgeBase,
          characters: this.currentProject.characters
        };

        console.log(`⚡ [Prefetch] 启动后台对白预生成 (当前队列: ${this.prefetchQueue.length}/${this.maxPrefetchDepth})...`);

        const aiResponse = await window.aiService.generateStoryContent(
          context,
          knowledgeBase,
          '',
          null
        );

        if (aiResponse && (aiResponse.dialogue || aiResponse.dialogues)) {
          const updatedKnowledgeBase = window.aiService.applyKnowledgeUpdates(
            knowledgeBase,
            aiResponse.knowledgeUpdates
          );

          // 背景图预拉取
          const previousBg = lastNode.content?.backgroundUrl || null;
          const targetImagePrompt = aiResponse.backgroundPrompt || aiResponse.imagePrompt;
          let backgroundUrl = previousBg;

          if (aiResponse.sceneChanged === true && targetImagePrompt) {
            try {
              const filename = `background_${Date.now()}.png`;
              const localPath = await window.aiService.generateImage(targetImagePrompt, {
                projectId: this.currentProject.id,
                filename: filename
              });
              if (localPath) backgroundUrl = localPath;
            } catch (imgErr) {
              console.warn('⚡ [Prefetch] 后台预取背景图跳过:', imgErr);
            }
          }

          const prefetchedTimelineNode = {
            id: Utils.generateId(),
            timestamp: Date.now(),
            content: {
              dialogue: aiResponse.dialogue,
              dialogues: aiResponse.dialogues || null,
              speaker: aiResponse.speaker,
              speakerEmotion: aiResponse.speakerEmotion || 'neutral',
              activeCharacters: aiResponse.activeCharacters || [],
              choices: aiResponse.choices || [],
              imagePrompt: targetImagePrompt,
              backgroundPrompt: aiResponse.backgroundPrompt,
              knowledgeUpdates: aiResponse.knowledgeUpdates || {},
              chapterSummary: aiResponse.chapterSummary,
              backgroundUrl: backgroundUrl,
              userChoice: ''
            },
            knowledgeBase: updatedKnowledgeBase,
            charactersDelta: aiResponse.charactersDelta || null,
            isCheckpoint: true
          };

          this.prefetchQueue.push(prefetchedTimelineNode);
          console.log(`✅ [Prefetch] 成功预生成第 ${this.prefetchQueue.length} 个后台对白:`, (aiResponse.dialogue || '').substring(0, 25));

          // 如果还可以继续预取且无分支选择，自动填充下一个
          if (this.prefetchQueue.length < this.maxPrefetchDepth && (!aiResponse.choices || aiResponse.choices.length === 0)) {
            setTimeout(() => this.triggerPrefetch(), 500);
          }
        }
      } catch (err) {
        console.warn('⚡ [Prefetch] 后台预取对白跳过:', err);
      } finally {
        this.isPrefetching = false;
        this.activePrefetchPromise = null;
      }
    })();

    await this.activePrefetchPromise;
  }

  /**
   * 生成下一段内容
   * @param {string} userChoice - 用户选择
   */
  async generateNextContent(userChoice) {
    if (this.isGenerating) return;

    this.isGenerating = true;
    
    // 创建 AbortController 用于请求中断
    const abortController = new AbortController();
    
    // 定义重试函数
    const retryGeneration = () => {
      console.log('用户请求重试内容生成');
      this.isGenerating = false;
      this.hideLoadingOverlay();
      // 延迟一点时间后重新开始
      setTimeout(() => {
        this.generateNextContent(userChoice);
      }, 500);
    };
    
    this.showLoadingOverlay('正在生成故事内容...', '文本生成中', retryGeneration, abortController);

    try {
      // 获取当前知识库
  const knowledgeBase = this.currentProject.knowledgeBase || this.currentTimeline.knowledgeBase || {};

      // 构建上下文
      const context = {
        projectName: this.currentProject.name,
        projectStyle: this.currentProject.style,
        currentContent: this.currentTimeline.content.dialogue,
        knowledgeBase: knowledgeBase,
        characters: this.currentProject.characters
      };

      // 生成新内容 - 传递 AbortController 信号
      const aiResponse = await window.aiService.generateStoryContent(
        context,
        knowledgeBase,
        userChoice,
        abortController.signal
      );

      // 更新知识库
      const updatedKnowledgeBase = window.aiService.applyKnowledgeUpdates(
        knowledgeBase,
        aiResponse.knowledgeUpdates
      );
      // 持久化知识库
      this.currentProject.knowledgeBase = updatedKnowledgeBase;
      await window.projectManager.writeKnowledgeBase(this.currentProject, updatedKnowledgeBase);

      // 角色库更新
      if (aiResponse.charactersDelta) {
        const updatedCharacters = window.aiService.applyCharacterUpdates(this.currentProject.characters, aiResponse.charactersDelta);
        this.currentProject.characters = updatedCharacters;
        await window.projectManager.writeCharacters(this.currentProject, updatedCharacters);
      }

      // 图像生成：判断是否需要生成新背景（同一场景复用背景，避免每句对白重复画图）
      const previousBg = this.currentTimeline?.content?.backgroundUrl || null;
      const previousPrompt = this.currentTimeline?.content?.backgroundPrompt || this.currentTimeline?.content?.imagePrompt || null;
      const targetImagePrompt = aiResponse.backgroundPrompt || aiResponse.imagePrompt;

      // 仅在无背景、明确转场或新提示词明确且sceneChanged不为false时生成新图
      const needsNewImage = (
        !previousBg || 
        aiResponse.sceneChanged === true ||
        (targetImagePrompt && previousPrompt && targetImagePrompt !== previousPrompt && aiResponse.sceneChanged !== false)
      );

      let backgroundUrl = previousBg;
      let imagePromise = null;
      let filename = null;
      const bgEl = document.getElementById('game-background');

      if (needsNewImage && targetImagePrompt) {
        if (bgEl) {
          bgEl.style.filter = 'blur(12px) brightness(0.85)';
        }
        this.updateLoadingStage('图像生成中');
        const hadBg = !!previousBg;
        
        const timestamp = Date.now();
        filename = `background_${timestamp}.png`;

        imagePromise = window.aiService.generateImage(targetImagePrompt, {
          projectId: this.currentProject.id,
          filename: filename,
          signal: abortController.signal,
          onProgress: (progress) => {
            if (progress) {
              this.updateLoadingStage(progress.stage);
              if (!hadBg) {
                window.dispatchEvent(new CustomEvent('image-progress', { 
                  detail: { 
                    projectId: this.currentProject.id, 
                    stage: progress.stage, 
                    done: false, 
                    percent: progress.percent 
                  } 
                }));
              }
            }
          }
        })
          .then(localPath => { 
            backgroundUrl = localPath;
            return localPath; 
          })
          .catch(err => { 
            console.warn('图像生成失败，使用当前背景:', err); 
            return previousBg; 
          });
      } else {
        console.log('🖼️ 场景未发生切换，沿用当前背景:', backgroundUrl);
      }

      // 创建新的时间线节点
      const newTimeline = {
        id: Utils.generateId(),
        timestamp: Date.now(),
        content: {
          dialogue: aiResponse.dialogue,
          dialogues: aiResponse.dialogues || null,
          speaker: aiResponse.speaker,
          speakerEmotion: aiResponse.speakerEmotion || 'neutral',
          activeCharacters: aiResponse.activeCharacters || [],
          choices: aiResponse.choices || [],
          imagePrompt: targetImagePrompt,
          backgroundPrompt: aiResponse.backgroundPrompt,
          knowledgeUpdates: aiResponse.knowledgeUpdates || {},
          chapterSummary: aiResponse.chapterSummary,
          backgroundUrl: backgroundUrl,
          userChoice: userChoice
        },
        knowledgeBase: updatedKnowledgeBase,
        isCheckpoint: true
      };

      // 等待图像完成后，更新backgroundUrl并重新保存
      if (imagePromise) {
        const localPath = await imagePromise;
        if (localPath) {
          // 更新时间线节点的背景URL
          backgroundUrl = `assets/${filename}`; // 存储相对路径
          newTimeline.content.backgroundUrl = backgroundUrl;
          console.log('更新时间线背景URL:', backgroundUrl);
          
          // 使用本地文件路径设置背景 - 使用路径工具
          const fullLocalPath = `${this.currentProject.path}/${localPath}`;
          const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
          this.setBackgroundImage(fileUrl);
          // 广播完成，更新封面（传递本地路径用于封面显示）
          window.dispatchEvent(new CustomEvent('image-progress', { 
            detail: { 
              projectId: this.currentProject.id, 
              stage: '完成', 
              done: true, 
              url: `file://${fullLocalPath}` 
            } 
          }));
        }
      }

      // 保存时间线节点（在图像处理完成后）
      await window.projectManager.saveTimelineNode(newTimeline);

      // 更新当前状态
      this.currentTimeline = newTimeline;
      this.currentProject.currentTimeline = newTimeline;

      // 更新时间线管理器
      window.timeline.addNode(newTimeline);
      this.hideLoadingOverlay();
      if (bgEl) bgEl.style.filter = '';
      await this.displayContent(newTimeline.content);

    } catch (error) {
      console.error('生成内容失败:', error);
      
      // 检查是否是用户主动中断
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.log('用户中断了内容生成');
        this.isGenerating = false;
        return; // 不显示错误，因为是用户主动中断
      }
      
      Utils.showNotification('生成内容失败，请稍后重试', 'error');
      this.hideLoadingOverlay();
      
      // 恢复之前的状态
      if (this.currentChoices.length > 0) {
        this.isWaitingForChoice = true;
        this.displayChoices(this.currentChoices);
      }
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * 生成背景图像
   * @param {string} prompt - 图像提示词
   */
  async generateBackgroundImage(prompt) {
    try {
      const currentProject = window.projectManager.getCurrentProject();
      if (!currentProject) {
        throw new Error('没有当前项目');
      }

      // 生成唯一文件名
      const timestamp = Date.now();
      const filename = `background_${timestamp}.png`;

      const localPath = await window.aiService.generateImage(prompt, {
        projectId: currentProject.id,
        filename: filename,
        onProgress: (progress) => {
          // 可以在这里更新加载进度UI
          console.log(`背景图生成进度: ${progress.stage} - ${progress.percent}%`);
        }
      });

      // 使用本地路径设置背景 - 使用路径工具
      const fullLocalPath = `${currentProject.path}/${localPath}`;
      const fileUrl = window.PathUtils.toFileUrl(fullLocalPath);
      this.setBackgroundImage(fileUrl);
      
      // 返回本地路径供保存到时间线
      return localPath;
    } catch (error) {
      console.warn('生成背景图像失败:', error);
      // 设置默认背景
      this.setDefaultBackground();
      return null;
    }
  }

  /**
   * 设置背景图像
   * @param {string} imageUrl - 图像URL
   */
  setBackgroundImage(imageUrl) {
    const background = document.getElementById('game-background');
    if (background && imageUrl) {
  // 不清空当前背景，轻微降不透明度作为加载提示
  background.style.opacity = '0.6';
      
      // 创建图像对象预加载
      const img = new Image();
      img.onload = () => {
        // 图像加载完成后再替换背景，避免空白
        background.style.backgroundImage = `url(${imageUrl})`;
        background.style.opacity = '0';
        setTimeout(() => {
          background.style.transition = 'opacity 0.8s ease';
          background.style.opacity = '1';
        }, 20);
      };
      
      img.onerror = () => {
  // 加载失败，保持当前背景
        console.warn('背景图像加载失败:', imageUrl);
        background.style.opacity = '1';
      };
      
      // 开始加载图像
      img.src = imageUrl;
    }
  }

  /**
   * 设置默认背景
   */
  setDefaultBackground() {
    const background = document.getElementById('game-background');
    if (background) {
      // 设置主题渐变背景作为默认
      background.style.backgroundImage = 'var(--gradient-primary)';
    }
  }

  /**
   * 更新游戏画面中的角色立绘图层，并实现说话角色高亮放大与遮罩变暗
   * @param {Object} content - 对话节点内容 (包含 speaker, activeCharacters 等)
   */
  async updateCharacterSpritesLayer(content) {
    const layer = document.getElementById('character-layer');
    if (!layer) return;

    const currentSpeaker = (content.speaker || '').trim();

    // 读取当前项目的角色库
    let characterMap = {};
    try {
      if (this.currentProject) {
        const charData = await this.projectManager.readCharacters(this.currentProject);
        characterMap = charData?.characters || {};
      }
    } catch (e) {
      console.warn('[GameEngine] 读取角色库失败:', e);
    }

    // 收集需要在屏幕上呈现的角色列表
    let sceneCharacters = [];

    if (Array.isArray(content.activeCharacters) && content.activeCharacters.length > 0) {
      sceneCharacters = content.activeCharacters;
    } else {
      const existing = Object.values(characterMap);
      if (existing.length === 1) {
        sceneCharacters = [{ name: existing[0].name, position: 'center' }];
      } else if (existing.length >= 2) {
        // 双人立绘同台模式：说话人在左或右，另一人在对应侧，形成生动的对话互动氛围
        sceneCharacters = existing.slice(0, 2).map((c, i) => ({
          name: c.name,
          position: i === 0 ? 'left' : 'right'
        }));
      } else if (currentSpeaker && currentSpeaker !== '旁白' && currentSpeaker !== '系统') {
        sceneCharacters = [{ name: currentSpeaker, position: 'center' }];
      }
    }

    layer.innerHTML = '';

    if (sceneCharacters.length === 0) {
      return;
    }

    const posMap = {
      left: '32%',
      center: '50%',
      right: '68%'
    };

    sceneCharacters.forEach((sc, index) => {
      const name = typeof sc === 'string' ? sc : sc.name;
      if (!name) return;

      // 匹配角色库数据
      const charObj = Object.values(characterMap).find(c => c.name === name || c.id === name) || {};
      const isSpeaking = currentSpeaker && (name === currentSpeaker || charObj.name === currentSpeaker);

      let position = sc.position || (sceneCharacters.length === 1 ? 'center' : (index === 0 ? 'left' : 'right'));
      let leftCss = posMap[position] || '50%';

      // 动态匹配情绪与表情差分立绘 (happy, blushing, sad, angry, surprised, thinking, smug, neutral)
      const emotion = (sc.expression || (isSpeaking ? (content.speakerEmotion || content.emotion) : 'neutral') || 'neutral').toLowerCase();
      let chosenRelativePath = null;
      if (charObj.expressions && typeof charObj.expressions === 'object' && charObj.expressions[emotion]) {
        chosenRelativePath = charObj.expressions[emotion];
      } else if (charObj.expressions && typeof charObj.expressions === 'object' && charObj.expressions['neutral']) {
        chosenRelativePath = charObj.expressions['neutral'];
      } else if (charObj.spriteUrl) {
        chosenRelativePath = charObj.spriteUrl;
      } else if (charObj.expressions && typeof charObj.expressions === 'object' && Object.values(charObj.expressions).length > 0) {
        chosenRelativePath = Object.values(charObj.expressions)[0];
      } else {
        chosenRelativePath = charObj.avatarUrl;
      }

      let spriteUrl = chosenRelativePath;
      if (!spriteUrl) {
        spriteUrl = this.generateFallbackCharacterSvg(name, charObj.color || (isSpeaking ? '#ff69b4' : '#4a90e2'));
      } else if (spriteUrl.startsWith('assets/')) {
        // 项目内部相对路径转为本地 file:// URL
        const fullPath = `${this.currentProject.path}/${spriteUrl}`;
        spriteUrl = window.PathUtils.toFileUrl(fullPath);
      }

      const spriteWrapper = document.createElement('div');
      spriteWrapper.className = `character-sprite-wrapper ${isSpeaking ? 'speaking' : 'inactive'}`;
      spriteWrapper.dataset.name = name;
      spriteWrapper.dataset.emotion = emotion;
      spriteWrapper.style.left = leftCss;

      const img = document.createElement('img');
      img.src = spriteUrl;
      img.alt = name;
      img.onerror = () => {
        img.src = this.generateFallbackCharacterSvg(name, isSpeaking ? '#ff69b4' : '#4a90e2');
      };

      spriteWrapper.appendChild(img);
      layer.appendChild(spriteWrapper);
    });
  }

  /**
   * 生成二次元角色立绘 SVG 占位/备用图（纯净剪影，无悬浮遮挡黑条）
   */
  generateFallbackCharacterSvg(name, mainColor = '#ff69b4') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="600" viewBox="0 0 360 600">
      <defs>
        <linearGradient id="grad_${name}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${mainColor}" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="#1e293b" stop-opacity="0.95"/>
        </linearGradient>
        <filter id="glow_${name}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="${mainColor}" flood-opacity="0.5"/>
        </filter>
      </defs>
      <path d="M 90 580 C 90 400 110 320 180 300 C 250 320 270 400 270 580 Z" fill="url(#grad_${name})" filter="url(#glow_${name})"/>
      <circle cx="180" cy="200" r="85" fill="${mainColor}" opacity="0.95"/>
      <circle cx="180" cy="200" r="75" fill="#ffffff" opacity="0.96"/>
      <circle cx="155" cy="190" r="10" fill="#1e293b"/>
      <circle cx="205" cy="190" r="10" fill="#1e293b"/>
      <circle cx="158" cy="187" r="3" fill="#ffffff"/>
      <circle cx="208" cy="187" r="3" fill="#ffffff"/>
      <path d="M 165 220 Q 180 235 195 220" stroke="#1e293b" stroke-width="4" fill="none" stroke-linecap="round"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /**
   * 显示加载覆盖层
   * @param {string} text - 加载文本
   * @param {string} stage - 当前阶段
   */
  showLoadingOverlay(text, stage, onRetry = null, abortController = null) {
    // 使用科幻霓虹加载器
    if (window.Loader) {
      window.Loader.show(onRetry, abortController);
      window.Loader.setProgress(0);
      window.Loader.setStage(stage || '准备中');
    }
    // 场景转场
    const trans = document.getElementById('scene-transition');
    if (trans) { trans.classList.remove('hidden'); trans.classList.add('active'); setTimeout(()=>trans.classList.remove('active'), 400); }
  }

  /**
   * 更新加载阶段
   * @param {string} stage - 新阶段
   */
  updateLoadingStage(stage) {
    // 可在不同阶段更新大致进度（示例：文本阶段30%，图像阶段80%）
    if (window.Loader) {
  const p = stage && stage.includes('下载') ? 90 : (stage && stage.includes('图像') ? 80 : 30);
      window.Loader.setProgress(p);
  window.Loader.setStage(stage || '处理中');
    }
  }

  /**
   * 隐藏加载覆盖层
   */
  hideLoadingOverlay() {
    if (window.Loader) {
      window.Loader.setProgress(100);
      window.Loader.hide();
    }
  const trans = document.getElementById('scene-transition');
  if (trans) { setTimeout(()=>trans.classList.add('hidden'), 450); }
  }

  /**
   * 处理自定义动作
   * @param {Object} choice - 选择对象
   */
  async handleCustomAction(choice) {
    // 这里可以处理其他类型的选择，如：
    // - 查看物品
    // - 角色互动
    // - 场景切换等
    
    console.log('处理自定义动作:', choice);
    
    // 默认行为：继续故事
    await this.generateNextContent(choice.text);
  }

  /**
   * 暂停游戏
   */
  pauseGame() {
    this.gameState = 'paused';
    // 可以显示暂停菜单
    Utils.showNotification('游戏已暂停，按ESC继续', 'info', 2000);
    
    setTimeout(() => {
      if (this.gameState === 'paused') {
        this.gameState = 'playing';
      }
    }, 2000);
  }

  /**
   * 结束游戏
   */
  endGame() {
    this.gameState = 'menu';
    Utils.showNotification('游戏结束', 'info');
    this.exitGame();
  }

  /**
   * 退出游戏回到主菜单
   */
  exitGame() {
    // 清理游戏状态
    this.gameState = 'menu';
    this.currentProject = null;
    this.currentTimeline = null;
    this.currentChoices = [];
    this.selectedChoiceIndex = -1;
    this.isWaitingForChoice = false;
    this.isGenerating = false;

    // 隐藏加载界面
    this.hideLoadingOverlay();

    // 隐藏时间线面板
    window.timeline.hide();

    // 切换到主界面
    this.switchToMainScreen();

    // 重新加载项目列表
    window.projectManager.loadProjects().then(() => {
      if (window.renderProjectsList) {
        window.renderProjectsList();
      }
    });
  }

  /**
   * 切换到游戏界面
   */
  switchToGameScreen() {
    const mainScreen = document.getElementById('main-screen');
    const gameScreen = document.getElementById('game-screen');

    if (mainScreen) mainScreen.classList.remove('active');
    if (gameScreen) gameScreen.classList.add('active');
  }

  /**
   * 切换到主界面
   */
  switchToMainScreen() {
    const mainScreen = document.getElementById('main-screen');
    const gameScreen = document.getElementById('game-screen');

    if (gameScreen) gameScreen.classList.remove('active');
    if (mainScreen) mainScreen.classList.add('active');
  }

  /**
   * 检查游戏是否活跃
   */
  isGameActive() {
    return this.gameState === 'playing';
  }

  /**
   * 获取游戏状态
   */
  getGameState() {
    return {
      state: this.gameState,
      project: this.currentProject?.name || null,
      isGenerating: this.isGenerating,
      isWaitingForChoice: this.isWaitingForChoice,
      choicesCount: this.currentChoices.length
    };
  }

  /* ========================================================
     快进与自动播放控制 (SKIP & AUTO)
     ======================================================== */

  /**
   * 启动极速快进 (按住 Ctrl 或点击 SKIP 触发)
   */
  startSkip() {
    if (this.skipMode || this.gameState !== 'playing') return;
    this.skipMode = true;
    const btnSkip = document.getElementById('btn-skip');
    if (btnSkip) btnSkip.classList.add('active');
    this.runSkipLoop();
  }

  /**
   * 停止极速快进 (松开 Ctrl 触发)
   */
  stopSkip() {
    this.skipMode = false;
    const btnSkip = document.getElementById('btn-skip');
    if (btnSkip) btnSkip.classList.remove('active');
  }

  /**
   * 极速快进执行循环
   */
  async runSkipLoop() {
    while (this.skipMode && this.gameState === 'playing') {
      // 1. 如果正在打字，瞬间显示完整文本
      const dialogueText = document.getElementById('dialogue-text');
      if (dialogueText && dialogueText.dataset.typing === 'true') {
        dialogueText.textContent = dialogueText.dataset.fullText || '';
        dialogueText.dataset.typing = 'false';
      }

      // 2. 如果遇到选项分支，自动停止快进（等待玩家选择，符合 Galgame 习惯）
      if (this.isWaitingForChoice && this.currentChoices.length > 0) {
        this.stopSkip();
        break;
      }

      // 3. 推进对白（消耗 Beat 对白小节或预载队列）
      if (!this.isGenerating) {
        await this.continueStory();
      }

      // 快进间隔 (60ms 极速连贯)
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  }

  /* ========================================================
     多槽位存档与读档系统 (SAVE & LOAD SYSTEM)
     ======================================================== */

  /**
   * 自动播放模式切换 (AUTO)
   */
  toggleAutoMode() {
    this.autoMode = !this.autoMode;
    const btnAuto = document.getElementById('btn-auto');
    if (btnAuto) {
      if (this.autoMode) {
        btnAuto.classList.add('active');
        Utils.showNotification('▶️ 自动播放已开启', 'info');
        this.runAutoPlayLoop();
      } else {
        btnAuto.classList.remove('active');
        Utils.showNotification('⏸️ 自动播放已关闭', 'info');
      }
    }
  }

  async runAutoPlayLoop() {
    if (!this.autoMode || this.gameState !== 'playing') return;
    if (!this.isWaitingForChoice && !this.isGenerating) {
      const dialogueText = document.getElementById('dialogue-text');
      if (!dialogueText || dialogueText.dataset.typing !== 'true') {
        await this.continueStory();
      }
    }
    if (this.autoMode) {
      setTimeout(() => this.runAutoPlayLoop(), 2800);
    }
  }

  /**
   * 快速存档 (Q.SAVE)
   */
  async quickSave() {
    if (!this.currentProject || !this.currentTimeline) {
      Utils.showNotification('当前没有进行中的剧情可存档', 'warning');
      return;
    }

    try {
      const savesDir = `${this.currentProject.path}/saves`;
      await window.electronAPI.fs.ensureDir(savesDir);

      const saveData = this.buildSaveDataObject('qsave');
      await window.electronAPI.fs.writeJson(`${savesDir}/quick_save.json`, saveData);

      console.log('⚡ [QuickSave] 快速存档成功:', saveData.dialogueSnippet);
      Utils.showNotification('⚡ 快速存档成功 (Q.SAVE)', 'success');
    } catch (err) {
      console.error('快速存档失败:', err);
      Utils.showNotification('快速存档失败', 'error');
    }
  }

  /**
   * 快速读档 (Q.LOAD)
   */
  async quickLoad() {
    if (!this.currentProject) {
      Utils.showNotification('请先进入游戏', 'warning');
      return;
    }

    try {
      const qsavePath = `${this.currentProject.path}/saves/quick_save.json`;
      if (!(await window.electronAPI.fs.exists(qsavePath))) {
        Utils.showNotification('未找到快速存档记录', 'info');
        return;
      }

      const saveData = await window.electronAPI.fs.readJson(qsavePath);
      await this.loadSaveData(saveData);
      Utils.showNotification('⚡ 快速读档成功！', 'success');
    } catch (err) {
      console.error('快速读档失败:', err);
      Utils.showNotification('快速读档失败', 'error');
    }
  }

  /**
   * 打开存档界面 (SAVE)
   */
  async openSaveModal() {
    this.saveLoadMode = 'save';
    await this.renderSaveSlots();
    const modal = document.getElementById('save-load-modal');
    if (modal) modal.classList.add('active');
  }

  /**
   * 打开读档界面 (LOAD)
   */
  async openLoadModal() {
    this.saveLoadMode = 'load';
    await this.renderSaveSlots();
    const modal = document.getElementById('save-load-modal');
    if (modal) modal.classList.add('active');
  }

  /**
   * 关闭存档/读档模态框
   */
  closeSaveLoadModal() {
    const modal = document.getElementById('save-load-modal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * 切换存档/读档模式
   */
  async switchSaveLoadMode(mode) {
    this.saveLoadMode = mode;
    const tabSave = document.getElementById('tab-save-mode');
    const tabLoad = document.getElementById('tab-load-mode');
    const hint = document.getElementById('save-load-mode-hint');

    if (mode === 'save') {
      tabSave?.classList.add('active');
      tabLoad?.classList.remove('active');
      if (hint) hint.textContent = '点击任意槽位即可覆盖或保存当前游戏进度';
    } else {
      tabSave?.classList.remove('active');
      tabLoad?.classList.add('active');
      if (hint) hint.textContent = '点击已有存档槽位即可快速读取并继续游玩';
    }

    await this.renderSaveSlots();
  }

  /**
   * 构建存档数据对象
   */
  buildSaveDataObject(slotId) {
    const content = this.currentTimeline?.content || {};
    return {
      slotId: slotId,
      savedAt: new Date().toISOString(),
      dialogueSnippet: content.dialogue || (this.currentBeatQueue ? this.currentBeatQueue[this.currentBeatIndex]?.text : '') || '',
      speaker: content.speaker || (this.currentBeatQueue ? this.currentBeatQueue[this.currentBeatIndex]?.speaker : '旁白') || '旁白',
      speakerEmotion: content.speakerEmotion || (this.currentBeatQueue ? this.currentBeatQueue[this.currentBeatIndex]?.emotion : 'neutral') || 'neutral',
      backgroundUrl: content.backgroundUrl || null,
      timelineNode: this.currentTimeline,
      knowledgeBase: this.currentProject.knowledgeBase || {},
      characters: this.currentProject.characters || {},
      dialogues: content.dialogues || this.currentBeatQueue || null,
      activeBeatIndex: this.currentBeatIndex || 0,
      activeCharacters: content.activeCharacters || []
    };
  }

  /**
   * 保存到指定槽位 (1 ~ 12 或 qsave)
   */
  async saveToSlot(slotId) {
    if (!this.currentProject || !this.currentTimeline) {
      Utils.showNotification('当前没有进行中的剧情可存档', 'warning');
      return;
    }

    try {
      const savesDir = `${this.currentProject.path}/saves`;
      await window.electronAPI.fs.ensureDir(savesDir);

      const saveData = this.buildSaveDataObject(slotId);
      const filePath = slotId === 'qsave' ? `${savesDir}/quick_save.json` : `${savesDir}/slot_${slotId}.json`;

      await window.electronAPI.fs.writeJson(filePath, saveData);
      Utils.showNotification(`💾 存档成功 (槽位 ${slotId === 'qsave' ? 'Q.SAVE' : slotId})`, 'success');
      await this.renderSaveSlots();
    } catch (err) {
      console.error('保存存档失败:', err);
      Utils.showNotification('保存存档失败', 'error');
    }
  }

  /**
   * 从指定槽位读取存档
   */
  async loadFromSlot(slotId) {
    if (!this.currentProject) return;

    try {
      const savesDir = `${this.currentProject.path}/saves`;
      const filePath = slotId === 'qsave' ? `${savesDir}/quick_save.json` : `${savesDir}/slot_${slotId}.json`;

      if (!(await window.electronAPI.fs.exists(filePath))) {
        Utils.showNotification('该槽位暂无存档', 'info');
        return;
      }

      const saveData = await window.electronAPI.fs.readJson(filePath);
      await this.loadSaveData(saveData);
      this.closeSaveLoadModal();
      Utils.showNotification(`📂 读取存档成功 (槽位 ${slotId === 'qsave' ? 'Q.SAVE' : slotId})`, 'success');
    } catch (err) {
      console.error('读取存档失败:', err);
      Utils.showNotification('读取存档失败', 'error');
    }
  }

  /**
   * 删除指定槽位存档
   */
  async deleteSaveSlot(slotId, event) {
    if (event) event.stopPropagation();
    if (!this.currentProject) return;
    if (!confirm(`确定要删除【${slotId === 'qsave' ? '快速存档' : '槽位 ' + slotId}】的存档数据吗？`)) {
      return;
    }

    try {
      const savesDir = `${this.currentProject.path}/saves`;
      const filePath = slotId === 'qsave' ? `${savesDir}/quick_save.json` : `${savesDir}/slot_${slotId}.json`;
      if (await window.electronAPI.fs.exists(filePath)) {
        await window.electronAPI.fs.unlink(filePath);
      }
      Utils.showNotification('存档已删除', 'info');
      await this.renderSaveSlots();
    } catch (err) {
      console.error('删除存档失败:', err);
      Utils.showNotification('删除存档失败', 'error');
    }
  }

  /**
   * 应用存档数据并恢复游戏状态
   */
  async loadSaveData(saveData) {
    if (!saveData || !saveData.timelineNode) {
      throw new Error('无效的存档数据');
    }

    // 1. 恢复核心状态
    this.currentTimeline = saveData.timelineNode;
    this.currentProject.currentTimeline = saveData.timelineNode;
    this.currentProject.knowledgeBase = saveData.knowledgeBase || {};
    this.currentProject.characters = saveData.characters || {};

    // 2. 清空预载队列以防与读档后的分支冲突
    this.prefetchQueue = [];
    this.branchPrefetchMap = {};

    // 3. 恢复 Beat 进度与对白队列
    this.currentBeatQueue = saveData.dialogues || saveData.timelineNode.content?.dialogues || null;
    this.currentBeatIndex = saveData.activeBeatIndex || 0;

    // 4. 恢复背景
    const bgUrl = saveData.backgroundUrl || saveData.timelineNode.content?.backgroundUrl;
    if (bgUrl) {
      const fullBg = bgUrl.startsWith('assets/') ? `${this.currentProject.path}/${bgUrl}` : bgUrl;
      this.setBackgroundImage(window.PathUtils.toFileUrl(fullBg));
    }

    // 5. 呈现内容
    await this.displayContent(saveData.timelineNode.content);

    // 6. 更新时间线管理器
    if (window.timeline) {
      window.timeline.setCurrentNode(saveData.timelineNode);
    }

    // 7. 启动后台预载填充
    setTimeout(() => this.triggerPrefetch(), 600);
  }

  /**
   * 渲染存档/读档多槽位列表
   */
  async renderSaveSlots() {
    const qSaveContainer = document.getElementById('quick-save-slot-card');
    const gridContainer = document.getElementById('save-slots-grid');
    if (!gridContainer || !this.currentProject) return;

    const isSaveMode = this.saveLoadMode === 'save';
    const savesDir = `${this.currentProject.path}/saves`;
    await window.electronAPI.fs.ensureDir(savesDir);

    // 读取快速存档与 12 个普通槽位
    const allSlots = ['qsave', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const slotDataMap = {};

    for (const sId of allSlots) {
      const fPath = sId === 'qsave' ? `${savesDir}/quick_save.json` : `${savesDir}/slot_${sId}.json`;
      try {
        if (await window.electronAPI.fs.exists(fPath)) {
          slotDataMap[sId] = await window.electronAPI.fs.readJson(fPath);
        }
      } catch (e) {
        console.warn(`读取槽位 ${sId} 失败:`, e);
      }
    }

    // 格式化时间戳帮助函数
    const formatTime = (iso) => {
      if (!iso) return '-';
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    };

    // 渲染卡片 HTML 辅助函数
    const renderCardHtml = (sId, data) => {
      const isQ = sId === 'qsave';
      const badgeLabel = isQ ? '⚡ Q.SAVE 快速存档' : `SLOT ${String(sId).padStart(2, '0')}`;
      const badgeClass = isQ ? 'qsave-badge' : '';

      if (!data) {
        // 空槽位
        if (isSaveMode) {
          return `
            <div class="save-slot-card is-empty" onclick="window.gameEngine.saveToSlot('${sId}')">
              <div class="slot-empty-body">
                <i class="fa fa-plus-circle"></i>
                <div style="font-weight: 600; color: #e2e8f0;">${badgeLabel}</div>
                <div style="font-size: 0.78rem;">【空槽位】点击保存当前进度</div>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="save-slot-card is-empty" style="opacity: 0.5; cursor: not-allowed;">
              <div class="slot-empty-body">
                <i class="fa fa-ban"></i>
                <div style="font-weight: 600; color: var(--text-muted);">${badgeLabel}</div>
                <div style="font-size: 0.78rem;">【无存档数据】</div>
              </div>
            </div>
          `;
        }
      }

      // 已有存档卡片
      let bgSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><rect width="300" height="150" fill="%231a1d2e"/></svg>';
      if (data.backgroundUrl) {
        const fullBg = data.backgroundUrl.startsWith('assets/') ? `${this.currentProject.path}/${data.backgroundUrl}` : data.backgroundUrl;
        bgSrc = window.PathUtils.toFileUrl(fullBg);
      }

      const speaker = data.speaker || '旁白';
      const snippet = data.dialogueSnippet || '（无对白记录）';
      const timeStr = formatTime(data.savedAt);
      const actionText = isSaveMode ? '<i class="fa fa-floppy-disk"></i> 覆盖此存档' : '<i class="fa fa-folder-open"></i> 读取此存档';
      const clickAction = isSaveMode ? `window.gameEngine.saveToSlot('${sId}')` : `window.gameEngine.loadFromSlot('${sId}')`;

      return `
        <div class="save-slot-card ${isQ ? 'is-quick' : ''}" onclick="${clickAction}">
          <div class="slot-thumbnail-container">
            <img class="slot-thumbnail-bg" src="${bgSrc}" alt="存档缩略图" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'300\\' height=\\'150\\'><rect width=\\'300\\' height=\\'150\\' fill=\\'%231a1d2e\\'/></svg>'" />
            <div class="slot-thumbnail-gradient"></div>
            <div class="slot-badge ${badgeClass}">${badgeLabel}</div>
            <div class="slot-timestamp"><i class="fa fa-clock"></i> ${timeStr}</div>
          </div>
          <div class="slot-content-body">
            <div class="slot-speaker-row">
              <span class="slot-speaker-name"><i class="fa fa-user"></i> ${Utils.escapeHtml(speaker)}</span>
              ${data.speakerEmotion && data.speakerEmotion !== 'neutral' ? `<span class="slot-emotion-tag">${Utils.escapeHtml(data.speakerEmotion)}</span>` : ''}
            </div>
            <div class="slot-dialogue-snippet">${Utils.escapeHtml(snippet)}</div>
            <div class="slot-actions-row">
              <button class="slot-action-btn" onclick="event.stopPropagation(); ${clickAction}">
                ${actionText}
              </button>
              <button class="slot-action-btn btn-delete" title="删除存档" onclick="window.gameEngine.deleteSaveSlot('${sId}', event)">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    };

    // 渲染 Q.SAVE 槽位
    if (qSaveContainer) {
      qSaveContainer.innerHTML = renderCardHtml('qsave', slotDataMap['qsave']);
    }

    // 渲染 1~12 普通槽位
    const gridHtml = [];
    for (let i = 1; i <= 12; i++) {
      gridHtml.push(renderCardHtml(i, slotDataMap[i]));
    }
    gridContainer.innerHTML = gridHtml.join('');
  }

  /**
   * 销毁游戏引擎
   */
  destroy() {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler, true);
    }
    if (this.keyUpHandler) {
      document.removeEventListener('keyup', this.keyUpHandler, true);
    }
    
    this.exitGame();
  }
}

// 创建全局游戏引擎实例
window.gameEngine = new GameEngine();
