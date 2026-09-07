// pages/firmware.js — 烧写固件：下载 + 浏览器一键烧写（esptool-js）+ 手动教程（i18n）
import { t } from '../i18n.js';
import { core } from '../core.js';

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

    // esptool 安全连接：若端口被占用（already open，可能以中文「端口已打开」呈现），
    // 先让 esptool 自身 disconnect（释放其读锁并 close），再重连，最多 4 次。
    async function safeConnect(transport, baud) {
      for (let i = 1; i <= 4; i++) {
        try { await transport.connect(baud); return; }
        catch (e) {
          const m = String((e && e.message) || (e && e.name) || '');
          if (/already open|端口已打开|port is already open/i.test(m)) {
            append(`端口仍被占用，正在释放后重试 (${i}/4)…`);
            try { await transport.disconnect(); } catch (_) {}
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
          throw e;
        }
      }
      throw new Error(t('fw.portBusy'));
    }

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
    let wasMonitoring = false;
    try {
      wasMonitoring = !!core.port && core.devState === '已连接';
      // 0) 彻底停监听并关闭监视端口（保留同一对象，稍后复用，避免再次选口）
      const reused = await core.pauseForFlash();

      // 诊断：确认监视端口已真正关闭；若没关干净，降级为「重新选口」
      const monClosed = !reused || (reused.readable === null && reused.writable === null);
      if (monClosed) {
        append('已停止监视并关闭串口（复用同一端口烧写，无需重新选口）。');
      } else {
        append('警告：监视端口未能真正关闭，将改用重新选口方式烧写。');
      }

      // 1) 决定 esptool 使用的端口：
      //    - 原本连着监视且已成功关闭 → 复用同一对象（无弹窗）
      //    - 未连监视 / 复用对象仍处打开态 → 才重新选口
      let port = reused;
      if (!port || port.readable !== null || port.writable !== null) {
        append(t('fw.pickPort'));
        stateEl.textContent = t('fw.pickPort');
        try { port = await navigator.serial.requestPort(); }
        catch (e) {
          append('错误: ' + (e && e.message ? e.message : String(e)));
          stateEl.textContent = t('fw.error');
          btn.disabled = false;
          return;
        }
      }
      core.port = port;

      const file = { url: '/firmware/combined.bin', address: 0x0 };
      append(t('fw.dlItem') + ' ' + file.url + ' …');
      const buf = await (await fetch(file.url)).arrayBuffer();
      const fileArray = [{ data: new Uint8Array(buf), address: file.address }];

      // 2) esptool-js 0.5.2：Transport 第一个参数必须是已关闭的 SerialPort 实例
      transport = new esptool.Transport(port, false, true);
      await safeConnect(transport, 921600);
      const esploader = new esptool.ESPLoader({
        transport,
        baudrate: 921600,
        terminal: {
          clean: () => {},
          write: (d) => append(typeof d === 'string' ? d : String(d)),
          writeLine: (d) => append(typeof d === 'string' ? d : String(d)),
        },
      });
      await esploader.main();
      await esploader.flash(new esptool.FlashOptions({
        fileArray,
        flashSize: '16MB',
        flashMode: 'dio',
        flashFreq: '80m',
        eraseAll: false,
      }));
      append(t('fw.done'));
      stateEl.textContent = t('fw.done');
      try { await transport.disconnect(); } catch (_) {}

      // 3) 若原本连着监视，复用同一端口恢复监视连接；否则关端口复位
      if (wasMonitoring) {
        stateEl.textContent = t('fw.reconnect');
        await new Promise(r => setTimeout(r, 1200));
        await core.resumeAfterFlash();
      } else {
        core.port = null;
      }
    } catch (e) {
      const m = String((e && e.message) || (e && e.name) || '');
      stateEl.textContent = t('fw.error');
      append('错误: ' + m);
      // 端口被占用（already open）：多半是本页之前一次串口句柄没释放干净（僵尸端口）
      if (/already open|端口已打开|port is already open/i.test(m)) {
        append('→ COM5 仍被占用。最可能原因：本网页之前一次烧写/监视留下的串口句柄没关干净（僵尸端口）。');
        append('   请【关闭本标签页】，重新打开网页，先「不要」连监视，直接点「开始烧写」再试一次。');
      }
      try { if (transport) await transport.disconnect(); } catch (_) {}
      if (wasMonitoring) await core.resumeAfterFlash().catch(() => {});
      else { try { if (core.port) await core.port.close(); } catch (_) {} core.port = null; }
    } finally {
      btn.disabled = false;
    }
  });

  return null;
}
