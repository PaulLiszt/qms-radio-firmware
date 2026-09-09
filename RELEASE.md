# Release v1.0.0

First public release of MMDVM-S3 Terminal.

## Firmware binary (attached)
- `qms-radio-firmware-v1.0.0.bin` — flash it with the in-browser Web Serial flasher at
  https://ba4qms.top (connect the board's **CH340 COM port**).
- The same binary is also bundled in this repo as `public/firmware/combined.bin`, so the
  in-repo flasher works out of the box after cloning.

## What is included
- Software-only MMDVM all-in-one running on a single ESP32-S3 (no external vocoder dongle).
- USB headset audio (UAC 1.0); the board acts as a USB host.
- Zero-install browser flashing & configuration (Web Serial).
- This repository (MIT): the browser flasher UI + settings writer, as a pure static site.

## Requirements
- ESP32-S3 development board
- UAC 1.0 Type-C headset
- OTG / USB pads shorted on the board
- 2.4 GHz Wi-Fi

## Notes
- The firmware is distributed as a closed-source binary; the web source in this repo is open (MIT).
- The live monitor, account management and network access are provided by the hosted platform
  at https://ba4qms.top — this repo contains only the flasher & config tool.
