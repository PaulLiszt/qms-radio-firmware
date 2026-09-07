// core.js — 共享状态管理器（单例）
// 负责：登录态、WebSocket 令牌通道、Web Serial 设备连接、行事件总线。
// SPA 中各页面共享同一份连接，切换页面不会断开串口/令牌通道。

const enc = new TextEncoder();
const dec = new TextDecoder();

const lineListeners = new Set();   // 行事件订阅（设备输出 + 本地发送回显）
const statusListeners = new Set(); // 状态变化订阅（ws/dev/token/user）

export const core = {
  ws: null,
  port: null,
  writer: null,
  reader: null,
  _reading: false,
  _readDone: null,
  token: null,
  user: null,
  wsState: '未连接',
  devState: '未连接',

  // ---- 订阅 ----
  onLine(cb) { lineListeners.add(cb); return () => lineListeners.delete(cb); },
  onStatus(cb) { statusListeners.add(cb); cb(this.status()); return () => statusListeners.delete(cb); },
  _emitLine(line) { lineListeners.forEach(cb => { try { cb(line); } catch (e) { console.error(e); } }); },
  _emitStatus() { const s = this.status(); statusListeners.forEach(cb => { try { cb(s); } catch (e) {} }); },

  status() {
    return { wsState: this.wsState, devState: this.devState, token: this.token, user: this.user };
  },

  // ---- 网络 ----
  async api(url, opts) {
    const r = await fetch(url, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }, opts || {}));
    return r.json();
  },

  async refreshMe() {
    const { user } = await this.api('/api/me');
    this.user = user;
    this._emitStatus();
    return user;
  },

  async login(username, password) {
    const res = await this.api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) { await this.refreshMe(); return true; }
    return false;
  },

  async logout() {
    await this.api('/api/logout', { method: 'POST' });
    if (this.ws) try { this.ws.close(); } catch (_) {}
    if (this.port) { try { await this.port.close(); } catch (_) {} }
    this.ws = null; this.port = null; this.writer = null; this.reader = null;
    this.token = null; this.user = null;
    location.reload();
  },

  // ---- WebSocket 令牌通道 ----
  connectWs() {
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === 0)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => { this.wsState = '已连接'; this._emitStatus(); };
    ws.onclose = () => { this.wsState = '已断开'; this._emitStatus(); };
    ws.onmessage = async (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.type === 'token') {
        this.token = msg.hex; this._emitStatus();
        if (this.writer) await this._sendAuth(msg.hex);
      } else if (msg.type === 'stop') {
        this.token = null; this._emitStatus();
      }
    };
  },

  async _sendAuth(hex) {
    if (!this.writer) return;
    try { await this.writer.write(enc.encode('AUTH ' + hex + '\n')); } catch (_) {}
    this._emitLine('>> AUTH ' + hex.slice(0, 24) + '…(已发送)');
  },

  // ---- Web Serial 设备连接 ----
  // 单一 SerialPort 句柄模型：core.port 是唯一的真相来源，监视与烧写都复用它，
  // 避免「孤儿端口」（同一物理设备的多个 SerialPort 对象，旧句柄未关导致新句柄 open 报 already open）。
  async connectSerial() {
    if (!navigator.serial) {
      alert('当前浏览器不支持 Web Serial，请改用 Chrome / Edge，并通过 HTTPS 访问本页。');
      return false;
    }
    try {
      if (!this.port) this.port = await navigator.serial.requestPort();
      // 若端口仍标记为「已打开」（覆盖波特率、或上次未正常关闭），先彻底释放读/写锁再重开，避免 already open
      if (this.port.readable || this.port.writable) {
        await this._disconnectPort();
      }
      if (!this.port.readable) await this.port.open({ baudRate: 115200 });
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      this.devState = '已连接'; this._emitStatus();
      this._readLoop();
      if (this.token) await this._sendAuth(this.token);
      return true;
    } catch (e) {
      console.error('connectSerial 失败:', e);
      await this._hardResetPort();
      return false;
    }
  },

  // 彻底复位串口句柄（失败兜底用）
  async _hardResetPort() {
    await this._disconnectPort();
    this.port = null; this.writer = null; this.reader = null;
    this.devState = '未连接'; this._emitStatus();
  },

  // 彻底断开端口（稳健版）：
  // 1) cancel 挂起的 read() → await 读取循环真正退出（_readDone，循环 finally 中 releaseLock）
  // 2) writer：先 close() 刷完挂起写入，再 releaseLock()（直接 releaseLock 且写入挂起会抛错 → 写锁残留 → close 失败 → 僵尸端口）
  // 3) 物理 close()，带重试；close 前确保读/写锁都已释放。
  // 注意：Web Serial 的 close() 在仍有读/写锁时会被 reject，端口会一直占着（already open 的根因）。
  async _disconnectPort() {
    if (!this.port) return false;
    const r = this.reader;
    const w = this.writer;
    // 1) 中止挂起的 read()，让读取循环退出
    if (r) { try { await r.cancel(); } catch (_) {} }
    // 2) 等待读取循环真正跑完并释放读锁（不能只轮询 locked 标志）
    if (this._readDone) {
      try { await Promise.race([this._readDone, new Promise(res => setTimeout(res, 3000))]); } catch (_) {}
    }
    this.reader = null;
    // 3) 写锁：先 close 刷完挂起写入，再 releaseLock
    if (w) {
      try { await w.close(); } catch (_) {}
      try { w.releaseLock(); } catch (_) {}
      this.writer = null;
    }
    this._readDone = null;
    // 4) 物理关闭端口（此时读/写锁都应已释放）
    let closed = false;
    for (let i = 0; i < 3 && !closed; i++) {
      try {
        if (this.port.readable !== null || this.port.writable !== null) {
          await this.port.close();
        }
        closed = true;
      } catch (e) {
        console.warn('_disconnectPort: close 尝试 ' + (i + 1) + ' 失败', e);
        await new Promise(res => setTimeout(res, 200));
      }
    }
    if (!closed) {
      // 关闭失败：端口可能卡死在 OS 层。保留引用以便后续重试，抛错让调用方提示用户
      throw new Error('串口关闭失败：端口可能仍被占用（请关闭本标签页后重新打开再试）');
    }
    return true;
  },

  // 断开 Web Serial 设备（顶栏按钮在已连接时调用）
  async disconnectSerial() {
    await this._disconnectPort();
    this.port = null; this.writer = null; this.reader = null;
    this.devState = '未连接'; this._emitStatus();
  },

  // 烧写固件前：彻底停止监视读取并关闭物理端口（避免孤儿端口占住设备）。
  // 返回原 SerialPort 对象（已关闭）；调用方应改用 requestPort 取得「全新」对象交给 esptool，
  // 因为 Chrome 对同一对象「刚关即开」不可靠，新对象才能保证 open() 不报 already open。
  async pauseForFlash() {
    if (!this.port) return null;
    const port = this.port;
    await this._disconnectPort();
    this.devState = '烧写中（已暂停监听）'; this._emitStatus();
    return port; // 仅作「是否曾连接监视」的标记；烧写改用 requestPort 新对象
  },

  // 烧写固件后：重新打开并恢复监视读取（core.port 应为一个已关闭的端口对象）。
  async resumeAfterFlash() {
    if (!this.port) return false;
    try {
      await this._disconnectPort();                 // 确保关闭状态
      await this.port.open({ baudRate: 115200 });
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      this.devState = '已连接'; this._emitStatus();
      this._readLoop();
      if (this.token) await this._sendAuth(this.token);
      return true;
    } catch (e) {
      console.error('resumeAfterFlash 失败:', e);
      await this._hardResetPort();
      return false;
    }
  },

  async _readLoop() {
    if (!this.reader || this._reading) return;   // 防重入：已在读取则不重复启动
    const reader = this.reader;
    this._reading = true;
    const loop = async () => {
      let buf = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, '');
            buf = buf.slice(nl + 1);
            this._handleLine(line);
          }
        }
        if (buf.length) this._handleLine(buf.replace(/\r$/, ''));
      } catch (_) { /* 设备断开 / cancel 中止，忽略 */ }
      finally {
        this._reading = false;
        try { reader.releaseLock(); } catch (_) {}
      }
    };
    // 保存完成 Promise，供 _disconnectPort 在关闭端口前 await 它真正退出并释放读锁
    this._readDone = loop();
  },

  _handleLine(line) {
    this._emitLine(line);
    // 设备确认授权：回传给服务器（服务器据此停止重发该令牌）
    if (line === '@@AUTH OK' && this.ws && this.ws.readyState === 1 && this.token) {
      this.ws.send(JSON.stringify({ type: 'auth_ack', hex: this.token }));
    }
  },

  // 向设备发送一行命令（行结束自动补 \n）
  async sendLine(line) {
    if (!this.writer) throw new Error('设备未连接');
    await this.writer.write(enc.encode(line + '\n'));
    this._emitLine('>> ' + line);
  },
};
