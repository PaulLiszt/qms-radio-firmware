// 验证：server/secrets/private_key.pem 派生的公钥 == components/licensing/license_pubkey.h 内嵌公钥
// 并做端到端 签名->验签 自测。
const c = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const priv = c.createPrivateKey(fs.readFileSync(path.join(root, 'secrets', 'private_key.pem'), 'utf8'));

// 从 header 重建 PEM
const hdr = fs.readFileSync(path.join(root, '..', 'components', 'licensing', 'license_pubkey.h'), 'utf8');
const lit = [...hdr.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
const pem = lit.join('').replace(/\\n/g, '\n') + '\n';
const k = c.createPublicKey(pem);
const derived = priv.createPublicKey ? priv.createPublicKey() : c.createPublicKey(priv);

console.log('派生公钥 == 内嵌公钥 :', derived.export({ type: 'spki', format: 'pem' }).trim() === pem.trim() ? 'MATCH ✅' : 'MISMATCH ❌');

const token = Buffer.alloc(11);
token[0] = 1;
token.writeUInt32LE(1700000000 >>> 0, 1);
token.writeUInt32LE(1700007200 >>> 0, 5);
token.writeUInt16LE(0x01, 9);
const sig = c.sign('sha256', token, priv);
console.log('签名长度(字节):', sig.length, '(DER, mbedTLS 预期 70-72)');
console.log('端到端 签名->验签:', c.verify('sha256', token, k, sig) ? 'PASS ✅' : 'FAIL ❌');
const bad = Buffer.from(token); bad[9] ^= 0xFF;
console.log('篡改令牌验签(应 false):', c.verify('sha256', bad, k, sig));
