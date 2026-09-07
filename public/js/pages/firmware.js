// pages/firmware.js — 烧写固件：下载 + 浏览器一键烧写（esptool-js）+ 手动教程（i18n）
import { t } from '../i18n.js';
import { core } from '../core.js';

// esptool-js 0.5.2 的 writeFlash 要求 fileArray[i].data 为「二进制字符串」(Latin1)，
// 而非 Uint8Array（库内对 image 直接做 image.substring / 字符串拼接）。
// 把 Uint8Array 按 Latin1 逐字节转成字符串，保证 charCodeAt(i) === 原字节。
function uint8ToBinaryString(u8) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return bin;
}

// 刷写成功后不在网页侧自动恢复：实测在 mmdvm-s3-terminal 上，esptool 复位后设备/USB 链路会卡死，
// 只有「物理拔插 USB」能清除（刷新页面无效——证明卡死在浏览器之下的 USB/设备层，
// Web Serial 没有任何 API 能给端口断电或强制重新枚举）。故刷完直接提示用户拔插 USB，
// 之后在本页点「连接设备」即可重连（无需刷新页面）。

// 刷写成功后弹出的「拔插提醒」对话框（复用 authmodal 的 modal-mask/modal 样式）
function showDoneModal() {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <button class="modal-x" aria-label="关闭" title="${t('fw.doneModalOk')}">×</button>
      <h3>${t('fw.doneModalTitle')}</h3>
      <p style="line-height:1.75">${t('fw.doneModalBody')}</p>
      <button class="primary" id="fwDoneOk">${t('fw.doneModalOk')}</button>
    </div>`;
  const close = () => { if (mask.parentNode) mask.parentNode.removeChild(mask); };
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  mask.querySelector('.modal-x').addEventListener('click', close);
  mask.querySelector('#fwDoneOk').addEventListener('click', close);
  document.body.appendChild(mask);
}

export function renderFirmware(view) {
  view.innerHTML = `
    <section class="card">
      <h2>${t('fw.webTitle')}</h2>
      <p class="sub">${t('fw.webSub')}</p>
      <p class="hint">${t('fw.webNote')}</p>
      <div class="row">
        <button id="fwFlash" class="primary">${t('fw.start')}</button>
        <span id="fwState" class="info">${t('fw.notStarted')}</span>
      </div>
      <pre id="fwLog" class="log" style="height:180px"></pre>
      <p class="hint">${t('fw.webHint')}</p>
    </section>

    <section class="card">
      <h2>${t('fw.manTitle')}</h2>
      <p class="sub">${t('fw.manGithub')}</p>
      <p><a class="flink" href="https://github.com/PaulLiszt/qms-radio-firmware/releases/tag/v1.0.0" target="_blank" rel="noopener noreferrer">${t('fw.downloadLink')}</a></p>
      <h3>${t('fw.m1')}</h3>
      <pre class="code">esptool.py --chip esp32s3 -p COMx -b 921600 write_flash \\
  0x0 combined.bin</pre>
      <h3>${t('fw.m2')}</h3>
      <pre class="code">esptool.py --chip esp32s3 -p COMx -b 921600 write_flash \\
  0x0    bootloader.bin \\
  0x8000 partition-table.bin \\
  0xe000 ota_data_initial.bin \\
  0x10000 mmdvm_s3_terminal.bin</pre>
      <h3>${t('fw.m3')}</h3>
      <pre class="code">idf.py build
idf.py -p COMx flash</pre>
      <h3>${t('fw.m4')}</h3>
      <p class="sub">${t('fw.m4Sub')}</p>
    </section>`;

  const logEl = view.querySelector('#fwLog');
  const stateEl = view.querySelector('#fwState');
  const append = (txt) => { logEl.textContent += txt + '\n'; logEl.scrollTop = logEl.scrollHeight; };

  view.querySelector('#fwFlash').addEventListener('click', async () => {
    const btn = view.querySelector('#fwFlash');
    btn.disabled = true;
    stateEl.textContent = t('fw.loading');

    let esptool;
    try {
      esptool = await import('https://cdn.jsdelivr.net/npm/esptool-js@0.5.2/+esm');
    } catch (e) {
      btn.disabled = false;
      stateEl.textContent = t('fw.loadFail');
      append(t('fw.webHint'));
      return;
    }

    let transport = null;
    try {
      // 1) 若监视正占用串口：彻底断开并清空句柄，让出 COM 口给 esptool
      if (core.port) {
        append('检测到设备已连接监视，正在释放端口用于烧写…');
        await core.disconnectSerial();
      }

      // 2) 为 esptool 取一个「全新」且处于「关闭态」的端口对象（唯一会弹窗选口的地方）
      append(t('fw.pickPort'));
      stateEl.textContent = t('fw.pickPort');
      let port;
      try { port = await navigator.serial.requestPort(); }
      catch (e) {
        append('错误: ' + (e && e.message ? e.message : String(e)));
        stateEl.textContent = t('fw.error');
        btn.disabled = false;
        return;
      }

      // 3) 防御诊断：规范的 requestPort() 返回的端口应当是「未打开」状态。
      //    注：部分 Chromium 版本 SerialPort.opened 为 undefined，无法据此判断，
      //    故不再用 port.opened 提前拦截，而是让 esptool 的 open() 自然暴露错误。
      core.port = port;

      // 4) 下载固件（整包镜像，单文件烧写到 0x0）
      const file = { url: '/firmware/combined.bin', address: 0x0 };
      append(t('fw.dlItem') + ' ' + file.url + ' …');
      const buf = await (await fetch(file.url)).arrayBuffer();
      // ⚠️ esptool-js 0.5.2 要求 data 是二进制字符串(Latin1)，不是 Uint8Array
      const fileArray = [{ data: uint8ToBinaryString(new Uint8Array(buf)), address: file.address }];

      // 5) 让 esptool 自己打开端口（单一 open）：
      //    ESPLoader.main() 内部会 detectChip → connect → device.open()，
      //    之后才会 writeFlash。
      //    ⚠️ 严禁在此前手动 transport.connect() —— 否则 main() 内部再 open 一次同一端口 → already open。
      //    ⚠️ 烧写必须调 writeFlash()（普通对象参数）；esptool-js 0.5.2 没有 flash() 方法，也未导出 FlashOptions。
      transport = new esptool.Transport(port, false, true);
      const esploader = new esptool.ESPLoader({
        transport,
        baudrate: 921600,
        terminal: {
          clean: () => {},
          write: (d) => append(typeof d === 'string' ? d : String(d)),
          writeLine: (d) => append(typeof d === 'string' ? d : String(d)),
        },
      });
      const chip = await esploader.main();
      append('已连接: ' + chip);
      append('正在写入固件…');
      await esploader.writeFlash({
        fileArray,
        flashSize: '16MB',
        flashMode: 'dio',
        flashFreq: '80m',
        eraseAll: false,
        compress: true,
      });
      append(t('fw.done'));
      append(t('fw.doneHint'));
      stateEl.textContent = t('fw.done');
      showDoneModal();   // 弹窗提醒用户拔掉 USB 数据线后重新插入
    } catch (e) {
      const m = String((e && e.message) || (e && e.name) || '');
      stateEl.textContent = t('fw.error');
      append('错误: ' + m);
      if (/already open|端口已打开|port is already open/i.test(m)) {
        append('→ COM5 仍被占用。最可能原因：上一次监视/烧写没把端口真正释放。');
        append('   请【完全关闭浏览器（所有窗口）】后重新打开网页，先「不要」连监视，直接点「开始烧写」再试一次。');
      }
      // 刷写失败：关闭 esptool 遗留端口，清空句柄（用户可手动重连 / 重插刷新）
      if (core.port) { try { await core.port.close(); } catch (_) {} core.port = null; }
    } finally {
      // 收尾：esptool 的 transport.disconnect() 会 cancel reader + 关闭底层端口。
      // 之后清空句柄，以便用户拔插 USB 后在本页直接点「连接设备」重连（无需刷新页面）。
      try { if (transport) await transport.disconnect(); } catch (_) {}
      if (core.port) { try { await core.port.close(); } catch (_) {} }
      core.port = null;
      btn.disabled = false;
    }
  });

  return null;
}
