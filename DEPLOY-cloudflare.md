# Cloudflare Workers 部署（默认公网路径）

入口：`wrangler.toml` + `src/worker.ts`（Hono + `@x402/hono`）。

## 已写入 `[vars]`（非密钥）
- `PAY_TO` / `NETWORK=eip155:8453` / `BASE_RPC_URL`
- `FACILITATOR_URL=https://facilitator.payai.network`（PayAI 默认；免费档无需 API key）
- `PRICE_BALANCE=$0.01` / `PRICE_GAS=$0.01` / `FREE_TRIAL_LIMIT=10`
- **禁止** `https://x402.org/facilitator` 用于主网真钱

## Facilitator 说明
- **默认 PayAI**：`https://facilitator.payai.network` — 无密钥即可 verify/settle（免费档）
- **备选**：Heurist `https://facilitator.heurist.xyz`；Mogami v2 `https://v2.facilitator.mogami.tech`
- **自托管**：后续需要 gas signer，通过钱包配置，勿在聊天中索要私钥
- **可选 CDP**：若日后有 CDP 密钥，将 `FACILITATOR_URL` 改回 `https://api.cdp.coinbase.com/platform/v2/x402` 并 `wrangler secret put` 两个 CDP 密钥；仅当 URL 仍指向 CDP host 时才会走 `createCdpFacilitatorClient`

## 主人需配置的 Secrets
当前 PayAI 默认路径：**无需** CDP secrets。

部署机环境还需：
- `CLOUDFLARE_API_TOKEN`（Edit Cloudflare Workers）— **当前阻塞项**
- `CLOUDFLARE_ACCOUNT_ID`（可选但建议）

**不要**把 `EVM_PRIVATE_KEY` 配进卖家 Worker。

## 部署
```bash
npm ci
# 仅在改用 CDP facilitator 时：
# npx wrangler secret put CDP_API_KEY_ID
# npx wrangler secret put CDP_API_KEY_SECRET
npx wrangler deploy
```

## 验收
- `GET /health` → 200，含 payTo / prices / network / facilitator=PayAI
- 试用内：`GET /gas` 或 `/balance` 可 200
- 试用尽：返回 **402** + `PAYMENT-REQUIRED`
- 付 USDC（exact）settle 成功后返回查询 JSON

## 已知限制
- 免费试用计数为 Worker 内存 Map：冷启动/多 isolate 会重置，非持久配额。
