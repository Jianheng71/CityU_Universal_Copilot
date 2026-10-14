# CityU Universal Sinno

基于 Chrome 侧边栏与动态聚光灯的 CityU AIMS 操作指南。

## 部署 AI 服务

AI 代理支持 Vercel Functions。服务端 API 密钥只保存在部署平台，不要放进扩展源码或提交到 Git。

1. 在 Vercel 导入此 GitHub 仓库，Framework Preset 选择 **Other**，Root Directory 保持仓库根目录。`vercel.json` 已将 Build Command 设为只部署 API functions，不会误运行 Chrome 扩展的构建流程。
2. 在项目 **Settings → Environment Variables** 添加 `DEEPSEEK_API_KEY` 和/或 `GEMINI_API_KEY`，值从对应 AI 服务商获取。至少配置一个；环境变量只添加到 Production。保存后需要重新部署 Production，环境变量才会进入运行中的函数。
3. 部署项目后，确认 `https://<你的-Vercel-域名>/api/health` 返回 `{"ok":true,...}`。
4. 如果 Vercel 域名不是 `cityu-universal-sinno-ai.vercel.app`，将 `src/services/aiRouter.ts` 的默认代理 URL 和 `package.json` manifest 中的 AI 服务 host permission 一并改为你的域名，然后重新构建扩展。也可在构建扩展时设置 `PLASMO_PUBLIC_AI_PROXY_URL=https://<你的-Vercel-域名>/api/ai` 覆盖代理 URL；host permission 仍需同步更新。
5. 在 Vercel **Settings → Deployment Protection** 确保公开部署可访问；代理接口本身不需要用户登录。

扩展可选择 DeepSeek 或 Gemini。使用会消耗配置该服务端密钥所对应账户的额度，费用由部署方承担。代理不记录用户问题；请求内容会发送到所选 AI 服务商处理。AI 接口包含每个服务实例每 IP 每分钟 20 次的基础限流；部署方还应在 AI 服务商账户中设置用量限额或账单告警。无状态函数的限流不等同于跨实例的强防护。

## 本地运行 AI 代理

```sh
npm install
cp .env.example .env
# 在 .env 中填写至少一个服务端 API 密钥
npm run proxy
```

本地代理地址为 `http://localhost:3001/api/ai`，健康检查为 `http://localhost:3001/api/health`。不要提交 `.env`。
