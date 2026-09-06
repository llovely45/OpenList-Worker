# OpenList-Worker

_基于 TypeScript、Hono 与 Cloudflare Workers 的 OpenList 运行版 fork；版本信息按当前 `main` 分支记录，更新于 2026-09-06。_

<div align="center">
  <img src="https://raw.githubusercontent.com/OpenListTeam/Logo/main/logo.svg" width="128" height="128" alt="OpenList logo" />

  <p><strong>将 OpenList 后端运行在 Workers / Edge Functions / Serverless 平台</strong></p>

<a href="https://github.com/llovely45/OpenList-Worker/actions/workflows/deploy-worker.yml"><img src="https://github.com/llovely45/OpenList-Worker/actions/workflows/deploy-worker.yml/badge.svg?branch=main" alt="Deploy status" /></a>
<a href="https://github.com/llovely45/OpenList-Worker/blob/main/LICENSE"><img src="https://img.shields.io/github/license/llovely45/OpenList-Worker" alt="License" /></a>

</div>

---

- [上游 Worker 仓库](https://github.com/OpenListTeam/OpenList-Worker)
- [Go 版 OpenList](https://github.com/OpenListTeam/OpenList)
- [官方前端](https://github.com/OpenListTeam/OpenList-Frontend)
- [Cloudflare Workers 部署指南](./docs/deploy-cloudflare-workers.md)
- [EdgeOne Makers 部署指南](./docs/edgeone.md)
- [贡献指南](./CONTRIBUTING.md)
- [许可证](./LICENSE)

## 📌 项目定位

本仓库是在 [OpenListTeam/OpenList-Worker](https://github.com/OpenListTeam/OpenList-Worker) 基础上维护的 fork，并加入了面向边缘部署的构建、认证、上传、下载和 115 Open 兼容性修复。

- 后端源码位于 `src/backend/`，使用 TypeScript + Hono，入口为 `src/backend/worker.ts`
- 前端源码不再内置在本仓库；构建时由 `scripts/fetch-frontend.mjs` 获取 [OpenList-Frontend](https://github.com/OpenListTeam/OpenList-Frontend) 并生成 `dist/`
- Cloudflare Workers 默认使用 KV 持久化配置；EdgeOne 优先使用 Blob，其他 Serverless 入口默认可能退回内存存储
- 本项目与 Go 版 OpenList 的 API 和界面保持兼容方向，但不是 Go 版的单体二进制，也不承诺所有驱动在所有运行时都可用

## 🧭 版本与上游同步基线

以下是本次 README 更新时仓库中能够确认的版本快照：

| 对象             | 来源或分支                                        | 提交 / 版本                                                                                                  | 说明                                                     |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 后端上游同步来源 | `OpenListTeam/OpenList-Worker` 的 `main`          | [`cd25094`](https://github.com/OpenListTeam/OpenList-Worker/commit/cd250946b73e88e48c81c419a0fa3cc188f2da4d) | 最近一次同步的上游基线，2026-09-05                       |
| 本地同步合并     | 本仓库 `main`                                     | [`75b7631`](https://github.com/llovely45/OpenList-Worker/commit/75b7631)                                     | 将上游 `main` 合并进本地修复分支                         |
| 当前 fork        | `llovely45/OpenList-Worker` 的 `main`             | [`e1157e4`](https://github.com/llovely45/OpenList-Worker/commit/e1157e40b8805feb2ef54c36eb95c4e71d5cbe1c)    | 当前 README 对应的代码快照                               |
| 应用 / API 版本  | `package.json`、`/health`、`/api/public/settings` | `4.2.3` / `v4.2.3`                                                                                           | 仓库当前没有同名 Git tag；这是应用版本，不是 release tag |
| 前端构建来源     | `OpenListTeam/OpenList-Frontend` 的 `main`        | 构建时获取                                                                                                   | 当前没有锁定前端 commit，可用 `FRONTEND_GIT_REF` 覆盖    |

`.github/workflows/sync-upstream.yml` 会定期或手动执行 `git fetch upstream main`，再将上游 `main` 合并到本仓库 `main`。因此，上表是当前快照；后续自动同步后，应同步更新 README 中的上游提交和当前提交。

## 🛠️ 与上游的差异与修复

对比基线为上表中的上游提交 `cd25094`，不是 Go 版 OpenList。生成的 `cloud-functions/[[default]].js` 只作为部署产物，不单独列为功能差异。

| 模块            | 本仓库的差异或修复                                                                                                                            | 实际效果                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cloudflare 部署 | Worker 入口改为始终返回 Promise；修正 `esbuild` 的模块解析和边缘构建；补充 KV、Assets、日志配置以及自动部署工作流                             | `wrangler deploy` 能使用当前 Worker 入口和 `dist/` 静态资源部署       |
| Edge / 前端构建 | 按官方前端 `packageManager` 使用对应 pnpm；自动补齐 i18n；对官方 `useFetch` 应用 Worker 专用 401 loading 修复，并拒绝带旧 bug 的预构建 `dist` | 避免中文语言包缺失，以及 API 返回 401 后页面无限 loading              |
| 115 驱动分派    | 将旧版 `115`、`115cloud`、`115netdisk` 与 `115Open`、`115Pan` 分开分派                                                                        | 115 Open Platform 不再误走旧版 115 驱动                               |
| 115 存量数据    | 增加 `/api/admin/driver/115open/repair` 和修复插件，将历史别名规范化为 `115Open`，只更新 `driver` / `modified`，不改写 token                  | 已有 115 Open 存储可以在部署后修复并刷新驱动实例                      |
| 115 路径操作    | 修复默认根目录产生双斜杠的问题；拒绝空白目录名                                                                                                | 根目录下的目录列表、目录创建路径更稳定                                |
| 管理员认证      | 静态管理员 API token 从数据库设置项 `token` 分离到 Worker Secret `ADMIN_API_TOKEN`                                                            | 115 token、登录密码和管理员 API token 不再共用；CI 可安全调用管理接口 |
| 匿名访问        | Worker 不再把数据库中的 `guest` 记录当作匿名登录；公开设置固定返回 `allow_guest=false`                                                        | 未携带凭证的请求不能获得文件系统权限，显式分享链接仍可使用            |
| 下载签名        | 启用 `sign_all` 或 `link_expiration` 时，将 HMAC 下载签名同时写入 `raw_url` 和代理下载 URL                                                    | 前端直接消费 `raw_url` 时也会受到签名和过期时间保护                   |
| 分片上传        | 默认公开设置启用 multipart，默认分片大小为 10 MB；限制会话、分片元数据的数量和生命周期                                                        | 大文件可按官方前端契约断点上传，长生命周期 Worker 不会因缓存无限增长  |
| 进程内缓存      | 驱动、登录失败、IP 限流、token 撤销和 Edge KV 缓存统一增加容量上限与 TTL                                                                      | 降低长时间运行的 Worker / Edge Function 内存持续增长风险              |

相关修复提交包括 [`f178a30`](https://github.com/llovely45/OpenList-Worker/commit/f178a30)、[`92f8478`](https://github.com/llovely45/OpenList-Worker/commit/92f8478)、[`e8ad7b0`](https://github.com/llovely45/OpenList-Worker/commit/e8ad7b0)、[`7f4c335`](https://github.com/llovely45/OpenList-Worker/commit/7f4c335)、[`167a541`](https://github.com/llovely45/OpenList-Worker/commit/167a541)、[`dcafa93`](https://github.com/llovely45/OpenList-Worker/commit/dcafa93)、[`1f052c5`](https://github.com/llovely45/OpenList-Worker/commit/1f052c5) 和 [`e1157e4`](https://github.com/llovely45/OpenList-Worker/commit/e1157e4)。

## ✨ 功能

- 多种存储：阿里云盘、OneDrive / SharePoint、天翼云盘、Google Drive、123 云盘、FTP / SFTP、PikPak、S3、Seafile、WebDAV、115、百度网盘、夸克、迅雷、GitHub、OpenList、Teldrive 等
- 文件浏览、搜索、排序、分页和受保护路由
- 图片画廊、视频 / 音频、PDF、Markdown、代码和 Office 文档预览
- 上传、下载、删除、新建文件夹、重命名、移动、复制和打包下载
- 官方前端国际化、暗色模式、永久链接、分享链接和 WebDAV
- Cloudflare Workers 原生部署，以及 EdgeOne Makers、阿里云 ESA、Vercel、AWS Serverless 适配入口
- Hono API、JWT 登录、管理员后台、插件系统、WebDAV 服务和 S3 网关

### 平台限制

- Cloudflare Workers / EdgeOne 等边缘运行时没有原始 TCP socket；`Local`、`FTP`、`SFTP` 以及基于 `mysql2` 的数据库后端需要完整 Node.js 运行时
- 边缘构建会把 Node 专属依赖替换为空实现；相关驱动会明确返回运行时不支持，而不是在构建阶段让整个项目失败
- 归档预览在 Worker 环境中主要支持 ZIP；Serverless 环境没有常驻后台任务，离线下载工具列表可能为空
- Vercel / Lambda 等无 KV 绑定的部署默认是内存模式，重启或换实例后配置不会自动持久化，必须自行接入持久化后端

## 🧱 技术栈与目录

| 层次              | 实现                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| 前端              | 官方 `OpenList-Frontend`，SolidJS + TypeScript + Vite，构建产物为 `dist/`        |
| 后端              | Hono + TypeScript，Worker 入口为 `src/backend/worker.ts`                         |
| Cloudflare 持久化 | KV 默认后端；可选 Cloudflare D1，配置见 `docs/database-backend-multi-support.md` |
| EdgeOne 持久化    | `@edgeone/pages-blob`，并兼容 EdgeOne / KV binding                               |
| Node 适配         | `api/[...route].ts`、`handler.ts`、`dist-server/api/[...route].js`               |

```text
.
├── src/backend/                 # Hono 后端、驱动、认证、文件与管理接口
├── api/[...route].ts            # Vercel / Edge Function 适配入口
├── handler.ts                   # AWS Lambda 适配入口
├── scripts/
│   ├── fetch-frontend.mjs       # 获取并构建官方前端
│   ├── frontend-patch.mjs       # Worker 前端兼容补丁
│   ├── build-edge.mjs           # 构建 Node / Edge 产物
│   └── deploy.js                # Cloudflare 一键部署脚本
├── dist/                        # 前端静态产物
├── dist-server/                 # Node / Vercel Serverless 产物
├── cloud-functions/             # EdgeOne 必需的已提交云函数产物
├── plugins/                     # Worker 插件，例如 115 Open 修复插件
├── wrangler.toml                # Cloudflare Workers 配置
├── edgeone.json                 # EdgeOne Makers 配置
├── esa.jsonc                    # 阿里云 ESA 配置
└── vercel.json                  # Vercel 路由配置
```

## 🚀 快速开始

### 环境要求

- Node.js 22.13+（推荐；EdgeOne 配置使用 Node.js `22.21.1`）
- pnpm `9.15.4`（根项目 `packageManager` 中已声明）
- 使用 Cloudflare Workers 时需要 Cloudflare 账号和 Workers / KV 权限

### 安装和构建

```bash
pnpm install --frozen-lockfile
pnpm run build
```

`pnpm run build` 会依次获取官方前端、补齐翻译、应用 Worker 401 loading 兼容补丁、构建 `dist/`，并生成 `dist-server/`、`cloud-functions/[[default]].js` 以及 `dist/esa-entry.js`。

默认前端来源是 `OpenList-Frontend` 的 `main` 分支。需要固定分支或 commit 时：

```bash
FRONTEND_GIT_REF=<branch-or-commit> pnpm run build
```

也可以复用本地前端仓库或已经构建好的产物：

```bash
FRONTEND_REPO=../OpenList-Frontend pnpm run build
FRONTEND_DIST=../OpenList-Frontend/dist pnpm run fetch:frontend
```

### 本地开发

```bash
# 获取前端并启动 Workers 模拟环境
pnpm run dev:unified

# 仅启动 Worker；需要先确保 dist/ 已存在
pnpm run dev:worker
```

## ☁️ 部署方法

### 方式一：Cloudflare Workers（首选）

项目入口和绑定由 [`wrangler.toml`](./wrangler.toml) 管理：Worker 入口是 `src/backend/worker.ts`，前端由 `dist/` 的 `ASSETS` binding 提供，默认配置后端为 `OPENLIST_KV`。

#### 手动部署

第一次部署到自己的 Cloudflare 账号时，先创建自己的 KV namespace，并把命令输出的 ID 写入 `wrangler.toml`：

```bash
pnpm exec wrangler login
pnpm exec wrangler kv namespace create OPENLIST_KV

# 将上一步返回的 ID 写入 wrangler.toml 的 [[kv_namespaces]] / id
pnpm exec wrangler secret put ADMIN_PASSWORD
pnpm exec wrangler secret put JWT_SECRET

pnpm run build
pnpm run deploy:worker
```

`ADMIN_PASSWORD` 未配置时，首次启动会生成随机初始密码并只在启动日志中打印一次。`JWT_SECRET` 建议显式配置，否则会依赖 KV 或当前进程保存随机密钥。

`ADMIN_API_TOKEN` 是给 CI 或维护脚本使用的独立管理员 API token，可选但推荐配置：

```bash
pnpm exec wrangler secret put ADMIN_API_TOKEN
```

> ⚠️ **注意 KV ID**：仓库当前 `wrangler.toml` 中已有维护者账号的 `OPENLIST_KV` ID。部署到其他账号时必须替换为自己的 namespace ID，不要直接复用该值。

#### 一键部署

```bash
pnpm run deploy
```

该脚本会检查或创建名为 `OPENLIST_KV` 的 namespace，获取官方前端并执行 `wrangler deploy`。`pnpm run deploy:worker` 只负责部署已有的 `dist/`，不会替你构建前端。

#### GitHub Actions 自动部署

`.github/workflows/deploy-worker.yml` 会在 `main` 更新或手动触发时执行：安装依赖 → 运行后端测试 → 构建 → 部署 Worker → 检查 `/api/health` 和 `/api/healthz` → 安装 115 Open 修复插件并执行一次存量修复。

在 fork 的 GitHub Settings → Secrets and variables → Actions 中配置：

| 名称                    | 类型     | 用途                                                       |
| ----------------------- | -------- | ---------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Secret   | Wrangler 部署权限                                          |
| `CLOUDFLARE_ACCOUNT_ID` | Secret   | Cloudflare 账号 ID                                         |
| `OPENLIST_ADMIN_TOKEN`  | Secret   | 随机生成的管理员 API token，不是登录密码，也不是 115 token |
| `OPENLIST_BASE_URL`     | Variable | 部署后健康检查和 115 修复所使用的自己的站点地址            |

`OPENLIST_BASE_URL` 应填写你自己的 Worker 域名；不要依赖工作流文件中的示例回退地址。

### 方式二：腾讯云 EdgeOne Makers

EdgeOne 使用根目录的 [`edgeone.json`](./edgeone.json)：Node.js `22.21.1`、安装命令 `pnpm install --no-frozen-lockfile`、构建命令 `pnpm run build`、静态输出目录 `dist/`。

1. 在 [EdgeOne Makers 控制台](https://console.edgeone.ai/makers) 导入 GitHub 仓库
2. 确认构建设置读取 `edgeone.json`
3. 在环境变量中设置 `ADMIN_PASSWORD`、`JWT_SECRET`
4. 部署完成后从日志获取初始密码（如果没有设置 `ADMIN_PASSWORD`）

`cloud-functions/[[default]].js` 是 EdgeOne 扫描仓库时需要的已提交云函数产物，不能只保留源码而删除它。代码或前端变化后先运行 `pnpm run build`，再提交该产物；`.github/workflows/edgeone-artifact-guard.yml` 会在 push / PR 时检查它是否过期。定时刷新 token 的 `CRON_SECRET` 配置和安全说明见 [EdgeOne 详细指南](./docs/edgeone.md)。

也可以使用 CLI：

```bash
npm install -g edgeone
edgeone login
edgeone makers deploy
```

### 方式三：阿里云 ESA

ESA 使用 [`esa.jsonc`](./esa.jsonc)、[`esa-entry.ts`](./esa-entry.ts) 和构建产物 `dist/esa-entry.js`。在 ESA 控制台导入仓库并使用 `pnpm run build` 构建；按 ESA 控制台实际名称配置 KV namespace，并设置 `JWT_SECRET`。ESA 的 KV 适配、请求级缓存和 SPA 回退已经封装在 `esa-entry.ts` 中，不使用 Cloudflare 的 `wrangler.toml` 绑定方式。

### 方式四：Vercel / AWS Serverless / Node

仓库提供以下适配入口：

- Vercel：`api/[...route].ts` + `vercel.json`
- AWS Lambda：`handler.ts` + `serverless.yml`，可运行 `pnpm run sls:deploy`
- Node：构建后端产物为 `dist-server/api/[...route].js`

```bash
pnpm install --frozen-lockfile
pnpm run build
```

这些入口不是 Cloudflare KV 的自动替代品。部署到 Vercel、Lambda 或普通 Node 容器时，需要自行配置静态 `dist/` 的托管方式和持久化后端；否则 `/healthz` 会显示 `mode: "memory"`，配置可能在实例重启后丢失。

## 🔐 认证、存储与验证

- 登录密码使用 `ADMIN_PASSWORD`；管理员脚本使用独立的 `ADMIN_API_TOKEN`
- `JWT_SECRET` 不要提交到 Git；生产环境建议通过平台 Secret 配置
- Cloudflare Workers 默认使用 `OPENLIST_KV` 保存用户、存储、设置和分享数据
- 公开设置接口会过滤敏感字段；Worker 默认关闭匿名 guest 文件系统访问
- 部署后优先检查：

```bash
curl -i https://<你的域名>/health
curl -i https://<你的域名>/healthz
```

`/health` 是存活探针；`/healthz` 会实际检查配置和持久化状态，已配置的 KV 无法读取时返回 `503`。

## 🧪 开发验证

```bash
pnpm run lint
pnpm run test:189
pnpm exec tsx --test $(find src/backend -name '*.test.ts' -print)
```

改动后端或前端构建链时，还应确认 `pnpm run build` 成功，并检查 `cloud-functions/[[default]].js` 是否与源码同步。

## 📚 文档与社区

- [官方文档](https://doc.oplist.org)
- [中国镜像](https://doc.oplist.org.cn)
- [Cloudflare Workers 部署指南](./docs/deploy-cloudflare-workers.md)
- [EdgeOne Makers 部署指南](./docs/edgeone.md)
- [多数据库后端说明](./docs/database-backend-multi-support.md)
- [GitHub Discussions](https://github.com/OpenListTeam/OpenList/discussions)
- [OpenList Telegram 交流群](https://t.me/OpenListTeam)

## 📄 许可证与免责声明

本项目遵循 [AGPL-3.0](./LICENSE)。OpenList-Worker、OpenList 及其存储服务驱动不代表任何网盘、云平台或第三方服务商；使用时请遵守相关服务条款和当地法律法规。软件按“原样”提供，账号风控、限速、封禁以及第三方接口变更风险由使用者自行承担。
