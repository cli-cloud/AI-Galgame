/**
 * 项目详情管理器 - 处理项目综合信息显示
 */
class ProjectDetails {
  constructor() {
    this.currentProject = null;
  }

  /**
   * 显示项目综合介绍
   */
  async showProjectOverview(projectId) {
    const project = window.projectManager.getProjects().find(p => p.id === projectId);
    if (!project) return;

    this.currentProject = project;

    const modal = document.getElementById('project-overview-modal');
    const title = document.getElementById('project-overview-title');
    const startBtn = document.getElementById('start-project-btn');

    if (!modal || !title) return;

    title.textContent = `${project.name} - 项目综合介绍`;

    // 设置开始游戏按钮事件
    if (startBtn) {
      startBtn.onclick = () => {
        window.app.startGame(projectId);
        this.closeProjectOverview();
      };
    }

    // 填充信息
    await this.fillProjectOverviewInfo(project);

    // 显示模态框
    modal.classList.add('active');
    this.setupOverviewTabs();
    
    // 立即加载章节里程碑数据
    await this.loadOverviewMilestones();
  }

  /**
   * 填充项目综合介绍信息
   */
  async fillProjectOverviewInfo(project) {
    try {
      const nameEl = document.getElementById('overview-name');
      const descEl = document.getElementById('overview-description');
      const createdEl = document.getElementById('overview-created');
      const modifiedEl = document.getElementById('overview-modified');
      const styleEl = document.getElementById('overview-style');
      const summaryEl = document.getElementById('overview-summary');
      const coverEl = document.getElementById('overview-cover');

      if (nameEl) nameEl.textContent = project.name;
      if (descEl) descEl.textContent = project.description || '暂无描述';
      if (createdEl) createdEl.textContent = project.createdAt ? new Date(project.createdAt).toLocaleDateString('zh-CN') : '未知';
      if (modifiedEl) modifiedEl.textContent = project.lastModified ? new Date(project.lastModified).toLocaleDateString('zh-CN') : '未知';

      // 设置风格信息
      if (styleEl) styleEl.textContent = project.style || '现代都市';

      // 设置总结信息
      if (summaryEl) summaryEl.textContent = project.summary || '暂无总结';

      // 设置封面
      if (coverEl) {
        try {
          const coverUrl = await window.projectManager.getProjectCover(project);
          if (coverUrl) {
            coverEl.style.backgroundImage = `url('${coverUrl.replace(/"/g, '\\"')}')`;
            coverEl.classList.add('has-image');
          } else {
            coverEl.style.backgroundImage = 'none';
            coverEl.style.backgroundColor = 'var(--gradient-surface)';
            coverEl.classList.remove('has-image');
          }
        } catch (e) {
          console.warn('加载项目封面失败:', e);
          coverEl.style.backgroundImage = 'none';
          coverEl.style.backgroundColor = 'var(--gradient-surface)';
          coverEl.classList.remove('has-image');
        }
      }

      // 更新知识库统计信息
      try {
        const kb = await window.projectManager.readKnowledgeBase(project);
        const characters = await window.projectManager.readCharacters(project);
        
        const charactersCountEl = document.getElementById('characters-count');
        const scenesCountEl = document.getElementById('scenes-count');
        const itemsCountEl = document.getElementById('items-count');

        const charCount = Object.keys(characters?.characters || {}).length;
        const sceneCount = Object.keys(kb?.locations || {}).length;
        const itemCount = Object.keys(kb?.items || {}).length;

        if (charactersCountEl) charactersCountEl.textContent = charCount;
        if (scenesCountEl) scenesCountEl.textContent = sceneCount;
        if (itemsCountEl) itemsCountEl.textContent = itemCount;

        // 知识库内容预览
        const knowledgeContentEl = document.getElementById('overview-knowledge-content');
        if (knowledgeContentEl) {
          const hasContent = (charCount > 0) || (sceneCount > 0) || (itemCount > 0);
          if (hasContent) {
            let content = '';
            if (Object.keys(characters?.characters || {}).length > 0) {
              content += '<h5>主要角色</h5><ul>';
              Object.entries(characters.characters).slice(0, 3).forEach(([id, char]) => {
                content += `<li><strong>${char.name || id}</strong>: ${char.summary || char.description || '暂无描述'}</li>`;
              });
              content += '</ul>';
            }
            if (Object.keys(kb?.locations || {}).length > 0) {
              content += '<h5>主要场景</h5><ul>';
              Object.entries(kb.locations).slice(0, 3).forEach(([name, desc]) => {
                content += `<li><strong>${name}</strong>: ${desc || '暂无描述'}</li>`;
              });
              content += '</ul>';
            }
            if (Object.keys(kb?.items || {}).length > 0) {
              content += '<h5>重要物品</h5><ul>';
              Object.entries(kb.items).slice(0, 3).forEach(([name, desc]) => {
                content += `<li><strong>${name}</strong>: ${desc || '暂无描述'}</li>`;
              });
              content += '</ul>';
            }
            knowledgeContentEl.innerHTML = content;
          } else {
            knowledgeContentEl.innerHTML = '<p class="placeholder">开始游戏后，知识库内容将在此显示</p>';
          }
        }
      } catch (error) {
        console.warn('加载知识库失败:', error);
      }

      // 更新对话历史（如果有游戏引擎实例）
      if (window.gameEngine) {
        const historyEl = document.getElementById('overview-history-content');
        if (historyEl) {
          const history = window.gameEngine.getHistory();
          if (history && history.length > 0) {
            const historyHtml = history.map(entry => {
              const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString('zh-CN') : '';
              return `
                <div class="history-item">
                  <div class="history-time">${time}</div>
                  <div class="history-text">${Utils.escapeHtml(entry.text || entry.content || '')}</div>
                  ${entry.choice ? `<div class="history-choice">选择: ${Utils.escapeHtml(entry.choice)}</div>` : ''}
                </div>
              `;
            }).join('');
            historyEl.innerHTML = historyHtml;
          } else {
            historyEl.innerHTML = '<p class="placeholder">暂无对话历史</p>';
          }
        }
      }

      // 更新知识库信息
      if (window.gameEngine && window.gameEngine.knowledgeBase) {
        const knowledgeContentEl = document.getElementById('overview-knowledge-content');
        if (knowledgeContentEl) {
          const knowledge = window.gameEngine.knowledgeBase;
          if (knowledge && Object.keys(knowledge).length > 0) {
            const knowledgeHtml = Object.entries(knowledge).map(([key, value]) => `
              <div class="knowledge-item">
                <strong>${Utils.escapeHtml(key)}:</strong>
                <span>${Utils.escapeHtml(String(value))}</span>
              </div>
            `).join('');
            knowledgeContentEl.innerHTML = knowledgeHtml;
          } else {
            knowledgeContentEl.innerHTML = '<p class="placeholder">开始游戏后，知识库内容将在此显示</p>';
          }
        }
      }

    } catch (error) {
      console.error('填充项目信息失败:', error);
    }
  }

  /**
   * 设置标签页切换
   */
  setupOverviewTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.overview-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // 移除所有活跃状态
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));

        // 激活当前标签页
        tab.classList.add('active');
        const targetTab = tab.getAttribute('data-tab');
        const targetContent = document.getElementById(`overview-${targetTab}`);
        if (targetContent) {
          targetContent.classList.add('active');

          // 特殊处理：如果是故事流图或章节里程碑，加载对应内容
          if (targetTab === 'graph') {
            this.loadOverviewGraph();
          } else if (targetTab === 'milestones') {
            this.loadOverviewMilestones();
          }
        }
      });
    });
  }

  /**
   * 加载故事流图
   */
  async loadOverviewGraph() {
    const graphCanvas = document.getElementById('overview-graph-canvas');
    if (!graphCanvas) return;

    try {
      if (!this.currentProject) {
        graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">没有可用项目</div>';
        return;
      }

      const kb = await window.projectManager.readKnowledgeBase(this.currentProject);
      const characters = await window.projectManager.readCharacters(this.currentProject);
      const timeline = await window.projectManager.getTimelineHistory(this.currentProject.id);

      graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">正在加载故事流图...</div>';

      // 构建节点和边
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

      if (nodes.length === 0) {
        graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">暂无故事内容</div>';
        return;
      }

      // 检查是否有Cytoscape
      if (!window.cytoscape) {
        graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">故事流图组件未加载</div>';
        return;
      }

      // 清除加载提示，准备显示图形
      graphCanvas.innerHTML = '';

      const cy = window.cytoscape({
        container: graphCanvas,
        elements: [...nodes, ...edges],
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'var(--primary-color)',
              'label': 'data(label)',
              'color': '#ffffff',
              'text-valign': 'center',
              'text-halign': 'center'
            }
          },
          {
            selector: 'node[type="character"]',
            style: {
              'background-color': '#e74c3c'
            }
          },
          {
            selector: 'node[type="location"]',
            style: {
              'background-color': '#27ae60'
            }
          },
          {
            selector: 'node[type="timeline"]',
            style: {
              'background-color': '#3498db'
            }
          }
        ],
        layout: {
          name: 'cose',
          idealEdgeLength: 100,
          nodeOverlap: 20
        }
      });

    } catch (error) {
      console.error('加载故事流图失败:', error);
      graphCanvas.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">加载故事流图失败</div>';
    }
  }

  /**
   * 加载章节里程碑
   */
  async loadOverviewMilestones() {
    const milestonesContent = document.getElementById('overview-milestones-content');
    if (!milestonesContent) return;

    try {
      if (!this.currentProject) {
        milestonesContent.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">没有可用项目</div>';
        return;
      }

      // 检查是否支持设置壁纸
      let canSetWallpaper = false;
      if (window.electronAPI?.shell?.canSetWallpaper) {
        try {
          canSetWallpaper = await window.electronAPI.shell.canSetWallpaper();
        } catch (error) {
          console.warn('检查壁纸设置支持失败:', error);
        }
      }

      const timeline = await window.projectManager.getTimelineHistory(this.currentProject.id);

      const milestones = await Promise.all(timeline.map(async (node, idx) => {
        let backgroundUrl = null;
        let localImagePath = null; // 用于设置壁纸的本地路径
        
        // 处理背景图片路径
        if (node.content?.backgroundUrl) {
          if (node.content.backgroundUrl.startsWith('assets/')) {
            // 转换相对路径为完整路径
            const filename = node.content.backgroundUrl.replace('assets/', '');
            const fullPath = await window.projectManager.getAssetPath(this.currentProject, filename);
            backgroundUrl = window.PathUtils.toFileUrl(fullPath);
            localImagePath = fullPath; // 保存本地路径用于壁纸设置
          } else if (node.content.backgroundUrl.startsWith('file://') || node.content.backgroundUrl.startsWith('http')) {
            // 已经是完整URL
            backgroundUrl = node.content.backgroundUrl;
            // 如果是file://协议，提取本地路径
            if (node.content.backgroundUrl.startsWith('file://')) {
              localImagePath = node.content.backgroundUrl.replace('file://', '');
            }
          }
        }

        return {
          idx: idx + 1,
          time: Utils.formatTime(node.timestamp || Date.now()),
          summary: node.content?.chapterSummary || '',
          text: node.content?.dialogue || '',
          backgroundUrl: backgroundUrl,
          localImagePath: localImagePath
        };
      }));

      // 过滤出有摘要的章节
      const validMilestones = milestones.filter(m => m.summary);

      // 如果有章节，为第一章获取项目封面（如果没有背景的话）
      if (validMilestones.length > 0 && !validMilestones[0].backgroundUrl) {
        const projectCover = await window.projectManager.getProjectCover(this.currentProject);
        if (projectCover) {
          validMilestones[0].backgroundUrl = projectCover;
          validMilestones[0].isProjectCover = true;
          // 项目封面通常也有本地路径，尝试获取
          if (projectCover.startsWith('file://')) {
            validMilestones[0].localImagePath = projectCover.replace('file://', '');
          }
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
          
          // 生成按钮组（壁纸和全屏按钮）
          let buttonsHtml = '';
          if (milestone.backgroundUrl) {
            // 全屏查看按钮（总是显示）
            buttonsHtml += `
              <button class="milestone-fullscreen-btn" 
                      title="全屏查看" 
                      data-image-url="${Utils.escapeHtml(milestone.backgroundUrl)}"
                      data-chapter-title="${Utils.escapeHtml(imageTitle)}">
                <i class="fa fa-expand"></i>
              </button>
            `;
            
            // 壁纸按钮（仅在支持且有本地路径时显示）
            if (canSetWallpaper && milestone.localImagePath) {
              buttonsHtml += `
                <button class="milestone-wallpaper-btn" 
                        title="设为系统壁纸" 
                        data-image-path="${Utils.escapeHtml(milestone.localImagePath)}"
                        data-chapter-title="${Utils.escapeHtml(imageTitle)}">
                  <i class="fa fa-desktop"></i>
                </button>
              `;
            }
          }
          
          imageHtml = `
            <div class="milestone-image" title="${imageTitle}">
              <img src="${milestone.backgroundUrl}" alt="${imageTitle}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'image-placeholder\\'><i class=\\'fa fa-image\\'></i><span>图片加载失败</span></div>'">
              <div class="image-overlay">
                <span class="image-title">${imageTitle}</span>
                <div class="image-buttons">
                  ${buttonsHtml}
                </div>
              </div>
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

      // 为壁纸按钮添加事件监听器
      if (canSetWallpaper) {
        const wallpaperButtons = milestonesContent.querySelectorAll('.milestone-wallpaper-btn');
        wallpaperButtons.forEach(button => {
          button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const imagePath = button.getAttribute('data-image-path');
            const chapterTitle = button.getAttribute('data-chapter-title');
            
            if (!imagePath) {
              Utils.showNotification('图片路径无效', 'error');
              return;
            }

            // 显示加载状态
            const originalHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

            try {
              // 验证文件路径
              if (!imagePath || !await window.electronAPI.fs.exists(imagePath)) {
                throw new Error('图片文件不存在或路径无效');
              }

              await window.electronAPI.shell.setWallpaper(imagePath);
              Utils.showNotification(`已将"${chapterTitle}"设为系统壁纸`, 'success');
            } catch (error) {
              console.error('设置壁纸失败:', error);
              
              let errorMessage = '设置壁纸失败';
              if (error.message.includes('does not exist')) {
                errorMessage = '图片文件不存在';
              } else if (error.message.includes('Unsupported image format')) {
                errorMessage = '不支持的图片格式';
              } else if (error.message.includes('All wallpaper setting methods failed')) {
                errorMessage = '系统壁纸设置失败，请检查系统权限';
              } else if (error.message.includes('PowerShell exited with code')) {
                errorMessage = 'PowerShell执行失败，可能需要管理员权限';
              } else {
                errorMessage = `设置失败: ${error.message}`;
              }
              
              Utils.showNotification(errorMessage, 'error');
            } finally {
              // 恢复按钮状态
              button.disabled = false;
              button.innerHTML = originalHtml;
            }
          });
        });
      }

  // 为全屏查看按钮添加事件监听器
  const fullscreenButtons = milestonesContent.querySelectorAll('.milestone-fullscreen-btn');
      fullscreenButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
          e.stopPropagation();
          
          const imageUrl = button.getAttribute('data-image-url');
          const chapterTitle = button.getAttribute('data-chapter-title');
          
          if (!imageUrl) {
            Utils.showNotification('图片路径无效', 'error');
            return;
          }

          this.showFullscreenImage(imageUrl, chapterTitle);
        });
      });

    } catch (error) {
      console.error('加载章节里程碑失败:', error);
      milestonesContent.innerHTML = '<div class="text-muted" style="padding: 20px; text-align: center;">加载章节里程碑失败</div>';
    }
  }

  /**
   * 显示全屏图片
   */
  showFullscreenImage(imageUrl, chapterTitle) {
    // 创建全屏模态框
    const modal = document.createElement('div');
    modal.className = 'fullscreen-image-modal';
    modal.innerHTML = `
      <div class="fullscreen-backdrop"></div>
      <div class="fullscreen-image-container">
        <img src="${imageUrl}" alt="${chapterTitle}" class="fullscreen-image">
        <div class="fullscreen-image-title">${chapterTitle}</div>
      </div>
    `;

    // 添加到页面
    document.body.appendChild(modal);

    // 添加事件监听器
    const closeModal = () => {
      modal.classList.add('closing');
      setTimeout(() => {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      }, 300);
    };

    // 点击任意地方关闭
    modal.addEventListener('click', closeModal);
    
    // ESC键关闭
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // 显示动画
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
  }

  /**
   * 关闭项目详情
   */
  closeProjectOverview() {
    const modal = document.getElementById('project-overview-modal');
    if (modal) {
      modal.classList.remove('active');
    }
    this.currentProject = null;
  }

  /**
   * 获取当前项目
   */
  getCurrentProject() {
    return this.currentProject;
  }

  /**
   * 刷新项目信息
   */
  async refreshProjectInfo() {
    if (this.currentProject) {
      await this.fillProjectOverviewInfo(this.currentProject);
    }
  }
}

// 创建全局实例
window.projectDetails = new ProjectDetails();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProjectDetails;
}
