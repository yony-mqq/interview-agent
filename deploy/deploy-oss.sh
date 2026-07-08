#!/bin/bash
set -e

# ============================================================================
# interview-agent Client（OSS）部署脚本（本地执行）
# ============================================================================
# 用法: bash deploy/deploy-oss.sh [版本描述]
# 例:   bash deploy/deploy-oss.sh "优化首页加载速度"
# ============================================================================

# -------------------- 配置区（请修改为你的实际信息）--------------------
OSS_BUCKET="mqq-resume"                 # <-- 你的 OSS Bucket 名称
OSS_ENDPOINT="oss-cn-beijing.aliyuncs.com"  # <-- 你的 OSS 地域端点
OSS_PREFIX="app/resume"                 # <-- OSS 中的路径前缀
# ----------------------------------------------------------------------

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESCRIPTION="${1:-}"

# 检查 ossutil
if ! command -v ossutil &> /dev/null; then
  echo "错误: 未找到 ossutil，请先安装阿里云 OSS 命令行工具"
  echo "安装指南: https://help.aliyun.com/document_detail/120075.html"
  exit 1
fi

# 检查是否在 git 仓库内
if ! git -C "$REPO_DIR" rev-parse --git-dir > /dev/null 2>&1; then
  echo "错误: 当前目录不是 git 仓库"
  exit 1
fi

# 生成版本 ID
GIT_BRANCH=$(git -C "$REPO_DIR" branch --show-current)
GIT_COMMIT=$(git -C "$REPO_DIR" rev-parse HEAD)
GIT_SHORT=$(git -C "$REPO_DIR" rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
VERSION_ID="${TIMESTAMP}-${GIT_SHORT}"

echo "=========================================="
echo "  interview-agent Client (OSS) 部署"
echo "=========================================="
echo "版本ID:    $VERSION_ID"
echo "分支:      $GIT_BRANCH"
echo "Commit:    $GIT_COMMIT"
[ -n "$DESCRIPTION" ] && echo "描述:      $DESCRIPTION"
echo "OSS:       oss://$OSS_BUCKET/$OSS_PREFIX"
echo ""

# 1. 构建前端
echo "[1/4] 构建前端..."
cd "$REPO_DIR/client"
npm install
npm run build

# 2. 上传到版本历史目录
echo "[2/4] 上传到 OSS versions/$VERSION_ID/ ..."
ossutil cp -rf "$REPO_DIR/client/dist/" "oss://$OSS_BUCKET/$OSS_PREFIX/versions/$VERSION_ID/"

# 3. 复制到 current（根目录）
echo "[3/4] 更新当前版本（复制到根目录）..."
ossutil cp -rf "$REPO_DIR/client/dist/" "oss://$OSS_BUCKET/$OSS_PREFIX/"

# 4. 更新 version.json
echo "[4/4] 更新 version.json..."
VERSION_JSON="/tmp/interview-agent-version-$$.json"
cat > "$VERSION_JSON" << EOF
{
  "versionId": "$VERSION_ID",
  "gitBranch": "$GIT_BRANCH",
  "gitCommit": "$GIT_COMMIT",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "description": "$DESCRIPTION"
}
EOF
ossutil cp "$VERSION_JSON" "oss://$OSS_BUCKET/$OSS_PREFIX/version.json"
rm -f "$VERSION_JSON"

echo ""
echo "=========================================="
echo "  部署完成 ✅"
echo "=========================================="
echo "版本:      $VERSION_ID"
echo "OSS地址:   oss://$OSS_BUCKET/$OSS_PREFIX/"
echo "历史版本:  oss://$OSS_BUCKET/$OSS_PREFIX/versions/$VERSION_ID/"
echo ""
echo "⚠️  重要: 请前往阿里云 CDN 控制台刷新缓存"
echo "   路径: /app/resume/* 或 /*"
echo ""
echo "如需回滚，执行: bash deploy/rollback-oss.sh"
