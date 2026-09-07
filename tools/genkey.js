/*
 * genkey.js — 生成 ECDSA P-256 密钥对并写入两处：
 *   1) 服务器私钥 -> server/secrets/private_key.pem（权限 600，切勿提交/外泄）
 *   2) 固件公钥   -> components/licensing/license_pubkey.h（PEM 文本，含公钥；无私钥）
 *
 * 两端的密钥必须一一对应：先跑本脚本，再用新公钥重新编译烧录固件。
 *
 * 算法选型说明：原设计用 Ed25519，但 ESP-IDF v5.5.5 的 mbedTLS(3.6.6) 默认未编入
 * Ed25519 签名能力（Kconfig 不暴露该符号，esp_config.h 仅含 X25519 交换）。
 * 改用 ECDSA P-256(secp256r1)：ESP-IDF 默认 mbedTLS 已内置 P-256 验签（TLS 要用），
 * 无需 menuconfig、无需改 mbedTLS 配置；安全模型等价（私钥签/公钥验）。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',   // = secp256r1 = P-256
});

// 导出 PEM 公钥（SubjectPublicKeyInfo，mbedtls_pk_parse_public_key 可直接载入）
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

const root = path.join(__dirname, '..');
const secretDir = path.join(root, 'secrets');
fs.mkdirSync(secretDir, { recursive: true });
const privPath = path.join(secretDir, 'private_key.pem');

// ⛔ 密钥固定保护：除非显式 --force，否则已存在的密钥绝不覆盖。
// 密钥对必须固件公钥(server/../components/licensing/license_pubkey.h)
// 与服务器私钥(server/secrets/private_key.pem)一一对应。误跑本脚本会
// 静默换掉其中一侧 → 令牌一次性全部失效，且旧令牌无法恢复。
// 轮换（用户明确要求时）也必须三件套同步：genkey --force → 重编固件 → 重布私钥。
const force = process.argv.includes('--force');
const privExists = fs.existsSync(privPath);
const pubPath = path.join(root, '..', 'components', 'licensing', 'license_pubkey.h');
const pubExists = fs.existsSync(pubPath);
if ((privExists || pubExists) && !force) {
  console.error('⛔ 密钥已存在，已按约定固定，未做覆盖。');
  console.error('   现有密钥：');
  if (privExists) console.error('     ' + privPath);
  if (pubExists) console.error('     ' + pubPath);
  console.error('   如需主动轮换密钥，请加 --force，并务必完成以下三步（缺一不可）：');
  console.error('     1) 本地用 ESP-IDF 重新编译并烧录固件（写入新公钥）；');
  console.error('     2) 把新 server/secrets/private_key.pem 传到云机 server/secrets/ 后 `docker compose up -d`；');
  console.error('     3) 新旧密钥不可混用——未烧新固件前，旧令牌仍用旧私钥；轮换期间旧令牌会全部失效。');
  process.exit(1);
}
if (force) {
  // 轮换时备份旧文件，便于紧急回滚（secrets/ 已被 .gitignore 排除，不会进仓库）
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (privExists) fs.renameSync(privPath, privPath + '.' + ts + '.bak');
  if (pubExists) fs.renameSync(pubPath, pubPath + '.' + ts + '.bak');
  console.log('🔁 --force 已启用，旧密钥已备份为 .bak（时间戳），开始轮换…');
}

fs.writeFileSync(privPath, privPem);
fs.chmodSync(privPath, 0o600);

// 把 PEM 公钥逐行包成 C 字符串字面量（每行末尾加 `\` 续行，保留 \n 转义以便 mbedTLS 正常解析）
const pubLines = pubPem.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const cstr = pubLines
  .map((l, i, arr) => '    "' + l + '\\n"' + (i === arr.length - 1 ? '' : ' \\'))
  .join('\n');

const header = `/*
 * license_pubkey.h — 设备端硬编码的验签公钥（ECDSA P-256 / secp256r1, PEM）
 * 由 server/tools/genkey.js 自动生成。仅含公钥；私钥只在服务器持有。
 * 逆向固件只能掏出公钥，无法反推私钥、无法伪造令牌。
 */
#ifndef LICENSE_PUBKEY_H
#define LICENSE_PUBKEY_H

#define LICENSE_PUBKEY_PEM \\
${cstr}

#endif /* LICENSE_PUBKEY_H */
`;
fs.writeFileSync(pubPath, header);

console.log('✅ 已写入固件公钥(PEM):', pubPath);
console.log('✅ 已写入服务器私钥:', privPath, '(权限 600)');
console.log('');
console.log('下一步：');
console.log('  1) 在本地用 ESP-IDF 重新编译并烧录固件（新公钥已写入）。');
console.log('  2) 把 server/secrets/private_key.pem 传到服务器 server/secrets/ 后启动容器。');
