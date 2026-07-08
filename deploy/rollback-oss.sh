#!/bin/bash
set -e

# ============================================================================
# interview-agent OSS（前端）回滚脚本
# ============================================================================
# 用法1（交互式）: bash deploy/rollback-oss.sh
# 用法2（指定版本）: bash deploy/rollback-oss.sh 20250708-143022-a1b2c3d
# ============================================================================

# -------------------- 配置区（请修改为你的实际信息）--------------------
OSS_BUCKET="mqq-resume"                 # <-- 你的 OSS Bucket 名称
OSS_ENDPOINT="oss-cn-beijing.aliyuncs.com"  # <-- 你的 OSS 地域端点
OSS_PREFIX="app/resume"                 # <-- OSS 中的路径前缀
# ----------------------------------------------------------------------

TARGET_VERSION="${1:-}"

# 检查 ossutil
if ! command -v ossutil &> /dev/null; then
  echo "错误: 未找到 ossutil"
  exit 1
fi

# 如果没有指定版本，进入交互模式
if [ -z "$TARGET_VERSION" ]; then
  echo "=========================================="
  echo "  interview-agent OSS 回滚"
  echo "=========================================="
  echo "正在获取版本列表..."
  echo ""

  # 获取版本列表
  LIST_OUTPUT=$(ossutil ls "oss://$OSS_BUCKET/$OSS_PREFIX/versions/" 2>/dev/null || true)

  if [ -z "$LIST_OUTPUT" ]; then
    echo "错误: 没有找到任何版本"
    exit 1
  fi

  echo "序号  版本ID                           分支             时间(UTC)            描述"
  echo "----  -------------------------------  ---------------  -------------------  ------------"

  INDEX=1
  VERSION_ARRAY=()

  # 解析 ossutil ls 输出，提取目录名
  while IFS= read -r LINE; do
    # 匹配目录行，提取版本号
    if [[ "$LINE" =~ oss://$OSS_BUCKET/$OSS_PREFIX/versions/([^/]+)/$ ]]; then
      VER="${BASH_REMATCH[1]}"
      [ -z "$VER" ] && continue
      VERSION_ARRAY+=("$VER")

      # 尝试读取 meta 信息
      META=$(ossutil cat "oss://$OSS_BUCKET/$OSS_PREFIX/versions/$VER/meta.json" 2>/dev/null || echo "{}")
      BRANCH=$(echo "$META" | grep -o '"gitBranch" *: *"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "-")
      DEPLOYED=$(echo "$META" | grep -o '"deployedAt" *: *"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' | cut -d'T' -f1,2 | tr 'T' ' ' || echo "-")
      DESC=$(echo "$META" | grep -o '"description" *: *"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "-")

      # 检查是否为当前版本
      CURRENT_MARK=""
      CURRENT_VER=$(ossutil cat "oss://$OSS_BUCKET/$OSS_PREFIX/version.json" 2>/dev/null | grep -o '"versionId" *: *"[^"]*"' | sed 's/.*: *"\(.*\)".*/\1/' || echo "")
      [ "$VER" = "$CURRENT_VER" ] && CURRENT_MARK=" <-- 当前"

      printf "%-4s  %-31s  %-15s  %-19s  %s%s\n" "$INDEX" "$VER" "$BRANCH" "$DEPLOYED" "$DESC" "$CURRENT_MARK"
      INDEX=$((INDEX + 1))
    fi
  done <<< "$LIST_OUTPUT"

  if [ ${#VERSION_ARRAY[@]} -eq 0 ]; then
    echo "未找到版本目录"
    exit 1
  fi

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
if ! ossutil ls "oss://$OSS_BUCKET/$OSS_PREFIX/versions/$TARGET_VERSION/" > /dev/null 2>&1; then
  echo "错误: 版本 $TARGET_VERSION 不存在"
  exit 1
fi

# 执行回滚
echo "[1/2] 复制历史版本到根目录..."
ossutil cp -rf "oss://$OSS_BUCKET/$OSS_PREFIX/versions/$TARGET_VERSION/" "oss://$OSS_BUCKET/$OSS_PREFIX/"

echo "[2/2] 更新 version.json..."
# 尝试读取历史版本的 meta.json，回写为当前 version.json
META=$(ossutil cat "oss://$OSS_BUCKET/$OSS_PREFIX/versions/$TARGET_VERSION/meta.json" 2>/dev/null || echo "{}")
if [ "$META" = "{}" ]; then
  # 如果没有 meta.json，构造一个基本的
  cat > "/tmp/rollback-version-$$.json" << EOF
{
  "versionId": "$TARGET_VERSION",
  "rolledBackAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "note": "rolled back from version.json"
}
EOF
else
  # 添加回滚标记
  echo "$META" | sed 's/}$/,"rolledBackAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}/' > "/tmp/rollback-version-$$.json"
fi
ossutil cp "/tmp/rollback-version-$$.json" "oss://$OSS_BUCKET/$OSS_PREFIX/version.json"
rm -f "/tmp/rollback-version-$$.json"

echo ""
echo "=========================================="
echo "  回滚完成 ✅"
echo "=========================================="
echo "当前版本:  $TARGET_VERSION"
echo ""
echo "⚠️  重要: 请前往阿里云 CDN 控制台刷新缓存"
echo "   路径: /app/resume/* 或 /*"
echo ""
