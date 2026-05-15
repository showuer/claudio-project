# Claudio FM — Agent Rules

> 每次修改代码前必须阅读此文件。所有工作必须兼容以下三个运行环境。

## 运行环境兼容矩阵

| 环境 | URL | 特点 |
|---|---|---|
| 本地开发 | `localhost:5173` | 安全上下文，crypto/WS 正常 |
| 局域网 | `192.168.1.11:5173` | **非安全上下文**，crypto/WS 受限 |
| Cloudflare | `showu.xyz` (即将) | HTTPS 强制，WS 需特殊配置 |

## 硬性约束

### 1. crypto.randomUUID()
- **问题**：在 `192.168.1.11`（非 localhost/HTTPS）下不可用
- **规则**：前端代码**永远不要直接使用** `crypto.randomUUID()`
- **替代**：使用 `chatStore.ts` 中的 `uuid()` 函数

### 2. WebSocket
- **当前**：连接到 `window.location` 的 `/ws`
- **注意**：非 localhost 环境可能连接失败，这是正常的
- **禁止**：硬编码 `ws://localhost:8080/ws`

### 3. API 调用
- **必须**使用相对路径（如 `/api/chat`），不硬编码域名
- Vite 代理在开发环境处理转发，Cloudflare 在生产环境处理

### 4. 移动端兼容
- 触控目标最小 40×40px
- 字体最小 12px（防止 iOS 自动缩放）
- 所有交互必须基于 click/tap，不依赖 hover
- 底部输入栏适配 `safe-area-inset-bottom`
- 使用 `100dvh` 而非 `100vh` 处理移动浏览器地址栏

### 5. 已有功能保护
- **DeepSeek AI 对话**：system.md + chat.ts SSE 流
- **MiMo TTS**：tts.service.ts（茉莉女声 + 新模型）
- **网易云音乐**：NCM Proxy :3000（VIP Cookie 无损播放）
- **私人漫游 AIDJ**：/api/aidj 路由 + NCM personal_fm
- **红心收藏**：/api/like + /api/like/check
- **歌单+每日推荐**：语义意图检测 → NCM playlist/recommend/songs
- **播放器 UI**：胶囊按钮、红心、Mesh 背景、聊天区
- **移动端适配**：480px 媒体查询、PWA、safe-area

### 6. 代码修改规范
- 每次最多修改 **3-4 个文件**
- 改前 git diff 确认当前状态
- 改后 `npx tsc --noEmit` 确认无 TS 错误
- 改后 `curl` 测试关键 API 端点
- 不改 `.env`（除非明确需要）
- 不在 `node_modules` 搜索或修改

## 每次工作前检查清单

```
□ 1. 读此 AGENTS.md
□ 2. 检查三个服务都在跑（NCM :3000 / Backend :8080 / Frontend :5173）
□ 3. curl http://localhost:8080/api/health 确认后端存活
□ 4. curl http://localhost:3000/ 确认 NCM 代理存活
□ 5. git status 看有无未提交改动
□ 6. 想清楚：改动会影响哪个运行环境？（localhost / 局域网 / Cloudflare / 移动端）
□ 7. 想清楚：改动会不会破坏已有功能？
```

## 每次工作后验证清单

```
□ 1. npx tsc --noEmit 零错误
□ 2. curl 测试改动的 API
□ 3. 打开 localhost:5173 验证功能
□ 4. 打开 192.168.1.11:5173 验证移动端/局域网兼容
□ 5. git commit 存档（标注日期时间）
```

## 禁止操作

- 扫描 `node_modules/`、`.next/`、`cache/`、`data/` 目录
- 修改 `.env` 中的 Key/Secret/Cookie
- 删除本地音频/数据库/用户数据文件
- 大范围重构（单次超过 5 个文件）
- 接入真实第三方 API（除非明确要求）
- 使用 `crypto.randomUUID()` 在前端
- 硬编码绝对 URL 路径
- 删除或覆盖已有功能代码
