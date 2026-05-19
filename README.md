# 📁 File Manager

一款开箱即用的 Web 文件管理器，基于 Express.js 构建，暗色主题，功能全面。

A ready-to-use web-based file manager built with Express.js, featuring a dark theme and full feature set.

---

## 功能 Features

| 功能 | 说明 |
|------|------|
| 📂 文件浏览 | 目录树、面包屑导航、搜索过滤、排序 |
| 📤 上传 / 📥 下载 | 单文件/批量上传、拖拽上传、目录打包下载为 zip |
| 📦 解压 | 右键解压 `.zip` / `.tar.gz` / `.tgz` / `.tar.bz2` / `.tar` / `.gz` |
| ✏️ 在线编辑 | 点击编辑按钮打开暗色编辑器，Ctrl+S 保存，支持 10MB 以下文本文件 |
| 📋 复制/剪切/粘贴 | 选中文件 → 复制/剪切 → 切换目录 → 粘贴（Ctrl+C/X/V） |
| 🖱 右键菜单 | 下载、编辑、解压、重命名、复制路径、复制、剪切、删除 |
| 🔐 路径安全 | 白名单机制，防止路径穿越攻击 |

## 快速开始 Quick Start

```bash
# 克隆
git clone https://github.com/9623739-bot/file-manager.git
cd file-manager

# 安装依赖
npm install

# 启动（默认端口 3456）
node server.js
```

浏览器打开 `http://localhost:3456`，密码 `hermes2024`。

## 自动登录 Auto Login

访问 `http://localhost:3456/?safe=1` 可自动登录，密码不会出现在 URL 中。

## 开机自启 Systemd Service

```bash
sudo tee /etc/systemd/system/file-manager.service > /dev/null << UNIT
[Unit]
Description=File Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node server.js
Restart=always
User=$(whoami)

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now file-manager
```

## 一键部署 One-Click Deploy

本仓库包含一个 Hermes Agent skill，在新服务器上加载后执行：

```bash
bash ~/.hermes/skills/software-development/file-manager/scripts/setup.sh
```

脚本会自动完成：安装依赖 → 复制代码 → npm install → 配置 systemd → 启动服务。

## API 概览 API Overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/list?dir=` | 列出目录内容 |
| `POST` | `/api/upload` | 上传文件 |
| `POST` | `/api/upload-batch` | 批量上传 |
| `POST` | `/api/mkdir` | 创建目录 |
| `POST` | `/api/rename` | 重命名 |
| `POST` | `/api/copy` | 复制（支持目录递归） |
| `POST` | `/api/move` | 移动（支持跨设备回退） |
| `POST` | `/api/delete` | 删除 |
| `GET` | `/api/download?path=` | 下载文件/目录 |
| `GET` | `/api/download-batch` | 批量下载为 zip |
| `POST` | `/api/extract` | 解压压缩包 |
| `POST` | `/api/upload-archive` | 上传并解压 |
| `GET` | `/api/read?path=` | 读取文件内容 |
| `POST` | `/api/save` | 保存文件内容 |

## 技术栈 Tech Stack

- **后端:** Node.js + Express.js + Multer + Archiver
- **前端:** 纯 JavaScript + CSS（暗色主题，无框架依赖）
- **安全:** 路径白名单、路径穿越防护

## 许可 License

MIT
