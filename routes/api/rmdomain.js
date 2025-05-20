// =====================================================
// 域名删除系统 - API路由
// =====================================================
// 此文件专门处理与域名删除相关的API路由和功能函数

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const SSHClient = require('../../utils/ssh'); // 引入 SSHClient 类
const DeployedDomain = require('../../models/deployed_domain'); // 引入 DeployedDomain 模型
const Server = require('../../models/server'); // 引入 Server 模型

// =====================================================
// 初始化设置
// =====================================================

// 临时文件目录 (本地 Node.js 应用的临时目录)
const TEMP_DIR = path.join(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * 生成统一的域名删除脚本内容 (包含标准 Linux 和 Serv00/Hostuno 逻辑)
 * @param {string} domainName 要删除的域名
 * @param {string} webroot 网站根目录的基础路径 (标准 Linux 用)
 * @param {string} serverIp 脚本中使用的服务器IP (传递给脚本用)
 * @param {string} sniIp 脚本中使用的 SNI IP (Serv00/Hostuno 用)
 * @returns {string} 脚本内容
 */
function generateUnifiedDeleteScript(domainName, webroot, serverIp, sniIp) {
    // 使用传递进来的变量生成脚本内容
    return `#!/bin/bash

# 域名删除脚本
# 自动生成于 $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 定义输出函数，确保每行输出都被正确记录
log_info() {
    echo "[INFO] $(date -u +"%Y-%m-%dT%H:%M:%SZ") $1"
}

log_error() {
    echo "[ERROR] $(date -u +"%Y-%m-%dT%H:%M:%SZ") $1" >&2
    exit 1 # 发生错误时退出脚本
}

log_success() {
    echo "[SUCCESS] $(date -u +"%Y-%m-%dT%H:%M:%SZ") $1"
}

log_warn() {
    echo "[WARN] $(date -u +"%Y-%m-%dT%H:%M:%SZ") $1" >&2
}


log_info "脚本开始执行..."

# ----------------------------------------------------------------------------
# 从 Node.js 传递的变量
# ----------------------------------------------------------------------------
# 注意：这些变量的值是在生成脚本时直接嵌入的
WEBROOT_DIR="${webroot}" # 基础网站根目录 (标准 Linux 用)
DOMAIN="${domainName}"   # 域名
SERVER_IP="${serverIp}"  # 服务器IP (传递给脚本用)
SNI_IP="${sniIp}"        # SNI IP (Serv00/Hostuno 用)

log_info "接收到参数: WEBROOT_DIR='\${WEBROOT_DIR}', DOMAIN='\${DOMAIN}', SERVER_IP='\${SERVER_IP}', SNI_IP='\${SNI_IP}'"

# ----------------------------------------------------------------------------
# 环境检测 (提前执行)
# ----------------------------------------------------------------------------
# 通过检测 devil 命令是否存在来判断是否是 Serv00/Hostuno 环境
IS_SERV00_HOSTUNO=false
if command -v devil &> /dev/null; then
    log_info "检测到 devil 命令，假定为 Serv00/Hostuno 环境。"
    IS_SERV00_HOSTUNO=true
else
    log_info "未检测到 devil 命令，假定为标准 Linux 环境。"
fi

# ----------------------------------------------------------------------------
# 参数检查 (Serv00/Hostuno 环境需要检查 SNI_IP)
# ----------------------------------------------------------------------------
if [ "$IS_SERV00_HOSTUNO" = true ] && [ -z "$SNI_IP" ]; then
    log_error "错误：在 Serv00/Hostuno 环境下，缺少 SNI IP 参数。脚本执行终止。"
    # 在 Node.js 中会检查 domainName 和 serverId，这里只检查 Serv00 特有的 SNI IP
fi

log_info "开始处理域名: \${DOMAIN}"
if [ "$IS_SERV00_HOSTUNO" = true ]; then
    log_info "使用的 SNI IP: \${SNI_IP}"
fi


# ----------------------------------------------------------------------------
# 执行删除操作 (根据环境)
# ----------------------------------------------------------------------------

if [ "$IS_SERV00_HOSTUNO" = true ]; then
    # Serv00/Hostuno 环境删除逻辑
    log_info "使用 devil 命令删除域名 \${DOMAIN} 的证书和网站配置..."

    # 删除证书 (使用修正后的 devil ssl www del 命令)
    log_info "尝试删除域名 \${DOMAIN} (SNI IP: \${SNI_IP}) 的 SSL 证书..."
    # 修正命令格式为 devil ssl www del <sni_ip> <domain>
    devil ssl www del "\${SNI_IP}" "\${DOMAIN}"
    if [ $? -eq 0 ]; then
        log_success "SSL 证书 (\${SNI_IP}, \${DOMAIN}) 删除命令执行完成"
    else
        # 即使删除失败也记录警告，因为可能证书不存在，但继续删除网站配置
        log_warn "SSL 证书 (\${SNI_IP}, \${DOMAIN}) 删除命令失败或证书不存在 (退出码: $?)"
    fi

    # 删除网站配置
    log_info "尝试删除域名 \${DOMAIN} 的网站配置..."
    # devil www remove 命令通常会处理文件删除和 Nginx 配置
    devil www remove "\${DOMAIN}"
    if [ $? -eq 0 ]; then
        log_success "网站配置 (\${DOMAIN}) 删除命令执行完成"
    else
        log_error "删除网站配置 (\${DOMAIN}) 失败！请手动检查。" # 网站配置删除失败是严重错误
    fi

    log_success "Serv00/Hostuno 环境域名 \${DOMAIN} 删除流程完成。"

else
    # 标准 Linux 环境删除逻辑
    log_info "执行标准 Linux 环境下的域名 \${DOMAIN} 删除操作..."

    # *** 在脚本内部定义完整的网站目标目录变量 ***
    # 组合基础根目录和域名来形成完整的网站目录路径
    TARGET_DIR="\${WEBROOT_DIR}/\${DOMAIN}"

    log_info "计算出的目标目录: \${TARGET_DIR}"

    # 在删除前检查目录是否存在
    log_info "检查网站目录是否存在: \${TARGET_DIR}"
    if [ -d "\${TARGET_DIR}" ]; then
        log_info "找到网站目录 \${TARGET_DIR}，开始删除..."
        # 使用 sudo 删除，确保权限
        sudo rm -rf "\${TARGET_DIR}"
        if [ $? -eq 0 ]; then
            log_success "网站目录 \${TARGET_DIR} 已删除"
        else
            log_error "删除网站目录 \${TARGET_DIR} 失败 (退出码: $?)"
            # 注意：即使删除目录失败，我们仍然尝试继续清理其他配置
        fi
    else
        log_warn "网站目录 \${TARGET_DIR} 不存在，无需删除"
    fi

    # 删除 Nginx 配置文件 (available 和 enabled)
    log_info "尝试删除 Nginx 配置文件..."
    NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
    NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
    NGINX_CONF="\${NGINX_SITES_AVAILABLE}/\${DOMAIN}" # 假设配置文件名就是域名

    if [ -f "\${NGINX_CONF}" ]; then
        log_info "找到 Nginx 配置文件 \${NGINX_CONF}，开始删除..."
        sudo rm -f "\${NGINX_CONF}"
        if [ $? -eq 0 ]; then
            log_success "Nginx 配置文件 \${NGINX_CONF} 已删除"
        else
            log_error "删除 Nginx 配置文件 \${NGINX_CONF} 失败 (退出码: $?)"
        fi

        # 同时尝试删除 sites-enabled 中的软链接
        NGINX_ENABLED_LINK="\${NGINX_SITES_ENABLED}/\${DOMAIN}"
        if [ -L "\${NGINX_ENABLED_LINK}" ]; then # 检查是否是软链接
            log_info "找到 Nginx sites-enabled 软链接 \${NGINX_ENABLED_LINK}，开始删除..."
            sudo rm -f "\${NGINX_ENABLED_LINK}"
            if [ $? -eq 0 ]; then
                log_success "Nginx sites-enabled 软链接 \${NGINX_ENABLED_LINK} 已删除"
            else
                log_error "删除 Nginx sites-enabled 软链接 \${NGINX_ENABLED_LINK} 失败 (退出码: $?)"
            fi
        elif [ -f "\${NGINX_ENABLED_LINK}" ]; then # 如果不是软链接但同名文件存在 (不应该发生)
             log_warn "在 \${NGINX_SITES_ENABLED} 中找到同名文件 \${NGINX_ENABLED_LINK} (非软链接)，跳过删除"
        else
            log_warn "未找到 Nginx sites-enabled 软链接 \${NGINX_ENABLED_LINK}"
        fi

        # 尝试重载 Nginx 配置
        log_info "尝试重载 Nginx 服务..."
        # 尝试多种重载命令，兼容不同系统
        sudo systemctl reload nginx 2>/dev/null || sudo service nginx reload 2>/dev/null || sudo nginx -s reload 2>/dev/null || log_warn "重载 Nginx 服务失败或不需要重载 (退出码: $?)"
        if [ $? -eq 0 ]; then
             log_success "Nginx 服务已重载"
        fi


    else
        log_warn "未找到 Nginx 配置文件 \${NGINX_CONF}"
    fi

    log_success "标准 Linux 环境域名 \${DOMAIN} 删除流程完成。"
fi

log_success "域名 \${DOMAIN} 删除脚本执行完毕。"

# 重要标记：部署已成功删除
echo ""
echo ""
echo "=== 部署已删除 ==="

# DNS记录删除提示 - 这是另一个重要标记
echo "------------------------------------------------------------------------" >&2
echo "                >>>>> 请移除以下DNS记录: <<<<<" >&2 # Increased leading spaces
echo "" >&2
echo "                       域名: \${DOMAIN}" >&2 # Increased leading spaces
echo "                         类型: A记录" >&2 # Increased leading spaces
echo "                      指向IP: \${SNI_IP:-\$SERVER_IP}" >&2 # 使用SNI_IP（如果存在），否则使用SERVER_IP # Increased leading spaces
echo "" >&2
echo "------------------------------------------------------------------------" >&2

exit 0
`;
}


// =====================================================
// 域名删除 - 删除已部署的域名 API 路由
// =====================================================

router.post('/delete', async (req, res) => {
    let ssh = null; // 初始化 ssh 连接为 null
    let scriptPath = null; // 声明 scriptPath 变量 (local path)
    let remoteScriptPath = null; // 声明 remote script path

    try {
        // 从请求体获取 domainId 或 bcid
        const { domainId, bcid } = req.body;

        if (!domainId && !bcid) {
            console.log('请求缺少必要参数 (domainId 或 bcid)');
            return res.status(400).json({
                success: false,
                error: '缺少必要参数 (domainId 或 bcid)'
            });
        }

        console.log(`接收到删除请求: ${bcid ? `bcid ${bcid}` : `已部署记录 ID ${domainId}`}`);
        console.log('请求体完整内容:', JSON.stringify(req.body));

        // 1. 获取完整的已部署域名记录 (优先使用 bcid)
        let deployedDomainRecord;
        
        if (bcid) {
            // 通过 bcid 获取记录
            console.log(`尝试通过 bcid ${bcid} 查询部署记录...`);
            deployedDomainRecord = await new Promise((resolve, reject) => {
                DeployedDomain.getByBcid(bcid, (err, data) => {
                    if (err) {
                        console.error(`通过 bcid ${bcid} 查询部署记录失败:`, err);
                        reject(err);
                    }
                    else if (!data) {
                        console.error(`未找到 bcid 为 ${bcid} 的已部署域名记录`);
                        reject(new Error(`未找到 bcid 为 ${bcid} 的已部署域名记录`));
                    }
                    else {
                        console.log(`通过 bcid ${bcid} 找到已部署记录:`, JSON.stringify(data));
                        resolve(data);
                    }
                });
            });
            console.log(`通过 bcid ${bcid} 找到已部署记录`);
        } else {
            // 通过 domainId 获取记录
            console.log(`尝试通过 domainId ${domainId} 查询部署记录...`);
            deployedDomainRecord = await new Promise((resolve, reject) => {
                DeployedDomain.getById(domainId, (err, data) => {
                    if (err) {
                        console.error(`通过 domainId ${domainId} 查询部署记录失败:`, err);
                        reject(err);
                    }
                    else if (!data) {
                        console.error(`未找到 ID 为 ${domainId} 的已部署域名记录`);
                        reject(new Error(`未找到 ID 为 ${domainId} 的已部署域名记录`));
                    }
                    else {
                        console.log(`通过 domainId ${domainId} 找到已部署记录:`, JSON.stringify(data));
                        resolve(data);
                    }
                });
            });
            console.log(`通过 domainId ${domainId} 找到已部署记录`);
        }

        // 从记录中提取必要信息
        const {
            domain_name: domainName,
            server_name: serverName,
            server_ip: deployedServerIp, // 已部署记录中的服务器IP
            sni_ip: sniIp // Serv00 环境可能需要
        } = deployedDomainRecord;

        console.log(`找到已部署记录详情: 域名=${domainName}, 服务器名称=${serverName}, 服务器IP=${deployedServerIp}, SNI IP=${sniIp || 'N/A'}`);

        // 2. 根据 server_name 和 server_ip 获取服务器信息 (获取连接信息和 webroot, type)
        console.log(`开始查询服务器信息，首先尝试通过IP ${deployedServerIp} 查询...`);
        let server;
        try {
            // 使用 Server 模型查询服务器信息 - getByIp返回Promise
            server = await Server.getByIp(deployedServerIp);
            if (!server) {
                console.warn(`未找到IP为 ${deployedServerIp} 的服务器，尝试通过服务器名称 ${serverName} 查询...`);
                // 尝试通过服务器名称查询 - 假设getByName也返回Promise
                try {
                    server = await new Promise((resolve, reject) => {
                        Server.getByName(serverName, (nameErr, nameData) => {
                            if (nameErr) {
                                console.warn(`通过名称 ${serverName} 查询服务器也失败: ${nameErr.message}`);
                                reject(new Error(`未找到IP为 ${deployedServerIp} 或名称为 ${serverName} 的服务器`));
                            }
                            else if (!nameData) {
                                console.error(`未找到IP为 ${deployedServerIp} 或名称为 ${serverName} 的服务器`);
                                reject(new Error(`未找到IP为 ${deployedServerIp} 或名称为 ${serverName} 的服务器`));
                            }
                            else {
                                console.log(`通过名称找到服务器: ${nameData.name} (${nameData.ip}), 详情:`, JSON.stringify(nameData));
                                resolve(nameData);
                            }
                        });
                    });
                } catch (nameError) {
                    throw nameError; // 重新抛出错误
                }
            } else {
                console.log(`通过IP找到服务器: ${server.name} (${server.ip}), 详情:`, JSON.stringify(server));
            }
        } catch (serverError) {
            console.error(`查询服务器信息失败:`, serverError);
            throw new Error(`查询服务器信息失败: ${serverError.message}`);
        }

        console.log(`找到服务器信息: 名称=${server.name}, IP=${server.ip}, 类型=${server.type || '未知'}, 端口=${server.port || 22}, 用户名=${server.username || server.ssh_user}`);

        // 确定服务器类型用于生成脚本
        const isSpecialServer = server.ip && (
            server.ip.includes('serv00') ||
            server.ip.includes('hostuno') ||
            server.name && (server.name.includes('serv00') || server.name.includes('hostuno')) ||
            server.hostname && (server.hostname.includes('serv00') || server.hostname.includes('hostuno'))
        );
        const serverTypeForScript = isSpecialServer ? 'serv00_hostuno' : 'standard_linux';
        console.log(`确定脚本类型为: ${serverTypeForScript} (特殊服务器检测结果: ${isSpecialServer})`);

        // 获取网站根目录设置 (仅标准 Linux 逻辑会在脚本中使用此变量)
        const webroot = server.webroot || '/var/www'; // 默认值 /var/www
        console.log(`传递给脚本的网站根目录 (webroot): ${webroot}`);

        // 获取传递给脚本的服务器IP和SNI IP
        // 脚本内部会使用这些变量
        const scriptServerIp = deployedServerIp || server.ip; // 脚本中使用的服务器IP (可能不需要，但传递过去备用)
        const scriptSniIp = sniIp; // 直接使用从部署记录中获取的 SNI IP (Serv00/Hostuno 需要)
        console.log(`传递给脚本的服务器IP: ${scriptServerIp}, SNI IP: ${scriptSniIp || 'N/A'}`);


        // 3. 生成统一的删除脚本内容
        console.log(`开始生成删除脚本，参数: domainName=${domainName}, webroot=${webroot}, scriptServerIp=${scriptServerIp}, scriptSniIp=${scriptSniIp || 'N/A'}`);
        const deleteScriptContent = generateUnifiedDeleteScript(
            domainName,
            webroot,
            scriptServerIp,
            scriptSniIp
        );
        console.log(`删除脚本生成完成，脚本长度: ${deleteScriptContent.length} 字符`);

        // 4. 将脚本内容写入本地临时文件
        // 使用 uuidv4() 确保文件名唯一性
        const scriptFilename = `delete_${domainName.replace(/[^a-zA-Z0-9_]/g, '_')}_${uuidv4()}.sh`; // 确保文件名安全
        scriptPath = path.join(TEMP_DIR, scriptFilename);
        console.log(`开始将脚本内容写入本地临时文件: ${scriptPath}`);
        fs.writeFileSync(scriptPath, deleteScriptContent, { mode: 0o755 }); // 设置可执行权限
        console.log(`删除脚本已成功写入本地临时文件: ${scriptPath}, 文件大小: ${fs.statSync(scriptPath).size} 字节`);

        // 5. 连接到远程服务器
        try {
            // 添加更多日志
            console.log(`开始连接到服务器: ${server.ip}, 用户: ${server.username || server.ssh_user}, 端口: ${server.port || server.ssh_port || 22}`);
            console.log('服务器对象详情:', JSON.stringify(server));
            
            ssh = new SSHClient();
            console.log('SSHClient 实例已创建，开始连接...');
            
            // 确保使用服务器对象中的auth_type，如果没有则默认为'password'
            const connectConfig = {
                host: server.ip,
                port: server.port || server.ssh_port || 22,
                username: server.username || server.ssh_user,
                password: server.password || server.ssh_password,
                auth_type: server.auth_type || 'password' // 使用服务器对象中的auth_type或默认为'password'
            };
            
            console.log('SSH连接配置 (敏感信息已隐藏):', {
                host: connectConfig.host,
                port: connectConfig.port,
                username: connectConfig.username,
                passwordProvided: !!connectConfig.password,
                auth_type: connectConfig.auth_type // 显示auth_type
            });
            
            await ssh.connect(connectConfig);
            
            console.log(`成功连接到服务器 ${server.ip}`);
        } catch (sshError) {
            // 详细记录SSH连接错误
            console.error(`SSH连接失败: ${sshError.message}`);
            console.error(`SSH连接错误详情:`, sshError);
            console.error(`服务器信息: IP=${server.ip}, 用户=${server.username || server.ssh_user}, 端口=${server.port || server.ssh_port || 22}`);
            throw sshError;
        }

        // 6. 上传脚本到远程服务器
        remoteScriptPath = `/tmp/${scriptFilename}`; // 上传到远程服务器的 /tmp 目录
        console.log(`开始上传脚本到远程服务器: 本地路径=${scriptPath}, 远程路径=${remoteScriptPath}`);
        await ssh.putFile(scriptPath, remoteScriptPath);
        console.log('脚本上传完成');

        // 7. 在远程服务器上执行脚本
        console.log(`准备在远程服务器上执行脚本: ${remoteScriptPath}`);
        // 构建执行命令和参数
        let execCommand = `bash ${remoteScriptPath} "${domainName}"`; // 脚本的第一个参数是域名
        if (serverTypeForScript === 'serv00_hostuno') {
             // 如果是 Serv00/Hostuno，传递 SNI IP 作为第二个参数
             if (scriptSniIp) {
                  execCommand += ` "${scriptSniIp}"`;
                  console.log(`为 Serv00/Hostuno 环境添加 SNI IP 参数: ${scriptSniIp}`);
             } else {
                  // 如果是 Serv00 但没有 SNI IP，脚本会报错，但我们仍然执行
                  console.warn('Serv00 服务器缺少 SNI IP，执行脚本时不会传递 SNI IP');
             }
        }
         // 使用 sudo 执行脚本，确保有权限删除目录和修改Nginx配置
         execCommand = `sudo ${execCommand}`;
         console.log(`最终执行命令: ${execCommand}`);


        console.log(`开始执行远程命令: ${execCommand}`);
        const result = await ssh.execCommand(execCommand);
        console.log(`远程命令执行完成，退出码: ${result.code}`);

        console.log('脚本执行完成');
        console.log(`脚本 stdout 长度: ${result.stdout ? result.stdout.length : 0} 字符`);
        console.log(`脚本 stdout (前500字符):\n${result.stdout ? result.stdout.substring(0, 500) + '...' : '无输出'}`);
        console.log(`脚本 stderr 长度: ${result.stderr ? result.stderr.length : 0} 字符`);
        if (result.stderr) console.error(`脚本stderr (前500字符):\n${result.stderr ? result.stderr.substring(0, 500) + '...' : '无输出'}`);
        console.log(`脚本退出码: ${result.code}`);


        // 8. 删除远程脚本文件
        console.log(`开始删除远程脚本文件: ${remoteScriptPath}`);
        await ssh.execCommand(`sudo rm -f ${remoteScriptPath}`); // 使用 sudo 删除，确保权限
        console.log('远程脚本文件删除完成');

        // 9. 检查脚本执行结果，判断是否成功
        // 简单的检查：如果脚本退出码为 0 且标准错误中不包含 "[ERROR]"，则认为成功
        const success = (result.code === 0 && !result.stderr.includes('[ERROR]'));
        const output = result.stdout;
        const error = result.stderr;
        let message = "";
        
        // 检查是否包含部署已删除和请移除DNS记录的标记
        const deploymentDeletedMarker = "=== 部署已删除 ===";
        const dnsRemovalMarker = "请移除以下DNS记录";
        
        const deploymentDeleted = output.includes(deploymentDeletedMarker);
        const dnsRemovalRequested = output.includes(dnsRemovalMarker) || error.includes(dnsRemovalMarker);
        
        console.log(`检查删除标记: deploymentDeleted=${deploymentDeleted}, dnsRemovalRequested=${dnsRemovalRequested}`);
        
        // 如果找到了这两个标记，那么部署删除被确认成功
        const deletionConfirmed = deploymentDeleted && dnsRemovalRequested;
        console.log(`删除确认状态: ${deletionConfirmed ? '已确认' : '未确认'}`);
        
        if (success) {
            if (deletionConfirmed) {
                message = `域名 ${domainName} 删除脚本执行成功，确认部署已被删除`;
                console.log(message);
                
                // 使用 bcid 或 domainId 删除记录
                if (bcid) {
                    console.log(`开始从数据库中删除 bcid 为 ${bcid} 的已部署记录...`);
                    await new Promise((resolve, reject) => {
                        DeployedDomain.deleteByBcid(bcid, (err) => {
                            if (err) {
                                console.error(`删除 bcid 为 ${bcid} 的已部署记录失败:`, err);
                                reject(err);
                            } else {
                                console.log(`成功删除 bcid 为 ${bcid} 的已部署记录`);
                                resolve();
                            }
                        });
                    });
                    console.log(`数据库中已部署记录 bcid ${bcid} 已删除`);
                } else {
                    console.log(`开始从数据库中删除 ID 为 ${domainId} 的已部署记录...`);
                    await new Promise((resolve, reject) => {
                        DeployedDomain.deleteById(domainId, (err) => {
                            if (err) {
                                console.error(`删除 ID 为 ${domainId} 的已部署记录失败:`, err);
                                reject(err);
                            } else {
                                console.log(`成功删除 ID 为 ${domainId} 的已部署记录`);
                                resolve();
                            }
                        });
                    });
                    console.log(`数据库中已部署记录 ID ${domainId} 已删除`);
                }
            } else {
                message = `域名 ${domainName} 删除脚本执行完成，但未确认部署已被删除 (退出码: ${result.code})。`;
                console.warn(message);
                console.warn(`删除操作未能确认完成，缺少删除确认标记。数据库记录 ${bcid ? `bcid ${bcid}` : `ID ${domainId}`} 未自动删除。`);
            }
        } else {
            message = `域名 ${domainName} 删除脚本执行完成，但存在问题 (退出码: ${result.code})。请检查日志和脚本输出。`;
            console.warn(message);
            console.warn(`删除操作可能存在问题，数据库记录 ${bcid ? `bcid ${bcid}` : `ID ${domainId}`} 未自动删除。`);
        }

        // 11. 返回响应
        console.log(`准备返回响应: success=${success && deletionConfirmed}, deletionConfirmed=${deletionConfirmed}`);
        res.json({
            success: success && deletionConfirmed,
            message: message,
            scriptOutput: output,
            scriptError: error,
            deletionConfirmed: deletionConfirmed
        });
        console.log('响应已发送');

    } catch (error) {
        console.error(`处理域名删除请求失败: ${error.message}`);
        console.error('错误详情:', error);
        // 错误处理和资源清理将在 finally 块中进行

        // 返回错误响应
        console.log('准备返回错误响应');
        res.status(500).json({
            success: false,
            error: error.message || '处理域名删除请求失败',
            // 在 catch 块中，output 和 error 可能来自 SSH 连接错误等，而不是脚本输出
            scriptOutput: '',
            scriptError: error.stack || error.message // 返回更详细的错误信息
        });
        console.log('错误响应已发送');

    } finally {
        // 确保最终断开连接
        if (ssh && ssh.isConnected) {
             try {
                console.log('尝试断开SSH连接...');
                ssh.disconnect();
                console.log('SSH连接已断开 (finally)');
            } catch (disconnectError) {
                console.error(`SSH连接断开失败 (finally): ${disconnectError.message}`);
                console.error('SSH断开连接错误详情:', disconnectError);
            }
        } else if (ssh) {
            console.log('SSH连接未建立或已断开，不需要在finally中断开连接');
        } else {
            console.log('SSH对象为null，无需断开连接');
        }
        
        // 删除本地临时脚本文件
        if (scriptPath && fs.existsSync(scriptPath)) {
            try {
                console.log(`尝试删除本地临时脚本文件: ${scriptPath}`);
                fs.unlinkSync(scriptPath);
                console.log(`本地临时脚本文件已删除: ${scriptPath}`);
            } catch (unlinkError) {
                console.error(`删除本地临时脚本文件失败: ${unlinkError.message}`);
                console.error('删除文件错误详情:', unlinkError);
            }
        } else if (scriptPath) {
            console.log(`本地临时脚本文件不存在: ${scriptPath}，无需删除`);
        } else {
            console.log('scriptPath为null，无需删除本地临时文件');
        }
        // 注意：远程脚本文件已在成功或失败后尝试删除
        console.log('域名删除处理完成');
    }
});


// =====================================================
// Module Export
// =====================================================

module.exports = router;
