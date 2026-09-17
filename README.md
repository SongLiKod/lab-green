# LabGreen

纯前端三端（Web / Windows Electron / Android WebView）多账号 **GitLab** 一站式管理工具。
所有 GitLab Personal Access Token 仅在本机 AES-256-GCM 加密存储，不经过任何自建后端服务器。

> 本项目为独立原创实现，绿色系视觉风格，功能对标同类 GitLab 管理工具。

## 一、功能清单

| 路由 | 页面 | 主要功能 |
| --- | --- | --- |
| `/dashboard` | 仪表盘 | 当前账号/项目概览、项目/Issue/MR/流水线统计、最近活跃项目、移动端功能宫格 |
| `/account` | 账号管理 | 多账号常驻（PAT 校验→本地加密）、编辑备注/分组/实例地址、更新 PAT、状态检测、删除、加密备份导入导出、SSH 公钥管理 |
| `/project` | 项目管理 | 分页列表、全局搜索、仅我拥有、置顶/收藏、设为当前项目、新建/删除远程项目 |
| `/repo-setting` | 仓库设置 | 基本信息、可见性、功能开关（Issues/MR/Wiki/CI/片段）、协作者增删查 |
| `/branch` | 分支管理 | 分支增删、搜索、保护/取消保护、任意分支差异对比（提交 + 文件级 diff） |
| `/commits` | 提交历史 | 按分支/关键词检索、分页、提交详情弹窗（逐文件 diff） |
| `/file` | 文件管理 | 在线浏览目录树、图片/源码预览、编辑提交、新建/删除文件与目录（Contents API 直提远程） |
| `/issue` | Issue 管理 | 状态/标签/关键词筛选、Markdown 编辑器与渲染、标签多选（回车新建、× 删除仓库标签）、详情抽屉：评论、关联/关闭提交、关闭/重开 |
| `/merge` | 合并请求 | 列表筛选、详情抽屉（描述/文件 diff/提交/评论）、审核通过、合并（可删源分支）、关闭、新建 MR |
| `/pipeline` | 流水线 | 运行记录、Job 展开、手动触发（含自定义变量）、重跑/取消/执行 manual job、Job 日志查看与下载、CI/CD 变量管理 |
| `/release` | Release | 列表、新建（可选分支/Tag 创建）、编辑、删除、资产链接、Markdown 说明 |
| `/log` | 操作日志 | IndexedDB 本地留痕，模块/级别/关键词过滤，CSV 导出，按保留天数清理 |
| `/settings` | 设置 | 主题（浅色/深色/跟随系统）、请求并发/超时/重试、日志保留、应用锁（PIN、空闲/失焦自动锁定、失败冷却）、清除全部数据 |

## 二、技术栈

- **框架**：Vue 3（`<script setup>` + TypeScript）、Vue Router（hash）、Pinia
- **UI**：Element Plus（桌面形态）、Vant 4（移动形态，≤768px 自动切换）、双主题 CSS 变量、绿色主题色 `#16a34a`
- **构建**：Vite 5 + vue-tsc；桌面壳 Electron（本地 `git:exec`、文件对话框）；移动壳 Android WebView（见 `android/README.md`）
- **HTTP**：axios 封装（统一错误、并发门闩、指数退避重试、429 Retry-After）
- **Markdown**：markdown-it（禁用原始 HTML 防 XSS）
- **加密**：Web Crypto `AES-256-GCM` + `PBKDF2`（设备密钥包装随机主密钥）

## 三、目录结构

```
├─ electron/                # Electron 主进程与 preload（本地 Git、文件对话框）
├─ android/                 # Android WebView 壳说明与关键源码
├─ src/
│  ├─ api/gitlab.ts         # GitLab REST API v4 封装（项目/分支/提交/文件/Issue/MR/CI/Release/SSH）
│  ├─ api/request.ts        # axios 实例、并发门闩、重试、错误归一化
│  ├─ components/           # 布局、项目选择器、Markdown 编辑器/渲染器、Diff、应用锁
│  ├─ pages/                # 13 个功能页面（桌面/移动双形态）
│  ├─ stores/               # settings（设置）、app（账号/当前项目/锁）
│  ├─ utils/                # 加密、IndexedDB 日志、Markdown、通用工具
│  └─ styles/theme.css      # 绿色主题变量与双主题样式
└─ package.json
```

## 四、数据存储（全部本机）

- `localStorage`：`labgreen_settings`、`labgreen_accounts`（密文 PAT）、`labgreen_cur_acct`、`labgreen_cur_project`、`labgreen_repo_meta`、`labgreen_mk/salt/pin`
- `IndexedDB`（`labgreen`）：操作日志、下载记录
- 全程仅直连你所配置的 GitLab 实例（`gitlab.com` 或自建地址）的 `/api/v4`

## 五、开发与构建

```bash
npm install
npm run dev               # Web 开发（Vite，默认 http://localhost:5273）
npm run build             # 类型检查 + 产物
npm run typecheck         # 仅类型检查

# Windows 客户端
npm run build             # 先产出 dist
npm run electron:dev      # 开发启动（可设 VITE_DEV_SERVER_URL）
npm run electron:build    # electron-builder 打包 NSIS / 便携版

# Android APK：npm run build 后按 android/README.md 将 dist 放入 assets 编译
```

## 六、使用流程

1. 「账号管理」添加 GitLab 账号：填实例地址 + PAT（需 `read_api`，写操作需 `write_repository` 等）
2. 「项目管理」点击某行 → 设为当前项目
3. 分支/提交/文件/Issue/MR/流水线/Release 各页面即围绕当前项目工作

## 七、安全说明

- PAT 运行时才解密进内存，导出备份为密文（含密钥材料，可跨设备还原，请妥善保管）
- 应用锁：PIN 派生哈希校验 + 连续失败 5 次冷却 60 秒；忘记 PIN 只能清除数据重建
- 本工具不内置任何代理服务器，令牌只发送给你自己配置的 GitLab 实例
