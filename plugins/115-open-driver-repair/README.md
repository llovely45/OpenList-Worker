# 115 开放平台驱动修复插件

这个插件用于修复 `openlist-worker` 的 115 Open Platform 存储分派问题。

修复动作只会：

- 将 `115OPEN` / `115-Pan` 等存储驱动名规范化为 `115Open`；
- 更新 `modified`，让 Worker 丢弃旧的驱动实例缓存；
- 保留原有 `addition` 内容，不读取、显示或改写 access token / refresh token。

插件按钮只读取浏览器中现有的 OpenList 登录会话令牌，用于调用管理员修复接口；不会读取存储配置中的 115 令牌。

安装并启用后，支持插件 SDK 的前端会在管理员顶部操作栏显示“修复 115 Open”；不含 SDK 的前端会显示备用按钮。点击后重新打开 `/115` 目录即可验证。

本插件依赖 Worker 中的 `/api/admin/driver/115open/repair` 接口。接口需要管理员权限，并且不会主动调用 115 API；目录请求会使用新的 `Pan115Driver` 完成 token 验证。

## GitHub Actions 自动化

仓库中的 `.github/workflows/deploy-worker.yml` 会在 `main` 更新后构建、测试并部署 Worker，随后上传插件构件并自动安装插件、执行一次修复。需要配置以下 GitHub Actions Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `OPENLIST_ADMIN_TOKEN`：OpenList 管理设置中的原始静态 API token，不要包含 `Bearer ` 前缀

可选 Actions Variable：`OPENLIST_BASE_URL`，默认值为 `https://alist.nmsl.best`。
