# 域名管理系统

一个强大的多功能域名管理平台，用于自动化管理域名、服务器、SSL证书和网站部署。

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-16.x+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-lightgrey.svg)](https://expressjs.com/)

## 功能特点

- **域名管理**：集中管理域名、注册商信息、过期日期和状态追踪
- **服务器管理**：管理多台服务器，支持密码和SSH密钥认证
- **自动化部署**：一键部署网站，自动配置Nginx和SSL证书
- **SSL证书管理**：支持Let's Encrypt/ACME自动申请与自签名证书
- **模板系统**：使用预定义模板快速创建网站
- **服务器监控**：检查Nginx状态、服务器性能和连接状态
- **自动化备份**：定期备份网站和证书配置
- **批量操作**：同时管理多个域名和服务器
- **直观界面**：响应式设计，易于使用的管理控制台

## 技术架构

### 前端
- HTML5 / CSS3 / JavaScript
- Bootstrap 5 框架
- AJAX / Fetch API 异步请求
- 响应式设计

### 后端
- Node.js 16+
- Express.js 4.x Web框架
- EJS 模板引擎
- SQLite3 数据库
- SSH远程连接管理

### 核心功能
- SSH自动化部署
- Let's Encrypt/ACME SSL证书自动申请
- Nginx配置自动生成与管理
- 多平台支持（标准Linux服务器和专用托管环境）

## 安装步骤

### 前提条件
- Node.js 16.0.0 或更高版本
- NPM 7.x 或更高版本
- 支持SSH连接的服务器

### 安装过程

1. **克隆仓库**
```bash
git clone https://github.com/yourusername/domain-manager.git
cd domain-manager
```

2. **安装依赖**
```bash
npm install
```

3. **准备数据目录**
```bash
mkdir -p data
mkdir -p temp
```

4. **初始化数据库**
```bash
node models/init-db.js
```

5. **启动应用**
```bash
npm start
```

或使用开发模式（自动重启）：
```bash
npm run dev
```

6. **访问应用**

浏览器中打开 `http://localhost:3000`

## 使用说明

### 服务器管理
1. 添加服务器：提供服务器名称、IP地址、SSH端口、用户名和认证方式
2. 支持两种认证方式：
   - 密码认证：直接输入密码
   - SSH密钥认证：上传或指定私钥文件路径

### 域名部署
1. 选择域名和目标服务器
2. 选择证书类型（ACME/Let's Encrypt或自签名）
3. 选择网站模板
4. 点击部署按钮，系统将：
   - 通过SSH连接服务器
   - 创建必要的目录结构
   - 上传网站模板
   - 申请SSL证书（或生成自签名证书）
   - 配置Nginx服务器
   - 启动网站服务

### 证书管理
系统支持两种类型的SSL证书：
- **ACME/Let's Encrypt**：自动申请免费的受信任证书（有效期90天，自动续期）
- **自签名证书**：在无法验证域名所有权时的备选项（有效期365天）

## 目录结构

```
domain-manager/
├── app.js                # 应用主入口
├── public/               # 静态资源
│   ├── css/              # 样式表
│   ├── js/               # 客户端脚本
│   └── images/           # 图片资源
├── models/               # 数据模型
│   ├── db.js             # 数据库连接
│   ├── init-db.js        # 数据库初始化
│   └── *.js              # 各实体模型
├── views/                # EJS视图模板
│   └── partials/         # 可重用视图组件
├── routes/               # 路由控制器
│   └── api/              # API路由
│       ├── deploy.js     # 部署相关API
│       ├── servers.js    # 服务器相关API
│       └── rmdomain.js   # 域名移除API
├── utils/                # 工具函数
│   ├── ssh.js            # SSH连接工具
│   └── logger.js         # 日志记录工具
├── middleware/           # Express中间件
├── config/               # 配置文件
├── data/                 # SQLite数据库文件
└── temp/                 # 临时文件目录
```

## 服务器类型支持

系统支持两种主要的服务器环境：

1. **标准Linux服务器**：
   - CentOS、Ubuntu、Debian等标准服务器
   - 使用标准Nginx配置方式
   - 支持完整的服务器配置管理

2. **专用托管环境(serv00/hostuno)**：
   - 针对serv00和hostuno托管环境优化
   - 使用devil命令进行域名和SSL配置
   - 自动检测环境并调整部署策略

## 安全注意事项

- 所有密码和SSH密钥存储在本地数据库中，确保服务器安全
- 建议定期备份data目录下的数据库文件
- 确保应用只在安全的内网环境中访问
- 定期更新依赖包以修复潜在的安全漏洞

## 贡献指南

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

## 许可证

本项目采用 [ISC 许可证](MIT)。

## 致谢

- [Express.js](https://expressjs.com/) - Web框架
- [node-ssh](https://github.com/steelbrain/node-ssh) - SSH客户端
- [Let's Encrypt](https://letsencrypt.org/) - 免费SSL证书
- [acme.sh](https://github.com/acmesh-official/acme.sh) - ACME
