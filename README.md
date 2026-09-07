# MMDVM-S3 Terminal

> A software-only MMDVM all-in-one terminal that runs on a single ESP32-S3 — **no external vocoder dongle required**.

MMDVM-S3 Terminal turns a single ESP32-S3 board into a DMR hotspot / terminal.
- Flash the firmware & set callsign/DMR ID in the browser over Web Serial (zero install).
- Vocoder runs in software — no external dongle, no Raspberry Pi.
- USB-headset audio (UAC 1.0), free device tokens (ECDSA P-256).
- Web source (MIT) here; firmware binary via Releases.


---

## English

### What it is
MMDVM-S3 Terminal turns a plain ESP32-S3 development board into a compact DMR hotspot / terminal. The AMBE vocoder runs **entirely in software** on the ESP32-S3, so you don't need to buy or wire up an external AMBE USB dongle. Audio is delivered to a standard **USB headset (UAC 1.0)** — the board acts as a USB host.

### Highlights
- **No external AMBE hardware** — the codec is software on the ESP32-S3.
- **USB headset audio** — plug in a UAC 1.0 Type-C headset; the board drives it directly.
- **Zero-install web tools** — firmware flashing and radio configuration happen in the browser over **Web Serial**. No drivers, no Python toolchain.
- **Free, no membership tiers** — device tokens are issued free of charge to any signed-in account.
- **Open web source** — this repository contains the web server + flasher UI (MIT licensed). The firmware binary is distributed via GitHub Releases.

### Getting started (hosted)
1. Open **https://ba4qms.top** (use Chrome / Edge).
2. Download the firmware binary from the [Releases](releases) page (`qms-radio-firmware-v1.0.0.bin`).
3. Flash it with the in-browser flasher (connect the board's **CH340 COM port**).
4. Configure your callsign / DMR ID and you are on the air.

### Hardware you need
- An ESP32-S3 development board.
- A **UAC 1.0** Type-C headset (e.g. Google Pixel-type). Note: some AB17x-based headsets mute on PTT — not recommended.
- Short the board's **OTG / USB** pads so it can act as a USB host for the headset.
- 2.4 GHz Wi-Fi only.

### Self-hosting the web server
```bash
git clone <this-repo>
cd server
npm install
# Generate the signing key (writes secrets/private_key.pem).
# NOTE: the released firmware is signed with the project's FIXED public key,
# so token issuance for the released binary is handled by the hosted service.
node tools/genkey.js
docker compose up -d --build
```
Open `http://localhost:8080`. For a public deployment use the included Caddyfile (automatic Let's Encrypt HTTPS, which Web Serial requires).

> The ECDSA P-256 signing key is intentionally **not** in this repository.

### License
MIT — see [LICENSE](LICENSE).

---

## 中文

### 这是什么
MMDVM-S3 Terminal 把一块普通的 ESP32-S3 开发板变成一个紧凑的 DMR 热点 / 终端。AMBE 声码器**完全在 ESP32-S3 上以软件实现**，因此你无需购买或连接外置的 AMBE USB 加密狗。声音通过标准 **USB 耳机（UAC 1.0）** 输出——开发板本身作为 USB 主机。

### 主要特点
- **无需外置 AMBE 硬件** —— 声码器是 ESP32-S3 上的软件实现。
- **USB 耳机音频** —— 插入 UAC 1.0 的 Type-C 耳机，开发板直接驱动。
- **零安装网页工具** —— 固件烧录与参数配置都在浏览器里通过 **Web Serial** 完成，无需驱动、无需 Python 环境。
- **免费、无会员门槛** —— 设备令牌向任何登录账户免费签发。
- **网页端开源** —— 本仓库包含网页服务端 + 烧写界面（MIT 许可）。固件二进制通过 GitHub Releases 分发。

### 快速开始（托管版）
1. 打开 **https://ba4qms.top**（使用 Chrome / Edge）。
2. 从 [Releases](releases) 页面下载固件 `qms-radio-firmware-v1.0.0.bin`。
3. 用浏览器内烧写工具烧录（连接开发板的 **CH340 COM 口**）。
4. 配置呼号 / DMR ID 即可上线。

### 所需硬件
- 一块 ESP32-S3 开发板。
- 一副 **UAC 1.0** Type-C 耳机（如 Google Pixel 原装/兼容款）。注意：部分采用 AB17x 方案的耳机会在按 PTT 时被硬件静音，不推荐。
- 短接开发板上的 **OTG / USB** 焊盘，使其可作为 USB 主机接耳机。
- 仅支持 2.4GHz Wi-Fi。

### 自建网页服务端
```bash
git clone <本仓库>
cd server
npm install
# 生成签名密钥（写入 secrets/private_key.pem）。
# 注意：已发布的固件用项目固定的公钥签名，故已发布二进制的令牌由托管服务签发。
node tools/genkey.js
docker compose up -d --build
```
浏览器打开 `http://localhost:8080`。公网部署请用自带的 Caddyfile（自动签发 Let's Encrypt HTTPS，Web Serial 所必需）。

> ECDSA P-256 签名私钥**有意不放入**本仓库。

### 许可证
MIT —— 见 [LICENSE](LICENSE)。
