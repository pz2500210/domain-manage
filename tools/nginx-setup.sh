#!/bin/bash

# 域名管理系统 - Nginx配置脚本
# 此脚本用于配置Nginx作为域名管理系统的反向代理

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

# 显示欢迎信息
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}     域名管理系统 - Nginx配置脚本               ${NC}"
echo -e "${BLUE}================================================${NC}"
echo

# 获取当前目录（假设脚本在项目的tools目录下）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${BLUE}[信息]${NC} 项目目录: $PROJECT_DIR"

# 检查Nginx是否安装
echo -e "\n${BLUE}[步骤1]${NC} 检查Nginx..."
if command -v nginx >/dev/null 2>&1; then
  NGINX_VERSION=$(nginx -v 2>&1)
  echo -e "${GREEN}[成功]${NC} Nginx已安装: $NGINX_VERSION"
else
  echo -e "${YELLOW}[警告]${NC} Nginx未安装，将进行安装..."
  apt-get update
  apt-get install -y nginx
  if [ $? -ne 0 ]; then
    echo -e "${RED}[错误]${NC} 无法安装Nginx"
    exit 1
  fi
  echo -e "${GREEN}[成功]${NC} Nginx已安装: $(nginx -v 2>&1)"
fi

# 检查Nginx状态
echo -e "\n${BLUE}[步骤2]${NC} 检查Nginx状态..."
systemctl status nginx | grep "Active:" | grep "running" > /dev/null
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}[警告]${NC} Nginx未运行，将启动服务..."
  systemctl start nginx
  if [ $? -ne 0 ]; then
    echo -e "${RED}[错误]${NC} 无法启动Nginx服务"
    exit 1
  fi
  echo -e "${GREEN}[成功]${NC} Nginx服务已启动"
else
  echo -e "${GREEN}[成功]${NC} Nginx服务正在运行"
fi

# 获取域名或IP
echo -e "\n${BLUE}[步骤3]${NC} 配置Nginx反向代理..."
echo -e "${YELLOW}请提供应用访问地址:${NC}"
read -p "域名/IP (默认: localhost): " SERVER_NAME
SERVER_NAME=${SERVER_NAME:-localhost}

# 获取端口号
read -p "应用监听端口 (默认: 3000): " APP_PORT
APP_PORT=${APP_PORT:-3000}

# 是否启用SSL
read -p "是否启用SSL? (y/n, 默认: n): " -n 1 -r ENABLE_SSL
ENABLE_SSL=${ENABLE_SSL:-n}
echo

# 定义Nginx配置文件
NGINX_CONF_FILE="/etc/nginx/sites-available/domain-manager"

# 创建Nginx配置
echo -e "\n${BLUE}[步骤4]${NC} 创建Nginx配置文件..."

if [[ $ENABLE_SSL =~ ^[Yy]$ ]]; then
  # 使用SSL配置
  echo -e "${YELLOW}[注意]${NC} SSL配置需要证书文件，请提供证书路径:"
  read -p "SSL证书路径 (例如: /etc/ssl/certs/server.crt): " SSL_CERT
  read -p "SSL密钥路径 (例如: /etc/ssl/private/server.key): " SSL_KEY
  
  if [ ! -f "$SSL_CERT" ] || [ ! -f "$SSL_KEY" ]; then
    echo -e "${RED}[错误]${NC} 证书文件不存在，请先准备SSL证书"
    read -p "继续使用HTTP配置? (y/n): " -n 1 -r CONTINUE_HTTP
    echo
    if [[ ! $CONTINUE_HTTP =~ ^[Yy]$ ]]; then
      exit 1
    fi
    ENABLE_SSL="n"
  else
    cat > $NGINX_CONF_FILE << EOF
server {
    listen 80;
    server_name $SERVER_NAME;
    
    # 重定向HTTP到HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name $SERVER_NAME;
    
    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    access_log /var/log/nginx/domain-manager-access.log;
    error_log /var/log/nginx/domain-manager-error.log;
    
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    echo -e "${GREEN}[成功]${NC} 已创建HTTPS Nginx配置"
  fi
fi

# 如果不使用SSL或SSL配置失败，创建HTTP配置
if [[ ! $ENABLE_SSL =~ ^[Yy]$ ]]; then
  cat > $NGINX_CONF_FILE << EOF
server {
    listen 80;
    server_name $SERVER_NAME;
    
    access_log /var/log/nginx/domain-manager-access.log;
    error_log /var/log/nginx/domain-manager-error.log;
    
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  echo -e "${GREEN}[成功]${NC} 已创建HTTP Nginx配置"
fi

# 启用站点配置
echo -e "\n${BLUE}[步骤5]${NC} 启用Nginx站点配置..."
ln -sf $NGINX_CONF_FILE /etc/nginx/sites-enabled/
if [ $? -ne 0 ]; then
  echo -e "${RED}[错误]${NC} 无法启用Nginx站点配置"
  exit 1
fi

# 测试Nginx配置
echo -e "\n${BLUE}[步骤6]${NC} 测试Nginx配置..."
nginx -t
if [ $? -ne 0 ]; then
  echo -e "${RED}[错误]${NC} Nginx配置测试失败，请检查配置文件"
  exit 1
fi
echo -e "${GREEN}[成功]${NC} Nginx配置测试通过"

# 重启Nginx
echo -e "\n${BLUE}[步骤7]${NC} 重启Nginx服务..."
systemctl restart nginx
if [ $? -ne 0 ]; then
  echo -e "${RED}[错误]${NC} 无法重启Nginx服务"
  exit 1
fi
echo -e "${GREEN}[成功]${NC} Nginx服务已重启"

# 配置防火墙（如果存在）
echo -e "\n${BLUE}[步骤8]${NC} 配置防火墙..."
if command -v ufw >/dev/null 2>&1; then
  ufw status | grep "Status: active" > /dev/null
  if [ $? -eq 0 ]; then
    echo -e "${YELLOW}[警告]${NC} 检测到UFW防火墙启用"
    
    # 检查HTTP端口
    ufw status | grep "80/tcp" > /dev/null
    if [ $? -ne 0 ]; then
      echo -e "${BLUE}[信息]${NC} 开放HTTP端口(80)..."
      ufw allow 80/tcp
    else
      echo -e "${GREEN}[成功]${NC} HTTP端口(80)已开放"
    fi
    
    # 如果启用SSL，检查HTTPS端口
    if [[ $ENABLE_SSL =~ ^[Yy]$ ]]; then
      ufw status | grep "443/tcp" > /dev/null
      if [ $? -ne 0 ]; then
        echo -e "${BLUE}[信息]${NC} 开放HTTPS端口(443)..."
        ufw allow 443/tcp
      else
        echo -e "${GREEN}[成功]${NC} HTTPS端口(443)已开放"
      fi
    fi
  else
    echo -e "${BLUE}[信息]${NC} UFW防火墙未启用，无需配置"
  fi
else
  echo -e "${BLUE}[信息]${NC} 未检测到UFW防火墙，无需配置"
fi

# 配置服务自启动
echo -e "\n${BLUE}[步骤9]${NC} 配置应用服务..."
cat > /etc/systemd/system/domain-manager.service << EOF
[Unit]
Description=域名管理系统
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which node) $PROJECT_DIR/app.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=domain-manager

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}[成功]${NC} 创建系统服务文件"

# 重新加载systemd并启用服务
echo -e "\n${BLUE}[步骤10]${NC} 启用系统服务..."
systemctl daemon-reload
systemctl enable domain-manager.service
echo -e "${GREEN}[成功]${NC} 服务已启用，将在系统启动时自动运行"

# 提供操作说明
echo -e "\n${BLUE}================================================${NC}"
echo -e "${GREEN}Nginx配置完成!${NC}"
echo -e "${BLUE}------------------------------------------------${NC}"
echo -e "您的域名管理系统现在可以通过以下方式访问:"
if [[ $ENABLE_SSL =~ ^[Yy]$ ]]; then
  echo -e "  https://$SERVER_NAME"
else
  echo -e "  http://$SERVER_NAME"
fi

echo -e "\n管理应用服务的命令:"
echo -e "  启动: sudo systemctl start domain-manager"
echo -e "  停止: sudo systemctl stop domain-manager"
echo -e "  重启: sudo systemctl restart domain-manager"
echo -e "  查看状态: sudo systemctl status domain-manager"
echo -e "  查看日志: journalctl -u domain-manager"
echo -e "${BLUE}================================================${NC}"

# 询问是否立即启动应用服务
read -p "是否立即启动应用服务? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${BLUE}[信息]${NC} 启动应用服务中..."
  systemctl start domain-manager
  if [ $? -ne 0 ]; then
    echo -e "${RED}[错误]${NC} 无法启动应用服务，请检查日志"
    exit 1
  else
    echo -e "${GREEN}[成功]${NC} 应用服务已启动"
    systemctl status domain-manager
  fi
fi

exit 0 