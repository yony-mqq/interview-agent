#!/bin/bash
set -e

APP_DIR="/var/www/interview-agent"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 面试 Agent 助手 - 部署脚本 ==="

# 1. 构建前端
echo "[1/5] 构建前端..."
cd "$REPO_DIR/client"
npm install
npm run build

# 2. 构建后端
echo "[2/5] 构建后端..."
cd "$REPO_DIR/server"
npm install
npm run build

# 3. 复制文件到部署目录
echo "[3/5] 部署文件..."
sudo mkdir -p "$APP_DIR"
sudo cp -r "$REPO_DIR/client/dist" "$APP_DIR/dist"
sudo cp -r "$REPO_DIR/server" "$APP_DIR/server"
sudo cp -r "$REPO_DIR/data" "$APP_DIR/data"
sudo cp "$REPO_DIR/deploy/ecosystem.config.js" "$APP_DIR/"

# 创建持久化数据库目录（确保 SQLite 文件不被覆盖）
echo "[3.5/5] 准备数据库目录..."
sudo mkdir -p /data/interview-agent/backup
sudo chown -R www-data:www-data /data/interview-agent 2>/dev/null || sudo chown -R $(whoami):$(whoami) /data/interview-agent

# 4. 配置 Nginx
echo "[4/5] 配置 Nginx..."
sudo cp "$REPO_DIR/deploy/nginx.conf" /etc/nginx/conf.d/interview-agent.conf
sudo nginx -t && sudo systemctl reload nginx

# 5. 启动/重启 PM2
echo "[5/5] 启动服务..."
cd "$APP_DIR"
pm2 startOrRestart ecosystem.config.js --env production
pm2 save

echo "=== 部署完成！==="
echo "前端: http://$(hostname -I | awk '{print $1}')"
echo "API:  http://$(hostname -I | awk '{print $1}')/api/health"
