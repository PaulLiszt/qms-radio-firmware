/*
 * adduser.js — 添加一个用户（SHA-256 密码，付费到期，功能位图）。
 * 用法: node tools/adduser.js <用户名> <密码> <到期Unix秒 或 ISO时间> [功能位图16进制, 默认 0xffff]
 */
const { loadUsers, saveUsers, hashPassword } = require('../src/users');

const [,, username, password, paidUntilArg, featureBitsArg] = process.argv;
if (!username || !password || !paidUntilArg) {
  console.log('用法: node tools/adduser.js <用户名> <密码> <到期Unix秒 或 ISO时间> [功能位图16进制, 默认 0xffff]');
  process.exit(1);
}

let paidUntil;
if (/^\d+$/.test(paidUntilArg)) {
  paidUntil = parseInt(paidUntilArg, 10);
} else {
  paidUntil = Math.floor(new Date(paidUntilArg).getTime() / 1000);
}
if (!Number.isFinite(paidUntil)) {
  console.error('付费到期时间解析失败');
  process.exit(1);
}
const featureBits = (featureBitsArg != null) ? parseInt(featureBitsArg, 16) : 0xffff;

const users = loadUsers();
const existing = users.find(u => u.username === username);
const entry = { username, passHash: hashPassword(password), paidUntil, featureBits };
if (existing) Object.assign(existing, entry);
else users.push(entry);
saveUsers(users);
console.log('✅ 用户', username, '已保存');
console.log('   付费到期:', new Date(paidUntil * 1000).toISOString());
console.log('   功能位图: 0x' + (featureBits & 0xffff).toString(16));
