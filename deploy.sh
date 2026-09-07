#!/usr/bin/env bash
# 在腾讯云 Lighthouse（Docker 基础镜像）上部署本服务。
# 用法: 把整个 server/ 目录传到服务器后，执行: bash deploy.sh
set -e

echo "== 检查 Docker =="
if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 Docker，正在安装..."
  curl -fsSL https://get.docker.com | sh
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker 安装失败，请手动安装后重试。"
  exit 1
fi
if ! command -v docker compose >/dev/null 2>&1; then
  echo "未检测到 docker compose 插件，请安装 docker-compose-plugin。"
  exit 1
fi

echo "== 准备目录 =="
mkdir -p data secrets
[ -f data/users.json ] || echo '[]' > data/users.json

if [ ! -f secrets/private_key.pem ]; then
  echo "⚠️  未找到 secrets/private_key.pem"
  echo "    请先在本地运行 'node tools/genkey.js' 生成密钥（注意：密钥已约定固定，"
  echo "    切勿随意重跑 genkey，否则已烧录固件与私钥将错配、令牌全部失效）。"
  echo "    并把生成的 server/secrets/private_key.pem 传到本机 server/secrets/ 再重试。"
  exit 1
fi

echo "== 构建并启动 =="
docker compose up -d --build

echo ""
echo "✅ 部署完成。"
echo "下一步："
echo "  1) 腾讯云 DNSPod 把 ba4qms.top 与 www.ba4qms.top 的 A 记录指向本机公网 IP。"
echo "  2) 等待 Caddy 自动申请 Let's Encrypt 证书（几分钟；需 80/443 入站放行）。"
echo "  3) 浏览器访问 https://ba4qms.top （用 Chrome / Edge）。"
echo "  4) 添加用户: docker compose exec app node tools/adduser.js <用户名> <密码> '<到期ISO,如 2026-12-31>'"
