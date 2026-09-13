# Cloudflare Workers 部署路径（已定默认）

Express 直跑在 Workers 上不完整；本仓当前是 **Node/Express 可跑源**。上公网默认路径：

## 推荐（短期可上线）
1. 先把本服务跑在支持 Node 的边缘/容器（Cloudflare **Containers** / **Workers + nodejs_compat** 实验，或临时 Fly/Railway）拿 **HTTPS 公网 URL**。
2. Bazaar 需要公网 HTTPS + **≥1 笔主人自签 settle**（≤$1）才会索引。本桌不代签。
3. 环境变量（Workers Secrets / 平台 secrets）：
   - `CDP_API_KEY_ID`
   - `CDP_API_KEY_SECRET`
   - `PAY_TO`（默认已写死公开地址）
   - `BASE_RPC_URL`
   - `FREE_TRIAL_LIMIT=10`
   - **不要**配置 `EVM_PRIVATE_KEY` 到公网卖家

## 中期（真·Workers）
把卖家迁到 `@x402/hono` + Cloudflare Worker（本仓预留下一 PR）：
- `wrangler.toml` + `src/worker.ts`（Hono）
- 同路由：`/balance` `/gas` `/health`
- 同 x402 exact / Base / CDP / Bazaar

## 验收
- `curl -i https://<host>/gas` → 402（试用耗尽后）或 200（试用内）
- 付费成功后 JSON 字段见 README / 副总 schema 回执
