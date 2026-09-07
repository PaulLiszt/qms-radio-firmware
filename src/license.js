/*
 * license.js — 服务端 ECDSA P-256 令牌签发（与固件 mbedTLS 验签互通）
 *
 * 算法：ECDSA P-256(secp256r1) + SHA-256，DER 编码签名。
 *   - 选用 P-256 而非 Ed25519：ESP-IDF v5.5.5 默认 mbedTLS 未编入 Ed25519 签名，
 *     但已内置 P-256 验签（TLS 必备），零额外配置即可互通。
 *   - 安全模型等价：私钥（服务器）签名，公钥（固件）验签，逆向固件无法伪造。
 *
 * 令牌线格式（小端，共 11 字节）：版本(1) | 发行UTC(4) | 失效UTC(4) | 功能位图(2)
 * 整包签名：签名覆盖整个 token，防"复用合法时间签名贴更大请求"。
 * 输出 hex = token(11字节,22 hex) || sig(DER 变长, ~70-72字节, ~140-144 hex)
 */
const crypto = require('crypto');
const fs = require('fs');

const TOKEN_VERSION = 1;
const SLOT = 7200; // 2 小时（秒）。密码按 UTC 每 2 小时变化一次。

let _priv = undefined;
function loadPrivateKey() {
  if (_priv) return _priv;
  let pem = process.env.LICENSE_PRIVATE_KEY;
  if (!pem && process.env.LICENSE_PRIVATE_KEY_FILE) {
    pem = fs.readFileSync(process.env.LICENSE_PRIVATE_KEY_FILE, 'utf8');
  }
  if (!pem) {
    throw new Error('LICENSE_PRIVATE_KEY / LICENSE_PRIVATE_KEY_FILE 未设置（先运行 node tools/genkey.js）');
  }
  _priv = crypto.createPrivateKey(pem);
  return _priv;
}

function buildToken(issue, expire, featureBits) {
  const buf = Buffer.alloc(11);
  buf[0] = TOKEN_VERSION;
  buf.writeUInt32LE(issue >>> 0, 1);
  buf.writeUInt32LE(expire >>> 0, 5);
  buf.writeUInt16LE(featureBits & 0xffff, 9);
  return buf;
}

/*
 * 计算时间窗：每次授权固定为当前 2 小时时隙（floor(now/7200)*7200 ~ +2h）。
 * 已取消付费到期(paidUntil)概念：令牌有效期即 2 小时时隙，与任何账户期限无关。
 */
function computeWindow(now) {
  const slotStart = Math.floor(now / SLOT) * SLOT;
  const slotEnd = slotStart + SLOT;
  return { issue: slotStart, expire: slotEnd };
}

/*
 * 签发令牌，返回 hex（token[11] || sig[DER 变长]）。
 * 任何已登录账户均可签发（已取消付费到期/授权门槛）。
 */
function signToken(featureBits, now) {
  now = (now != null) ? now : Math.floor(Date.now() / 1000);
  const { issue, expire } = computeWindow(now);
  const token = buildToken(issue, expire, featureBits);
  // ECDSA P-256：hash 'sha256' -> 对 token 做 SHA-256 后用私钥签；DER 编码（mbedTLS 原生可验）。
  const sig = crypto.sign('sha256', token, loadPrivateKey());
  return Buffer.concat([token, sig]).toString('hex');
}

module.exports = { signToken, buildToken, computeWindow, SLOT, TOKEN_VERSION };
