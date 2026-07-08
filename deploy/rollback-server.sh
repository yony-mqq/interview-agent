#!/bin/bash
set -e

# ============================================================================
# interview-agent Server 回滚脚本
# ============================================================================
# 用法1（交互式）: bash deploy/rollback-server.sh
# 用法2（指定版本）: bash deploy/rollback-server.sh 20250708-143022-a1b2c3d
# ============================================================================

# -------------------- 配置区（请修改为你的实际信息）--------------------
SERVER_USER="root"
SERVER_HOST="YOUR_LIGHT_SERVER_IP"      # <-- 改成你的轻量服务器 IP
APP_DIR="/var/www/interview-agent"
# ----------------------------------------------------------------------

TARGET_VERSION="${1:-}"

# 如果没有指定版本，进入交互模式
if [ -z "$TARGET_VERSION" ]; then
  echo "=========================================="
  echo "  interview-agent Server 回滚"
  echo "=========================================="
  echo "正在获取版本列表..."
  echo ""

  # 获取版本列表和元信息
  VERSIONS=$(ssh "$SERVER_USER@$SERVER_HOST" "ls -1 $APP_DIR/releases | sort -r")

  if [ -z "$VERSIONS" ]; then
    echo "错误: 没有找到任何版本"
    exit 1
  fi

  echo "序号  版本ID                           分支             时间(UTC)            描述"
  echo "----  -------------------------------  ---------------  -------------------  ------------"

  INDEX=1
  VERSION_ARRAY=()
  while IFS= read -r VER; do
    [ -z "$VER" ] && continue
    VERSION_ARRAY+=("$VER")
    META=$(ssh "$SERVER_USER@$SERVER_HOST" "cat $APP_DIR/releases/$VER/meta.json 2>/dev/null || echo '{}'")
    BRANCH=$(echo "$META" | grep -o '"gitBranch" *: *"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "-")
    DEPLOYED=$(echo "$META" | grep -o '"deployedAt" *: *"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' | cut -d'T' -f1,2 | tr 'T' ' ' || echo "-")
    DESC=$(echo "$META" | grep -o '"description" *: *"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "-")
    CURRENT_MARK=""
    [ "$VER" = "$(ssh "$SERVER_USER@$SERVER_HOST" "readlink $APP_DIR/current | xargs basename")" ] && CURRENT_MARK=" <-- 当前"
    printf "%-4s  %-31s  %-15s  %-19s  %s%s\n" "$INDEX" "$VER" "$BRANCH" "$DEPLOYED" "$DESC" "$CURRENT_MARK"
    INDEX=$((INDEX + 1))
  done <<< "$VERSIONS"

  echo ""
  read -p "输入要回滚的版本序号或版本ID: " INPUT

  # 判断输入的是序号还是版本ID
  if [[ "$INPUT" =~ ^[0-9]+$ ]] && [ "$INPUT" -ge 1 ] && [ "$INPUT" -lt "$INDEX" ]; then
    TARGET_VERSION="${VERSION_ARRAY[$((INPUT - 1))]}"
  else
    TARGET_VERSION="$INPUT"
  fi
fi

echo ""
echo "准备回滚到: $TARGET_VERSION"

# 检查版本是否存在
ssh "$SERVER_USER@$SERVER_HOST" "test -d $APP_DIR/releases/$TARGET_VERSION" || {
  echo "错误: 版本 $TARGET_VERSION 不存在"
  exit 1
}

# 执行回滚
echo "[1/2] 更新 current 符号链接..."
ssh "$SERVER_USER@$SERVER_HOST" << REMOTE
  set -e
  ln -sfn $APP_DIR/releases/$TARGET_VERSION $APP_DIR/current
  echo "current -> releases/$TARGET_VERSION"
REMOTE

echo "[2/2] PM2 平滑重启..."
ssh "$SERVER_USER@$SERVER_HOST" << REMOTE
  set -e
  cd $APP_DIR/current
  pm2 startOrReload ecosystem.config.js --env production
  pm2 save
REMOTE

echo ""
echo "=========================================="
echo "  回滚完成 ✅"
echo "=========================================="
echo "当前版本:  $TARGET_VERSION"
echo "回滚耗时:  < 1 秒"
echo ""
