#!/bin/bash
set -e

# ============================================================================
# interview-agent 版本清理脚本
# ============================================================================
# 保留最近 N 个版本，删除更旧的
# 可在本地执行（通过 SSH）或在服务器上直接执行
# ============================================================================

# -------------------- 配置区（请修改为你的实际信息）--------------------
SERVER_USER="root"
SERVER_HOST="YOUR_LIGHT_SERVER_IP"      # <-- 改成你的轻量服务器 IP（本地执行时需要）
APP_DIR="/var/www/interview-agent"
KEEP=10                                 # 保留的版本数量
# ----------------------------------------------------------------------

# 检测执行环境：如果在服务器本地执行（没有 SSH 到远程），直接操作
# 如果在本地执行，通过 SSH 操作
if [ -d "$APP_DIR/releases" ]; then
  # 在服务器上直接执行
  RUN=""
  echo "=========================================="
  echo "  服务器本地执行版本清理"
  echo "=========================================="
else
  # 在本地通过 SSH 执行
  RUN="ssh $SERVER_USER@$SERVER_HOST"
  echo "=========================================="
  echo "  远程清理服务器版本（通过 SSH）"
  echo "=========================================="
fi

# 获取版本总数
TOTAL=$($RUN "ls -1 $APP_DIR/releases 2>/dev/null | wc -l")

echo "版本总数: $TOTAL"
echo "保留数量: $KEEP"

if [ "$TOTAL" -le "$KEEP" ]; then
  echo "版本数量未超过保留上限，无需清理"
  exit 0
fi

TO_DELETE=$($RUN "ls -1 $APP_DIR/releases | sort -r | tail -n +$((KEEP + 1))")
DELETE_COUNT=$(echo "$TO_DELETE" | grep -c '^' || echo 0)

echo "即将删除 $DELETE_COUNT 个旧版本:"
echo "$TO_DELETE"
echo ""

# 获取当前激活的版本，确保不删除当前版本
CURRENT_VER=$($RUN "readlink $APP_DIR/current 2>/dev/null | xargs basename 2>/dev/null || echo ''")

# 安全确认
read -p "确认删除以上版本？(输入 yes 确认): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "已取消"
  exit 0
fi

# 执行删除
while IFS= read -r VER; do
  [ -z "$VER" ] && continue
  if [ "$VER" = "$CURRENT_VER" ]; then
    echo "跳过当前激活版本: $VER"
    continue
  fi
  echo "删除: $VER"
  $RUN "rm -rf $APP_DIR/releases/$VER"
done <<< "$TO_DELETE"

echo ""
echo "清理完成，剩余版本数: $($RUN "ls -1 $APP_DIR/releases 2>/dev/null | wc -l")"
