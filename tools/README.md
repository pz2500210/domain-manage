# 域名管理系统工具集

此目录包含用于域名管理系统的辅助工具和脚本，主要用于系统部署、测试和维护。

## 可用工具

### 1. Debian环境安装脚本 (debian-install.sh)

用于在Debian系统上快速部署域名管理系统所需的环境。

**使用方法:**
```bash
# 赋予执行权限
chmod +x debian-install.sh
# 以root权限运行
sudo ./debian-install.sh
```

此脚本将：
- 安装系统依赖（curl, wget, git, build-essential, sqlite3）
- 检查并安装Node.js（如果需要）
- 设置适当的文件权限
- 安装项目依赖
- 运行测试脚本验证环境
- 提供启动说明

### 2. Debian环境测试脚本 (debian-setup-test.js)

测试Debian系统上的环境配置是否正确。

**使用方法:**
```bash
# 在项目根目录运行
node tools/debian-setup-test.js
```

此脚本将检查：
- 系统环境（Debian版本、系统资源）
- Node.js环境
- SQLite可用性
- 应用依赖是否安装
- 文件权限
- 网络服务（端口占用）
- 数据库初始化

## 注意事项

- 安装脚本需要root权限运行
- 测试脚本可能需要管理员权限才能完成所有测试
- 部署到生产环境前，建议先在测试环境运行这些工具 