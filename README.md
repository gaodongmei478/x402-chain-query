# x402-chain-query

最小可用的 **x402 v2** 卖家（Express）+ 买家冒烟脚本：在 **Base 主网**（`eip155:8453`）上提供两个付费链上查询接口，使用 **exact** 方案与 **CDP Facilitator**，并声明 **Bazaar** 发现扩展。

## 定价与试用

- 首发：**$0.01**/次（`/balance` 与 `/gas`，exact）
- 每地址免费试用：**10** 次（`FREE_TRIAL_N`）
- 直上 Base 主网；Sepolia 仅本地冒烟，**禁止**用测试 facilitator 收真钱

## 功能

| 路由 | 说明 | 价格 |
|------|------|------|
| `GET /balance?address=0x...` | Base ETH 余额（`wei` + `ether` 字符串） | **$0.01** |
| `GET /gas` | 通过 `eth_gasPrice` 的 Base gas 提示 | **$0.01** |
| `GET /health` | 健康检查（免费） | — |

- **网络**: `eip155:8453`（Base mainnet）
- **收款地址 payTo**: `0xc8aaea11c93a438e2fc7bd5cddb9a6936ed3595c`
- **Facilitator**: `https://api.cdp.coinbase.com/platform/v2/x402`（`HTTPFacilitatorClient`）
- **RPC**: 环境变量 `BASE_RPC_URL`，默认 `https://mainnet.base.org`

## 安装

```bash
cd x402-chain-query
cp .env.example .env
# 编辑 .env：填入 CDP 密钥、买家私钥等（切勿提交真实密钥）
npm install
```

### 环境变量（见 `.env.example`）

| 变量 | 用途 |
|------|------|
| `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` | **CDP Facilitator 鉴权**（主网 verify/settle 必需）。在 [CDP Portal](https://portal.cdp.coinbase.com/) 创建 |
| `PAY_TO` | 收款地址（默认即上述 payTo） |
| `BASE_RPC_URL` | Base 公共 RPC |
| `PORT` | 卖家监听端口（默认 `4021`） |
| `FACILITATOR_URL` | Facilitator 覆盖（默认 CDP） |
| `EVM_PRIVATE_KEY` | 买家冒烟脚本支付用私钥 |
| `SELLER_URL` | 买家请求的卖家 URL（默认 `http://127.0.0.1:4021`） |
| `QUERY_ADDRESS` | 买家查询余额的示例地址 |

未配置 CDP 密钥时：仍可返回 **402 Payment Required**（便于 curl 演示），但 **verify/settle 会失败**。

## 运行卖家

```bash
npm run dev     # tsx watch
# 或
npm start       # tsx src/server.ts
```

类型检查：

```bash
npm run typecheck
```

## curl 演示 402（无需支付）

服务启动后：

```bash
curl -i "http://127.0.0.1:4021/gas"
curl -i "http://127.0.0.1:4021/balance?address=0xc8aaea11c93a438e2fc7bd5cddb9a6936ed3595c"
```

预期：

- HTTP **402 Payment Required**
- 响应头含 `PAYMENT-REQUIRED`（Base64 JSON，含 exact / 价格 / 网络 / payTo）

免费健康检查：

```bash
curl -s "http://127.0.0.1:4021/health" | jq .
```

## 运行买家冒烟脚本

先启动卖家，再：

```bash
export EVM_PRIVATE_KEY=0x你的私钥
export SELLER_URL=http://127.0.0.1:4021
npm run buyer
```

买家侧控制：

- `@x402/fetch` 的 `wrapFetchWithPayment`（**不要**使用已弃用的 `x402-fetch`）
- `spendControls.maxAmountPerPayment = "$1"`
- **进程内**每日累计支出护栏 **$20**（UTC 日切）
- **仅允许** `localhost` / `127.0.0.1`（`SELLER_URL` 其它主机直接拒绝）

买家钱包需在 Base 主网持有足够 **USDC**（及少量 ETH 视方案而定）。

## Bazaar 发现

两条付费路由均通过 `declareDiscoveryExtension`（`@x402/extensions/bazaar`）声明元数据。

**重要：**

1. **公网 HTTPS**：要被 CDP Bazaar 收录/发现，卖家 API 通常需要可公网访问的 **HTTPS** URL（本地 `127.0.0.1` 不会被索引）。
2. **首次自行支付结算**：Bazaar 目录化发生在带 `bazaar` 扩展的 **PaymentPayload 被 facilitator settle** 时。仅声明扩展不够——**资源所有者需先完成一次真实支付并成功 settle**，客户端会回显 bazaar 扩展，facilitator 才会编目。参见 [Bazaar 文档](https://docs.x402.org/extensions/bazaar)。

## 价格与网络速查

- `/balance` → **$0.01** USDC（exact）
- `/gas` → **$0.01** USDC（exact）
- 网络 → **`eip155:8453`**
- payTo → **`0xc8aaea11c93a438e2fc7bd5cddb9a6936ed3595c`**

## 依赖说明

核心包：`@x402/express` `@x402/core` `@x402/evm` `@x402/fetch` `@x402/extensions` `express` `viem` `typescript` `tsx`。

可选：`@coinbase/cdp-sdk` 用于 `createCdpFacilitatorClient()`，向 CDP Facilitator 注入 JWT（仍是 `HTTPFacilitatorClient`）。

## 参考

- 卖家快速开始：https://docs.x402.org/getting-started/quickstart-for-sellers
- 买家快速开始：https://docs.x402.org/getting-started/quickstart-for-buyers
- Bazaar：https://docs.x402.org/extensions/bazaar

## 公网部署（默认 Cloudflare）

见 [DEPLOY-cloudflare.md](./DEPLOY-cloudflare.md)。公网 HTTPS + 主人自签 ≤$1 settle 后 Bazaar 才可能索引。
