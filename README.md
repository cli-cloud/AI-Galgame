# ArtiMeow AI GalGamer RT

> 基于 **Electron** + **实时 AIGC** 的次世代视觉小说游戏引擎 / Galgame 创作与游玩框架

![ArtiMeow AI GalGamer RT](assets/icon.png)

ArtiMeow AI GalGamer RT 是一个高度可扩展、支持实时自生成演进的现代 Galgame / 视觉小说游戏框架。项目深度融合了 **LLM 长篇剧情生成**、**GPT / DALL-E 3 原生透明立绘生成**、**8 大表情差分立绘系统**、**双角色同台光影聚焦**、**多深度全分支并发预载**、**12+1 多槽位存档管理**、**经典 Galgame 键盘操控（Ctrl 快进 / 历史回溯）** 以及 **IoT 实时生理数据感知**（心率/SRI），为玩家与创作者提供真正具备无限分支推演与极致沉浸感的游戏体验。

---

## 🌟 核心功能特性

### 1. 🎭 8 大表情差分立绘与 GPT 原生透明背景引擎
- **8 大经典 Galgame 情绪预设**：支持 `平静 (neutral)`、`开心微笑 (happy)`、`害羞脸红 (blushing)`、`伤心低落 (sad)`、`生气恼怒 (angry)`、`惊讶吃惊 (surprised)`、`陷入思考 (thinking)`、`得意自信 (smug)`。
- **一键批量生成**：在「素材管理」中可一键为指定角色批量生成全部 8 种表情差分立绘。
- **GPT / DALL-E 3 专属透明 PNG 提示词特化**：针对 OpenAI / GPT / DALL-E 3 模型自动注入原生透明通道（`isolated on pure transparent background`, `transparent alpha channel`, `sticker cutout style`）精准提示词，并搭配全自动二进制 PNG 自愈与智能透明去底处理。
- **游戏内情绪自适应切换**：AI 在推进剧情时根据语境自动标记说话人情绪（`emotion`），立绘瞬间平滑切换至对应表情差分。

---

### 2. 🎬 视觉立绘沉浸优化与双角色同台光影聚焦
- **底边贴合（Grounding）**：立绘扎根贴合屏幕底边（占屏幕高度 84%），下半身自然延伸于半透明对话框之后，杜绝半空悬浮感。
- **双角色同台互动（Dual-Character Staging）**：当场景内存在多名角色时，两人分别自然置于左右两侧（左 `32%`，右 `68%`）同台出场。
- **动态说话人聚焦高亮**：
  - **当前说话角色（Speaking）**：高亮聚焦、明亮加深（亮度 108%、立体光影），名牌精准指示；
  - **未说话角色（Inactive）**：自然淡定旁听（亮度 72%），营造出面对面对话的绝佳临场感。

---

### 3. 📖 单次长篇剧情生成与连续对白序列拆解
- **饱满长篇情节**：AI 单次输出 300 ~ 600 字丰富剧情内容（包含角色交锋对白、心理独白、环境氛围渲染与动作互动）。
- **连贯多对话框拆解**：引擎将长篇内容智能拆解为 **6 ~ 12 个连续对白小节（Beats）**，玩家每次生成即可通过按空格或点击连贯阅读 6~12 句台词。
- **低频分支沉浸设计**：85% 以上场景保持无选项纯享对白连贯阅读，仅在主线关键抉择点提供 2~3 个有深度影响的决策分支。

---

### 4. ⚡ 0~8 幕 / 自定义深度全分支超前并发预生成（Prefetch System）
- **静默后台预载**：玩家阅读当前对白时，引擎在后台自动超前预生成后续剧情，彻底消除等待旋转圈，实现 0ms 瞬间翻页。
- **丰富档位配置**：支持 `0次 (关闭)`、`1次`、`2次 (推荐)`、`3次`、`5次`、`8次` 以及 `自定义 (1~20幕)` 预载深度。
- **分支决策树预加载**：当遇到多选项分支时，后台并发预生成不同选项的后续剧情，玩家做出选择后瞬间呈现。

---

### 5. 💾 12+1 可视化多槽位存档与读档系统 (Save & Load System)
- **Q.SAVE / Q.LOAD 极速快存快读**：一键瞬间秒存/秒读最近进度，游戏画面右下角弹出精美提醒。
- **12 个标准多槽位管理**：
  - 🖼️ **高清场景缩略图**：直观展示当时所处的背景画面；
  - 👤 **发言角色与情绪标签**：记录说话人物及表情；
  - 💬 **剧情台词摘要**：截取关键台词片段；
  - ⏰ **精确时间戳**：精确记录存档生成时间；
  - 🔄 **覆盖 / 读取 / 一键删除**：支持多档位自由管理。

---

### 6. ⌨️ 经典 Galgame 操控体验
- **<kbd>Ctrl</kbd> 极速快进 (SKIP)**：**按住键盘 <kbd>Ctrl</kbd> 键**以 60ms 极速快进对白（遇到选项分支自动暂停保护），松开即停。
- **<kbd>PageUp</kbd> / 滚轮上滑**：打开 **Backlog 对话历史记录面板**，随时回看前文对白与说话人。
- **<kbd>S</kbd>**：极速快速存档（Q.SAVE）。
- **<kbd>L</kbd>**：极速快速读档（Q.LOAD）。
- **<kbd>A</kbd>**：开启 / 关闭自动播放模式（AUTO）。
- **<kbd>Space</kbd> / <kbd>Enter</kbd>**：跳过打字机动画 / 推进下一句台词。
- **<kbd>Esc</kbd>**：关闭存档面板或历史回看窗口。

---

### 7. 🤖 多 AI 模型协议全覆盖
支持主流在线云端大模型与本地开源推理框架：
- **OpenAI**：`gpt-4o`, `gpt-4o-mini`, `dall-e-3`, `dall-e-2`, `chatgpt-4o-latest` (文本与生图全系列)
- **Claude (Anthropic)**：`claude-3-5-sonnet-20241022` (原生 `/messages` 接口)
- **Google Gemini**：`gemini-2.5-flash`, `gemini-3.7-flash-high`, `gemini-2.0-flash`
- **Ollama / 本地大模型**：`qwen2.5`, `llama3`, `deepseek-r1` (免 Key 本地部署)
- **llama.cpp**：`/completion` 本地推理服务
- **Custom API**：兼容任意第三方 OpenAI 格式中转 API

---

### 8. 🏆 华丽结局落幕与结算系统 (Ending & FIN System)
- **AI 智能结局识别与定级**：AI 根据剧情高潮走向自动判定终局，生成专属结局类型：
  - 👑 **`TRUE END`（真结局）**：华丽金光琉璃专属徽章与高光结局标题；
  - 💖 **`HAPPY END`（美满结局）**：樱粉浪漫光晕与温馨大团圆；
  - 🥀 **`BAD END`（沉沦/悲剧结局）**：猩红破碎裂纹与凄美落幕；
  - 🍃 **`NORMAL END`（普通日常结局）**：青蓝清爽微风与余韵悠长。
- **全屏落幕特效与粒子光效**：全屏暗转、金粉粒子漂浮，缓缓浮现 **「—— FIN ——」** 呼吸艺术字。
- **结局历程结算卡片**：展示结局专属 CG、结局诗意评语、经历幕数、关键决策数及羁绊角色统计。
- **二周目轮回与存档回溯**：提供【开启新的轮回 (二周目)】、【读取存档重选关键分支】、【查看故事树图】等结算选项，并将结局持久化收录进成就库。

---

### 9. 🖼️ 素材管理库 (Asset Library)
- **角色立绘库**：按角色查看所有表情差分立绘，支持单独生成、批量全量生成与原图大图全屏预览。
- **场景背景库**：集中展示游戏中生成的所有场景背景图，悬浮展示提示词（Prompt），支持一键全屏检视。

---

## 📁 目录结构

```text
AI-Galgame/
├── assets/                    # 软件图标与通用静态资源
│   ├── icon.ico              # Windows 可执行程序图标
│   ├── icon.icns             # macOS 应用图标
│   └── icon.png              # Linux / 网页端图标
├── dist/                      # 构建打包产物目录 (.exe, win-unpacked)
├── src/
│   ├── main.js                # Electron 主进程 (窗口管理、IPC 通信、存储分发)
│   ├── preload.js             # 预加载脚本 (安全暴露 window.electronAPI 接口)
│   └── renderer/              # 渲染进程前端代码
│       ├── index.html         # 游戏主界面 (包含主页网格、游戏舞台、12槽位存档面板)
│       ├── settings.html      # 系统与 AI 设置面板
│       ├── styles/            # 样式文件目录
│       │   ├── main.css       # 游戏核心样式 (立绘图层、对话框、HUD、存档面板)
│       │   └── settings.css   # 设置面板样式
│       └── js/                # 核心业务模块
│           ├── main.js        # 主界面控制器、素材库管理、表情差分批量生成
│           ├── game-engine.js # 游戏引擎 (长篇对白Beat播放、Ctrl快进、多槽位存档、预载)
│           ├── ai-service.js   # AI 服务 (多协议适配、JSON多层自愈修复、GPT透明提示词)
│           ├── project-manager.js # 项目生命周期、时间线存档、读取/写入 characters.json
│           ├── settings.js    # 设置面板控制器 (实时自动保存、API 测试诊断)
│           ├── background-manager.js # 主页动态背景生成器
│           ├── iot-manager.js # IoT 设备通讯管理器
│           ├── path-utils.js  # 本地文件路径与 file:// 协议转换工具
│           ├── timeline.js    # 交互式时间线视图渲染
│           └── utils.js       # 通用工具函数 (透明抠图、模态框、通知)
├── package.json               # 项目依赖与 electron-builder 构建配置
└── README.md                  # 项目开发与使用文档
```

---

## 🛠️ 项目环境搭建与运行

### 1. 环境要求
- **Node.js**: `v18.0.0` 或更高版本
- **npm**: `v9.0.0` 或更高版本

### 2. 安装依赖

```bash
npm install
```

### 3. 开发模式启动

```bash
npm start
# 或
npm run dev
```

启动后将自动打开游戏主窗口：
- 按 **<kbd>Ctrl</kbd> + <kbd>R</kbd>** 可热刷新前端代码；
- 按 **<kbd>F12</kbd>** 可打开开发者工具控制台查看实时日志。

---

## 📦 应用构建打包 (Windows `.exe`)

```bash
# 编译打包 Windows x64 版本
npm run build -- --win --x64
```

打包完成后产物位于 `dist/` 目录下：
1. **安装程序**：`dist/ArtiMeow AI GalGamer RT Setup 1.2.0.exe` (NSIS 安装包)
2. **绿色免安装版**：`dist/win-unpacked/ArtiMeow AI GalGamer RT.exe` (解压直接运行)

---

## 📄 数据结构规范

每个游戏项目存放在项目工作区中，包含以下标准文件结构：

### 1. 角色库定义文件 (`characters.json`)
```json
{
  "characters": {
    "char_miyuki": {
      "id": "char_miyuki",
      "name": "曾根美雪",
      "summary": "才色兼备的优等生，演剧部部员",
      "visualPrompt": "17yo anime girl, long dark brown hair, amber eyes, school uniform, delicate features",
      "spriteUrl": "assets/sprite_曾根美雪_neutral.png",
      "expressions": {
        "neutral": "assets/sprite_曾根美雪_neutral.png",
        "happy": "assets/sprite_曾根美雪_happy.png",
        "blushing": "assets/sprite_曾根美雪_blushing.png",
        "sad": "assets/sprite_曾根美雪_sad.png",
        "angry": "assets/sprite_曾根美雪_angry.png",
        "surprised": "assets/sprite_曾根美雪_surprised.png",
        "thinking": "assets/sprite_曾根美雪_thinking.png",
        "smug": "assets/sprite_曾根美雪_smug.png"
      }
    }
  }
}
```

### 2. 存档槽位数据结构 (`saves/slot_1.json` / `saves/quick_save.json`)
```json
{
  "slotId": 1,
  "savedAt": "2026-08-30T22:30:00.000Z",
  "dialogueSnippet": "「放学后一起去天台吹吹风吧。」",
  "speaker": "曾根美雪",
  "speakerEmotion": "happy",
  "backgroundUrl": "assets/background_classroom_sunset.png",
  "timelineNode": { ... },
  "knowledgeBase": { ... },
  "characters": { ... },
  "dialogues": [ ... ],
  "activeBeatIndex": 3
}
```

---

## 📜 开源协议

本项目基于 [B5-Software Free and Open Knowledge Public License](LICENSE.md) 开源。


