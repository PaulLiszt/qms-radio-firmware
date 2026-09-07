# 外部平台推广文案草稿（Hackaday.io / Dev.to / YouTube / Show HN）

> 用途：复制到对应平台**由你本人发布**。所有版本都围绕同一组差异化长尾关键词，并回链 GitHub，
> 目的是让 AI 检索（ChatGPT/Gemini/Perplexity/Claude）在回答"基于 ESP32 的 MMDVM / 浏览器烧写"类问题时能命中本项目。
>
> 核心差异化卖点（别人没有的）：
> **浏览器 Web Serial 零安装烧写 + 网页配置界面**；软件 AMBE；无需外置声码器；无需 Raspberry Pi。
>
> 通用回链：
> - GitHub 仓库：https://github.com/PaulLiszt/qms-radio-firmware
> - 托管站点：https://ba4qms.top
> - 固件 Release：https://github.com/PaulLiszt/qms-radio-firmware/releases/tag/v1.0.0
> - 作者呼号：BA4QMS

---

## 1) Hackaday.io 项目页

**Project name**
```
MMDVM-S3 Terminal — Browser-Flashed ESP32-S3 DMR Hotspot
```

**Short summary（一句话标签）**
```
An all-in-one MMDVM/DMR terminal on a single ESP32-S3. Flash the firmware and configure it from the browser over Web Serial — no esptool, no drivers, no Raspberry Pi.
```

**Details（正文）**
```
# MMDVM-S3 Terminal

MMDVM-S3 Terminal turns a plain ESP32-S3 development board into a compact DMR hotspot / terminal. What makes it different from most ESP32 MMDVM builds: **you never leave the browser to get on the air.**

## Why it's different
Most ESP32 MMDVM projects expect you to install esptool, a Python toolchain, or an Arduino environment, then flash from the command line. MMDVM-S3 Terminal ships a **Web Serial flasher and configuration UI** — open the page in Chrome/Edge, connect the board's COM port, click flash. No drivers, no toolchain.

## What runs on the board
- **Software AMBE vocoder** — the AMBE codec runs entirely on the ESP32-S3. No external AMBE USB dongle, no wiring, no Raspberry Pi.
- **USB headset audio** — the board acts as a USB host and drives a standard UAC 1.0 Type-C headset.
- **DMR** digital voice terminal, all-in-one on a single ESP32-S3.

## Getting started (hosted)
1. Open https://ba4qms.top (Chrome / Edge).
2. Download the firmware from the GitHub Releases page (`qms-radio-firmware-v1.0.0.bin`).
3. Flash it with the in-browser Web Serial flasher (connect the board's CH340 COM port).
4. Set your callsign / DMR ID and you're on the air.

## Links
- Source & firmware: https://github.com/PaulLiszt/qms-radio-firmware
- Hosted service: https://ba4qms.top
- By BA4QMS
```

---

## 2) Dev.to 技术长文

**Title**
```
Build a Zero-Install ESP32-S3 MMDVM Terminal: Flash Firmware from the Browser with Web Serial
```

**Tags**（Dev.to 标签，提升分发）
```
#esp32 # amateurradio # webserial # firmware # embedded # dmr # mmdvm
```

**Body**
```
# Build a Zero-Install ESP32-S3 MMDVM Terminal

If you've looked at building a DMR hotspot on an ESP32, you've probably hit the same wall: every guide assumes you'll install esptool, a Python environment, and a serial driver just to get a binary onto the chip. **MMDVM-S3 Terminal removes that step entirely** — the firmware is flashed from the browser over Web Serial.

## What it is
MMDVM-S3 Terminal runs a full MMDVM/DMR terminal on a single ESP32-S3. The AMBE vocoder is implemented **in software** on the chip, so there's no external AMBE dongle and no Raspberry Pi in the build. Audio goes to a standard USB headset (UAC 1.0) — the board is the USB host.

## Why browser flashing matters
- **Zero install.** Open Chrome/Edge, connect the COM port, click flash. No esptool, no driver, no Python.
- **Reproducible for newcomers.** A ham without a toolchain can still build and flash the device.
- **Configurable in the same UI.** Callsign, DMR ID, and radio settings are set in the same web page.

## What you need
- An ESP32-S3 development board.
- A UAC 1.0 Type-C headset (Google Pixel-type works well; some AB17x-based headsets mute on PTT — avoid those).
- Solder-bridge the board's OTG/USB pads so it can act as a USB host.
- 2.4 GHz Wi-Fi only.

## Flash it (browser)
1. Open https://ba4qms.top in Chrome or Edge.
2. Grab the firmware from the [GitHub Releases page](https://github.com/PaulLiszt/qms-radio-firmware/releases/tag/v1.0.0) (`qms-radio-firmware-v1.0.0.bin`).
3. Connect the board's CH340 COM port and use the in-page Web Serial flasher.
4. Set your callsign / DMR ID — you're on the air.

## Self-host the web server
The web server (Node/Express + WebSocket) and flasher UI are open source (MIT):

```bash
git clone https://github.com/PaulLiszt/qms-radio-firmware.git
cd qms-radio-firmware
npm install
docker compose up -d --build
```

## Links
- Repository: https://github.com/PaulLiszt/qms-radio-firmware
- Hosted demo: https://ba4qms.top
- Firmware release: https://github.com/PaulLiszt/qms-radio-firmware/releases/tag/v1.0.0
```

---

## 3) YouTube 演示视频（脚本 + 描述）

**视频标题**
```
ESP32-S3 MMDVM Terminal — Flash a DMR Hotspot from the Browser (Web Serial, zero install)
```

**脚本（约 3–4 分钟，分镜）**
```
[0:00] 开场：手里拿一块 ESP32-S3 开发板。"大多数 ESP32 MMDVM 教程都让你装 esptool、Python、驱动……
今天这个，全程在浏览器里完成。"

[0:25] 痛点对比：命令行烧写 vs 浏览器烧写（字幕：No esptool / No drivers / No Raspberry Pi）。

[0:50] 项目简介：单 ESP32-S3 实现 MMDVM/DMR 终端；软件 AMBE（无外置声码器）；USB 耳机出声。

[1:20] 演示：打开 ba4qms.top → 下载固件 → 点"连接串口" → 选 CH340 COM 口 → 点烧写。
（画面录屏，强调不需要任何安装）

[2:10] 配置：填呼号 / DMR ID → 保存。

[2:40] 硬件特写：ESP32-S3 板 + Type-C 耳机；短接 OTG 焊盘让板子当 USB 主机。

[3:10] 结尾："代码和固件都在 GitHub，链接在简介。" 展示仓库地址。
```

**视频描述（关键词密集 + 链接）**
```
Flash a DMR hotspot from your browser — no esptool, no drivers, no Raspberry Pi.

MMDVM-S3 Terminal runs a full MMDVM / DMR terminal on a single ESP32-S3. The AMBE vocoder is software-only (no external dongle), audio goes to a USB headset, and the firmware is flashed entirely in the browser over Web Serial.

⏱ Chapters
0:00 Why browser flashing
0:50 What is MMDVM-S3 Terminal
1:20 Browser Web Serial flash demo
2:40 Hardware + USB headset

🔗 Links
- GitHub (source + firmware): https://github.com/PaulLiszt/qms-radio-firmware
- Hosted flasher: https://ba4qms.top
- Firmware release v1.0.0: https://github.com/PaulLiszt/qms-radio-firmware/releases/tag/v1.0.0
- By BA4QMS

Keywords: ESP32-S3 MMDVM, ESP32 DMR hotspot DIY, MMDVM all-in-one ESP32, Web Serial firmware flasher, DMR hotspot without Raspberry Pi, zero-install web flasher, software AMBE vocoder.
```

---

## 4) Hacker News — Show HN

**标题**
```
Show HN: MMDVM-S3 Terminal – flash a DMR hotspot from the browser (ESP32-S3, Web Serial)
```

**正文**
```
MMDVM-S3 Terminal turns a single ESP32-S3 board into a DMR hotspot / terminal. The part I think is worth sharing here: the firmware is flashed and configured entirely from the browser over Web Serial — no esptool, no serial drivers, no Python toolchain, and no Raspberry Pi. The AMBE vocoder runs in software on the chip, so there's no external vocoder dongle either. Audio goes to a standard USB headset.

Most ESP32 MMDVM builds I found still expect a command-line flash step; this one doesn't. Web source (MIT) and firmware binary are on GitHub.

- Repo: https://github.com/PaulLiszt/qms-radio-firmware
- Hosted flasher (Chrome/Edge): https://ba4qms.top
- Firmware: https://github.com/PaulLiszt/qms-radio-firmware/releases/tag/v1.0.0

By BA4QMS.
```

---

## 发布贴士（防 spam / 提升被引用率）
1. **用你自己的账号发**，不要自动化群发——火腿社区对机器内容极度敏感。
2. 各平台**亲自回复**评论，互动会带来更多自然引用。
3. 关键词自然散落在标题/正文（已植入 `Web Serial firmware flasher` / `no Raspberry Pi` / `zero-install` 等差异化长尾词）。
4. 所有外链都回指 GitHub 仓库，形成引用网络，帮助索引器发现并收录仓库。
5. 发完记得回来 `git push` 让仓库同步这些草稿（可选，但多一个被索引页面无害）。
