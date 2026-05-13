# Claudio FM — Private AI Music Radio

> 完整项目交接文档。后续 AI 或开发者接手时，阅读此文件即可理解全貌。

## 1. 项目定位

Claudio 是一个本地私有化 AI 电台 PWA。核心能力：
- DeepSeek AI 根据天气/时间/用户品味从 2179 首歌库中选歌并写 DJ 串词
- MiMo/Fish Audio TTS 将串词合成为语音播报
- 网易云音乐 VIP Cookie 提供无损音频流
- 浏览器 HTML5 Audio 播放，支持逐首 intro 介绍语

**一句话：** Chat 发消息 → AI 选歌 → TTS 播报开场白 → 每首歌有 intro 语音 → 播放完整无损歌曲。

## 2. 技术栈

| 层 | 技术 |
|:---|:---|
| 前端 | Vite + React 19 + TypeScript + Zustand |
| 后端 | Fastify + TypeScript + tsx |
| 数据库 | SQLite (sql.js WASM) |
| AI | DeepSeek API (`deepseek-chat`, JSON mode, SSE stream) |
| 音乐 | NeteaseCloudMusicApi (localhost:3000) + VIP Cookie |
| TTS | MiMo API → Fish Audio API 双 fallback |
| 天气 | 和风天气 API |
| 包管理 | pnpm monorepo |

## 3. 目录结构

```
claudio/
├── CLAUDE.md                    ← 你正在读的文件
├── start.sh                     ← 一键启动脚本
├── package.json                 ← monorepo 根配置
├── pnpm-workspace.yaml
├── .gitignore
│
├── apps/
│   ├── server/                  ← 后端 (Fastify :8080)
│   │   ├── .env                 ← API Keys (不提交 git)
│   │   ├── .env.example         ← 配置模板
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts              ← 入口：注册路由、WS、启动
│   │       ├── config.ts             ← 环境变量校验 (zod)
│   │       ├── ws.ts                 ← WebSocket 管理
│   │       ├── db/
│   │       │   ├── db.ts             ← SQLite 连接 (sql.js)
│   │       │   ├── schema.sql        ← 建表 DDL
│   │       │   ├── messages.repo.ts  ← 对话历史
│   │       │   ├── plays.repo.ts     ← 播放记录
│   │       │   ├── playlist.repo.ts  ← 歌单缓存
│   │       │   ├── queue.repo.ts     ← 播放队列
│   │       │   └── settings.repo.ts  ← 系统设置
│   │       ├── routes/
│   │       │   ├── chat.ts           ← POST /api/chat (SSE) + GET /api/chat/history
│   │       │   ├── player.ts         ← GET /api/player/url/:songId
│   │       │   ├── stream.ts         ← GET /api/stream/:songId (音频代理)
│   │       │   ├── playlist.ts       ← 歌单 CRUD + 同步
│   │       │   ├── profile.ts        ← 听歌统计 + taste.md 读写
│   │       │   ├── settings.ts       ← 设置 CRUD
│   │       │   ├── health.ts         ← GET /api/health
│   │       │   ├── now.ts            ← GET /api/now (当前状态)
│   │       │   └── search.ts         ← GET /api/search
│   │       ├── services/
│   │       │   ├── deepseek.service.ts   ← DeepSeek API (SSE 流式)
│   │       │   ├── context.service.ts    ← 组装 System Prompt (6片段)
│   │       │   ├── ncm.service.ts        ← 网易云 API (localhost:3000)
│   │       │   ├── tts.service.ts        ← MiMo + Fish Audio TTS
│   │       │   ├── weather.service.ts    ← 和风天气
│   │       │   └── scheduler.service.ts  ← 定时调度 (cron)
│   │       ├── prompts/
│   │       │   └── system.md         ← DeepSeek System Prompt 模板
│   │       └── types/
│   │           └── sql.js.d.ts       ← sql.js 类型声明
│   │
│   └── web/                      ← 前端 (Vite :5173)
│       ├── index.html                ← 字体加载 + PWA manifest
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts            ← Vite 配置 (代理 /api → :8080, /ws → :8080)
│       ├── public/
│       │   └── manifest.json         ← PWA manifest
│       └── src/
│           ├── main.tsx              ← ReactDOM 入口
│           ├── App.tsx               ← 根组件 (Stage > Card > HomePage)
│           ├── pages/
│           │   └── HomePage.tsx      ← 唯一页面：Header + Clock + Player + Queue + Chat + Footer
│           ├── components/
│           │   ├── Stage.tsx         ← 全屏黑底 + 紫蓝中心柔光
│           │   ├── Card.tsx          ← 毛玻璃卡片容器 + InteractiveDotGrid
│           │   ├── InteractiveDotGrid.tsx  ← Canvas 鼠标追踪点阵
│           │   ├── TopNav.tsx        ← 顶部导航 (未使用)
│           │   ├── OnAirIndicator.tsx
│           │   ├── WaveformCanvas.tsx
│           │   └── CardHeader.tsx
│           ├── stores/
│           │   ├── playerStore.ts    ← 播放状态 + 音频控制 (Zustand)
│           │   └── chatStore.ts      ← 对话状态 + SSE 处理
│           ├── api/
│           │   ├── client.ts         ← HTTP 客户端 (SSE 解析)
│           │   └── ws.ts             ← WebSocket 客户端
│           ├── audio/
│           │   ├── AudioEngine.ts    ← (未使用)
│           │   └── GlobalMusicController.ts ← (未使用)
│           └── styles/
│               ├── tokens.css        ← CSS 变量 (配色/字体/间距)
│               └── global.css        ← 全局样式
│
├── user/                          ← 用户私有数据
│   ├── taste.md                   ← 音乐品味档案 (给 AI 读)
│   ├── routines.md                ← 作息规则
│   └── library.json               ← 2179 首歌曲库 (来自网易云红心歌单)
│
├── cache/tts/                     ← TTS 缓存 (hash.mp3, 不提交 git)
├── data/                          ← SQLite 数据库文件
└── docs/
    └── DESIGN_SPEC.md             ← 旧版设计文档
```

## 4. API 端点全表

### 后端 (:8080)

| 方法 | 路径 | 说明 | 请求 | 响应 |
|:---|:---|:---|:---|:---|
| `GET` | `/api/health` | 健康检查 | - | `{ok, uptime, time}` |
| `GET` | `/api/now` | 当前播放状态 | - | `{nowPlaying, queue, isPlaying}` |
| `POST` | `/api/chat` | AI 对话 (SSE 流式) | `{message: string}` | SSE: `data: {token}` ... `data: {done, say, ttsUrl, songs[], songIntros{}}` |
| `GET` | `/api/chat/history` | 对话历史 | `?limit=50` | `{messages[]}` |
| `GET` | `/api/player/url/:songId` | 获取歌曲播放 URL | - | `{url}` |
| `GET` | `/api/stream/:songId` | 音频流代理 | - | `audio/mpeg` binary |
| `GET` | `/api/search` | 搜索歌曲 | `?keyword=&limit=10` | `{results[]}` |
| `GET` | `/api/playlists` | 歌单列表 | - | `{playlists[]}` |
| `POST` | `/api/playlists/sync` | 同步网易云歌单 | - | `{imported}` |
| `GET` | `/api/profile` | 听歌统计 | - | `{totalHours, topArtists}` |
| `GET` | `/api/profile/taste` | 获取 taste.md | - | `{content}` |
| `PUT` | `/api/profile/taste` | 保存 taste.md | `{content}` | `{saved}` |
| `GET` | `/api/settings` | 获取设置 | - | `{key: value}` |
| `PUT` | `/api/settings` | 更新设置 | `{key, value}` | `{updated}` |

### NCM API 代理 (:3000) — NeteaseCloudMusicApi

| 路径 | 说明 |
|:---|:---|
| `/song/url/v1?id=&level=lossless` | 获取歌曲播放 URL |
| `/search?keywords=&limit=` | 搜索歌曲 |
| `/lyric?id=` | 获取歌词 |
| `/song/detail?ids=` | 歌曲详情 |
| `/user/playlist` | 用户歌单列表 |

### WebSocket (`ws://localhost:8080/ws`)

服务端 → 客户端:
- `{type: "now_playing", data: {song, queue, isPlaying, progressMs}}`
- `{type: "dj_message", data: {id, say, ttsUrl, songs[], songIntros{}}}`
- `{type: "queue_updated", data: {queue}}`
- `{type: "player_state", data: {isPlaying, progressMs}}`

客户端 → 服务端:
- `{type: "ping"}` (心跳)
- `{type: "seek", positionMs}`

## 5. 核心数据流

### 一次 AI 对话的完整链路

```
用户输入 "下午适合午休的安静钢琴曲"
  │
  ├─ 前端 HomePage
  │   ├─ chatStore.sendMessage(text)
  │   ├─ POST /api/chat {message} (Accept: text/event-stream)
  │   └─ 显示 [THINKING] 气泡
  │
  ├─ 后端 chat.ts
  │   ├─ 意图分流: 自然语言 → 走 DeepSeek
  │   ├─ context.service.ts 组装 Context Window:
  │   │   1. System Prompt (DJ 人设 + 规则)
  │   │   2. taste.md 全文
  │   │   3. routines.md 全文
  │   │   4. 和风天气 → "上海 18°C 小雨"
  │   │   5. 当前时间 → "14:30 周三"
  │   │   6. 最近播放 20 首
  │   │   7. 候选歌曲 200 首 (从 library.json 随机抽)
  │   │
  │   ├─ deepseek.service.ts
  │   │   POST https://api.deepseek.com/chat/completions
  │   │   model: deepseek-chat, stream: true
  │   │   response_format: {type: "json_object"}
  │   │   → SSE 逐 chunk 转发前端
  │   │
  │   ├─ 解析 JSON 输出:
  │   │   {theme, say, songs: [{id, name, artist, intro}]}
  │   │
  │   ├─ tts.service.ts
  │   │   say → MiMo TTS → cache/tts/{hash}.mp3
  │   │   每首 intro → MiMo TTS → cache/tts/{hash}.mp3
  │   │
  │   └─ SSE done: {done, say, ttsUrl, songs[], songIntros{}}
  │
  ├─ 前端 chatStore
  │   ├─ messages 更新 (DJ 气泡显示 say 文本)
  │   ├─ playerStore.setPlaylist(songs + introUrls)
  │   └─ 播放开场 TTS (ttsUrl)
  │
  └─ 前端 playerStore
      ├─ TTS 结束 → playTrack(0)
      ├─ introAudio.play(introUrl) → 结束 → audio.src = /api/stream/:songId
      ├─ /api/stream/ 后端代理 → NCM API → 无损音频流
      └─ 每首结束 → nextTrack() → 下一首 intro → 歌曲
```

## 6. 配置 (.env)

必填项:
```bash
DEEPSEEK_API_KEY=sk-xxx          # DeepSeek API Key
NCM_COOKIE=MUSIC_U=xxx           # 网易云 VIP Cookie (拿完整歌曲)
```

可选项:
```bash
MIMO_API_KEY=sk-xxx              # MiMo TTS
FISH_AUDIO_KEY=xxx               # Fish Audio TTS (fallback)
HEFENG_API_KEY=xxx               # 和风天气 API
HEFENG_CITY=上海                  # 城市
NCM_APPID=xxx                    # 网易云开放平台 AppID
NCM_PRIVATE_KEY=xxx              # 网易云开放平台 PrivateKey
PORT=8080
HOST=0.0.0.0
```

## 7. 启动方式

### 需要先启动三个进程:

```bash
# 1. 网易云 API 代理 (必须)
cd apps/server
npx NeteaseCloudMusicApi
# → http://localhost:3000

# 2. 后端 (必须)
cd apps/server
npx tsx src/index.ts
# → http://localhost:8080

# 3. 前端 (必须)
cd apps/web
npx vite --host
# → http://localhost:5173
```

或一键启动:
```bash
./start.sh
```

### 注意:
- 需要 Node.js >= 20
- 网易云 VIP Cookie 必须有效才能播放完整歌曲 (否则 30 秒预览)
- `.env` 中的 `NCM_COOKIE` 需要完整 Cookie 字符串 (包含 MUSIC_U=...)
- 获取 Cookie: 浏览器登录 music.163.com → F12 → Application → Cookies → 复制全部

## 8. 前端状态管理 (Zustand)

### playerStore
- `playlist: Song[]` — 播放列表 (localStorage 持久化)
- `currentIndex: number` — 当前播放索引
- `musicPlaying: boolean` — 是否播放中
- `progressMs / durationMs` — 进度
- `djNarrating: boolean` — DJ 是否在播报
- `volume: number` (0-1)
- 关键方法: `playTrack(i)`, `toggleMusic()`, `nextTrack()`, `prevTrack()`, `seekTo(pct)`, `setVolume(v)`
- 音频: 全局单例 `audio` + `introAudio` (HTML5 Audio), 进度定时器 250ms

### chatStore
- `messages: Message[]` — 对话历史
- `isStreaming: boolean` — 是否正在接收 SSE
- 关键方法: `sendMessage(text)`, `loadHistory()`

## 9. 设计规范

### 配色
- 背景: `#050505` (极深炭黑)
- 面板: `rgba(18,18,18,0.55)` + `backdrop-blur(20px)` (毛玻璃)
- 霓虹绿: `#00FF41`
- 紫色溢光: `box-shadow: 0 0 50px rgba(139,92,246,0.10)`
- 文本: `#EFEFEF` / `#7A7A7A` / `#5A5A5A`
- Chat 区: 纯黑 `#050505` (不透波点)

### 字体
- Display: Silkscreen (点阵像素) — Logo + 时钟
- Body: Inter — 正文
- Mono: Roboto Mono — 标签/数据

### 圆角
- 统一 22px Apple 曲率
- 气泡 18px，尖角 6px

### 特殊效果
- InteractiveDotGrid: Canvas 渲染，32px 间距，鼠标 100px 半径绿光
- 中心柔光: 三层 radial-gradient 紫蓝渐变，8s 呼吸动画
- ON AIR: 绿点 pulse 动画
- EQ 柱: 5 根绿条跳动动画
- 当前播放卡片: `rgba(0,255,65,0.10)` 底 + 左 2px 绿线 + box-shadow 双层发光

## 10. 已知限制 & 待办

- ncm-cli 因 Node.js RSA 兼容问题无法登录，暂用浏览器 Audio 方案
- Node.js 系统安装被误删后使用便携版 Node 20 (`/tmp/node20/`)
- 音量滑块暂只控制浏览器 Audio，不控制系统音量
- 进度条 seek 功能基础实现
- Profile / Playlists 页面 UI 待完善

## 11. 重要文件快速索引

| 需求 | 文件 |
|:---|:---|
| 改 AI 行为 | `apps/server/src/prompts/system.md` |
| 改配色/字体 | `apps/web/src/styles/tokens.css` |
| 改样式 | `apps/web/src/styles/global.css` |
| 改播放逻辑 | `apps/web/src/stores/playerStore.ts` |
| 改对话逻辑 | `apps/web/src/stores/chatStore.ts` |
| 改页面布局 | `apps/web/src/pages/HomePage.tsx` |
| 改 NCM API 调用 | `apps/server/src/services/ncm.service.ts` |
| 改 DeepSeek 调用 | `apps/server/src/services/deepseek.service.ts` |
| 改 TTS 引擎 | `apps/server/src/services/tts.service.ts` |
| 改聊天路由 | `apps/server/src/routes/chat.ts` |
| 加点阵效果 | `apps/web/src/components/InteractiveDotGrid.tsx` |
| API Keys | `apps/server/.env` |
| 用户品味 | `user/taste.md` |
| 歌曲库 | `user/library.json` |
