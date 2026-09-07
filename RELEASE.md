# Release v1.0.0

First public release of MMDVM-S3 Terminal.

## Firmware binary (attached)
- `qms-radio-firmware-v1.0.0.bin` — flash it with the in-browser Web Serial flasher at
  https://ba4qms.top (connect the board's **CH340 COM port**).

## What is included
- Software-only MMDVM all-in-one running on a single ESP32-S3 (no external AMBE dongle).
- USB headset audio (UAC 1.0); the board acts as a USB host.
- Zero-install browser flashing & configuration (Web Serial).
- Free device tokens (ECDSA P-256), no membership tiers.
- Web server + flasher UI in this repository (MIT licensed).

## Requirements
- ESP32-S3 development board
- UAC 1.0 Type-C headset
- OTG / USB pads shorted on the board
- 2.4 GHz Wi-Fi

## Notes
- The firmware is distributed as a closed-source binary; the web source in this repo is open (MIT).
- The token signing key is held by the project and is not included in the repository.
