/*
 * users.js — 用户库（MVP）。
 * 账户名即呼号（callsign）；新增字段 dmrId / email，三者全局唯一。
 * 密码以 SHA-256 存储；featureBits 功能位图。已取消付费到期 paidUntil 概念。
 * lastLoginAt / lastParamWriteAt：活跃度时间戳，用于「一个月不活跃则冻结」规则；frozen 为冻结状态。
 * 后续接支付系统时，把 loadUsers/authenticate 换成数据库即可，接口不变。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

const CALLSIGN_RE = /^[A-Z0-9]{2,12}([-/][A-Z0-9]{1,4})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DMR_RE = /^\d{1,9}$/;

// 保留名：注册接口拒绝，避免有人抢注成管理员账户（种子账号自身绕过）
const RESERVED = new Set(['ADMIN', 'ROOT', 'ADMINISTRATOR']);

// 冻结阈值：连续 30 天未登录且未写入参数，则冻结账户（管理员豁免）
const FROZEN_DAYS = 30;
const FROZEN_SEC = FROZEN_DAYS * 86400;

const ADMIN_CALLSIGN = 'ADMIN';
const ADMIN_EMAIL = 'admin@ba4qms.top';
// 管理员种子密码：优先读环境变量 ADMIN_PASSWORD（部署时在 .env / 编排环境注入），
// 未设置时回退到占位值——占位值仅用于「全新部署」首次播种，生产务必通过环境变量覆盖。
// 注意：真实密码切勿写入源码或提交到仓库（已改为 env 注入）。
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'QmsRadio!AdminChangeMe';

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw, 'utf8').digest('hex');
}

// 兼容旧账户（仅 username，无 callsign/email）：按 username 或 callsign 匹配
function authenticate(callsign, password) {
  const c = String(callsign || '').trim().toUpperCase();
  const users = loadUsers();
  const u = users.find(x =>
    (String(x.callsign || '').toUpperCase() === c) ||
    (String(x.username || '').toUpperCase() === c));
  if (!u) return null;
  if (u.passHash !== hashPassword(password)) return null;
  return u;
}

/*
 * 注册新账户。抛出的 Error.code 供路由映射为 HTTP 状态与前端提示：
 *   bad_callsign / bad_dmrid / bad_email / weak_password / callsign_exists / dmr_exists / email_exists / reserved
 * isAdmin 仅种子账号可置 true；普通注册永远为 false，且 ADMIN/ROOT 等保留名被拒。
 */
function createUser({ callsign, dmrId, email, password, trialDays = 0, isAdmin = false }) {
  const cs = String(callsign || '').trim().toUpperCase();
  const dm = String(dmrId || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '');

  if (!isAdmin && RESERVED.has(cs)) { const e = new Error('reserved'); e.code = 'reserved'; throw e; }
  if (!CALLSIGN_RE.test(cs)) { const e = new Error('bad callsign'); e.code = 'bad_callsign'; throw e; }
  if (!DMR_RE.test(dm)) { const e = new Error('bad dmrid'); e.code = 'bad_dmrid'; throw e; }
  if (!EMAIL_RE.test(em)) { const e = new Error('bad email'); e.code = 'bad_email'; throw e; }
  if (pw.length < 6) { const e = new Error('weak password'); e.code = 'weak_password'; throw e; }

  const users = loadUsers();
  // 空值（旧管理员账户 dmrId=0 / email='')不参与唯一性比对
  if (users.some(x => String(x.callsign || x.username || '').toUpperCase() === cs)) {
    const e = new Error('callsign exists'); e.code = 'callsign_exists'; throw e;
  }
  if (dm && users.some(x => x.dmrId && Number(x.dmrId) === Number(dm))) {
    const e = new Error('dmr exists'); e.code = 'dmr_exists'; throw e;
  }
  if (em && users.some(x => x.email && x.email.toLowerCase() === em)) {
    const e = new Error('email exists'); e.code = 'email_exists'; throw e;
  }

  const now = Math.floor(Date.now() / 1000);
  const u = {
    username: cs,           // 账户名 = 呼号
    callsign: cs,
    dmrId: Number(dm),
    email: em,
    passHash: hashPassword(pw),
    featureBits: 0xffff,
    isAdmin: !!isAdmin,
    createdAt: now,
    lastLoginAt: now,       // 注册即视为一次活跃
    lastParamWriteAt: 0,
    frozen: false,
  };
  users.push(u);
  saveUsers(users);
  return u;
}

// 服务器启动种子：若没有任何管理员，则创建唯一管理员账户（账号 ADMIN / 给定密码）。
// 已存在管理员或不含 ADMIN 但已有同名时跳过，绝不覆盖已有用户。
function seedAdmin() {
  const users = loadUsers();
  if (users.some(x => x.isAdmin)) return;            // 已有管理员，不重复种子
  if (users.some(x => (x.callsign || x.username || '').toUpperCase() === ADMIN_CALLSIGN)) return;
  const now = Math.floor(Date.now() / 1000);
  const u = {
    username: ADMIN_CALLSIGN,
    callsign: ADMIN_CALLSIGN,
    dmrId: 0,
    email: ADMIN_EMAIL,
    passHash: hashPassword(ADMIN_PASSWORD),
    featureBits: 0xffff,
    isAdmin: true,
    createdAt: now,
    lastLoginAt: now,
    lastParamWriteAt: now,
    frozen: false,
  };
  users.push(u);
  saveUsers(users);
  console.log('[users] 已种子管理员账户 ADMIN');
}

// 管理员修改用户权限：功能位图(featureBits)、冻结(frozen)，不触碰 isAdmin。已取消会员/付费到期概念。
function setUserPermission(callsign, { featureBits, frozen } = {}) {
  const cs = String(callsign || '').trim().toUpperCase();
  const users = loadUsers();
  const u = users.find(x => (x.callsign || x.username || '').toUpperCase() === cs);
  if (!u) { const e = new Error('not found'); e.code = 'not_found'; throw e; }
  if (featureBits != null) {
    const v = Number(featureBits);
    if (!Number.isFinite(v) || v < 0 || v > 0xffff) { const e = new Error('bad bits'); e.code = 'bad_bits'; throw e; }
    u.featureBits = Math.floor(v);
  }
  if (frozen != null) u.frozen = !!frozen;
  saveUsers(users);
  return u;
}

// 记录一次登录活跃（更新 lastLoginAt）；同时返回该用户对象，便于调用方判断冻结。
function recordLogin(callsign) {
  const cs = String(callsign || '').trim().toUpperCase();
  const users = loadUsers();
  const u = users.find(x => (x.callsign || x.username || '').toUpperCase() === cs);
  if (u) { u.lastLoginAt = Math.floor(Date.now() / 1000); saveUsers(users); }
  return u;
}

// 计算账户是否应被冻结：管理员豁免；账户创建后首 30 天为宽限；
// 之后若「最近一次登录」与「最近一次写入参数」都早于阈值（即整月无活跃），则冻结。
function computeFrozen(u, now) {
  if (!u || u.isAdmin) return false;
  if (u.frozen) return true;
  const last = Math.max(
    u.lastLoginAt || u.createdAt || 0,
    u.lastParamWriteAt || 0
  );
  if (!last) return false; // 无时间戳的旧账户暂不冻结
  return (now - last) >= FROZEN_SEC;
}

// 全量扫描：将超过阈值且未冻结的账户标记为 frozen（幂等，仅在状态变化时写盘）。
function markFreezeSweep() {
  const users = loadUsers();
  let changed = false;
  const now = Math.floor(Date.now() / 1000);
  for (const u of users) {
    if (u.isAdmin || u.frozen) continue;
    if (computeFrozen(u, now)) { u.frozen = true; changed = true; }
  }
  if (changed) saveUsers(users);
  return changed;
}

// 解冻：管理员恢复被冻结账户，并刷新活跃时间戳使其重新进入宽限期。
function unfreezeUser(callsign) {
  const cs = String(callsign || '').trim().toUpperCase();
  const users = loadUsers();
  const u = users.find(x => (x.callsign || x.username || '').toUpperCase() === cs);
  if (!u) { const e = new Error('not found'); e.code = 'not_found'; throw e; }
  u.frozen = false;
  u.lastLoginAt = Math.floor(Date.now() / 1000);
  saveUsers(users);
  return u;
}

// 删除单个用户（管理员不可删；返回 true）。
function deleteUser(callsign) {
  const cs = String(callsign || '').trim().toUpperCase();
  const users = loadUsers();
  const idx = users.findIndex(x => (x.callsign || x.username || '').toUpperCase() === cs);
  if (idx < 0) { const e = new Error('not found'); e.code = 'not_found'; throw e; }
  if (users[idx].isAdmin) { const e = new Error('cannot delete admin'); e.code = 'is_admin'; throw e; }
  users.splice(idx, 1);
  saveUsers(users);
  return true;
}

// 批量删除（管理员自动跳过；返回实际删除数量）。
function deleteUsers(callsigns) {
  const set = new Set((callsigns || []).map(c => String(c || '').trim().toUpperCase()).filter(Boolean));
  if (!set.size) { const e = new Error('empty'); e.code = 'empty'; throw e; }
  const users = loadUsers();
  let removed = 0;
  const next = users.filter(u => {
    const cs = (u.callsign || u.username || '').toUpperCase();
    if (set.has(cs) && !u.isAdmin) { removed++; return false; }
    return true;
  });
  if (removed) saveUsers(next);
  return removed;
}

module.exports = { loadUsers, saveUsers, hashPassword, authenticate, createUser, seedAdmin, setUserPermission, recordLogin, computeFrozen, markFreezeSweep, unfreezeUser, deleteUser, deleteUsers, RESERVED };
