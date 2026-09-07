#!/usr/bin/env bash
#
# MMDVM-S3 Terminal 数据备份脚本
# ---------------------------------------------------------------
# 用法:
#   backup.sh                 创建一次备份，并按保留期清理旧备份
#   backup.sh list            列出已有备份（倒序，含大小/时间）
#   backup.sh restore <文件>  从指定备份恢复到 data 目录
#   backup.sh help            显示本帮助
#
# 环境变量（均可选，已含云端默认值）:
#   MMDVM_DATA_DIR        数据目录，默认 /home/ubuntu/server/data
#   MMDVM_BACKUP_DIR      备份存放目录，默认 /var/backups/mmdvm
#                          （刻意放在项目目录之外，避免被 COPY . . 或同步带入镜像/循环嵌套）
#   MMDVM_RETENTION_DAYS  保留天数，默认 30（超过此天数的备份会被删除）
#
# 备份内容（白名单，仅持久化用户数据）:
#   users.json     用户账户（最关键）
#   messages.json  站内信
#   faq.json       常见问答
#   注: dmr_users_cache.json 每 2h 自动刷新，不备份，以免无意义占用空间。
#
set -euo pipefail

DATA_DIR="${MMDVM_DATA_DIR:-/home/ubuntu/server/data}"
BACKUP_DIR="${MMDVM_BACKUP_DIR:-/var/backups/mmdvm}"
RETENTION_DAYS="${MMDVM_RETENTION_DAYS:-30}"

# 需要备份的关键文件（空格分隔）
FILES="users.json messages.json faq.json"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# 人类可读大小；系统无 du 时降级为字节数
fsize() {
  if command -v du >/dev/null 2>&1; then
    du -h "$1" 2>/dev/null | cut -f1
  elif command -v stat >/dev/null 2>&1; then
    local b; b="$(stat -c%s "$1" 2>/dev/null || echo 0)"; echo "${b}B"
  else
    echo "?"
  fi
}

cmd_backup() {
  mkdir -p "$BACKUP_DIR"
  local ts archive tmp
  ts="$(date +%Y%m%d-%H%M%S)"
  archive="$BACKUP_DIR/mmdvm-data-$ts.tar.gz"

  # 收集当前存在的文件（直接用变量拼接，避免临时文件）
  local existing=""
  for f in $FILES; do
    if [ -f "$DATA_DIR/$f" ]; then
      existing="$existing $f"
    fi
  done
  existing="${existing# }"   # 去掉前导空格

  if [ -z "$existing" ]; then
    log "没有可备份的文件（data 目录: $DATA_DIR），跳过"
    return 0
  fi

  # shellcheck disable=SC2086
  tar -czf "$archive" -C "$DATA_DIR" $existing
  log "已创建备份: $archive ($(fsize "$archive"))"

  # 清理超过保留期的旧备份
  local old_count
  old_count="$(find "$BACKUP_DIR" -maxdepth 1 -name 'mmdvm-data-*.tar.gz' -mtime "+$RETENTION_DAYS" | wc -l)"
  if [ "$old_count" -gt 0 ]; then
    find "$BACKUP_DIR" -maxdepth 1 -name 'mmdvm-data-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete
    log "已清理 $old_count 个超过 $RETENTION_DAYS 天的旧备份"
  else
    log "无需清理（均在 $RETENTION_DAYS 天保留期内）"
  fi
}

cmd_list() {
  if [ ! -d "$BACKUP_DIR" ]; then
    log "备份目录不存在: $BACKUP_DIR"
    return 0
  fi
  local count
  count="$(find "$BACKUP_DIR" -maxdepth 1 -name 'mmdvm-data-*.tar.gz' | wc -l)"
  log "备份目录: $BACKUP_DIR （共 $count 个）"
  if [ "$count" -eq 0 ]; then
    log "（暂无备份）"
    return 0
  fi
  # 按修改时间倒序列出
  find "$BACKUP_DIR" -maxdepth 1 -name 'mmdvm-data-*.tar.gz' -printf '%T@ %p\n' \
    | sort -rn | while read -r ts path; do
      printf '  %s  [%s]  %s\n' "$(basename "$path")" "$(fsize "$path")" "$(date -d "@$ts" '+%Y-%m-%d %H:%M:%S')"
    done
}

cmd_restore() {
  local archive="${1:-}"
  if [ -z "$archive" ]; then
    log "用法: backup.sh restore <备份文件路径>"
    exit 1
  fi
  if [ ! -f "$archive" ]; then
    log "备份文件不存在: $archive"
    exit 1
  fi
  mkdir -p "$DATA_DIR"
  log "警告: 将用备份覆盖 $DATA_DIR 下的同名文件"
  tar -xzf "$archive" -C "$DATA_DIR"
  log "已从 $archive 恢复以下文件到 $DATA_DIR:"
  tar -tzf "$archive" | sed 's/^/    /'
}

case "${1:-backup}" in
  backup)            cmd_backup ;;
  list)              cmd_list ;;
  restore)           cmd_restore "${2:-}" ;;
  help|-h|--help)    sed -n '2,22p' "$0" ;;
  *)                 log "未知命令: $1"; exit 1 ;;
esac
