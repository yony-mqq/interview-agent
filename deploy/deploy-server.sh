#!/bin/bash
set -e

# ============================================================================
# interview-agent Server + Knowledge 部署脚本（本地执行）
# ============================================================================
# 用法: bash deploy/deploy-server.sh [版本描述]
# 例:   bash deploy/deploy-server.sh "修复登录接口bug"
# ============================================================================

# -------------------- 配置区（请修改为你的实际信息）--------------------
SERVER_USER="root"
SERVER_HOST="YOUR_LIGHT_SERVER_IP"      # <-- 改成你的轻量服务器 IP
APP_DIR="/var/www/interview-agent"
# ----------------------------------------------------------------------

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESCRIPTION="${1:-}"

# 检查是否在 git 仓库内
if ! git -C "$REPO_DIR" rev-parse --git-dir > /dev/null 2>&1; then
  echo "错误: 当前目录不是 git 仓库"
  exit 1
fi

# 生成版本 ID: 时间戳-git短哈希
GIT_BRANCH=$(git -C "$REPO_DIR" branch --show-current)
GIT_COMMIT=$(git -C "$REPO_DIR" rev-parse HEAD)
GIT_SHORT=$(git -C "$REPO_DIR" rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
VERSION_ID="${TIMESTAMP}-${GIT_SHORT}"

echo "=========================================="
echo "  interview-agent Server 部署"
echo "=========================================="
echo "版本ID:    $VERSION_ID"
echo "分支:      $GIT_BRANCH"
echo "Commit:    $GIT_COMMIT"
[ -n "$DESCRIPTION" ] && echo "描述:      $DESCRIPTION"
echo "目标服务器: $SERVER_USER@$SERVER_HOST"
echo ""

# 1. 构建后端
echo "[1/6] 构建后端..."
cd "$REPO_DIR/server"
npm install
npm run build

# 2. 准备发布包
echo "[2/6] 准备发布包..."
TMP_DIR="/tmp/interview-agent-release-$$"
mkdir -p "$TMP_DIR/server" "$TMP_DIR/knowledge"

# 复制 server（排除源码和本地依赖，保留构建产物和 package.json）
rsync -a \
  --exclude='src' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='npminstall-debug.log' \
  "$REPO_DIR/server/" "$TMP_DIR/server/"

# 复制 knowledge（完整目录）
rsync -a "$REPO_DIR/knowledge/" "$TMP_DIR/knowledge/"

# 复制 PM2 配置文件
cp "$REPO_DIR/deploy/ecosystem.config.js" "$TMP_DIR/"

# 生成版本元信息
cat > "$TMP_DIR/meta.json" << EOF
{
  "versionId": "$VERSION_ID",
  "gitBranch": "$GIT_BRANCH",
  "gitCommit": "$GIT_COMMIT",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "description": "$DESCRIPTION"
}
EOF

# 3. 上传到服务器
echo "[3/6] 上传发布包到服务器..."
ssh "$SERVER_USER@$SERVER_HOST" "mkdir -p $APP_DIR/releases"
scp -r "$TMP_DIR" "$SERVER_USER@$SERVER_HOST:$APP_DIR/releases/$VERSION_ID"

# 4. 远程安装依赖
echo "[4/6] 远程安装生产依赖..."
ssh "$SERVER_USER@$SERVER_HOST" << REMOTE
  set -e
  cd $APP_DIR/releases/$VERSION_ID/server
  npm install --production
REMOTE

# 5. 切换 current 符号链接
echo "[5/6] 激活新版本（更新 current 符号链接）..."
ssh "$SERVER_USER@$SERVER_HOST" << REMOTE
  set -e
  ln -sfn $APP_DIR/releases/$VERSION_ID $APP_DIR/current
  echo "current -> releases/$VERSION_ID"
REMOTE

# 6. PM2 平滑重启
echo "[6/6] PM2 平滑重启..."
ssh "$SERVER_USER@$SERVER_HOST" << REMOTE
  set -e
  cd $APP_DIR/current
  # 使用 ecosystem.config.js 中的 cwd 指向 current，reload 零停机
  pm2 startOrReload ecosystem.config.js --env production
  pm2 save
REMOTE

# 清理本地临时文件
rm -rf "$TMP_DIR"

echo ""
echo "=========================================="
echo "  部署完成 ✅"
echo "=========================================="
echo "版本:      $VERSION_ID"
echo "服务器:    $SERVER_USER@$SERVER_HOST"
echo "当前指向:  $APP_DIR/current -> releases/$VERSION_ID"
echo ""
echo "如需回滚，执行: bash deploy/rollback-server.sh"
