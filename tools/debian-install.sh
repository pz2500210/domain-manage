#!/bin/bash

# 域名管理系统 - Debian安装脚本
# 此脚本将安装所有必要的依赖并准备运行环境

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # 无颜色

# 检查是否有root权限
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}请使用root权限运行此脚本 (sudo $0)${NC}"
  exit 1
fi

# 检查是否为Debian系统
if [ ! -f /etc/debian_version ]; then
  echo -e "${YELLOW}警告: 这不是Debian系统，脚本可能无法正常工作${NC}"
  read -p "是否继续? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# 显示欢迎信息
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}       域名管理系统 - Debian安装脚本            ${NC}"
echo -e "${BLUE}================================================${NC}"
echo

# 获取当前目录（假设脚本在项目的tools目录下）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${BLUE}[信息]${NC} 项目目录: $PROJECT_DIR"

# 更新系统包
echo -e "\n${BLUE}[步骤1]${NC} 更新系统包..."
apt-get update
if [ $? -ne 0 ]; then
  echo -e "${RED}[错误]${NC} 无法更新系统包"
  exit 1
fi
echo -e "${GREEN}[成功]${NC} 系统包已更新"

# 安装基本依赖
echo -e "\n${BLUE}[步骤2]${NC} 安装基本依赖..."
apt-get install -y curl wget git build-essential sqlite3
if [ $? -ne 0 ]; then
  echo -e "${RED}[错误]${NC} 无法安装基本依赖"
  exit 1
fi
echo -e "${GREEN}[成功]${NC} 基本依赖已安装"

# 安装Node.js
echo -e "\n${BLUE}[步骤3]${NC} 检查Node.js..."
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v)
  echo -e "${GREEN}[成功]${NC} Node.js已安装，版本为: $NODE_VERSION"
  
  # 检查版本是否满足要求
  NODE_MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | tr -d 'v')
  if [ "$NODE_MAJOR_VERSION" -lt 14 ]; then
    echo -e "${YELLOW}[警告]${NC} Node.js版本低于推荐版本(v14+)"
    read -p "是否继续使用当前版本? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${BLUE}[信息]${NC} 将安装Node.js 16.x版本..."
      curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
      apt-get install -y nodejs
      echo -e "${GREEN}[成功]${NC} Node.js已更新，版本为: $(node -v)"
    fi
  fi
else
  echo -e "${YELLOW}[警告]${NC} 未检测到Node.js，将安装Node.js 16.x版本..."
  curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
  apt-get install -y nodejs
  if [ $? -ne 0 ]; then
    echo -e "${RED}[错误]${NC} 无法安装Node.js"
    exit 1
  fi
  echo -e "${GREEN}[成功]${NC} Node.js已安装，版本为: $(node -v)"
fi

# 检查npm
echo -e "\n${BLUE}[步骤4]${NC} 检查npm..."
if command -v npm >/dev/null 2>&1; then
  NPM_VERSION=$(npm -v)
  echo -e "${GREEN}[成功]${NC} npm已安装，版本为: $NPM_VERSION"
else
  echo -e "${RED}[错误]${NC} npm未安装，请检查Node.js安装"
  exit 1
fi

# 创建应用目录并设置权限
echo -e "\n${BLUE}[步骤5]${NC} 设置应用目录权限..."

# 获取当前用户
CURRENT_USER=$SUDO_USER
if [ -z "$CURRENT_USER" ]; then
  CURRENT_USER=$(whoami)
fi

# 创建data目录
mkdir -p "$PROJECT_DIR/data"
chown -R $CURRENT_USER:$CURRENT_USER "$PROJECT_DIR"
echo -e "${GREEN}[成功]${NC} 应用目录权限已设置"

# 安装项目依赖
echo -e "\n${BLUE}[步骤6]${NC} 安装项目依赖..."
cd "$PROJECT_DIR"
if sudo -u $CURRENT_USER npm install; then
  echo -e "${GREEN}[成功]${NC} 项目依赖已安装"
else
  echo -e "${RED}[错误]${NC} 无法安装项目依赖"
  exit 1
fi

# 检查应用配置
echo -e "\n${BLUE}[步骤7]${NC} 检查应用配置..."
if [ ! -f "$PROJECT_DIR/app.js" ]; then
  echo -e "${RED}[错误]${NC} app.js文件不存在，请检查项目结构"
  exit 1
fi
echo -e "${GREEN}[成功]${NC} 应用配置正常"

# 运行测试脚本
echo -e "\n${BLUE}[步骤8]${NC} 运行环境测试..."
if [ -f "$PROJECT_DIR/tools/debian-setup-test.js" ]; then
  cd "$PROJECT_DIR"
  sudo -u $CURRENT_USER node "$PROJECT_DIR/tools/debian-setup-test.js"
  if [ $? -ne 0 ]; then
    echo -e "${YELLOW}[警告]${NC} 环境测试可能存在问题，请查看上方日志"
  else
    echo -e "${GREEN}[成功]${NC} 环境测试通过"
  fi
else
  echo -e "${YELLOW}[警告]${NC} 找不到测试脚本，跳过环境测试"
fi

# 提供启动说明
echo -e "\n${BLUE}================================================${NC}"
echo -e "${GREEN}安装完成!${NC}"
echo -e "${BLUE}------------------------------------------------${NC}"
echo -e "要启动应用，请运行以下命令:"
echo -e "  cd $PROJECT_DIR"
echo -e "  npm start"
echo -e "\n应用将在 http://localhost:3000 运行"
echo -e "\n如需在后台运行应用，可以使用:"
echo -e "  cd $PROJECT_DIR"
echo -e "  nohup npm start &"
echo -e "${BLUE}================================================${NC}"

# 询问是否立即启动应用
read -p "是否立即启动应用? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${BLUE}[信息]${NC} 启动应用中..."
  cd "$PROJECT_DIR"
  sudo -u $CURRENT_USER npm start
fi

exit 0 