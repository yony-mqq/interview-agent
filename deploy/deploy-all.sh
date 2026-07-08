#!/bin/bash
set -e

# ============================================================================
# interview-agent 一键全量部署脚本
# ============================================================================
# 依次执行 server + knowledge 部署 和 client (OSS) 部署
# 用法: bash deploy/deploy-all.sh [版本描述]
# 例:   bash deploy/deploy-all.sh "v1.2.0 生产发布"
# ============================================================================

DESCRIPTION="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "  interview-agent 一键全量部署"
echo "=========================================="
[ -n "$DESCRIPTION" ] && echo "描述: $DESCRIPTION"
echo ""

echo "--- 第一步: 部署 Server + Knowledge ---"
bash "$SCRIPT_DIR/deploy-server.sh" "$DESCRIPTION"

echo ""
echo "--- 第二步: 部署 Client (OSS) ---"
bash "$SCRIPT_DIR/deploy-oss.sh" "$DESCRIPTION"

echo ""
echo "=========================================="
echo "  全量部署完成 ✅"
echo "=========================================="
echo ""
echo "如需回滚:"
echo "  Server: bash deploy/rollback-server.sh"
echo "  OSS:    bash deploy/rollback-oss.sh"
