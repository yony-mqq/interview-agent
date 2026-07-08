#!/usr/bin/env python3
"""
interview-agent Client (OSS) 部署脚本 — Python 版本
无需 ossutil，直接使用 oss2 SDK 上传

用法:
    python3 deploy/upload-oss.py
    python3 deploy/upload-oss.py "版本描述"

前置条件:
    pip3 install oss2
    配置环境变量（或脚本会提示输入）:
        OSS_ACCESS_KEY_ID
        OSS_ACCESS_KEY_SECRET
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# 自动加载 deploy/.env 文件中的环境变量
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

try:
    import oss2
except ImportError:
    print("正在安装 oss2 SDK...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "oss2", "-q"])
    import oss2
    print("oss2 安装完成")

# -------------------- 配置区 --------------------
OSS_BUCKET = "mqq-resume"
OSS_ENDPOINT = "https://oss-cn-beijing.aliyuncs.com"
OSS_PREFIX = "app/resume"
# -----------------------------------------------

REPO_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = REPO_DIR / "client" / "dist"


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


def get_credentials(args):
    """从命令行参数、环境变量或交互式输入获取 AccessKey"""
    ak_id = args.ak_id or os.environ.get("OSS_ACCESS_KEY_ID")
    ak_secret = args.ak_secret or os.environ.get("OSS_ACCESS_KEY_SECRET")

    if not ak_id:
        ak_id = input("请输入阿里云 AccessKey ID: ").strip()
    if not ak_secret:
        ak_secret = input("请输入阿里云 AccessKey Secret: ").strip()

    return ak_id, ak_secret


def upload_dir(bucket, local_dir: Path, remote_prefix: str):
    """递归上传目录到 OSS"""
    total = 0
    for item in local_dir.rglob("*"):
        if item.is_file():
            rel_path = item.relative_to(local_dir)
            remote_key = f"{remote_prefix}/{rel_path}".replace("//", "/")
            # 去除开头的 /
            remote_key = remote_key.lstrip("/")

            print(f"  上传: {rel_path} -> oss://{OSS_BUCKET}/{remote_key}")
            bucket.put_object_from_file(remote_key, str(item))
            total += 1
    return total


def main():
    parser = argparse.ArgumentParser(description="interview-agent Client (OSS) 部署脚本")
    parser.add_argument("description", nargs="?", default="", help="版本描述")
    parser.add_argument("--ak-id", dest="ak_id", default="", help="阿里云 AccessKey ID")
    parser.add_argument("--ak-secret", dest="ak_secret", default="", help="阿里云 AccessKey Secret")
    args = parser.parse_args()

    description = args.description

    if not DIST_DIR.exists():
        print(f"错误: 构建产物目录不存在: {DIST_DIR}")
        print("请先执行: cd client && npm run build")
        sys.exit(1)

    # 生成版本 ID
    branch, commit, short = get_git_info()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    version_id = f"{timestamp}-{short}"

    print("=" * 50)
    print("  interview-agent Client (OSS) 部署")
    print("=" * 50)
    print(f"版本ID:    {version_id}")
    print(f"分支:      {branch}")
    print(f"Commit:    {commit}")
    if description:
        print(f"描述:      {description}")
    print(f"OSS:       oss://{OSS_BUCKET}/{OSS_PREFIX}")
    print("")

    # 获取凭证并连接 OSS
    ak_id, ak_secret = get_credentials(args)
    auth = oss2.Auth(ak_id, ak_secret)
    bucket = oss2.Bucket(auth, OSS_ENDPOINT, OSS_BUCKET)

    # 1. 上传到版本历史目录
    version_prefix = f"{OSS_PREFIX}/versions/{version_id}"
    print(f"[1/3] 上传到 OSS {version_prefix}/ ...")
    count1 = upload_dir(bucket, DIST_DIR, version_prefix)
    print(f"      共上传 {count1} 个文件\n")

    # 2. 复制到根目录（当前版本）
    current_prefix = OSS_PREFIX
    print(f"[2/3] 更新当前版本（复制到根目录）...")
    count2 = upload_dir(bucket, DIST_DIR, current_prefix)
    print(f"      共上传 {count2} 个文件\n")

    # 3. 更新 version.json
    print("[3/3] 更新 version.json...")
    version_meta = {
        "versionId": version_id,
        "gitBranch": branch,
        "gitCommit": commit,
        "deployedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "description": description,
    }
    version_key = f"{OSS_PREFIX}/version.json".lstrip("/")
    bucket.put_object(version_key, json.dumps(version_meta, ensure_ascii=False).encode("utf-8"))
    print(f"      已上传 version.json\n")

    print("=" * 50)
    print("  部署完成 ✅")
    print("=" * 50)
    print(f"版本:      {version_id}")
    print(f"OSS地址:   https://{OSS_BUCKET}.oss-cn-beijing.aliyuncs.com/{OSS_PREFIX}/")
    print(f"历史版本:  https://{OSS_BUCKET}.oss-cn-beijing.aliyuncs.com/{OSS_PREFIX}/versions/{version_id}/")
    print("")
    print("⚠️  重要: 请前往阿里云 CDN 控制台刷新缓存")
    print("   路径: /app/resume/*")
    print("")


if __name__ == "__main__":
    main()
