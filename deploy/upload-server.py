#!/usr/bin/env python3
"""
interview-agent Server 部署脚本 — Python 版本
通过 scp/ssh 上传到阿里云轻量服务器，支持版本管理

用法:
    python3 deploy/upload-server.py
    python3 deploy/upload-server.py "版本描述"

前置条件:
    1. 配置 deploy/.env（复制 deploy/.env.example 为 deploy/.env）
    2. 确保本地 server/.env 已配置（包含 DASHSCOPE_API_KEY 等）
    3. 确保 server/data/ 包含最新的向量索引（vectors.json）
"""

import os
import sys
import json
import shutil
import argparse
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# 自动加载 deploy/.env
sys.path.insert(0, str(Path(__file__).resolve().parent))

def load_dotenv():
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())

load_dotenv()

# -------------------- 配置区（也可通过 deploy/.env 配置）--------------------
SERVER_HOST = os.environ.get("SERVER_HOST", "").strip()
SERVER_USER = os.environ.get("SERVER_USER", "root").strip()
SERVER_PORT = os.environ.get("SERVER_PORT", "22").strip()
SERVER_KEY_PATH = os.environ.get("SERVER_KEY_PATH", "").strip()
APP_DIR = "/var/www/interview-agent"
# ---------------------------------------------------------------------------

REPO_DIR = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_DIR / "server"
KNOWLEDGE_DIR = REPO_DIR / "knowledge"
DEPLOY_DIR = REPO_DIR / "deploy"


def get_git_info():
    """读取 git 分支和 commit"""
    try:
        branch = subprocess.check_output(
            ["git", "-C", str(REPO_DIR), "branch", "--show-current"],
            text=True,
        ).strip()
        commit = subprocess.check_output(
            ["git", "-C", str(REPO_DIR), "rev-parse", "HEAD"],
            text=True,
        ).strip()
        short = subprocess.check_output(
            ["git", "-C", str(REPO_DIR), "rev-parse", "--short", "HEAD"],
            text=True,
        ).strip()
        return branch, commit, short
    except subprocess.CalledProcessError:
        return "unknown", "unknown", "unknown"


def ssh_cmd(cmd: str, capture=False):
    """执行远程 SSH 命令"""
    ssh_base = ["ssh"]
    if SERVER_PORT != "22":
        ssh_base.extend(["-p", SERVER_PORT])
    if SERVER_KEY_PATH:
        ssh_base.extend(["-i", SERVER_KEY_PATH])
    ssh_base.append(f"{SERVER_USER}@{SERVER_HOST}")

    full = ssh_base + [cmd]
    if capture:
        return subprocess.check_output(full, text=True).strip()
    subprocess.check_call(full)


def scp_upload(local_path: Path, remote_path: str):
    """上传文件/目录到远程"""
    scp_base = ["scp", "-r"]
    if SERVER_PORT != "22":
        scp_base.extend(["-P", SERVER_PORT])
    if SERVER_KEY_PATH:
        scp_base.extend(["-i", SERVER_KEY_PATH])
    scp_base.extend([str(local_path), f"{SERVER_USER}@{SERVER_HOST}:{remote_path}"])
    subprocess.check_call(scp_base)


def main():
    parser = argparse.ArgumentParser(description="interview-agent Server 部署脚本")
    parser.add_argument("description", nargs="?", default="", help="版本描述")
    args = parser.parse_args()

    # 检查配置
    if not SERVER_HOST or SERVER_HOST == "你的轻量服务器IP":
        print("❌ 错误: 未配置服务器地址")
        print(f"   请编辑 {DEPLOY_DIR / '.env'}，设置 SERVER_HOST=你的轻量服务器IP")
        sys.exit(1)

    # 检查必要文件
    required_files = [
        (SERVER_DIR / "dist", "server/dist/（构建产物）"),
        (SERVER_DIR / "package.json", "server/package.json"),
        (SERVER_DIR / ".env", "server/.env（环境变量）"),
    ]
    for path, desc in required_files:
        if not path.exists():
            print(f"❌ 错误: 找不到 {desc}: {path}")
            sys.exit(1)

    # 生成版本 ID
    branch, commit, short = get_git_info()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    version_id = f"{timestamp}-{short}"

    print("=" * 55)
    print("  interview-agent Server 部署")
    print("=" * 55)
    print(f"版本ID:    {version_id}")
    print(f"分支:      {branch}")
    print(f"Commit:    {commit}")
    if args.description:
        print(f"描述:      {args.description}")
    print(f"目标服务器: {SERVER_USER}@{SERVER_HOST}:{SERVER_PORT}")
    print(f"部署目录:  {APP_DIR}")
    print("")

    # 1. 构建后端
    print("[1/5] 构建后端...")
    subprocess.check_call(["npm", "install"], cwd=SERVER_DIR)
    subprocess.check_call(["npm", "run", "build"], cwd=SERVER_DIR)

    # 2. 准备发布包
    print("[2/5] 准备发布包...")
    tmp_dir = Path(tempfile.mkdtemp(prefix="interview-agent-release-"))
    release_dir = tmp_dir / version_id
    release_dir.mkdir(parents=True)

    # 复制 server（用户指定的文件）
    server_release = release_dir / "server"
    server_release.mkdir()
    shutil.copytree(SERVER_DIR / "dist", server_release / "dist")
    if (SERVER_DIR / "data").exists():
        shutil.copytree(SERVER_DIR / "data", server_release / "data")
    shutil.copy(SERVER_DIR / "package.json", server_release / "package.json")
    shutil.copy(SERVER_DIR / ".env", server_release / ".env")

    # 复制 knowledge（完整目录）
    if KNOWLEDGE_DIR.exists():
        shutil.copytree(KNOWLEDGE_DIR, release_dir / "knowledge")

    # 复制 PM2 配置
    shutil.copy(DEPLOY_DIR / "ecosystem.config.js", release_dir / "ecosystem.config.js")

    # 生成版本元信息
    meta = {
        "versionId": version_id,
        "gitBranch": branch,
        "gitCommit": commit,
        "deployedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "description": args.description,
    }
    with open(release_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 3. 上传到服务器
    print(f"[3/5] 上传发布包到服务器...")
    ssh_cmd(f"mkdir -p {APP_DIR}/releases")
    scp_upload(release_dir, f"{APP_DIR}/releases/")

    # 4. 远程安装依赖 + 初始化环境
    print("[4/5] 远程安装生产依赖...")
    ssh_cmd(
        f"set -e; "
        f"cd {APP_DIR}/releases/{version_id}/server && npm install --production; "
        f"if [ ! -f {APP_DIR}/shared/.env ]; then "
        f"  mkdir -p {APP_DIR}/shared && cp {APP_DIR}/releases/{version_id}/server/.env {APP_DIR}/shared/.env; "
        f"  echo '首次部署: .env 已复制到 shared/'; "
        f"fi"
    )

    # 5. 切换 current 符号链接 + PM2 重启
    print("[5/5] 激活新版本并重启服务...")
    ssh_cmd(
        f"set -e; "
        f"ln -sfn {APP_DIR}/releases/{version_id} {APP_DIR}/current; "
        f"echo 'current -> releases/{version_id}'; "
        f"cd {APP_DIR}/current && pm2 startOrReload ecosystem.config.js --env production; "
        f"pm2 save"
    )

    # 清理临时文件
    shutil.rmtree(tmp_dir)

    print("")
    print("=" * 55)
    print("  部署完成 ✅")
    print("=" * 55)
    print(f"版本:      {version_id}")
    print(f"服务器:    {SERVER_USER}@{SERVER_HOST}")
    print(f"当前指向:  {APP_DIR}/current -> releases/{version_id}")
    print("")
    print("如需回滚，执行: python3 deploy/rollback-server.py")
    print("")


if __name__ == "__main__":
    main()
