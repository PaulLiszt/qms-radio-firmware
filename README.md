# MMDVM-S3 Terminal

> A software-only MMDVM all-in-one terminal that runs on a single ESP32-S3 — **no external vocoder dongle required**.

MMDVM-S3 Terminal turns a single ESP32-S3 board into a DMR hotspot / terminal.
- Flash the firmware & set callsign/DMR ID in the browser over Web Serial (zero install).
- Voice codec runs in software — no external dongle, no Raspberry Pi.
- USB-headset audio (UAC 1.0), free device tokens (ECDSA P-256).

This open-source repository is the **browser flasher + config tool** (MIT). The firmware binary (`combined.bin`) is **bundled in this repo**, so after cloning you can flash in one click immediately; a standalone release is also available on GitHub Releases if you prefer.

---

## English

### What it is
MMDVM-S3 Terminal turns a plain ESP32-S3 development board into a compact DMR hotspot / terminal. The voice codec runs **entirely in software** on the ESP32-S3, so you don't need to buy or wire up an external USB vocoder dongle. Audio is delivered to a standard **USB headset (UAC 1.0)** — the board acts as a USB host.

### What this repo gives you (two browser tools)
- **Firmware flasher** — connect the board's CH340 COM port in the browser and flash the firmware in one click (esptool-js, zero install, no drivers).
- **Settings writer** — write WiFi, callsign, DMR ID, BrandMeister host and talkgroup to the device over Web Serial.

Both run entirely in the browser and need **no account and no server**.

### Want the full experience? (monitor, account, network)
The **live monitor** in this project is genuinely useful — you can watch real-time RX/TX and the current QSO right from the web. The complete platform, including the live **monitor**, account management, free device tokens and network access, is hosted and running at **https://ba4qms.top**. For the best experience, just open that site in Chrome / Edge.

### Getting started (hosted — recommended)
1. Open **https://ba4qms.top** (use Chrome / Edge).
2. Download the firmware binary from the [Releases](releases) page (`qms-radio-firmware-v1.0.0.bin`) — or just use the in-browser flasher there.
3. Flash it with the in-browser flasher (connect the board's **CH340 COM port**).
4. Configure your callsign / DMR ID and you are on the air.

### Hardware you need
- An ESP32-S3 development board.
- A **UAC 1.0** Type-C headset (e.g. Google Pixel-type). Note: some AB17x-based headsets mute on PTT — not recommended.
- Short the board's **OTG / USB** pads so it can act as a USB host for the headset.
- 2.4 GHz Wi-Fi only.

### Self-hosting the flasher (optional)
This repo is the static web front-end + a tiny Node/Express server for the flasher UI and FAQ. The flashable firmware (`public/firmware/combined.bin`) is already included, so one-click flashing works out of the box after cloning.
```bash
git clone <this-repo>
cd server
npm install
docker compose up -d --build
```
Open the site in Chrome / Edge (Web Serial requires HTTPS or localhost).
> The ECDSA P-256 signing key is intentionally **not** in this repository. Token issuance for the released binary is handled by the hosted service at ba4qms.top.

### License
MIT — see [LICENSE](LICENSE).

---

## 中文

### 这是什么
MMDVM-S3 Terminal 把一块普通的 ESP32-S3 开发板变成一个紧凑的 DMR 热点 / 终端。声码器**完全在 ESP32-S3 上以软件实现**，因此你无需购买或连接外置的声码器加密狗。声音通过标准 **USB 耳机（UAC 1.0）** 输出——开发板本身作为 USB 主机。

### 本仓库提供什么（两项浏览器工具）
- **固件烧写** —— 在浏览器里连接开发板的 CH340 COM 口，一键烧写（esptool-js，零安装、无需驱动）。
- **参数写入** —— 经 Web Serial 把 WiFi、呼号、DMR ID、BrandMeister 主机与通话组写入设备。

两项功能**完全在浏览器内运行，无需账户、无需服务端**。

### 想要完整体验？（监视 / 账户 / 网络）
本项目里的**实时监视**非常实用——你可以直接在网页上看到实时 RX/TX 与当前通联。完整平台（含好用的**实时监视**、账户管理、免费设备令牌与网络接入）已在托管站点 **https://ba4qms.top** 上线运行。想获得最佳体验，直接用 Chrome / Edge 打开该站点即可。

### 快速开始（托管版，推荐）
1. 打开 **https://ba4qms.top**（使用 Chrome / Edge）。
2. 从 [Releases](releases) 页面下载固件 `qms-radio-firmware-v1.0.0.bin` —— 或直接使用站点内的浏览器烧写工具。
3. 用浏览器内烧写工具烧录（连接开发板的 **CH340 COM 口**）。
4. 配置呼号 / DMR ID 即可上线。

### 所需硬件
- 一块 ESP32-S3 开发板。
- 一副 **UAC 1.0** Type-C 耳机（如 Google Pixel 原装/兼容款）。注意：部分采用 AB17x 方案的耳机会在按 PTT 时被硬件静音，不推荐。
- 短接开发板上的 **OTG / USB** 焊盘，使其可作为 USB 主机接耳机。
- 仅支持 2.4GHz-WiFi。

### 自建烧写工具（可选）
本仓库是静态网页前端 + 一个轻量 Node/Express 服务端（仅供烧写界面与 FAQ 使用）。可烧写的固件（`public/firmware/combined.bin`）已随仓库附带，clone 后即可一键烧写，开箱即用。
```bash
git clone <本仓库>
cd server
npm install
docker compose up -d --build
```
用 Chrome / Edge 打开站点（Web Serial 需要 HTTPS 或 localhost）。
> ECDSA P-256 签名私钥**有意不放入**本仓库。已发布二进制的令牌由托管服务 ba4qms.top 签发。

### 许可证
MIT —— 见 [LICENSE](LICENSE)。
