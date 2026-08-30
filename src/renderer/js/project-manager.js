/**
 * 项目管理器
 */

class ProjectManager {
  constructor() {
    this.dataDir = '';
    this.projects = [];
    this.currentProject = null;
    this.init();
  }

  async init() {
    try {
      this.dataDir = await window.electronAPI.getDataDir();
      await this.loadProjects();
    } catch (error) {
      console.error('项目管理器初始化失败:', error);
      Utils.showNotification('项目管理器初始化失败', 'error');
    }
  }

  /**
   * 加载所有项目
   */
  async loadProjects() {
    try {
      const projectDirs = await window.electronAPI.fs.readdir(this.dataDir);
      this.projects = [];

      for (const dir of projectDirs) {
        // 跳过隐藏目录和回收站目录，防止重复显示
        if (!dir || dir.startsWith('.') || dir.toLowerCase() === '.trash') {
          continue;
        }
        const projectPath = `${this.dataDir}/${dir}`;
        const stat = await window.electronAPI.fs.stat(projectPath);
        
        if (stat.isDirectory) {
          const metadataPath = `${projectPath}/metadata.json`;
          
          if (await window.electronAPI.fs.exists(metadataPath)) {
            try {
              const metadata = await window.electronAPI.fs.readJson(metadataPath);
              this.projects.push({
                ...metadata,
                path: projectPath,
                lastModified: stat.mtime
              });
            } catch (error) {
              console.warn(`加载项目元数据失败: ${dir}`, error);
            }
          }
        }
      }

      // 去重并按修改时间排序
      const seen = new Set();
      this.projects = this.projects.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }).sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      
    } catch (error) {
      console.error('加载项目列表失败:', error);
      this.projects = [];
    }
  }

  /**
   * 创建新项目
   * @param {Object} projectData - 项目数据
   */
  async createProject(projectData) {
    try {
      const projectId = Utils.generateId();
      const projectPath = `${this.dataDir}/${projectId}`;
      
      // 创建项目目录结构
      await window.electronAPI.fs.ensureDir(projectPath);
      await window.electronAPI.fs.ensureDir(`${projectPath}/timeline`);
      await window.electronAPI.fs.ensureDir(`${projectPath}/backup`);
  await window.electronAPI.fs.ensureDir(`${projectPath}/assets`);

      // 创建项目元数据
      const metadata = {
        id: projectId,
        name: projectData.name,
        description: projectData.description || '',
        style: projectData.style || '',
        summary: projectData.summary || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        currentCheckpoint: null,
        settings: {
          autoSave: true,
          autoSaveInterval: 5,
          progressTarget: 20
        }
      };

  await window.electronAPI.fs.writeJson(`${projectPath}/metadata.json`, metadata);

      // 创建初始知识库
      const initialKnowledgeBase = {
        characters: {},
        locations: {},
        items: {},
        events: {},
        relationships: {},
        worldInfo: {},
        plotPoints: {},
        customData: {}
      };

      await window.electronAPI.fs.writeJson(`${projectPath}/knowledge-base.json`, initialKnowledgeBase);

      // 创建初始角色库
      const initialCharacters = {
        characters: {}
      };
      await window.electronAPI.fs.writeJson(`${projectPath}/characters.json`, initialCharacters);

      // 创建初始时间线节点
      const initialTimeline = {
        id: Utils.generateId(),
        timestamp: Date.now(),
        content: {
          dialogue: '欢迎来到你的新故事！点击开始，让AI为你创造无限可能的冒险。',
          choices: [
            { id: 1, text: '开始新的冒险', action: 'continue' }
          ],
          imagePrompt: '一个充满神秘感的开始场景，温暖的光芒',
          knowledgeUpdates: {},
          chapterSummary: '故事的开始'
        },
        knowledgeBase: initialKnowledgeBase,
        isCheckpoint: true
      };

  await window.electronAPI.fs.writeJson(
        `${projectPath}/timeline/${initialTimeline.id}.json`, 
        initialTimeline
      );

      // 更新元数据中的当前检查点
      metadata.currentCheckpoint = initialTimeline.id;
      await window.electronAPI.fs.writeJson(`${projectPath}/metadata.json`, metadata);

      // 立即尝试生成封面图（基于项目强相关提示词）
      try {
        Utils.showGlobalOverlay('正在为新项目生成封面...');
        const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        if (settings.imageApiKey) {
          // 始终使用项目维度的信息组合更相关的提示词（而非通用占位语）
          const prompt = await this.buildCoverPrompt({
            id: projectId,
            name: projectData.name,
            style: projectData.style,
            summary: projectData.summary,
            path: projectPath
          }, initialTimeline);
          const url = await window.aiService.generateImage(prompt, {
            projectId: projectId,
            onProgress: (p) => {
              const overlay = document.querySelector('#global-overlay .overlay-text');
              if (overlay) overlay.textContent = `封面生成中 · ${p.stage || ''}`;
              window.dispatchEvent(new CustomEvent('image-progress', { detail: { projectId, stage: p.stage, done: false } }));
            }
          });
          // 保存到首个时间线节点并缓存到content
          initialTimeline.content.backgroundUrl = url;
          await window.electronAPI.fs.writeJson(
            `${projectPath}/timeline/${initialTimeline.id}.json`,
            initialTimeline
          );
          // 更新元数据当前检查点（不变），仅更新时间
          metadata.updatedAt = new Date().toISOString();
          await window.electronAPI.fs.writeJson(`${projectPath}/metadata.json`, metadata);
          window.dispatchEvent(new CustomEvent('image-progress', { detail: { projectId, stage: '完成', percent: 100, done: true, url } }));
        }
      } catch (e) {
        console.warn('创建后封面生成失败（可忽略）:', e);
      } finally {
        Utils.hideGlobalOverlay();
      }

      // 重新加载项目列表
      await this.loadProjects();
      
      Utils.showNotification('项目创建成功！', 'success');
      return projectId;
      
    } catch (error) {
      console.error('创建项目失败:', error);
      Utils.showNotification('创建项目失败', 'error');
      throw error;
    }
  }

  /**
   * 保存项目元数据
   * @param {Object} project - 项目对象
   */
  async saveProject(project) {
    try {
      if (!project || !project.id) {
        throw new Error('项目对象无效');
      }

      const projectInList = this.projects.find(p => p.id === project.id);
      if (!projectInList) {
        throw new Error('项目不存在');
      }

      // 更新项目对象
      Object.assign(projectInList, project, {
        updatedAt: new Date().toISOString()
      });

      // 保存到文件
      const metadataPath = `${projectInList.path}/metadata.json`;
      const metadata = {
        id: projectInList.id,
        name: projectInList.name,
        description: projectInList.description,
        style: projectInList.style,
        summary: projectInList.summary,
        createdAt: projectInList.createdAt,
        updatedAt: projectInList.updatedAt,
        lastPlayed: projectInList.lastPlayed,
        version: projectInList.version || '1.0.0',
        currentCheckpoint: projectInList.currentCheckpoint,
        settings: projectInList.settings || {}
      };

      await window.electronAPI.fs.writeJson(metadataPath, metadata);
      
      return true;
    } catch (error) {
      console.error('保存项目失败:', error);
      throw error;
    }
  }

  /**
   * 删除项目
   * @param {string} projectId - 项目ID
   */
  async deleteProject(projectId) {
    try {
      const project = this.projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error('项目不存在');
      }

      // 移动到回收站而不是直接删除
      const trashPath = `${this.dataDir}/.trash`;
      await window.electronAPI.fs.ensureDir(trashPath);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const trashProjectPath = `${trashPath}/${project.name}_${timestamp}`;
      
      await window.electronAPI.fs.move(project.path, trashProjectPath);
      
      // 重新加载项目列表
      await this.loadProjects();
      
      Utils.showNotification('项目已删除', 'success');
      
    } catch (error) {
      console.error('删除项目失败:', error);
      Utils.showNotification('删除项目失败', 'error');
      throw error;
    }
  }

  /**
   * 复制项目
   * @param {string} projectId - 项目ID
   */
  async duplicateProject(projectId) {
    try {
  const sourceProject = this.projects.find(p => p.id === projectId);
      if (!sourceProject) {
        throw new Error('项目不存在');
      }

      const newProjectId = Utils.generateId();
      const newProjectPath = `${this.dataDir}/${newProjectId}`;
      
      // 复制整个项目目录
      await window.electronAPI.fs.copy(sourceProject.path, newProjectPath);
      
      // 更新新项目的元数据
      const newMetadata = await window.electronAPI.fs.readJson(`${newProjectPath}/metadata.json`);
      newMetadata.id = newProjectId;
      newMetadata.name = sourceProject.name + ' - 副本';
      newMetadata.createdAt = new Date().toISOString();
      newMetadata.updatedAt = new Date().toISOString();
      
      await window.electronAPI.fs.writeJson(`${newProjectPath}/metadata.json`, newMetadata);
      
      // 重新加载项目列表
      await this.loadProjects();
      
  Utils.showNotification('项目复制成功！', 'success', 2000);
      return newProjectId;
      
    } catch (error) {
      console.error('复制项目失败:', error);
      Utils.showNotification('复制项目失败', 'error');
      throw error;
    }
  }

  /**
   * 导出项目
   * @param {string} projectId - 项目ID
   */
  async exportProject(projectId) {
    try {
      const project = this.projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error('项目不存在');
      }

      const result = await window.electronAPI.showSaveDialog({
        title: '导出项目',
        defaultPath: `${project.name}.artimeow-gg-rt`,
        filters: [
          { name: 'ArtiMeow项目文件', extensions: ['artimeow-gg-rt'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
  const exportNotification = Utils.showNotification('正在导出项目...', 'info', 0); // 手动控制关闭
        
        try {
          // 导出指定项目目录（仅当前项目）
          await window.electronAPI.zip.exportProject(project.path, result.filePath);
          exportNotification.close(); // 关闭导出中的通知
          Utils.showNotification('项目导出成功!', 'success', 2000);
        } catch (error) {
          console.error('导出失败:', error);
          exportNotification.close(); // 关闭导出中的通知
          Utils.showNotification('导出项目失败', 'error', 3000);
        }
      }
      
    } catch (error) {
      console.error('导出项目失败:', error);
      Utils.showNotification('导出项目失败', 'error');
      throw error;
    }
  }

  /**
   * 导入项目
   */
  async importProject() {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: '导入项目',
        filters: [
          { name: 'ArtiMeow项目文件', extensions: ['artimeow-gg-rt'] },
          { name: 'ZIP文件', extensions: ['zip'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
  const importNotification = Utils.showNotification('正在导入项目...', 'info', 0); // 手动控制关闭
        
        try {
          // 生成临时解压目录名
          const projectId = Utils.generateId();
          const extractPath = `${this.dataDir}/${projectId}`;
          
          await window.electronAPI.zip.importProject(filePath, extractPath);
          
          // 重新加载项目列表
          await this.loadProjects();
          importNotification.close(); // 关闭导入中的通知
          Utils.showNotification('项目导入成功!', 'success', 2000);
          
          return projectId;
        } catch (error) {
          console.error('导入失败:', error);
          importNotification.close(); // 关闭导入中的通知
          Utils.showNotification('导入项目失败', 'error', 3000);
        }
      }
      
      return null;
    } catch (error) {
      console.error('导入项目失败:', error);
      Utils.showNotification('导入项目失败', 'error');
      throw error;
    }
  }

  /**
   * 加载项目
   * @param {string} projectId - 项目ID
   */
  async loadProject(projectId) {
    try {
      const project = this.projects.find(p => p.id === projectId);
      if (!project) {
        throw new Error('项目不存在');
      }

      // 加载项目元数据
      const metadata = await window.electronAPI.fs.readJson(`${project.path}/metadata.json`);
      
      // 加载当前检查点
      let currentTimeline = null;
      if (metadata.currentCheckpoint) {
        const timelinePath = `${project.path}/timeline/${metadata.currentCheckpoint}.json`;
        if (await window.electronAPI.fs.exists(timelinePath)) {
          currentTimeline = await window.electronAPI.fs.readJson(timelinePath);
        }
      }

      // 如果没有当前检查点，加载最新的时间线节点
      if (!currentTimeline) {
        const timelineFiles = await window.electronAPI.fs.readdir(`${project.path}/timeline`);
        const jsonFiles = timelineFiles.filter(f => f.endsWith('.json'));
        
        if (jsonFiles.length > 0) {
          // 按文件名（时间戳）排序，获取最新的
          jsonFiles.sort();
          const latestFile = jsonFiles[jsonFiles.length - 1];
          currentTimeline = await window.electronAPI.fs.readJson(
            `${project.path}/timeline/${latestFile}`
          );
          
          // 更新元数据
          metadata.currentCheckpoint = currentTimeline.id;
          await window.electronAPI.fs.writeJson(`${project.path}/metadata.json`, metadata);
        }
      }

      this.currentProject = {
        ...metadata,
        path: project.path,
        currentTimeline
      };

      return this.currentProject;
      
    } catch (error) {
      console.error('加载项目失败:', error);
      Utils.showNotification('加载项目失败', 'error');
      throw error;
    }
  }

  /**
   * 保存时间线节点
   * @param {Object} timelineData - 时间线数据
   */
  async saveTimelineNode(timelineData) {
    if (!this.currentProject) {
      throw new Error('没有当前项目');
    }

    try {
      const timelinePath = `${this.currentProject.path}/timeline/${timelineData.id}.json`;
      await window.electronAPI.fs.writeJson(timelinePath, timelineData);
      
      // 更新项目元数据
      this.currentProject.currentCheckpoint = timelineData.id;
      this.currentProject.updatedAt = new Date().toISOString();
      
      const metadataPath = `${this.currentProject.path}/metadata.json`;
      await window.electronAPI.fs.writeJson(metadataPath, {
        id: this.currentProject.id,
        name: this.currentProject.name,
        description: this.currentProject.description,
        style: this.currentProject.style,
        summary: this.currentProject.summary,
        createdAt: this.currentProject.createdAt,
        updatedAt: this.currentProject.updatedAt,
        version: this.currentProject.version,
        currentCheckpoint: this.currentProject.currentCheckpoint,
        settings: this.currentProject.settings
      });
      
    } catch (error) {
      console.error('保存时间线节点失败:', error);
      throw error;
    }
  }

  /** 加载知识库 */
  async readKnowledgeBase(projectIdOrObj) {
    const project = typeof projectIdOrObj === 'string' ? this.projects.find(p => p.id === projectIdOrObj) : projectIdOrObj;
    if (!project) return {};
    const kbPath = `${project.path}/knowledge-base.json`;
    try { return await window.electronAPI.fs.readJson(kbPath); } catch { return {}; }
  }

  /** 写入知识库 */
  async writeKnowledgeBase(projectIdOrObj, kb) {
    const project = typeof projectIdOrObj === 'string' ? this.projects.find(p => p.id === projectIdOrObj) : projectIdOrObj;
    if (!project) return false;
    const kbPath = `${project.path}/knowledge-base.json`;
    await window.electronAPI.fs.writeJson(kbPath, kb);
    return true;
  }

  /** 读取角色库 */
  async readCharacters(projectIdOrObj) {
    const project = typeof projectIdOrObj === 'string' ? this.projects.find(p => p.id === projectIdOrObj) : projectIdOrObj;
    if (!project) return { characters: {} };
    const cPath = `${project.path}/characters.json`;
    try { return await window.electronAPI.fs.readJson(cPath); } catch { return { characters: {} }; }
  }

  /** 写入角色库 */
  async writeCharacters(projectIdOrObj, characters) {
    const project = typeof projectIdOrObj === 'string' ? this.projects.find(p => p.id === projectIdOrObj) : projectIdOrObj;
    if (!project) return false;
    const cPath = `${project.path}/characters.json`;
    await window.electronAPI.fs.writeJson(cPath, characters);
    return true;
  }

  /** 获取项目统计（卡片徽标/进度等） */
  async getProjectStats(project) {
    try {
      const timeline = await this.getTimelineHistory(project.id);
      const nodeCount = timeline.length;
      const createdAt = project.createdAt ? new Date(project.createdAt) : new Date(project.lastModified || Date.now());
      const target = project.settings?.progressTarget || 20;
      const progress = Math.max(0, Math.min(100, Math.round((nodeCount / target) * 100)));
      const hasCover = !!(await this.getProjectCover(project));
      return { nodeCount, createdAt, progress, hasCover };
    } catch (e) {
      return { nodeCount: 0, createdAt: new Date(), progress: 0, hasCover: false };
    }
  }

  /**
   * 获取项目的时间线历史
   * @param {string} projectId - 项目ID
   */
  async getTimelineHistory(projectId) {
    try {
      const project = this.projects.find(p => p.id === projectId) || this.currentProject;
      if (!project) {
        throw new Error('项目不存在');
      }

      const timelinePath = project.path ? 
        `${project.path}/timeline` : 
        `${this.dataDir}/${projectId}/timeline`;
      
      const timelineFiles = await window.electronAPI.fs.readdir(timelinePath);
      const jsonFiles = timelineFiles.filter(f => f.endsWith('.json'));
      
      const timeline = [];
      for (const file of jsonFiles) {
        try {
          const nodeData = await window.electronAPI.fs.readJson(`${timelinePath}/${file}`);
          timeline.push(nodeData);
        } catch (error) {
          console.warn(`加载时间线节点失败: ${file}`, error);
        }
      }

      // 按时间戳排序
      timeline.sort((a, b) => a.timestamp - b.timestamp);
      
      return timeline;
      
    } catch (error) {
      console.error('获取时间线历史失败:', error);
      return [];
    }
  }

  /**
   * 回档到指定检查点
   * @param {string} checkpointId - 检查点ID
   */
  async revertToCheckpoint(checkpointId) {
    if (!this.currentProject) {
      throw new Error('没有当前项目');
    }

    try {
      // 获取所有时间线节点
      const timeline = await this.getTimelineHistory(this.currentProject.id);
      const checkpointIndex = timeline.findIndex(node => node.id === checkpointId);
      
      if (checkpointIndex === -1) {
        throw new Error('检查点不存在');
      }

  // 将检查点之后的节点移动到备份目录
      const backupDir = `${this.currentProject.path}/backup/${Date.now()}`;
      await window.electronAPI.fs.ensureDir(backupDir);
      
      const nodesToBackup = timeline.slice(checkpointIndex + 1);
      for (const node of nodesToBackup) {
        const sourcePath = `${this.currentProject.path}/timeline/${node.id}.json`;
        const backupPath = `${backupDir}/${node.id}.json`;
        
        if (await window.electronAPI.fs.exists(sourcePath)) {
          await window.electronAPI.fs.move(sourcePath, backupPath);
        }
      }

  // 备份完成后，删除回档检查点后的时间线节点（清理空目录即可跳过）
  // 实际文件已经移动走，不再重复；这里确保节点数组中也移除（内存状态）
  // 重新加载项目列表以反映变更
  await this.loadProjects();

      // 更新当前检查点
      this.currentProject.currentCheckpoint = checkpointId;
  this.currentProject.currentTimeline = timeline[checkpointIndex];
      
      // 保存元数据
      const metadataPath = `${this.currentProject.path}/metadata.json`;
      await window.electronAPI.fs.writeJson(metadataPath, {
        id: this.currentProject.id,
        name: this.currentProject.name,
        description: this.currentProject.description,
        style: this.currentProject.style,
        summary: this.currentProject.summary,
        createdAt: this.currentProject.createdAt,
        updatedAt: new Date().toISOString(),
        version: this.currentProject.version,
        currentCheckpoint: checkpointId,
        settings: this.currentProject.settings
      });
      
      Utils.showNotification('已回档到选定检查点', 'success');
      
    } catch (error) {
      console.error('回档失败:', error);
      Utils.showNotification('回档失败', 'error');
      throw error;
    }
  }

  /**
   * 递归添加目录到zip文件
   * @param {Object} zipFile - zip文件对象
   * @param {string} dirPath - 目录路径
   * @param {string} zipPath - zip内路径
   */
  async addDirectoryToZip(zipFile, dirPath, zipPath) {
    const items = await window.electronAPI.fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = `${dirPath}/${item}`;
      const itemZipPath = zipPath ? `${zipPath}/${item}` : item;
      const stat = await window.electronAPI.fs.stat(itemPath);
      
      if (stat.isDirectory) {
        await this.addDirectoryToZip(zipFile, itemPath, itemZipPath);
      } else {
        zipFile.addFile(itemPath, itemZipPath);
      }
    }
  }

  /**
   * 获取项目列表
   */
  getProjects() {
    return this.projects;
  }

  /**
   * 获取当前项目
   */
  getCurrentProject() {
    return this.currentProject;
  }

  /**
   * 获取项目资源文件路径
   * @param {Object} project - 项目对象
   * @param {string} filename - 文件名
   * @returns {Promise<string>} 完整的文件路径
   */
  async getAssetPath(project, filename) {
    if (!project || !project.path) {
      throw new Error('项目路径无效');
    }
    
    const assetDir = `${project.path}/assets`;
    await window.electronAPI.fs.ensureDir(assetDir);
    
    return `${assetDir}/${filename}`;
  }

  /**
   * 兼容方法：根据 projectId 返回项目路径
   * @param {string} projectId
   * @returns {Promise<string>} 项目目录路径
   */
  async getProjectPath(projectId) {
    // 优先查找已加载的项目列表
    const project = this.projects.find(p => p.id === projectId);
    if (project && project.path) return project.path;

    // 如果当前项目匹配，使用当前项目路径
    if (this.currentProject && this.currentProject.id === projectId && this.currentProject.path) {
      return this.currentProject.path;
    }

    // 退回到 dataDir 下的推断路径（不会验证是否存在）
    return `${this.dataDir}/${projectId}`;
  }

  /**
   * 获取项目资源的相对路径
   * @param {string} filename - 文件名
   * @returns {string} 相对路径
   */
  getAssetRelativePath(filename) {
    return `assets/${filename}`;
  }

  /**
   * 获取项目封面（当前检查点的背景图）
   * @param {Object} project - 项目对象（来自this.projects）
   * @returns {Promise<string|null>} 背景图URL
   */
  async getProjectCover(project) {
    try {
      if (!project) return null;

      let backgroundUrl = null;

      // 1. 优先检查metadata.json中的coverPath（项目专用封面）
      try {
        const metadataPath = `${project.path}/metadata.json`;
        if (await window.electronAPI.fs.exists(metadataPath)) {
          const metadata = await window.electronAPI.fs.readJson(metadataPath);
          if (metadata.coverPath) {
            const fullCoverPath = `${project.path}/${metadata.coverPath}`;
            if (await window.electronAPI.fs.exists(fullCoverPath)) {
              return window.PathUtils.toFileUrl(fullCoverPath);
            }
          }
        }
      } catch (error) {
        console.warn('读取项目封面路径失败:', error);
      }

      // 2. 如果没有专用封面，查找"故事的开始"时间线节点的背景图
      try {
        const dir = `${project.path}/timeline`;
        if (await window.electronAPI.fs.exists(dir)) {
          const files = (await window.electronAPI.fs.readdir(dir)).filter(f => f.endsWith('.json'));
          
          for (const file of files) {
            try {
              const node = await window.electronAPI.fs.readJson(`${dir}/${file}`);
              // 查找包含"故事的开始"或者是第一个节点的背景图
              if (node?.content?.backgroundUrl && 
                  (node.content.dialogue?.includes('故事的开始') || 
                   node.content.chapterSummary?.includes('故事的开始'))) {
                backgroundUrl = node.content.backgroundUrl;
                break;
              }
            } catch (e) {
              continue;
            }
          }
          
          // 如果没找到"故事的开始"，使用时间戳最早的节点
          if (!backgroundUrl) {
            const nodes = [];
            for (const file of files) {
              try {
                const node = await window.electronAPI.fs.readJson(`${dir}/${file}`);
                if (node?.content?.backgroundUrl) {
                  nodes.push(node);
                }
              } catch (e) {
                continue;
              }
            }
            // 按时间戳排序，取最早的
            nodes.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
            if (nodes.length > 0) {
              backgroundUrl = nodes[0].content.backgroundUrl;
            }
          }
        }
      } catch (error) {
        console.warn('读取时间线封面失败:', error);
      }

      if (!backgroundUrl) return null;

      // 处理本地路径：如果是相对路径（如 assets/xxx.png），转换为完整文件路径
      if (backgroundUrl.startsWith('assets/')) {
        const fullPath = `${project.path}/${backgroundUrl}`;
        if (await window.electronAPI.fs.exists(fullPath)) {
          // 使用PathUtils转换为file://协议路径
          return window.PathUtils.toFileUrl(fullPath);
        }
      }

      // 如果是网络URL或其他格式，直接返回
      return backgroundUrl;
    } catch (e) {
      console.warn('获取项目封面失败:', e);
      return null;
    }
  }

  /**
   * 设置项目封面路径到metadata.json
   * @param {Object} project - 项目对象
   * @param {string} coverPath - 封面相对路径（如 "assets/cover.png"）
   */
  async setProjectCover(project, coverPath) {
    try {
      if (!project) throw new Error('项目对象为空');

      const metadataPath = `${project.path}/metadata.json`;
      let metadata = {};
      
      // 读取现有metadata
      if (await window.electronAPI.fs.exists(metadataPath)) {
        metadata = await window.electronAPI.fs.readJson(metadataPath);
      }

      // 设置封面路径
      metadata.coverPath = coverPath;
      metadata.updatedAt = new Date().toISOString();

      // 保存metadata
      await window.electronAPI.fs.writeJson(metadataPath, metadata);
      
      console.log('项目封面已设置:', coverPath);
      return true;
    } catch (error) {
      console.error('设置项目封面失败:', error);
      return false;
    }
  }

  /**
   * 若项目无封面，尝试根据最近的imagePrompt生成一张封面，并写回时间线节点
   * @param {Object|string} projectOrId 项目对象或ID
   * @returns {Promise<string|null>} 生成的URL或null
   */
  async ensureCover(projectOrId) {
    try {
      const project = typeof projectOrId === 'string' ? this.projects.find(p => p.id === projectOrId) : projectOrId;
      if (!project) return null;

      // 已有封面则跳过
      const exists = await this.getProjectCover(project);
      if (exists) return exists;

      // 未配置图像API则跳过
      const cfg = window.aiService?.getConfigStatus?.();
      if (!cfg || !cfg.imageConfigured) return null;

      // 找到最近的时间线节点和提示词
      const dir = `${project.path}/timeline`;
      const files = (await window.electronAPI.fs.readdir(dir)).filter(f => f.endsWith('.json'));
      let latest = null;
      for (const f of files) {
        try {
          const n = await window.electronAPI.fs.readJson(`${dir}/${f}`);
          if (!latest || (n?.timestamp || 0) > (latest?.timestamp || 0)) latest = n;
        } catch {}
      }
      if (!latest) return null;
      const prompt = await this.buildCoverPrompt(project, latest);

      // 广播进度占位
      window.dispatchEvent(new CustomEvent('image-progress', { detail: { projectId: project.id, stage: '请求中', percent: 5, done: false } }));

      const url = await window.aiService.generateImage(prompt, {
        projectId: project.id,
        onProgress: (p) => {
          window.dispatchEvent(new CustomEvent('image-progress', { detail: { projectId: project.id, stage: p.stage, percent: p.percent, done: false } }));
        }
      });
      if (!url) return null;

      // 写回该节点
      latest.content = latest.content || {};
      latest.content.backgroundUrl = url;
      await window.electronAPI.fs.writeJson(`${dir}/${latest.id}.json`, latest);

      // 更新元数据更新时间
      const metadataPath = `${project.path}/metadata.json`;
      try {
        const meta = await window.electronAPI.fs.readJson(metadataPath);
        meta.updatedAt = new Date().toISOString();
        await window.electronAPI.fs.writeJson(metadataPath, meta);
      } catch {}

      // 广播完成，更新卡片
      window.dispatchEvent(new CustomEvent('image-progress', { detail: { projectId: project.id, stage: '完成', done: true, url } }));
      return url;
    } catch (e) {
      console.warn('ensureCover失败：', e);
      return null;
    }
  }

  /**
   * 生成项目相关性的封面提示词
   * @param {Object} project 项目信息 {id,name,style,summary,path}
   * @param {Object} latestNode 最近时间线节点（可选）
   * @returns {Promise<string>} 提示词
   */
  async buildCoverPrompt(project, latestNode) {
    try {
      // 读取角色名列表
      let characters = [];
      try {
        const cs = await this.readCharacters(project);
        characters = Object.values(cs?.characters || {}).map(c => c.name).filter(Boolean).slice(0, 4);
      } catch {}

      // 若节点里已有较详细的imagePrompt，拼接项目上下文以增强相关性
      const nodePrompt = latestNode?.content?.imagePrompt || '';

      const parts = [];
      parts.push(`为交互式视觉小说项目《${project.name}》生成一张横幅封面图`);
      if (project.style) parts.push(`风格：${project.style}`);
      if (project.summary) parts.push(`故事大纲要点：${project.summary.substring(0, 120)}${project.summary.length > 120 ? '…' : ''}`);
      if (characters.length) parts.push(`主要角色：${characters.join('、')}`);
      if (nodePrompt) parts.push(`场景聚焦：${nodePrompt}`);
      parts.push('画面需具备强叙事性与氛围感，构图适合作为封面（横向），不含文字与水印，影视级光影');
      return parts.join('。');
    } catch {
      return `${project.name} · ${project.style || '视觉小说'} 封面，氛围感强，横向构图，影视级光影，无水印`;
    }
  }
}

// 创建全局项目管理器实例
window.projectManager = new ProjectManager();
