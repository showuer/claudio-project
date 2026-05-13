# Claudio 私人 AI 电台 — 完整设计规范 & 架构文档

> 版本 v1.0 · 2026-05-13
> 融合 mmguo Claudio FM · hllqkb/Claudio · veilledio · MoeKoeMusic · Nothing Design

---

## 一、总体产品定义

Claudio 是一个本地私有化 AI 音乐电台。核心逻辑：**读懂听歌习惯 → 规划声音内容 → 像 DJ 那样播报**。

它不是播放器，是一个真的在陪你听歌的 AI DJ。

### 核心能力
1. 用户与 AI DJ **自然语言对话**，DJ 根据天气/时间/品味/心情选歌并写串词
2. 串词经 TTS 合成为语音播报，**逐词高亮同步**
3. 网易云音乐官方 API 驱动歌曲搜索与播放
4. 歌单管理、听歌统计、品味档案编辑
5. 深色/浅色双主题，默认深色

---

## 二、视觉设计体系（Visual Design System）

### 2.1 设计哲学（Nothing Design）

```
- Subtract, don't add.         每个像素都要挣到自己的位置
- Structure is ornament.       网格、数据、层级本身就是装饰
- Monochrome is the canvas.    色彩是事件，不是默认
- Type does the heavy lifting. 字体做重活：大小、字重、间距创造层级
- Industrial warmth.           技术感与精密，但不冷酷
```

### 2.2 配色方案

```css
/* 深色模式（默认） */
--bg-stage:         #000000;    /* OLED 纯黑舞台背景 */
--bg-card:          #0d0d0f;    /* 卡片/面板底色（深灰） */
--bg-surface:       #141417;    /* 浮层/输入框底色 */
--bg-transcript:    #0f0f11;    /* 对话区底色 */

--text-display:     #ffffff;    /* 主标题/核心数字 (100%) */
--text-primary:     #e0e0e0;    /* 正文 (90%) */
--text-secondary:   #808080;    /* 标签/元数据 (60%) */
--text-disabled:    #444444;    /* 禁用/时间戳 (40%) */

--accent-neon:      #29ffb8;    /* 霓虹绿 — ON AIR 灯 / 当前词高亮 / 播放进度 */
--accent-blue-glow: rgba(41,143,255,0.25); /* 微弱蓝色边缘溢光 */
--accent-red:       #D71921;    /* 仅用于中断/紧急提示 */

--border-subtle:    rgba(255,255,255,0.06);
--border-card:      rgba(255,255,255,0.04);
```

### 2.3 字体系统

| 用途 | 字体 | 字重 | 示例 |
|:---|:---|:---|:---|
| 核心数字 / 标题 | **Doto** | 400 / 600 | 电台名、统计数字、进度时间 |
| 正文 / 对话 | **Inter** | 400 / 500 | 聊天消息、歌曲名、设置标签 |
| 导航 / 标签 | **Space Grotesk** | 300 | 顶部导航、分类标签、ALL CAPS |

```html
<!-- Google Fonts 加载 -->
<link href="https://fonts.googleapis.com/css2?family=Doto:wght@400;600&family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@300;400&display=swap" rel="stylesheet">
```

### 2.4 三层层级规则

| 层 | 内容 | 实现 |
|:---|:---|:---|
| **Primary** | 歌曲名 / 核心统计数字 | Doto 或 Inter 600, 30-48px, `--text-display` |
| **Secondary** | 歌手名 / 对话正文 / 设置标签 | Inter 400, 14-16px, `--text-primary` |
| **Tertiary** | 元数据 / 时间戳 / 导航 | Space Grotesk 300 ALL CAPS, 11-12px, `--text-secondary` |

### 2.5 间距系统

```
Tight (4–8px)   = 归属关系 (图标+文字, 数字+单位)
Medium (16px)    = 同组隔离 (列表项, 表单行)
Wide (32–48px)   = 段落分割 (区块切换)
Vast (64–96px)   = 上下文切换 (Hero 到内容, 主分割)
```

### 2.6 禁止事项

- 禁止渐变（UI chrome 中）；禁止阴影、模糊
- 禁止骨架屏 loading，用 `[LOADING...]` 文字
- 禁止 toast 弹窗，用内联状态文字 `[SAVED]` / `[ERROR: ...]`
- 禁止 emoji 作为 UI 图标
- 禁止 border-radius > 16px（卡片除外，卡片可用 28px）
- 按钮：pill 形 (999px) 或 technical (4-8px)
- 禁止 spring/bounce 动效，只用 subtle ease-out

---

## 三、前端架构

### 3.1 页面路由

```
/             → PlayerPage     ① 播放器主页
/chat         → ChatPage       ② AI 对话
/playlists    → PlaylistsPage  ③ 歌单管理
/profile      → ProfilePage    ④ 个人中心
/settings     → SettingsPage   ⑤ 设置
```

### 3.2 组件树

```
<App>                                      // 根组件, 主题 Provider
├── <Stage>                                // 全屏黑色背景 (#000000)
│   ├── <FluidBlob color="blue" />        // oklch 蓝色流体光晕 (微弱)
│   ├── <FluidBlob color="violet" />      // 紫色流体光晕
│   ├── <FluidBlob color="accent" />      // 霓虹绿微光
│   ├── <BgNoise />                       // SVG 噪点纹理 overlay
│   └── <EdgeGlow />                      // 微弱蓝色边缘溢光
│
├── <TopNav>                              // 顶部导航 (Space Grotesk, 300)
│   └── NavLink ×5 (PLAYER · CHAT · PLAYLISTS · PROFILE · SETTINGS)
│
├── <Card>                                // 中央卡片容器 (max-w-[616px])
│   ├── <CardHeader>                      // 卡片头部
│   │   ├── .station-name (Doto 32px)
│   │   ├── <Avatar />                   // 圆形 DJ 头像
│   │   ├── <OnAirIndicator />           // ON AIR 标志 + 呼吸绿点
│   │   ├── .clock (实时时钟, Inter 15px)
│   │   └── <WaveformCanvas />           // Canvas 动态波形图
│   │
│   ├── <Router outlet>                   // 页面内容区
│   │   ├── [PlayerPage]                 // 见 3.3
│   │   ├── [ChatPage]                   // 见 3.4
│   │   ├── [PlaylistsPage]              // 见 3.5
│   │   ├── [ProfilePage]                // 见 3.6
│   │   └── [SettingsPage]               // 见 3.7
│   │
│   └── <PlayerBar>                      // 底部全局播放控制条
│       ├── .current-time (Doto, 13px)
│       ├── <ThinProgressBar />          // 极致纤细进度条 (2px)
│       ├── .total-time (Doto, 13px)
│       └── <PlayButton />              // 圆形黑底播放按钮
│
└── <TweaksPanel>                        // 右下浮动调节面板 (毛玻璃)
    ├── 音量滑块
    └── 主题色快捷切换
```

### 3.3 PlayerPage（① 播放器主页）

```
┌ Card Body ──────────────────────────────────────────────┐
│                                                          │
│  ┌ Meta Section ──────────────────────────────────────┐ │
│  │  歌曲封面 (可选, 缩略图 80×80)                      │ │
│  │  歌曲名 (Inter 600, 30px, --text-display)          │ │
│  │  歌手 · 来源 (Inter 400, 12px, --text-secondary)   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌ Transcript 区 (--bg-transcript, 圆角 12px) ────────┐ │
│  │  [DJ 头像 28px]                                     │ │
│  │  早上好，今天上海 18°C 小雨，                          │ │
│  │  我看你刚结束了两个小时的工作，                         │ │
│  │  来点轻松的爵士换换脑子吧 ☕                           │ │
│  │  (逐词 TTS 高亮: 已播=white, 当前=neon-green-bg,     │ │
│  │   未播=--text-secondary)                              │ │
│  │                                                      │ │
│  │  底部 40px 渐变淡出遮罩                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌ Mini Player ───────────────────────────────────────┐ │
│  │  [▶] ═══════════════○═══════  1:23 / 4:05          │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 3.4 ChatPage（② AI 对话 — 核心页面）

```
┌ Card Body ──────────────────────────────────────────────┐
│                                                          │
│  ┌ 动态频率波形图 (Canvas) ────────────────────────────┐ │
│  │  ▂▃▅▇█▇▅▃▂▁▂▃▅▇█▇▅▃▂▁▂▃▅▇█▇▅▃▂                   │ │
│  │  60-120 根细线, 中间=低频/外侧=高频                   │ │
│  │  颜色: --accent-neon #29ffb8                         │ │
│  │  仅在播放时活跃, 暂停时静止为微弱的直线               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌ ON AIR 呼吸灯 ──────────────────────────────────────┐ │
│  │  ● ON AIR   (绿点 pulse 动画 1.2s, #29ffb8 光晕)    │ │
│  │  Doto 字体 12px, letter-spacing:0.3em               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌ 消息列表 (flex:1, overflow-y:auto) ─────────────────┐ │
│  │                                                      │ │
│  │  ┌ DJ 消息 (左对齐) ────────────────────────────┐   │ │
│  │  │ [头像 28px]  11:30                            │   │ │
│  │  │ ┌──────────────────────────────────────┐     │   │ │
│  │  │ │ 下午好，看你刚结束了两个小时的工作，  │     │   │ │
│  │  │ │ 来点轻松的爵士换换脑子吧             │     │   │ │
│  │  │ └──────────────────────────────────────┘     │   │ │
│  │  │ 已播报 ✓                                    │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                                                      │ │
│  │  ┌ 用户消息 (右对齐) ──────────────────────────┐   │ │
│  │  │                          (头像)  11:31       │   │ │
│  │  │     ┌──────────────────────────────┐        │   │ │
│  │  │     │ 换点更安静的吧，我刚准备午休  │        │   │ │
│  │  │     └──────────────────────────────┘        │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌ 输入区 ────────────────────────────────────────────┐ │
│  │  [早安电台] [写代码] [午休] [下雨天] [下班放松]    │ │
│  │  ┌──────────────────────────────────────┐ [→ 发送] │ │
│  │  │ 输入你想听的，或告诉 DJ 你的状态...   │          │ │
│  │  └──────────────────────────────────────┘          │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Chat 交互细节：**

| 状态 | 气泡表现 |
|:---|:---|
| **用户发送中** | 立即显示，opacity 1.0，右侧 |
| **DJ 思考中** | 左侧显示 `[···thinking···]` ，Doto 字体闪烁 |
| **DJ 流式返回** | SSE 逐 token 追加，气泡实时增长 |
| **TTS 合成中** | 气泡底部显示 `[synthesizing...]` |
| **TTS 播报中** | 气泡逐词高亮（`.word.current` = neon green bg） |
| **播报完成** | 显示 `已播报 ✓` |
| **错误** | 红色 `[ERROR: 请重试]` |

### 3.5 PlaylistsPage（③ 歌单管理）

```
┌ Card Body ──────────────────────────────────────────────┐
│  标题: MY PLAYLISTS (Space Grotesk, ALL CAPS, 12px)     │
│                                                          │
│  ┌ 歌单网格 (2列, gap 16px) ──────────────────────────┐ │
│  │ ┌──────────────┐  ┌──────────────┐                  │ │
│  │ │ 封面 (正方形) │  │ 封面         │                  │ │
│  │ │ 歌单名        │  │ 歌单名       │                  │ │
│  │ │ 128 首       │  │ 64 首        │                  │ │
│  │ └──────────────┘  └──────────────┘                  │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  点击展开 → 歌曲列表 (表格行)                             │
│  ┌ # │ 歌名 │ 歌手 │ 专辑 │ 时长 ──────────────────┐    │
│  │ 1 │ ... │ ... │ ... │ 3:21                    │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### 3.6 ProfilePage（④ 个人中心）

```
┌ Card Body ──────────────────────────────────────────────┐
│  头像 + 用户名                                           │
│                                                          │
│  ┌ 统计卡片 (3列, gap 12px) ──────────────────────────┐ │
│  │ ┌───────────┐ ┌───────────┐ ┌───────────┐         │ │
│  │ │ LISTENING │ │ TOP ARTIST│ │ PEAK TIME │         │ │
│  │ │  1,361h   │ │   张杰    │ │  22:00    │         │ │
│  │ │ (Doto 48) │ │           │ │ (Doto 24) │         │ │
│  │ └───────────┘ └───────────┘ └───────────┘         │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌ 品味档案编辑器 ────────────────────────────────────┐ │
│  │ ┌──────────────────────────────────────────────┐   │ │
│  │ │ # 我的音乐品味                                │   │ │
│  │ │ ## 喜欢的风格                                  │   │ │
│  │ │ - 轻音乐、钢琴、爵士...                        │   │ │
│  │ │ ## 不喜欢的                                    │   │ │
│  │ │ - 过于吵闹的电子音乐                           │   │ │
│  │ │ ## 时间偏好                                    │   │ │
│  │ │ - 早上：轻快、积极                             │   │ │
│  │ │ - 深夜：慢、孤独但温暖                         │   │ │
│  │ └──────────────────────────────────────────────┘   │ │
│  │ [SAVED] (保存成功后的内联状态提示)                 │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 3.7 SettingsPage（⑤ 设置）

```
┌ Card Body ──────────────────────────────────────────────┐
│  标题: SETTINGS (Space Grotesk, ALL CAPS, 12px)         │
│                                                          │
│  ┌ 设置项列表 ────────────────────────────────────────┐ │
│  │  TTS VOICE      MIMO API · Configured        →     │ │
│  │  AI MODEL       DeepSeek · Configured        →     │ │
│  │  NETEASE        Official API · Configured    →     │ │
│  │  WEATHER        HeFeng · Configured          →     │ │
│  │  STATION NAME   Claudio FM                   →     │ │
│  │  ACCENT COLOR   #29ffb8                      →     │ │
│  │  THEME          Dark / Light                 →     │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  [RESTORE DEFAULTS] (--accent-red 文字)                  │
│  © Claudio FM · v1.0.0                                  │
└──────────────────────────────────────────────────────────┘
```

### 3.8 特殊组件规格

**ON AIR 呼吸灯：**
```css
.on-air-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #29ffb8;
  box-shadow: 0 0 6px rgba(41,255,184,0.6), 0 0 16px rgba(41,255,184,0.2);
  animation: breathe 1.2s ease-in-out infinite;
}
@keyframes breathe {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50%      { opacity: 1;   transform: scale(1.2); }
}
```

**极致纤细进度条：**
```css
.progress-bar {
  height: 2px;
  background: rgba(255,255,255,0.08);
  border-radius: 999px;
  cursor: pointer;
}
.progress-fill {
  height: 2px;
  background: #29ffb8;
  border-radius: 999px;
  transition: width 0.1s linear;
}
```

**动态频率波形图 (Canvas)：**
```
实现方案：
- 60-120 根垂直细线 (1-2px 宽)
- 中间 = 低频 (振幅最大), 外侧 = 高频 (振幅衰减)
- 使用 AnalyserNode.getByteFrequencyData() 驱动
- 颜色: #29ffb8, 透明度随高度变化
- 播放时活跃, 暂停时显示为微弱水平线 (~10% 高度)
- requestAnimationFrame 驱动, 每帧更新
- 上升快 (attack 0.9), 下降慢 (release 0.15)
```

**Stage 背景流体光晕：**
```css
/* 3 个光晕, 使用 oklch 色彩空间 */
.fluid-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(140px);
  opacity: 0.35;
  mix-blend-mode: screen;
  pointer-events: none;
}
/* 蓝: oklch(0.62 0.17 256) → 微弱的蓝紫色边缘溢光 */
/* 品红: oklch(0.50 0.18 325) → 保持氛围层次 */
/* 绿: oklch(0.65 0.18 165) → 呼应霓虹绿 accent */
/* 动画时长: 26s / 34s / 42s, cubic-bezier(.45,.05,.55,.95) */
```

---

## 四、后端架构

### 4.1 四层架构（Claudio 原始 + 改造）

```
┌──────────────────────────────────────────────────────────────────┐
│                    第四层：交互表层 (Interaction)                   │
│  PWA Frontend (Vite + React 19 + TS)                              │
│  HTTP REST (JSON) + WebSocket (实时推送)                           │
│  API 路由: /chat /player /playlist /profile /settings /stream     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│                    第三层：运行时聚合 (Runtime Aggregation)         │
│  每次 AI 对话触发:                                                 │
│    Context Window 组装 → DeepSeek 前向 → JSON 解析                │
│    → TTS 合成 → WebSocket push {say, tts_url, play[]}            │
│    → 播放队列更新                                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│                    第二层：本地大脑 (Local Brain)                   │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│  │ ROUTER.ts │→│CONTEXT.ts │→│DEEPSEEK  │ │SCHEDULER │ │TTS.ts │ │
│  │ 意图分流   │ │ 提示词组装│ │  AI适配器│ │ 定时调度  │ │语音合成│ │
│  └───────────┘ └──────────┘ └──────────┘ └──────────┘ └───────┘ │
│                       STATE.DB (SQLite)                            │
│  messages · plays · playlists · settings · queue                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│                    第一层：外部上下文 (External Context)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│  │ 用户画像  │ │ DeepSeek │ │ 网易云    │ │ 和风天气  │ │ MIMO  │ │
│  │ taste.md │ │  API     │ │ 官方API  │ │  API     │ │ TTS   │ │
│  │routines.md│ │          │ │          │ │          │ │       │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 后端路由表

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|:---|:---|:---|:---|:---|
| `GET` | `/api/health` | 健康检查 | - | `{ok:true, uptime}` |
| `GET` | `/api/now` | 当前播放状态 | - | `{nowPlaying, queue, isPlaying, progressMs}` |
| `POST` | `/api/chat` | AI 对话 (SSE 流式) | `{message:string}` | SSE stream |
| `GET` | `/api/chat/history` | 对话历史 | `?limit=50` | `{messages[]}` |
| `GET` | `/api/player/queue` | 获取播放队列 | - | `{queue[]}` |
| `POST` | `/api/player/play` | 播放/恢复 | `{songId?}` | `{success}` |
| `POST` | `/api/player/pause` | 暂停 | - | `{success}` |
| `POST` | `/api/player/next` | 下一首 | - | `{success}` |
| `POST` | `/api/player/prev` | 上一首 | - | `{success}` |
| `POST` | `/api/player/seek` | 跳转进度 | `{positionMs}` | `{success}` |
| `GET` | `/api/stream/:songId` | 音频流代理 | - | audio/mpeg stream |
| `GET` | `/api/search` | 搜索歌曲 | `?keyword=&limit=10` | `{results[]}` |
| `GET` | `/api/playlists` | 歌单列表 | - | `{playlists[]}` |
| `GET` | `/api/playlists/:id` | 歌单详情+歌曲 | - | `{playlist, songs[]}` |
| `POST` | `/api/playlists/sync` | 同步网易云歌单 | - | `{imported}` |
| `GET` | `/api/profile` | 听歌统计 | - | `{totalHours, topArtists, peakTime, ...}` |
| `GET` | `/api/profile/taste` | 获取 taste.md | - | `{content}` |
| `PUT` | `/api/profile/taste` | 保存 taste.md | `{content}` | `{saved}` |
| `GET` | `/api/settings` | 获取设置 (脱敏) | - | `{settings}` |
| `PUT` | `/api/settings` | 更新设置 | `{key, value}` | `{updated}` |

### 4.3 核心服务详解

#### 4.3.1 ROUTER.ts — 意图分流

```
输入: 用户消息文本
       │
       ├── 关键词匹配? (播放/暂停/下一首/上一首/音量...)
       │   └── YES → 直接执行播放控制, 不调用 AI
       │
       ├── 歌曲搜索关键词? (搜索/找歌/有没有...)
       │   └── YES → 调用 NCM search, 返回结果列表
       │
       └── 自然语言 (默认)
           └── → 走 DeepSeek 完整流程
```

#### 4.3.2 CONTEXT.ts — 提示词组装

```typescript
// 每次调用 DeepSeek 前, 组装 6 个上下文片段
interface ContextWindow {
  // 片段 1: DJ 人设系统提示词
  systemPrompt: string;

  // 片段 2: 用户品味语料 (taste.md 全文 + routines.md)
  userCorpus: string;

  // 片段 3: 环境注入
  environment: {
    weather: string;      // 和风天气返回: "上海 18°C 小雨"
    time: string;         // "2026-05-13 14:30 周三"
    season: string;       // "春季"
  };

  // 片段 4: 状态记忆
  stateMemory: {
    recentPlays: Song[];   // 最近 20 首播放记录
    skipped: string[];     // 最近跳过的歌曲 ID
    currentQueue: Song[];  // 当前队列
    favorites: string[];   // 收藏歌曲
  };

  // 片段 5: 用户输入
  userMessage: string;

  // 片段 6: 候选歌曲池
  candidatePool: CandidateSong[];  // 从歌单随机抽 200 首
}
```

#### 4.3.3 DEEPSEEK.ts — AI 适配器

```typescript
// DeepSeek API 调用配置
const DEEPSEEK_CONFIG = {
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-chat',
  max_tokens: 4096,
  temperature: 0.7,
  response_format: { type: 'json_object' },  // JSON 模式
  stream: true,                                // SSE 流式
  timeout: 60000,                              // 60s 超时
  retry: 2,                                    // 失败重试 2 次
};

// 期望的输出结构
interface DeepSeekOutput {
  say: string;                // DJ 串词文本 (2-4句)
  play: Array<{               // 选中的歌曲列表 (8-15首)
    id: string;
    name: string;
    artist: string;
    reason?: string;          // 选这首歌的原因 (可选)
  }>;
  segue: string;              // 转场逻辑描述
}
```

**System Prompt 模板：**

```
你是一个私人电台 DJ，叫 Claudio。你不是在"播放音乐"，你是在"陪她听歌"。

## 她的音乐品味
{taste.md 全文}

## 她的作息习惯
{routines.md 全文}

## 当前场景
- 天气: {weather}
- 时间: {time} {weekday}
- 季节: {season}

## 她最近的听歌记录
{recentPlays}

## 你的任务
1. 先读她的品味档案和当前场景，理解她此刻可能需要什么音乐
2. 从候选歌曲中选出 8-15 首最合适的
3. 为这次选歌写一段 2-4 句的串词（say），像朋友聊天一样自然
4. 串词可以提到天气、时间、她最近在听什么、为什么选这些歌

## 规则
- 不要说"为您播放"、"接下来为您带来"之类的套话
- 不要重复使用相同的开场白
- 如果天气特殊（下雨/下雪/高温），一定要提到
- 早上偏轻快，深夜偏安静，下雨天偏民谣/氛围
- 工作时间避免太吵闹的音乐
- 她不喜欢过于吵闹的电子音乐和歌词太过直白煽情的流行歌

## 输出格式
返回严格 JSON，不要加任何额外文字:
{"say":"...","play":[{"id":"...","name":"...","artist":"..."}],"segue":"..."}
```

#### 4.3.4 NCM.ts — 网易云官方 API

```typescript
// 使用网易云开放平台 (developer.music.163.com)
// AppID + PrivateKey 鉴权

interface NcmService {
  // 搜索歌曲
  search(keyword: string, limit?: number): Promise<SearchResult[]>;

  // 获取歌曲详情 (含播放 URL)
  getSongDetail(songId: string): Promise<SongDetail>;

  // 获取歌词
  getLyric(songId: string): Promise<LyricData>;

  // 获取用户歌单列表
  getUserPlaylists(): Promise<Playlist[]>;

  // 获取歌单详情 (含歌曲列表)
  getPlaylistDetail(playlistId: string): Promise<PlaylistDetail>;

  // 获取每日推荐 (需要登录态)
  getDailyRecommend(): Promise<Song[]>;
}
```

#### 4.3.5 TTS.ts — MIMO API

```typescript
// MIMO TTS 语音合成
interface TtsService {
  // 文本转语音, 返回音频 URL 或 base64
  synthesize(text: string, options?: {
    voice?: string;       // 音色 ID
    speed?: number;       // 语速
    format?: 'mp3'|'wav';
  }): Promise<{
    audioUrl: string;     // 本地缓存后的 URL
    duration: number;     // 音频时长 (ms)
  }>;

  // 本地缓存管理
  getCached(textHash: string): string | null;
}
```

#### 4.3.6 WEATHER.ts — 和风天气

```typescript
interface WeatherService {
  getCurrent(): Promise<{
    city: string;
    temp: number;         // 当前温度 °C
    condition: string;    // "小雨" | "晴" | "多云" ...
    humidity: number;     // 湿度 %
    wind: string;         // 风力描述
  }>;

  // 格式化为自然语言
  formatNatural(): string;  // "上海 18°C 小雨"
}
```

#### 4.3.7 SCHEDULER.ts — 定时调度

```typescript
// node-cron 驱动
const schedules = [
  { cron: '0 7 * * *',  action: 'morningGreeting' },   // 07:00 早安
  { cron: '0 12 * * *', action: 'noonUpdate' },         // 12:00 午间
  { cron: '0 18 * * *', action: 'eveningGreeting' },    // 18:00 傍晚
  { cron: '0 22 * * *', action: 'nightWindDown' },      // 22:00 晚安
];

// 每个 action 触发时:
// 1. 组装简化 Context (不含用户输入)
// 2. 调 DeepSeek 生成对应时段的串词
// 3. TTS 合成 → WebSocket 推送到前端
```

---

## 五、WebSocket 实时协议

### 5.1 事件类型

```typescript
// 服务端 → 客户端
type ServerEvent =
  | { type: 'now_playing'; data: { song: Song; progressMs: number } }
  | { type: 'dj_message'; data: { id: string; say: string; ttsUrl: string; play: Song[] } }
  | { type: 'tts_progress'; data: { messageId: string; wordIndex: number } }
  | { type: 'queue_updated'; data: { queue: Song[] } }
  | { type: 'player_state'; data: { isPlaying: boolean; progressMs: number } }
  | { type: 'error'; data: { code: string; message: string } };

// 客户端 → 服务端
type ClientEvent =
  | { type: 'ping' }
  | { type: 'seek'; positionMs: number };
```

### 5.2 连接生命周期

```
客户端连接 → ws://localhost:8080/ws
  │
  ├── 服务端发送 {type:'now_playing', ...} (当前状态快照)
  │
  ├── 每 1s: 服务端推送播放进度 {type:'player_state', ...}
  │
  ├── AI 选歌完成: 服务端推送 {type:'dj_message', ...}
  │
  ├── TTS 播放中: 每词推进时推送 {type:'tts_progress', ...}
  │
  └── 断开: 清理连接, 不影响播放
```

---

## 六、数据流：一次完整的 AI 对话

```
用户在 Chat 页面输入 "下午适合午休的安静钢琴曲"
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: 前端                                               │
│ - ChatInput 捕获文本, onSend(message)                       │
│ - chatStore.addMessage({role:'user', content:message})      │
│ - chatStore.addMessage({role:'dj', status:'thinking'})      │
│ - POST /api/chat {message} (Accept: text/event-stream)      │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: 后端 ROUTER.ts                                     │
│ - 收到 POST /api/chat                                       │
│ - 意图分析: "自然语言" → 走 DeepSeek 路线                    │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: 后端 CONTEXT.ts                                    │
│ - 读取 taste.md + routines.md                                │
│ - 调用 WeatherService.getCurrent() → "上海 18°C 小雨"        │
│ - 查询 plays 表 → 最近 20 首播放记录                         │
│ - 从 library.json 随机抽 200 首候选                          │
│ - 拼装完整 messages[]                                       │
│ - 调用 DeepSeek API (stream:true)                            │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: 后端 DEEPSEEK.ts (SSE 流式)                         │
│ - POST https://api.deepseek.com/chat/completions             │
│ - 逐 chunk 转发给前端 (SSE)                                   │
│ - 解析完整 JSON → {say, play[], segue}                       │
└──────────────────────┬───────────────────────────────────────┘
                       │ (并行)
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ STEP 5a:     │ │STEP 5b:  │ │STEP 5c:      │
│ 前端渲染     │ │TTS 合成  │ │NCM 查询      │
│              │ │          │ │              │
│ SSE 逐字渲染 │ │MIMO API  │ │查每首歌 URL  │
│ DJ 气泡实时  │ │text→MP3  │ │推入播放队列   │
│ 增长         │ │缓存到本地 │ │              │
└──────┬───────┘ └────┬─────┘ └──────┬───────┘
       │              │              │
       └──────────────┼──────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 6: WebSocket 推送                                      │
│ - {type:'dj_message', data:{id, say, ttsUrl, play[]}}       │
│ - {type:'queue_updated', data:{queue}}                       │
│ - {type:'now_playing', data:{song, progressMs:0}}            │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 7: 前端完成                                            │
│ - DJ 气泡显示完成文本, 标记 "已播报 ✓"                       │
│ - TTS 音频自动播放, 逐词高亮同步                              │
│ - 播放队列更新, 开始播放第一首歌                              │
│ - 对话历史存入 messages 表, 刷新不丢                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 七、数据库 Schema

```sql
-- settings: 系统设置 (单行表)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- messages: AI 对话历史
CREATE TABLE messages (
  id        TEXT PRIMARY KEY,
  role      TEXT NOT NULL CHECK(role IN ('user','dj','system')),
  content   TEXT NOT NULL,
  tts_url   TEXT,
  played    INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- playlists: 本地歌单缓存
CREATE TABLE playlists (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  cover_url TEXT,
  song_count INTEGER DEFAULT 0,
  source    TEXT DEFAULT 'ncm',  -- 'ncm' | 'local'
  synced_at TEXT
);

-- playlist_songs: 歌单-歌曲关联
CREATE TABLE playlist_songs (
  playlist_id TEXT NOT NULL,
  song_id     TEXT NOT NULL,
  song_name   TEXT NOT NULL,
  artist      TEXT,
  album       TEXT,
  duration_ms INTEGER,
  position    INTEGER,
  PRIMARY KEY (playlist_id, song_id)
);

-- plays: 播放历史
CREATE TABLE plays (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id   TEXT NOT NULL,
  song_name TEXT NOT NULL,
  artist    TEXT,
  played_at TEXT DEFAULT (datetime('now')),
  skipped   INTEGER DEFAULT 0,
  source    TEXT  -- 'ai_pick' | 'manual' | 'search' | 'schedule'
);

-- favorites: 收藏
CREATE TABLE favorites (
  song_id   TEXT PRIMARY KEY,
  song_name TEXT NOT NULL,
  artist    TEXT,
  added_at  TEXT DEFAULT (datetime('now'))
);

-- queue: 播放队列 (持久化)
CREATE TABLE queue (
  position  INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id   TEXT NOT NULL,
  song_name TEXT NOT NULL,
  artist    TEXT,
  url       TEXT,
  duration_ms INTEGER
);
```

---

## 八、项目目录结构

```
claudio/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts              # Fastify 入口
│   │   │   ├── config.ts             # 环境变量配置
│   │   │   ├── ws.ts                 # WebSocket 管理
│   │   │   ├── routes/
│   │   │   │   ├── health.ts         # GET /api/health
│   │   │   │   ├── chat.ts           # POST /api/chat (SSE)
│   │   │   │   ├── player.ts         # 播放控制
│   │   │   │   ├── stream.ts         # 音频流代理
│   │   │   │   ├── search.ts         # 歌曲搜索
│   │   │   │   ├── playlist.ts       # 歌单 CRUD + 同步
│   │   │   │   ├── profile.ts        # 统计 + taste 读写
│   │   │   │   ├── settings.ts       # 设置读写
│   │   │   │   └── now.ts            # 当前播放状态
│   │   │   ├── services/
│   │   │   │   ├── router.ts         # 意图分流
│   │   │   │   ├── context.ts        # 提示词组装
│   │   │   │   ├── deepseek.ts       # AI 适配器
│   │   │   │   ├── ncm.ts            # 网易云官方 API
│   │   │   │   ├── tts.ts            # MIMO TTS
│   │   │   │   ├── weather.ts        # 和风天气
│   │   │   │   └── scheduler.ts      # 定时调度
│   │   │   ├── db/
│   │   │   │   ├── schema.sql
│   │   │   │   ├── db.ts             # 连接管理
│   │   │   │   ├── messages.repo.ts
│   │   │   │   ├── plays.repo.ts
│   │   │   │   ├── playlist.repo.ts
│   │   │   │   ├── settings.repo.ts
│   │   │   │   └── queue.repo.ts
│   │   │   └── prompts/
│   │   │       └── system.md         # DeepSeek System Prompt 模板
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── PlayerPage.tsx
│       │   │   ├── ChatPage.tsx
│       │   │   ├── PlaylistsPage.tsx
│       │   │   ├── ProfilePage.tsx
│       │   │   └── SettingsPage.tsx
│       │   ├── components/
│       │   │   ├── Stage.tsx              # 全屏黑色背景
│       │   │   ├── FluidBlob.tsx          # 流体光晕
│       │   │   ├── BgNoise.tsx            # 噪点纹理
│       │   │   ├── EdgeGlow.tsx           # 蓝色边缘溢光
│       │   │   ├── Card.tsx               # 中央卡片容器
│       │   │   ├── CardHeader.tsx         # 卡片头部
│       │   │   ├── OnAirIndicator.tsx     # ON AIR 呼吸灯
│       │   │   ├── WaveformCanvas.tsx     # Canvas 动态波形
│       │   │   ├── TopNav.tsx             # 顶部导航
│       │   │   ├── PlayerBar.tsx          # 底部播放条
│       │   │   ├── ThinProgressBar.tsx    # 极致纤细进度条
│       │   │   ├── Transcript.tsx         # AI 串词逐词展示
│       │   │   ├── ChatBubble.tsx         # 对话气泡
│       │   │   ├── ChatInput.tsx          # 输入框 + 快捷标签
│       │   │   ├── MessageList.tsx        # 消息列表容器
│       │   │   ├── PlaylistGrid.tsx       # 歌单网格
│       │   │   ├── SongRow.tsx            # 歌曲行
│       │   │   ├── StatCard.tsx           # 统计卡片
│       │   │   ├── TasteEditor.tsx        # 品味档案编辑器
│       │   │   ├── SettingsRow.tsx        # 设置项行
│       │   │   └── TweaksPanel.tsx        # 浮动调节面板
│       │   ├── stores/
│       │   │   ├── playerStore.ts         # Zustand
│       │   │   ├── chatStore.ts
│       │   │   └── settingsStore.ts
│       │   ├── api/
│       │   │   ├── client.ts              # HTTP fetch 封装
│       │   │   └── ws.ts                  # WebSocket 客户端
│       │   ├── audio/
│       │   │   └── AudioEngine.ts         # HTMLAudioElement 封装
│       │   └── styles/
│       │       ├── global.css             # 全局样式
│       │       ├── tokens.css             # CSS 变量 (tokens)
│       │       └── fonts.css              # 字体加载
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── user/
│   ├── taste.md
│   ├── routines.md
│   └── library.json
│
├── pnpm-workspace.yaml
├── package.json
└── start.sh
```

---

## 九、完整实现任务列表

### Phase 0: 工程骨架
| # | 任务 | 详细说明 |
|:---|:---|:---|
| 0.1 | pnpm monorepo 初始化 | `pnpm-workspace.yaml`, 根 `package.json`, `apps/server` + `apps/web` 目录 |
| 0.2 | 后端 Fastify 骨架 | `index.ts` 注册 fastify + cors + ws, `GET /api/health` 返回 `{ok, uptime}` |
| 0.3 | 前端 Vite + React 骨架 | `main.tsx` + `App.tsx` + React Router 5 路由, PWA manifest |
| 0.4 | SQLite 数据库 | `schema.sql` (6 张表), `db.ts` better-sqlite3 连接, 所有 repo 文件 |
| 0.5 | 环境变量模板 | `.env.example`: DEEPSEEK_KEY, NCM_APPID, NCM_PRIVATE_KEY, HEFENG_KEY, MIMO_KEY |
| 0.6 | `start.sh` | 一键启动: 检查依赖 → 启动后端 :8080 → 启动前端 :5173 |

### Phase 1: 前端视觉体系
| # | 任务 | 详细说明 |
|:---|:---|:---|
| 1.1 | Stage 全屏黑色背景 | 3 个 FluidBlob (oklch, blur 140px, screen), BgNoise SVG 纹理, EdgeGlow 蓝光 |
| 1.2 | 字体加载 & tokens.css | Google Fonts CDN 加载 Inter/Doto/Space Grotesk, CSS 变量定义 |
| 1.3 | Card 卡片容器 | `max-w-[616px]` 居中, 圆角 28px, bg `--bg-card`, border-subtle |
| 1.4 | CardHeader | 深色渐变 + 点阵纹理 (radial-gradient dots), Doto 电台名, 头像, 时钟 |
| 1.5 | OnAirIndicator | 绿点 breathe 动画, Doto "ON AIR" 文字, letter-spacing:0.3em |
| 1.6 | TopNav 顶部导航 | Space Grotesk 300, letter-spacing:0.3em, ALL CAPS, 5 链接 |
| 1.7 | PlayerBar + ThinProgressBar | 2px 极致纤细进度条, neon-green fill, Doto 时间, 圆形播放按钮 |
| 1.8 | WaveformCanvas | Canvas 60-120 根线, getByteFrequencyData 驱动, rAF, neon-green |

### Phase 2: 后端核心服务
| # | 任务 | 详细说明 |
|:---|:---|:---|
| 2.1 | NCM 服务 | 网易云开放平台鉴权, search/getSongDetail/getLyric/getUserPlaylists |
| 2.2 | DeepSeek 服务 | deepseek-chat, JSON mode, SSE stream, 60s 超时, 重试 2 次 |
| 2.3 | Context 服务 | 组装 6 片段 Context Window, 读取 taste.md + routines.md |
| 2.4 | TTS 服务 (MIMO) | text→MP3, 本地文件缓存 (hash 去重) |
| 2.5 | Weather 服务 | 和风天气 API, formatNatural() 输出自然语言 |
| 2.6 | Scheduler 服务 | node-cron 定时触发, 4 个时段问候 |

### Phase 3: AI Chat 对话 (核心)
| # | 任务 | 详细说明 |
|:---|:---|:---|
| 3.1 | `POST /api/chat` SSE 路由 | 接收消息 → Context 组装 → DeepSeek SSE 流式 → 逐 chunk 转发前端 |
| 3.2 | ChatPage 页面 | MessageList + WaveformCanvas + OnAirIndicator + ChatInput |
| 3.3 | MessageList + ChatBubble | DJ 消息(左对齐+头像+时间戳) vs 用户消息(右对齐), pending/thinking/error 态 |
| 3.4 | ChatInput | 输入框 + 发送按钮 + 5 个快捷场景标签, 回车发送 |
| 3.5 | SSE 流式消费 | EventSource 接收, 逐 token 追加到气泡, 自动滚动 |
| 3.6 | TTS 联动 | DJ 回复完成 → 自动调 TTS → 播放音频 → 逐词高亮 → "已播报 ✓" |
| 3.7 | WebSocket 实时推送 | ws 连接管理, now_playing / dj_message / tts_progress / queue_updated |
| 3.8 | 对话历史持久化 | messages 表存取, 页面刷新恢复, 滚动到上次位置 |

### Phase 4: 播放器 & 歌单
| # | 任务 | 详细说明 |
|:---|:---|:---|
| 4.1 | PlayerPage | Meta 区 (歌名+歌手) + Mini Player + Transcript 区 |
| 4.2 | Transcript 逐词高亮 | `.word.said`(white) / `.word.current`(neon-green-bg) / `.word.future`(secondary) |
| 4.3 | AudioEngine | HTMLAudioElement 封装, 预加载 next, 错误降级, MediaSession |
| 4.4 | 播放队列管理 | `POST /api/player/play|pause|next|prev|seek`, 队列持久化 |
| 4.5 | 音频流代理 | `GET /api/stream/:songId` → NCM URL → pipe 到前端 |
| 4.6 | PlaylistsPage | 歌单网格 + 点击展开歌曲列表, 行式表格 |

### Phase 5: 个人中心 & 设置
| # | 任务 | 详细说明 |
|:---|:---|:---|
| 5.1 | ProfilePage + 听歌统计 | 3 张 StatCard (Doto 大数字), plays 表查询聚合 |
| 5.2 | TasteEditor | textarea 编辑 taste.md, 保存后显示 [SAVED] 内联状态 |
| 5.3 | SettingsPage | SettingsRow 列表, API Key 脱敏 (显示前4后4), PUT 保存 |
| 5.4 | TweaksPanel | 音量滑块 + 主题色快捷切换, 毛玻璃背景 |

### Phase 6: 集成 & 收尾
| # | 任务 | 详细说明 |
|:---|:---|:---|
| 6.1 | 网易云歌单同步 | 首次启动拉取所有歌单 → `library.json`, `POST /api/playlists/sync` |
| 6.2 | 端到端测试 | Chat → DeepSeek → 选歌 JSON 解析 → TTS → 播放, 全链路走通 |
| 6.3 | PWA | Service Worker, manifest.json, 离线壳 |
| 6.4 | MediaSession API | 锁屏/耳机控制 (play/pause/prev/next) |
| 6.5 | 错误处理 | TTS 失败不阻断播放, NCM URL 无效自动跳过, DeepSeek 超时重试 |

---

## 十、前端状态管理 (Zustand Stores)

### playerStore
```typescript
interface PlayerState {
  nowPlaying: Song | null;
  queue: Song[];
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  volume: number;
  // actions
  play: (song?: Song) => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
}
```

### chatStore
```typescript
interface ChatState {
  messages: Message[];
  isStreaming: boolean;      // DJ 是否正在生成回复
  currentTtsWord: number;    // 当前 TTS 播放到的词索引 (-1 = 未开始)
  // actions
  sendMessage: (text: string) => void;
  appendStreamToken: (token: string) => void;
  finishMessage: (ttsUrl: string) => void;
  setTtsWord: (index: number) => void;
  loadHistory: () => void;
}
```

### settingsStore
```typescript
interface SettingsState {
  theme: 'dark' | 'light';
  accentColor: string;
  stationName: string;
  ttsConfigured: boolean;
  aiConfigured: boolean;
  ncmConfigured: boolean;
  weatherConfigured: boolean;
  // actions
  load: () => void;
  update: (key: string, value: string) => void;
}
```

---

## 十一、环境变量

```bash
# .env (不提交到 git)
# === DeepSeek ===
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com

# === 网易云音乐开放平台 ===
NCM_APPID=your_app_id
NCM_PRIVATE_KEY=your_private_key

# === MIMO TTS ===
MIMO_API_KEY=xxxxxxxxxxxxxxxx
MIMO_VOICE_ID=default_voice_id

# === 和风天气 ===
HEFENG_API_KEY=xxxxxxxxxxxxxxxx
HEFENG_CITY=上海

# === 服务器相关 ===
PORT=8080
HOST=0.0.0.0
```

---

<div align="center">

**Claudio FM · Design Spec v1.0**

Designed with Nothing Design philosophy.

Fonts: Doto · Inter · Space Grotesk · Color: #29ffb8 on #000000

</div>
