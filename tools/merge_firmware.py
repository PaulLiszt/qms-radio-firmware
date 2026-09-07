#!/usr/bin/env python3
"""
merge_firmware.py — 将 ESP32-S3 四个独立烧录文件合并为单个 combined.bin，便于传播。
合并后只需一条命令即可烧写：write_flash 0x0 combined.bin

偏移（须与 partition-table 一致）：
  bootloader.bin        0x0
  partition-table.bin   0x8000
  ota_data_initial.bin  0xe000
  mmdvm_s3_terminal.bin 0x10000

分区之间用 0xFF 填充（SPI flash 擦除态），与 esptool merge_bin 行为一致。
"""
import os
import sys

# 直接合并已扁平化、随站部署的 public/firmware/ 四个文件（字段名与烧写页一致）
BUILD = os.path.join(os.path.dirname(__file__), '..', 'public', 'firmware')
OUT   = os.path.join(BUILD, 'combined.bin')

PARTS = [
    ('bootloader.bin',         0x0000),
    ('partition-table.bin',    0x8000),
    ('ota_data_initial.bin',   0xe000),
    ('mmdvm_s3_terminal.bin',  0x10000),
]

def main():
    max_end = 0
    blobs = []
    for rel, off in PARTS:
        p = os.path.join(BUILD, rel)
        if not os.path.isfile(p):
            print('缺少文件:', p, file=sys.stderr); sys.exit(1)
        data = open(p, 'rb').read()
        blobs.append((off, data))
        max_end = max(max_end, off + len(data))
        print(f'  {rel:42s} off=0x{off:05X} len={len(data)}')

    buf = bytearray(b'\xff' * max_end)
    for off, data in blobs:
        buf[off:off+len(data)] = data
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'wb').write(buf)
    print(f'已生成 {OUT}  ({len(buf)} 字节 = {len(buf)/1024:.1f} KB)')

if __name__ == '__main__':
    main()
