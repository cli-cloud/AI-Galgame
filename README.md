# ArtiMeow AI GalGamer RT

> 基于 **Electron** + **实时 AIGC** 的交互式视觉小说游戏引擎 / GalGame 框架

![ArtiMeow AI GalGamer RT](assets/icon.png)

ArtiMeow AI GalGamer RT 是一个高度可扩展的 GalGame 游戏框架。项目融合了 **LLM 文本生成**、**AI 图像生成**、**立绘与场景解耦渲染**、**固定角色视觉锚点** 以及 **IoT 实时生理数据感知**（心率/SRI），为玩家与开发者提供真正具有分支推演能力与沉浸感的故事生成体验。

---

## 🌟 核心特性

### 1. 🎬 立绘与背景解耦 + 说话角色高亮聚焦
- **解耦图层**：背景图层（`#game-background`）与独立角色立绘图层（`#character-layer`）彻底解耦，AI 可分别生成纯风景背景图与独立角色图。
- **动态说话高亮**：对白播放时，系统自动识别当前说话角色（`speaker`）：
  - **说话角色（Speaking）**：立绘自动**放大 1.12 倍**、向上升起浮现、提升亮度和对比度，并放置在最顶层（`z-index: 10`），显示角色姓名浮动框。
  - **未说话角色（Inactive）**：自动缩小至 **0.95 倍**、亮度降低并进行 20% 灰度沉降，退居背景层（`z-index: 5`）。
- **保底二次元立绘**：当 PNG 角色透明图尚未下载或生成完成时，自动渲染带有角色配色与名字徽章的 SVG 矢量立绘。

### 2. 🎨 固定角色造型锁定锚点（Character Visual Anchors）
- **持久化角色库（`characters.json`）**：自动锁定主角、女主及 NPC 的外观特征描述词（`visualPrompt`）。
- **造型稳定**：后续生成任何章节剧情或场景描述时，引擎强制将锁定的角色外观特征送入 AI，防止角色的发型、发色、瞳色、服装等造型在不同场景中随机飘忽变动。

### 3. 🤖 多 AI 模型协议全覆盖
支持目前主流的各种在线大模型与本地开源大模型 API：
- **OpenAI**：`gpt-4o-mini`, `gpt-4o`, `dall-e-3` (兼容 `/chat/completions`)
- **Claude (Anthropic)**：`claude-3-5-sonnet-20241022` (原生支持 `/messages` 接口与 `x-api-key`)
- **Google Gemini**：`gemini-2.0-flash`, `gemini-1.5-pro` (原生支持 `/models/{model}:generateContent`)
- **Ollama**：`qwen2.5`, `llama3` (本地免 Key 部署，`/api/generate`)
- **llama.cpp**：`/completion` 本地推理服务
- **Custom API**：兼容任何第三方 OpenAI 格式中转 API

### 4. 🔍 智能 API 测试与诊断系统
点击设置面板中的“测试文本 API”或“测试图像 API”时，系统提供精准诊断：
- **网络连接故障**：DNS 失败、拒绝连接（ECONNREFUSED）、代理/VPN 拦截。
- **API Key 认证失败**：HTTP 401 / 403 秘钥错误、过期或无访问权限。
- **模型/路径错误**：HTTP 404 / 400 模型不存在或拼写错误。
- **频次/额度限制**：HTTP 429 频率过高或账户余额不足。
- **真实数据校验与预览**：测试成功后回显并校验**真实返回的生成文本**或**图像 URL 预览**。

### 5. ⚡ 实时防抖自动保存与预设分发
- **实时自动保存**：在设置界面中填写 API Key、URL 或模型名称时，输入停止 300ms 后或输入框失焦时自动进行保存。
- **预设自动填充**：切换 API 类型时自动填充对应服务商的默认 URL 与最佳推荐模型。

### 6. ❤️ IoT 实时生理数据感知 (IoT Integration)
- 支持蓝牙 BLE / 串口连接心率手环或 SRI 测谎设备，将玩家实时的生理数据融入 AI 逻辑中，动态调整故事刺激程度、浪漫尺度与剧情节奏。

### 7. 📜 交互式时间线与无损备份
- 树状时间线节点管理，支持在任意分支节点进行检查点存档、历史回档与无损分支备份。

---

## 📁 目录结构

```text
ArtiMeow-AIGalGamerRT/
├── assets/                    # 软件图标与通用静态资源
│   ├── icon.ico              # Windows 可执行程序图标
│   ├── icon.icns             # macOS 应用图标
│   └── icon.png              # Linux / 网页端图标
├── dist/                      # 构建打包产物输出目录 (.exe, win-unpacked)
├── scripts/
│   └── postinstall.js        # npm install 后的 Electron 解压与二进制路径修正脚本
├── src/
│   ├── main.js                # Electron 主进程 (窗口管理、IPC 通信、存储分发)
│   ├── preload.js             # 预加载脚本 (安全暴露 window.electronAPI 接口)
│   └── renderer/              # 渲染进程前端代码
│       ├── index.html         # 游戏主界面 (包含主页卡片网格与游戏舞台)
│       ├── settings.html      # 系统与 AI 设置面板
│       ├── styles/            # 样式文件目录
│       │   ├── main.css       # 游戏核心样式 (包含 .character-layer 与视效动画)
│       │   └── settings.css   # 设置面板样式
│       └── js/                # 核心逻辑模块
│           ├── main.js        # 主界面初始化与事件绑定
│           ├── game-engine.js # 游戏引擎 (打字机效果、对话渲染、说话角色高亮)
│           ├── ai-service.js   # AI 服务 (文本生成、图像生成、多协议兼容、诊断)
│           ├── project-manager.js # 项目生命周期、时间线存档、读取/写入 characters.json
│           ├── settings.js    # 设置面板控制器 (实时自动保存、预设切换、API 测试)
│           ├── background-manager.js # 主页动态背景生成器
│           ├── iot-manager.js # IoT 设备通讯管理器
│           ├── path-utils.js  # 本地文件路径与 file:// 协议转换工具
│           ├── timeline.js    # 时间线视图渲染
│           └── utils.js       # 通用工具函数 (模态框、防抖、通知)
├── package.json               # 项目依赖、electron-builder 构建配置与 allowScripts
└── README.md                  # 开发与使用文档
```

---

## 🛠️ 项目环境搭建

### 1. 环境要求
- **Node.js**: `v18.0.0` 或更高版本
- **npm**: `v9.0.0` 或更高版本

### 2. 安装依赖
由于 Electron 38 及原生 C++ 模块（如 `@serialport/bindings-cpp`）需要脚本执行权限，在 package.json 中配置了 `allowScripts`：

```bash
npm install
```

> **注意**：`npm install` 完成后，系统会自动运行 `scripts/postinstall.js` 确保 Electron 可执行文件完全解压并清理 `path.txt` 中的换行符。

### 3. 开发模式启动

```bash
npm run dev
```

启动后将自动弹出 Electron 游戏主界面，按 `F12` 可打开开发者工具查看控制台输出（带 `[AIService]`、`[GameEngine]` 前缀的日志）。

---

## 📦 应用打包 (打包为 Windows `.exe`)

项目已配置好跨平台打包参数（使用 `electron-builder`，且已开启 `"npmRebuild": false` 以防止在 macOS 上交叉编译 Windows C++ 原生模块报错）。

### 构建 Windows .exe 安装包与绿色免安装版

在 macOS 或 Windows 环境下执行：

```bash
# 编译打包 Windows x64 版本
npm run build -- --win --x64
```

打包完成后，产物将生成在 `dist/` 文件夹中：
1. **Windows 安装程序**：`dist/ArtiMeow AI GalGamer RT Setup 1.2.0.exe` (NSIS 安装包)
2. **Windows 绿色免安装版**：`dist/win-unpacked/ArtiMeow AI GalGamer RT.exe` (解压即可运行)

---

## 📄 数据结构说明

每个游戏项目存放在用户数据目录中，包含以下标准文件结构：

### 1. 角色定义文件 (`characters.json`)
```json
{
  "characters": {
    "char_sakura": {
      "id": "char_sakura",
      "name": "樱",
      "summary": "男主角的青梅竹马，性格活泼开朗",
      "visualPrompt": "17yo anime girl, long pink hair with red hair ribbon, amber eyes, blue sailor school uniform",
      "avatarUrl": "assets/sprites/char_sakura.png",
      "tags": ["青梅竹马", "学生"],
      "metadata": { "身份": "高二学生" }
    }
  }
}
```

### 2. 时间线节点格式 (`timeline/node_xxx.json`)
```json
{
  "id": "node_1693000000000",
  "timestamp": 1693000000000,
  "content": {
    "dialogue": "今天的天气真好啊，要一起去图书馆吗？",
    "speaker": "樱",
    "activeCharacters": [
      { "name": "樱", "position": "center", "expression": "happy" }
    ],
    "backgroundPrompt": "sunset empty anime classroom, highly detailed, warm ambient lighting, no characters",
    "backgroundUrl": "assets/background_1693000000000.png",
    "choices": [
      { "id": 1, "text": "好啊，刚好想借几本书", "action": "continue" },
      { "id": 2, "text": "抱歉，今天社团有活动", "action": "continue" }
    ],
    "chapterSummary": "放学后的教室放学邀请"
  }
}
```

---

## 📄 许可证

本项目基于 **B5-Software Free and Open Knowledge Public License Version 1.0-Permissive** 开源许可。

B5-Software Team 版权所有。
