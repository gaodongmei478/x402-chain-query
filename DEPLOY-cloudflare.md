# Cloudflare Workers 部署（默认公网路径）

入口：`wrangler.toml` + `src/worker.ts`（Hono + `@x402/hono`）。

## 已写入 `[vars]`（非密钥）
- `PAY_TO` / `NETWORK=eip155:8453` / `BASE_RPC_URL`
- `FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402`（勿用 x402.org 测试 facilitator）
- `PRICE_BALANCE=$0.01` / `PRICE_GAS=$0.01` / `FREE_TRIAL_LIMIT=10`

## 主人需配置的 Secrets（`wrangler secret put`）
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`

部署机环境还需：
- `CLOUDFLARE_API_TOKEN`（Edit Cloudflare Workers）
- `CLOUDFLARE_ACCOUNT_ID`（可选但建议）

**不要**把 `EVM_PRIVATE_KEY` 配进卖家 Worker。

## 部署
```bash
npm ci
npx wrangler secret put CDP_API_KEY_ID
npx wrangler secret put CDP_API_KEY_SECRET
npx wrangler deploy
```

## 验收
- `GET /health` → 200，含 payTo / prices / network
- 试用内：`GET /gas` 或 `/balance` 可 200
- 试用尽：返回 **402** + `PAYMENT-REQUIRED`
- 付 USDC（exact）settle 成功后返回查询 JSON

## 已知限制
- 免费试用计数为 Worker 内存 Map：冷启动/多 isolate 会重置，非持久配额。
