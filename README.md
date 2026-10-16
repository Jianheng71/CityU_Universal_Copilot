# CityU Universal Sinno

基于 Chrome 侧边栏与动态聚光灯的 CityU AIMS 操作指南。

## 下载并安装 Chrome 扩展（无需本地终端）

**[点击直接下载 Chrome 扩展 ZIP](https://github.com/Jianheng71/CityU_Universal_Copilot/releases/latest/download/CityU-Universal-Sinno-Chrome.zip)**。这是最新稳定版；下载后解压并按下面步骤安装。

1. 下载并在 Finder 中解压 ZIP。
2. Chrome 打开 `chrome://extensions`，开启 **开发者模式**，点击 **加载已解压的扩展程序**，选择解压后含有 `manifest.json` 的文件夹。

安装后点击 Chrome 工具栏的扩展图标打开侧边栏。若 Chrome 显示安全提示，只从本仓库 Actions 页面下载构建产物。

## 部署 AI 服务（Cloudflare Workers）

后端部署在 Cloudflare Workers；不再使用 Vercel。AI 服务密钥保存在 Cloudflare Worker Secrets 中，不放进扩展或 GitHub。

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages → Create application → Workers → Connect to Git**，授权 GitHub 并选择 `Jianheng71/CityU_Universal_Copilot`。
2. Production branch 选择 `jianheng71-bugfix`，Root directory 设为 `workers`。项目已带 `wrangler.jsonc`，不需要 Build command；Worker 名称为 `cityu-universal-sinno-ai`。完成创建并部署。
3. 在 Worker 的 **Settings → Variables and Secrets** 中添加至少一个 Secret：`DEEPSEEK_API_KEY` 或 `GEMINI_API_KEY`。密钥需分别在 [DeepSeek API 平台](https://platform.deepseek.com/api_keys) 或 [Google AI Studio](https://aistudio.google.com/apikey) 创建；Vercel AI Gateway Key 不能代替这两种服务商密钥。保存 Secret 后重新部署 Worker。
4. Worker 部署后会显示一个 `https://<worker>.<account-subdomain>.workers.dev` 地址。打开该地址后加 `/api/health`，应返回 `{"ok":true,"service":"cityu-universal-sinno-ai"}`。把 Worker 的完整域名提供给仓库维护者，用于配置扩展并自动构建安装包。
5. 扩展中选 DeepSeek 或 Gemini。只有配置相应 Secret 的模型才能调用。费用按对应服务商账户用量结算；代理不记录问题，但请求会发送给所选 AI 服务商。接口有基础的每 IP 限流；还应在服务商账户设置用量限制或账单提醒。

Worker 通过 Git 集成从 `workers` 子目录独立部署，不会安装或构建 Chrome 扩展依赖。后续提交到 Production branch 会自动触发 Worker 部署。
