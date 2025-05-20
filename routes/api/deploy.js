// =====================================================
// 域名部署系统 - API路由
// =====================================================
// 此文件包含所有与域名部署相关的API路由和功能函数
// 主要功能包括：域名部署准备、执行部署操作、域名删除等

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const SSHClient = require('../../utils/ssh'); // 引入 SSHClient 类
const { getServerById } = require('../../models/db');
const db = require('../../config/db'); // 引入数据库模块
const Template = require('../../models/template');
const io = require('socket.io-client');
const DeployedDomain = require('../../models/deployed_domain');
const Server = require('../../models/server');
const Client = require('ssh2').Client; // 虽然引入了，但主要使用的是自定义的 SSHClient

// =====================================================
// 初始化设置
// =====================================================

// 临时文件目录
const TEMP_DIR = path.join(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =====================================================
// 域名检查 - 验证域名是否已部署
// =====================================================

// 检查域名是否已部署
router.post('/check-domain', async (req, res) => {
    try {
        const { domainName } = req.body;

        if (!domainName) {
            return res.status(400).json({
                success: false,
                error: '缺少域名参数'
            });
        }

        // 检查域名是否已在部署数据库中
        const deployedDomain = await new Promise((resolve, reject) => {
            DeployedDomain.getByDomain(domainName, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        return res.json({
            success: true,
            exists: !!deployedDomain,
            domain: deployedDomain || null
        });
    } catch (error) {
        console.error('检查域名是否部署失败:', error);
        return res.status(500).json({
            success: false,
            error: `检查域名失败: ${error.message}`
        });
    }
});

// =====================================================
// 域名部署准备 - 生成配置和脚本文件
// =====================================================

// 生成部署文件
router.post('/prepare', async (req, res) => {
    try {
        const config = req.body;

        // 验证请求
        if (!config.domain || !config.server || !config.certificate || !config.template) {
            return res.status(400).json({ success: false, error: '配置不完整' });
        }

        // 获取服务器详情
        const server = await getServerById(config.server.id);
        if (!server) {
            return res.status(404).json({ success: false, error: '服务器不存在' });
        }

        // 获取模板详情 - 使用Promise包装回调函数
        const template = await new Promise((resolve, reject) => {
            Template.getById(config.template.id, (err, template) => {
                if (err) reject(err);
                else resolve(template);
            });
        });

        if (!template) {
            return res.status(404).json({ success: false, error: '模板不存在' });
        }

        // 生成唯一文件ID
        const fileId = uuidv4();
        const tempDir = path.join(TEMP_DIR, fileId);
        fs.mkdirSync(tempDir, { recursive: true });

        // 保存配置信息
        const configFile = path.join(tempDir, 'config.json');
        fs.writeFileSync(configFile, JSON.stringify({
            ...config,
            server: {
                ...config.server,
                ip: server.ip,
                port: server.port || 22,
                username: server.username,
                password: server.password,
                key_file: server.key_file, // 添加密钥文件
                auth_type: server.auth_type, // 添加认证类型
                webroot: server.webroot || '/var/www/html'
            },
            template: {
                ...config.template,
                filename: template.filename,
                content: template.content
            },
            // 确保证书类型传递到配置中
            certificate: {
                 ...config.certificate,
                 type: config.certificate.type // 显式传递证书类型
            }
        }, null, 2));

        // 保存模板文件
        const templateFile = path.join(tempDir, template.filename);
        fs.writeFileSync(templateFile, template.content);

        // 检查服务器类型，确定是否为特殊服务器（serv00或hostuno）
        const isSpecialServer = server.ip && (
            server.ip.includes('serv00') ||
            server.ip.includes('hostuno') ||
            server.name && (server.name.includes('serv00') || server.name.includes('hostuno')) ||
            server.hostname && (server.hostname.includes('serv00') || server.hostname.includes('hostuno')) // 增加对HOSTNAME的判断
        );

        // 根据服务器类型生成不同的部署脚本
        let deployScriptContent;
        // 确保config.certificate.type传递给脚本生成函数
        const certType = config.certificate.type;

        if (isSpecialServer) {
            console.log(`检测到特殊服务器: ${server.ip}, 使用Node.js部署脚本`);
            deployScriptContent = generateNodeJsDeployScript(config.domain.name,
                                                          server.webroot || '/var/www/html',
                                                          template.filename,
                                                          certType, // 传递证书类型
                                                          server.ip);
        } else {
            console.log(`使用标准Nginx部署脚本: ${server.ip}`);
            deployScriptContent = generateDeployScript(config.domain.name,
                                                      server.webroot || '/var/www/html',
                                                      template.filename,
                                                      certType, // 传递证书类型
                                                      server.ip);
        }

        const scriptFile = path.join(tempDir, 'deploy.sh');
        fs.writeFileSync(scriptFile, deployScriptContent);

        // 设置60分钟后自动清理
        setTimeout(() => {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        }, 60 * 60 * 1000);

        res.json({
            success: true,
            fileId,
            message: '部署文件已准备好'
        });
    } catch (error) {
        console.error('准备部署文件失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || '准备部署文件失败'
        });
    }
});

// =====================================================
// 域名部署执行 - 上传和执行脚本
// =====================================================

// 执行部署
router.post('/execute', async (req, res) => {
    let ssh = null; // 初始化SSH连接为null
    let logResult = { stdout: '', stderr: '' }; // 初始化日志结果
    let localLogFile = null; // 在此声明localLogFile变量

    try {
        const { fileId } = req.body;

        if (!fileId) {
            return res.status(400).json({ success: false, error: '缺少文件ID' });
        }

        const tempDir = path.join(TEMP_DIR, fileId);

        // 检查临时目录是否存在
        if (!fs.existsSync(tempDir)) {
            return res.status(404).json({ success: false, error: '配置文件已过期或未找到' });
        }

        // 读取配置信息
        const configFile = path.join(tempDir, 'config.json');
        if (!fs.existsSync(configFile)) {
            return res.status(404).json({ success: false, error: '配置文件不完整' });
        }

        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const server = config.server;
        const domainName = config.domain.name;
        const templateFile = path.join(tempDir, config.template.filename);
        const scriptFile = path.join(tempDir, 'deploy.sh');

        // 验证服务器配置
        if (!server) {
            return res.status(400).json({ success: false, error: '服务器配置不存在' });
        }

        if (!server.ip) {
            return res.status(400).json({
                success: false,
                error: `服务器(ID: ${server.id || '未知'}, 名称: ${server.name || '未知'})的IP地址为空。请在服务器管理中更新IP地址。`
            });
        }

        // 尝试从数据库获取最新的服务器信息，覆盖配置文件中的旧信息
        try {
            const dbServer = await getServerById(server.id);
            if (dbServer && dbServer.ip) {
                // 使用数据库中的最新信息更新配置
                server.ip = dbServer.ip;
                server.port = dbServer.port || 22;
                server.username = dbServer.username;
                server.password = dbServer.password;
                server.key_file = dbServer.key_file; // 更新密钥文件
                server.auth_type = dbServer.auth_type; // 更新认证类型
            }
        } catch (dbError) {
            console.warn(`无法从数据库获取服务器信息: ${dbError.message}。将使用配置文件中的信息。`);
        }

        // 创建SSH连接
        ssh = new SSHClient(); // 分配给外部声明的ssh变量

        // 检查服务器IP是否存在（在数据库更新后再次检查，以防仍然为空）
        if (!server.ip) {
            throw new Error('服务器IP地址不存在，无法建立连接');
        }

        // 根据认证类型构建连接配置
        const sshConnectConfig = {
            ip: server.ip,
            port: server.port || 22,
            username: server.username,
            auth_type: server.auth_type || 'password' // 默认为密码认证
        };

        if (sshConnectConfig.auth_type === 'key' && server.key_file) {
            sshConnectConfig.key_file = server.key_file;
        } else {
            // 密码认证
            sshConnectConfig.password = server.password;
        }

        await ssh.connect(sshConnectConfig);

        // 获取服务器HOSTNAME，用于进一步确认服务器类型
        try {
            const hostnameResult = await ssh.execCommand('hostname');
            if (hostnameResult.stdout) {
                const hostname = hostnameResult.stdout.trim();
                console.log(`服务器HOSTNAME: ${hostname}`);
                
                // 将hostname保存到config中，以便后续使用
                config.server.hostname = hostname;
                
                // 如果之前未检测到特殊服务器，但hostname包含特殊标识，则重新生成脚本
                const isSpecialByHostname = hostname.includes('serv00') || hostname.includes('hostuno');
                const scriptIsSpecial = fs.readFileSync(scriptFile, 'utf8').includes('devil www add');
                
                if (isSpecialByHostname && !scriptIsSpecial) {
                    console.log(`根据HOSTNAME ${hostname} 检测到特殊服务器，重新生成部署脚本`);
                    const newScriptContent = generateNodeJsDeployScript(
                        config.domain.name,
                        server.webroot || '/var/www/html',
                        config.template.filename,
                        config.certificate.type,
                        server.ip
                    );
                    fs.writeFileSync(scriptFile, newScriptContent);
                    // 重新上传修改后的脚本
                    await ssh.putFile(scriptFile, remoteScriptPath);
                    console.log('基于HOSTNAME重新生成的部署脚本已上传');
                }
            }
        } catch (hostnameError) {
            console.warn(`无法获取服务器HOSTNAME: ${hostnameError.message}，将使用原始脚本`);
        }

        // 确保目标目录存在
        const targetDir = `${server.webroot}/${domainName}`;
        console.log(`确保目标目录存在: ${targetDir}`);
        await ssh.execCommand(`mkdir -p ${targetDir}`);
        console.log('目标目录创建/检查完成');

        // 上传模板文件
        console.log(`上传模板文件: ${config.template.filename} 到 ${targetDir}`);
        // 保持原始文件名
        await ssh.putFile(templateFile, `${targetDir}/${config.template.filename}`);
        console.log('模板文件上传完成');

        // 上传并执行部署脚本
        const remoteScriptPath = `${targetDir}/deploy.sh`;
        console.log(`上传部署脚本: deploy.sh 到 ${remoteScriptPath}`);
        await ssh.putFile(scriptFile, remoteScriptPath);
        console.log('部署脚本上传完成');

        console.log(`授予执行权限: chmod +x ${remoteScriptPath}`);
        await ssh.execCommand(`chmod +x ${remoteScriptPath}`);
        console.log('执行权限已设置');

        console.log(`开始执行部署脚本: ${remoteScriptPath}`);

        let deploySuccess = false;

        try {
            // 在服务器上执行部署脚本
            // 尝试使用script命令记录终端会话，可以捕获更完整的输出
            const deployScriptCmd = `cd ${targetDir} && script -q -c "bash ./deploy.sh" -f ${targetDir}/deploy_full.log`;
            console.log(`执行命令: ${deployScriptCmd}`);

            const scriptExecResult = await ssh.execCommand(deployScriptCmd, { timeout: 600000 }); // 10分钟超时
            console.log(`script命令执行完成，退出代码: ${scriptExecResult.code}`);
            // console.log(`script标准输出: ${scriptExecResult.stdout}`); // script标准输出通常为空
            // console.log(`script标准错误: ${scriptExecResult.stderr}`); // script标准错误可能包含错误信息

            // 检查script命令本身是否成功执行
            if (scriptExecResult.code !== 0) {
                console.warn(`script命令失败，尝试标准重定向。错误信息: ${scriptExecResult.stderr}`);
                const deployLogFile = `${targetDir}/deploy.log`;
                const fallbackCmd = `cd ${targetDir} && bash ./deploy.sh > ${deployLogFile} 2>&1`;
                console.log(`执行后备命令: ${fallbackCmd}`);
                const fallbackResult = await ssh.execCommand(fallbackCmd, { timeout: 600000 });
                console.log(`后备命令执行完成，退出代码: ${fallbackResult.code}`);

                // 读取服务器上的日志文件
                logResult = await ssh.execCommand(`cat ${deployLogFile}`);
                console.log(`后备日志内容长度: ${logResult.stdout.length} 字节`);

                 // 检查日志是否为空，如果为空则尝试直接执行以捕获输出
                 if (!logResult.stdout.trim()) {
                    console.warn(`警告: 后备日志文件为空，尝试直接执行脚本并捕获输出`);
                     const directResult = await ssh.execCommand(`cd ${targetDir} && bash ./deploy.sh`, { timeout: 600000 });
                     logResult.stdout = directResult.stdout;
                     logResult.stderr = directResult.stderr;
                     console.log(`直接执行捕获输出长度: stdout=${logResult.stdout.length}, stderr=${logResult.stderr.length}`);
                 }

                // 根据后备命令退出代码和日志内容确定部署结果
                const errorPatterns = ['错误', 'Error', 'Failed', '失败', 'exit 1', 'Exiting with error'];
                const successPattern = 'COMMAND_EXIT_CODE="0"';
                
                // 首先检查日志中是否包含成功退出代码标记
                const hasSuccessExitCode = logResult.stdout && logResult.stdout.includes(successPattern);
                
                // 即使日志中包含错误信息，只要最终成功完成（由退出代码0表示），就认为部署成功
                deploySuccess = fallbackResult.code === 0 && hasSuccessExitCode;
                
                console.log(`备用命令部署判断: 命令退出码=${fallbackResult.code}, 包含成功完成标记=${hasSuccessExitCode}, 最终判断=${deploySuccess}`);

            } else {
                // 如果script命令成功执行，读取完整日志文件
                console.log(`script命令成功执行，读取完整日志文件: ${targetDir}/deploy_full.log`);

                // 首先使用'cat'获取原始内容，然后在本地处理（如果需要）
                const rawLogResult = await ssh.execCommand(`cat ${targetDir}/deploy_full.log`);
                logResult.stdout = rawLogResult.stdout;
                logResult.stderr = rawLogResult.stderr; // 同时捕获cat的标准错误

                console.log(`原始日志内容长度: ${logResult.stdout.length} 字节`);

                 // 如果原始日志仍然为空，尝试直接执行
                 if (!logResult.stdout.trim()) {
                     console.warn(`警告: 原始日志内容也为空，尝试直接执行脚本并捕获输出`);
                     const directResult = await ssh.execCommand(`cd ${targetDir} && bash ./deploy.sh`, { timeout: 600000 });
                     logResult.stdout = directResult.stdout;
                     logResult.stderr = directResult.stderr;
                     console.log(`直接执行捕获输出长度: stdout=${logResult.stdout.length}, stderr=${logResult.stderr.length}`);
                 }


                // 根据script命令退出代码和日志内容确定部署结果
                const errorPatterns = ['错误', 'Error', 'Failed', '失败', 'exit 1', 'Exiting with error'];
                const successPattern = 'COMMAND_EXIT_CODE="0"';
                
                // 首先检查日志中是否包含成功退出代码标记
                const hasSuccessExitCode = logResult.stdout && logResult.stdout.includes(successPattern);
                
                // 即使日志中包含错误信息，只要最终成功完成（由退出代码0表示），就认为部署成功
                deploySuccess = scriptExecResult.code === 0 && hasSuccessExitCode;
                
                console.log(`部署判断: 命令退出码=${scriptExecResult.code}, 包含成功完成标记=${hasSuccessExitCode}, 最终判断=${deploySuccess}`);
            }

            // 将日志保存到本地文件
            localLogFile = path.join(TEMP_DIR, `${fileId}_deploy.log`); // 分配给外部声明的localLogFile
            fs.writeFileSync(localLogFile, logResult.stdout + (logResult.stderr ? '\n=== STDERR ===\n' + logResult.stderr : ''));
            console.log(`部署日志本地保存至: ${localLogFile}`);

            // 清理远程脚本和日志文件（无论成功还是失败）
            console.log(`清理远程文件: ${remoteScriptPath}, ${targetDir}/deploy.log, ${targetDir}/deploy_full.log`); // 移除deploy_clean.log
            await ssh.execCommand(`rm -f ${remoteScriptPath} ${targetDir}/deploy.log ${targetDir}/deploy_full.log`);
            console.log('远程文件清理完成');


        } catch (execError) {
            console.error('部署脚本执行期间出错:', execError);

            // 即使脚本执行失败，也尝试读取日志并清理远程文件
            try {
                 // 尝试读取可能的日志文件
                 const potentialLogFiles = [`${targetDir}/deploy_full.log`, `${targetDir}/deploy.log`];
                 for(const logFileCandidate of potentialLogFiles) { // 重命名变量以避免冲突
                     try {
                         const logContentResult = await ssh.execCommand(`cat ${logFileCandidate}`);
                         if (logContentResult.stdout.trim()) {
                             logResult.stdout += (logResult.stdout ? '\n' : '') + `=== 来自 ${logFileCandidate} 的日志 ===\n` + logContentResult.stdout;
                         }
                          if (logContentResult.stderr.trim()) {
                             logResult.stderr += (logResult.stderr ? '\n' : '') + `=== 来自 ${logFileCandidate} 的标准错误 ===\n` + logContentResult.stderr;
                         }
                     } catch (e) {
                         console.warn(`无法读取日志文件 ${logFileCandidate}: ${e.message}`);
                     }
                 }

                 // 将日志保存到本地文件
                 localLogFile = path.join(TEMP_DIR, `${fileId}_deploy.log`); // 分配给外部声明的localLogFile
                 fs.writeFileSync(localLogFile, logResult.stdout + (logResult.stderr ? '\n=== STDERR ===\n' + logResult.stderr : ''));
                 console.log(`部署日志本地保存至: ${localLogFile}`);

                // 清理远程脚本和日志文件
                 console.log(`清理远程文件 (执行错误): ${remoteScriptPath}, ${targetDir}/deploy.log, ${targetDir}/deploy_full.log`); // 移除deploy_clean.log
                 await ssh.execCommand(`rm -f ${remoteScriptPath} ${targetDir}/deploy.log ${targetDir}/deploy_full.log`);
                 console.log('远程文件清理完成 (执行错误)');

            } catch (cleanupError) {
                 console.error('清理后出错:', cleanupError);
            }

            // Re-throw the error so the top-level catch can handle it
            throw execError;

        } finally {
             // Ensure the connection is ultimately disconnected
             if (ssh && ssh.isConnected) { // Check if ssh is initialized and connected
                 try {
                    ssh.disconnect();
                    console.log('SSH连接已断开 (finally)');
                } catch (disconnectError) {
                    console.error(`无法断开SSH连接 (finally): ${disconnectError.message}`);
                }
             } else if (ssh) {
                 console.log('SSH连接未建立或已断开，不需要在finally中断开连接');
             }
        }


        // After successful deployment, process logs and extract information
        if (deploySuccess && logResult.stdout) {
            try {
                // Read the content of the locally saved log file
                const logContent = fs.readFileSync(localLogFile, 'utf8');

                // Check if it contains deployment completion messages
                const completionPatterns = [
                    '部署完成',
                    '===== 部署完成 =====',
                    '[成功] ===== 部署完成 =====',
                    '[信息] ===== 部署完成 =====',
                    'Deployment completed',
                    '网站现在可通过以下地址访问',
                    '[成功] 网站现在可通过以下地址访问',
                    '请添加以下DNS记录',
                    'Script done', // script命令结束标记
                    'COMMAND_EXIT_CODE="0"' // 成功退出代码
                ];

                const hasCompletionMessage = completionPatterns.some(pattern =>
                    logContent.includes(pattern)
                );

                if (!hasCompletionMessage) {
                    console.warn('部署可能已执行，但未检测到完成消息，不更新部署数据库');

                    res.json({
                        success: deploySuccess,
                        hasCompletionMessage: false,
                        message: '部署可能已执行，但未收到完成消息',
                        output: logResult.stdout || '无详细输出信息',
                        logFile: path.basename(localLogFile)
                    });
                    return;
                }

                // Split log by lines
                const logLines = logContent.split(/[\r\n]+/);

                // Search for lines containing certificate expiry time and certificate type
                for (const line of logLines) {
                    // Extract certificate type
                    if (line.includes("证书类型是")) {
                        const parts = line.split("证书类型是");
                        if (parts.length > 1) {
                            const certType = parts[1].trim();
                            console.log(`从部署日志中提取证书类型: ${certType}`);

                            // Update config object, add certificate type
                            config.cert_type = certType;
                        }
                    }

                    // Extract SNI IP (serv00/hostuno environment)
                    if (line.includes("SNI_IP=")) {
                        const parts = line.split("SNI_IP=");
                        if (parts.length > 1) {
                            const sniIp = parts[1].trim();
                            console.log(`从部署日志中提取SNI IP: ${sniIp}`);

                            // Update config object, add SNI IP
                            config.sni_ip = sniIp;
                        }
                    }

                    // Extract certificate expiry time - Now looking for lines containing domain name and "证书到期时间是"
                    if (line.includes(domainName) && line.includes("证书到期时间是")) {
                        const parts = line.split("证书到期时间是");
                        if (parts.length > 1) {
                            let expiry = parts[1].trim();

                            if (expiry.includes("无法获取证书信息") || expiry.includes("未知")) {
                                console.log("无法获取证书到期时间，可能是自签名或证书尚未激活");
                                // For self-signed certificates, if expiry time is not found, set to creation date + 1 year
                                if (config.cert_type === "自签名证书") {
                                    const oneYearLater = new Date();
                                    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
                                    config.cert_expiry_date = oneYearLater.toISOString().split('T')[0];
                                    console.log(`自签名证书使用默认1年到期: ${config.cert_expiry_date}`);
                                }
                            } else {
                                // Find the notAfter part, which is the certificate expiry time
                                if (expiry.includes("notAfter=")) {
                                    const notAfterParts = expiry.split("notAfter=");
                                    if (notAfterParts.length > 1) {
                                        expiry = notAfterParts[1].trim();
                                    }
                                }

                                console.log(`从部署日志中提取证书到期时间: ${expiry}`);

                                // Attempt to parse date format
                                try {
                                    const parsedDate = new Date(expiry);
                                    if (!isNaN(parsedDate.getTime())) {
                                        config.cert_expiry_date = parsedDate.toISOString().split('T')[0];
                                    } else {
                                        console.warn(`无法解析证书到期日期字符串: ${expiry}`);
                                        config.cert_expiry_date = expiry; // Save original string
                                    }
                                } catch (parseError) {
                                    console.warn(`解析证书到期日期时出错: ${parseError.message}`);
                                    config.cert_expiry_date = expiry; // Save original string
                                }
                            }
                        }
                    }
                }

                // If deployment is successful and there is a completion message, update information in the database
                updateDeployedDomainInfo(config, (err) => {
                    if (err) {
                        console.error('无法更新已部署域名信息:', err);
                    } else {
                        console.log('已部署域名信息更新成功');
                    }
                });

                res.json({
                    success: deploySuccess,
                    hasCompletionMessage: true,
                    message: '部署成功',
                    output: logResult.stdout || '无详细输出信息',
                    logFile: path.basename(localLogFile)
                });
            } catch (err) {
                console.error('提取证书信息时出错:', err);
                res.json({
                    success: deploySuccess,
                    hasCompletionMessage: false,
                    message: `部署可能成功但日志处理错误: ${err.message}`,
                    output: logResult.stdout || '无详细输出信息',
                    logFile: localLogFile ? path.basename(localLogFile) : null
                });
            }
        } else {
            // Deployment failed or log is empty
            res.json({
                success: deploySuccess,
                message: deploySuccess ? '部署成功但日志为空或未检测到完成消息' : '部署脚本执行失败',
                output: logResult.stdout || '无详细输出信息',
                logFile: localLogFile ? path.basename(localLogFile) : null // Check if localLogFile is defined
            });
        }

    } catch (error) {
        console.error('部署执行失败:', error);
        // Ensure log file information is returned even on top-level error capture (if generated)
        // localLogFile is already declared outside, use it directly
        res.status(500).json({
            success: false,
            error: error.message || '部署执行失败',
            output: '', // Top-level errors usually don't have script output
            logFile: localLogFile ? path.basename(localLogFile) : null // Check if localLogFile is defined
        });
    }
});

// =====================================================
// 域名删除 - 删除已部署的域名
// =====================================================

// Modify the delete domain route
router.post('/delete-domain', async (req, res) => {
    // 转发到专用的删除域名模块（rmdomain.js）
    try {
        // 调用rmdomain模块处理请求
        const rmRouter = require('./rmdomain');
        
        // 记录请求被转发
        const { domainId, domainName, serverId, bcid } = req.body;
        console.log(`转发删除域名请求到rmdomain模块: bcid=${bcid}, domainId=${domainId}, domainName=${domainName}, serverId=${serverId}`);
        
        // 优先通过bcid查找部署记录
        if (bcid) {
            try {
                // 通过bcid查询部署记录
                const deployedDomain = await new Promise((resolve, reject) => {
                    DeployedDomain.getByBcid(bcid, (err, data) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });
                
                if (deployedDomain) {
                    // 找到记录，设置domainName和serverId
                    req.body.domainName = deployedDomain.domain_name;
                    
                    // 如果部署记录中有server_ip，尝试查找对应的服务器ID
                    if (deployedDomain.server_ip && !req.body.serverId) {
                        try {
                            // 通过server_ip查询服务器ID
                            const server = await new Promise((resolve, reject) => {
                                db.get('SELECT id FROM servers WHERE ip = ?', [deployedDomain.server_ip], (err, row) => {
                                    if (err) reject(err);
                                    else resolve(row);
                                });
                            });
                            
                            if (server && server.id) {
                                req.body.serverId = server.id;
                                console.log(`通过server_ip=${deployedDomain.server_ip}找到serverId=${server.id}`);
                            }
                        } catch (err) {
                            console.error(`通过server_ip查询serverId失败: ${err.message}`);
                        }
                    }
                    
                    console.log(`通过bcid=${bcid}找到domainName=${req.body.domainName}和serverId=${req.body.serverId || '未找到'}`);
                } else {
                    console.log(`未通过bcid=${bcid}找到部署记录，尝试其他方式查找`);
                }
            } catch (err) {
                console.error(`通过bcid查询部署记录失败: ${err.message}`);
                // 继续处理，尝试其他方式查找
            }
        }
        
        // 如果没有通过bcid找到，尝试通过domainName查询
        if (!req.body.domainName && domainName) {
            try {
                // 通过domainName查询domainId
                const deployedDomain = await new Promise((resolve, reject) => {
                    DeployedDomain.getByDomain(domainName, (err, data) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });
                
                if (deployedDomain && deployedDomain.id) {
                    // 找到记录，设置domainId
                    req.body.domainId = deployedDomain.id;
                    console.log(`通过domainName=${domainName}找到domainId=${deployedDomain.id}`);
                } else {
                    return res.status(404).json({
                        success: false,
                        error: `找不到域名 ${domainName} 的部署记录`
                    });
                }
            } catch (err) {
                console.error(`通过domainName查询domainId失败: ${err.message}`);
                // 继续处理，让rmdomain模块处理错误情况
            }
        }
        
        // 创建一个新的请求对象，转发到rmdomain模块
        req.url = '/delete'; // 修改URL以匹配Rmdomain模块中的路由路径
        return rmRouter(req, res, () => {
            // 这是一个不应该被调用的next函数，因为Rmdomain模块应该会处理完请求
            console.warn('警告：rmdomain模块未完全处理删除域名请求，请检查rmdomain模块实现');
            return res.status(500).json({
                success: false,
                error: 'rmdomain模块未正确处理请求'
            });
        });
    } catch (error) {
        console.error('转发删除域名请求失败:', error);
        return res.status(500).json({
            success: false,
            error: `转发删除域名请求失败: ${error.message}`
        });
    }
});


// =====================================================
// SSH命令处理 - 执行远程命令
// =====================================================

// 执行SSH命令的函数
async function executeSSHCommand(sshConfig, scriptPath) {
    let ssh = null; // 初始化为空
    try {
        ssh = new SSHClient();

        // 连接到服务器 - 使用完整的连接配置
        const connectConfig = {
            ip: sshConfig.host, // SSHClient使用ip或host
            port: sshConfig.port || 22,
            username: sshConfig.username,
            auth_type: sshConfig.auth_type || 'password' // 默认为密码认证
        };

        if (connectConfig.auth_type === 'key' && sshConfig.privateKey) {
            connectConfig.key_file = connectConfig.privateKey; // 使用key_file属性
        } else {
            // 密码认证
            connectConfig.password = sshConfig.password;
        }

        await ssh.connect(connectConfig);
        console.log(`SSH连接成功到 ${sshConfig.host}`);


        // 上传脚本文件
        const remoteScriptPath = `/tmp/${path.basename(scriptPath)}`;
        console.log(`上传脚本文件 ${scriptPath} 到远程 ${remoteScriptPath}`);
        await ssh.putFile(scriptPath, remoteScriptPath);
        console.log('脚本文件上传完成');

        // 执行脚本，设置较长的超时时间
        console.log(`执行远程脚本: bash ${remoteScriptPath}`);
        const result = await ssh.execCommand(`bash ${remoteScriptPath}`, { timeout: 600000 }); // 10分钟超时
        console.log('远程脚本执行完成');
        console.log(`脚本退出代码: ${result.code}`);
        if (result.stdout) console.log(`脚本标准输出(前200字符): ${result.stdout.substring(0, 200)}...`);
        if (result.stderr) console.error(`脚本标准错误(前200字符): ${result.stderr.substring(0, 200)}...`);


        // 删除远程脚本文件
        console.log(`删除远程脚本文件: ${remoteScriptPath}`);
        await ssh.execCommand(`rm -f ${remoteScriptPath}`);
        console.log('远程脚本文件删除完成');

        // 返回合并的输出
        return result.stdout + (result.stderr ? '\n=== STDERR ===\n' + result.stderr : '');

    } catch (error) {
        console.error(`执行SSH命令失败: ${error.message}`);
        // 发生错误时尝试断开连接
        if (ssh && ssh.isConnected) { // Check if ssh is initialized and connected
            try {
                ssh.disconnect();
                console.log('SSH连接已断开 (发生错误时)');
            } catch (disconnectError) {
                console.error(`断开SSH连接失败 (发生错误时): ${disconnectError.message}`);
            }
        } else if (ssh) {
            console.log('SSH连接未建立或已断开，不需要在catch中断开连接');
        }
        throw error; // 重新抛出错误以便上层捕获
    } finally {
        // Ensure the connection is ultimately disconnected, unless already disconnected in catch
        if (ssh && ssh.isConnected) { // Check if ssh is initialized and connected
             try {
                ssh.disconnect();
                console.log('SSH连接已断开 (finally)');
            } catch (disconnectError) {
                console.error(`断开SSH连接失败 (finally): ${disconnectError.message}`);
            }
        } else if (ssh) {
             console.log('SSH连接未建立或已断开，不需要在finally中断开连接');
        }
    }
}

// =====================================================
// 部署脚本生成 - 标准服务器
// =====================================================

// 生成部署脚本
function generateDeployScript(domain, baseDir, templateFile, certType, serverIp) {
    const targetDir = `${baseDir}/${domain}`;

    return `#!/bin/bash

# 域名部署脚本
# 自动生成于 $(date '+%Y-%m-%d %H:%M:%S') # 使用date命令获取当前时间

# 定义输出函数以确保每行都被正确记录
log_info() {
    echo "[信息] \$1" # 转义 $
}

log_success() {
    echo "[成功] \$1" # 转义 $
}

log_error() {
    echo "[错误] \$1" # 转义 $
}

log_warn() {
    echo "[警告] \$1" # 转义 $
}

# 主机名检查 - 确保在正确的环境中执行
CURRENT_HOSTNAME=\$(hostname) # 转义 $
log_info "当前主机名: \$CURRENT_HOSTNAME" # 转义 $

# 检查是否在serv00/hostuno环境
if [[ "\$CURRENT_HOSTNAME" == *"serv00"* || "\$CURRENT_HOSTNAME" == *"hostuno"* ]]; then # 转义 $
    log_warn "检测到serv00/hostuno环境（主机名: \$CURRENT_HOSTNAME），但使用的是标准部署脚本" # 转义 $
    log_warn "当前脚本可能不完全适用于此环境，建议使用专用的serv00/hostuno部署脚本"
    # 此处不退出，尝试继续执行，但发出警告
    # 如果要更安全，可以取消下面的注释使脚本退出
    # log_error "脚本不适合当前环境，退出执行"
    # exit 1
fi

# 定义变量
DOMAIN="${domain}"
TARGET_DIR="${targetDir}"
TEMPLATE_FILE_NAME="${templateFile}" # 使用原始模板文件名
CERT_TYPE="${certType}" # 证书类型变量
SERVER_IP="${serverIp}"

# 定义与证书相关的路径（直接使用TARGET_DIR作为SSL_DIR）
SSL_DIR="\$TARGET_DIR" # 转义 $
CERT_FILE="\$SSL_DIR/\$DOMAIN.crt" # 转义 $
KEY_FILE="\$SSL_DIR/\$DOMAIN.key" # 转义 $

# === 调试: 在Nginx配置前打印变量值 ===
log_info "调试: Nginx配置前的当前目录: \$(pwd)" # 转义 $
log_info "调试: DOMAIN变量为: \$DOMAIN" # 转义 $
log_info "调试: TARGET_DIR变量为: \$TARGET_DIR" # 转义 $
log_info "调试: SSL_DIR变量为: \$SSL_DIR" # 转义 $
log_info "调试: CERT_FILE变量为: \$CERT_FILE" # 转义 $
log_info "调试: KEY_FILE变量为: \$KEY_FILE" # 转义 $
log_info "调试: CERT_TYPE变量为: \$CERT_TYPE" # 转义 $
log_info "调试: TEMPLATE_FILE_NAME变量为: \$TEMPLATE_FILE_NAME" # 转义 $
# ========================================================


log_info "===== 开始为 \$DOMAIN 部署 =====" # 转义 $
log_info "目标目录: \$TARGET_DIR" # 转义 $
log_info "证书类型: \$CERT_TYPE" # 转义 $
log_info "模板文件: \$TEMPLATE_FILE_NAME" # 转义 $

# 检查Nginx是否已安装
log_info "===== 检查Nginx是否已安装 ====="
if ! command -v nginx &> /dev/null; then
    log_info "Nginx未安装，开始安装..."

    # 检测系统类型并安装Nginx
    if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu系统
        sudo apt-get update
        sudo apt-get install -y nginx
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL系统
        sudo yum install -y epel-release
        sudo yum install -y nginx
    elif command -v dnf &> /dev/null; then
        # Fedora系统
        sudo dnf install -y nginx
    elif command -v pacman &> /dev/null; then
        # Arch Linux
        sudo pacman -S --noconfirm nginx
    else
        log_error "无法识别的系统，请在运行此脚本前手动安装Nginx"
        exit 1
    fi

    # 检查安装结果
    if command -v nginx &> /dev/null; then
        log_success "Nginx安装成功，启动服务..."
        # 启动服务
        if command -v systemctl &> /dev/null; then
            sudo systemctl enable nginx
            sudo systemctl start nginx
        else
            sudo service nginx start
        fi
    else
        log_error "Nginx安装失败，请在运行此脚本前手动安装"
        exit 1
    fi
else
    log_success "Nginx已安装，无需重新安装"
fi

# 确保目标目录存在
mkdir -p \$TARGET_DIR # 转义 $
cd \$TARGET_DIR # 转义 $

# 设置网站文件
log_info "===== 设置网站文件 ====="
# 模板文件已上传到\$TARGET_DIR，保留原始文件名
if [ -f "\$TARGET_DIR/\$TEMPLATE_FILE_NAME" ]; then # 转义 $
    log_success "网站模板文件 \$TEMPLATE_FILE_NAME 已就位" # 转义 $
    # 无需复制或重命名，Nginx将使用原始文件名
else
    log_error "错误: 在 \$TARGET_DIR 中未找到模板文件 \$TEMPLATE_FILE_NAME" # 转义 $
    exit 1
fi


# 应用SSL证书
log_info "===== 应用SSL证书 ====="
# SSL_DIR设置为TARGET_DIR，因此证书将直接放在网站根目录中
mkdir -p \$SSL_DIR # 确保SSL目录存在（现在是TARGET_DIR） # 转义 $

if [ "\$CERT_TYPE" == "acme" ] || [ "\$CERT_TYPE" == "lets_encrypt" ]; then # 转义 $
    log_info "尝试使用acme.sh获取Let's Encrypt证书..."

    # 检查并安装acme.sh
    if ! command -v acme.sh &> /dev/null; then
        log_info "acme.sh未安装，开始安装..."
        # 安装依赖项（curl或wget）
        if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
            log_error "需要安装curl或wget以下载acme.sh"
            log_warn "将回退到自签名证书"
            CERT_TYPE="self-signed-fallback" # 标记为acme失败回退
        else
            # 下载并安装acme.sh
            curl https://get.acme.sh | sh || wget -O - https://get.acme.sh | sh
            if [ \$? -eq 0 ]; then # 转义 $
                log_success "acme.sh安装成功"
                
                # 设置ACME_HOME变量，指向acme.sh安装位置
                ACME_HOME="\$HOME/.acme.sh" # 转义 $
                
                # 使用完整路径设置ACME_CMD变量
                ACME_CMD="\$ACME_HOME/acme.sh" # 转义 $
                
                # 检查acme.sh是否存在于预期路径
                if [ -f "\$ACME_CMD" ]; then # 转义 $
                    log_success "找到acme.sh在: \$ACME_CMD" # 转义 $
                    chmod +x "\$ACME_CMD" # 确保可执行
                    
                    # 配置acme.sh使用Let's Encrypt而不是ZeroSSL，避免需要注册邮箱
                    log_info "配置acme.sh使用Let's Encrypt作为默认CA..."
                    \$ACME_CMD --set-default-ca --server letsencrypt
                    if [ \$? -eq 0 ]; then # 转义 $
                        log_success "成功设置Let's Encrypt为默认CA"
                    else
                        log_warn "设置Let's Encrypt为默认CA失败，注册临时邮箱账户..."
                        # 如果无法切换CA，尝试注册临时账户
                        temp_email="admin@\$DOMAIN" # 使用域名创建临时邮箱，转义 $
                        \$ACME_CMD --register-account -m "\$temp_email" # 转义 $
                        if [ \$? -eq 0 ]; then # 转义 $
                            log_success "成功注册临时账户: \$temp_email" # 转义 $
                        else
                            log_error "注册账户失败，可能无法申请证书"
                        fi
                    fi
                else
                    log_error "acme.sh文件未在预期位置: \$ACME_CMD" # 转义 $
                    log_warn "将回退到自签名证书"
                    CERT_TYPE="self-signed-fallback" # 标记为acme失败回退
                fi
            else
                log_error "acme.sh安装失败"
                log_warn "将回退到自签名证书"
                CERT_TYPE="self-signed-fallback" # 标记为acme失败回退
            fi
        fi
    else
        log_success "acme.sh已安装"
        # 确保我们知道acme.sh的路径
        ACME_CMD="acme.sh" # 使用PATH中的acme.sh
    fi

    # 如果acme.sh安装成功且证书类型仍为acme或lets_encrypt，尝试签发证书
    if [ "\$CERT_TYPE" == "acme" ] || [ "\$CERT_TYPE" == "lets_encrypt" ]; then # 转义 $
        log_info "使用acme.sh签发Let's Encrypt证书..."
        # 使用--webroot模式签发证书，指向网站目录
        # 这要求端口80对互联网开放并可访问，用于ACME挑战
        log_info "调试: acme.sh签发命令: \$ACME_CMD --issue -d \$DOMAIN -w \$TARGET_DIR" # 转义 $
        \$ACME_CMD --issue -d \$DOMAIN -w \$TARGET_DIR # 转义 $
        ACME_EXIT_CODE=\$? # 转义 $

        if [ \$ACME_EXIT_CODE -eq 0 ]; then # 转义 $
            log_success "acme.sh证书签发成功"
            log_info "证书类型为Let's Encrypt"

            # 将证书安装到TARGET_DIR
            log_info "正在将证书安装到 \$TARGET_DIR..." # 转义 $
            # acme.sh install-cert命令将证书复制到指定路径
            # 使用--reloadcmd "sudo systemctl reload nginx || sudo service nginx reload"自动重新加载Nginx
            # 使用--fullchain-path和--key-path指定目标路径
            log_info "调试: acme.sh安装命令: \$ACME_CMD --install-cert -d \$DOMAIN --fullchain-path \$CERT_FILE --key-path \$KEY_FILE --reloadcmd 'sudo systemctl reload nginx || sudo service nginx reload'" # 转义 $
            \$ACME_CMD --install-cert -d \$DOMAIN \
            --fullchain-path \$CERT_FILE \
            --key-path \$KEY_FILE \
            --reloadcmd "sudo systemctl reload nginx || sudo service nginx reload" # 转义 $

            if [ \$? -eq 0 ]; then # 转义 $
                 log_success "证书安装到 \$TARGET_DIR 成功" # 转义 $
            else
                 log_error "证书安装到 \$TARGET_DIR 失败" # 转义 $
                 log_warn "Nginx可能未被acme.sh自动重新加载"
            fi

            log_info "调试: \$ACME_CMD 安装后 \$TARGET_DIR 中的文件列表:" # 转义 $
            ls -al \$TARGET_DIR # 转义 $

            # 获取证书过期时间（从安装路径）
            if [ -f "\$CERT_FILE" ]; then # 转义 $
                log_info "从 \$CERT_FILE 获取 \$DOMAIN 的证书过期时间..." # 转义 $
                expiry_info=\$(openssl x509 -noout -dates -in \$CERT_FILE 2>/dev/null || echo "无法获取证书信息") # 转义 $
                echo "\${DOMAIN} 证书到期时间是 \$expiry_info" # 转义 $
            else
                 log_warn "证书文件(\$CERT_FILE)在acme.sh安装后不存在，无法获取 \$DOMAIN 的过期时间" # 转义 $
                 echo "\${DOMAIN} 证书到期时间是 未知" # 转义 $
            fi

        else
            log_error "\$DOMAIN 的acme.sh证书签发失败，退出代码: \$ACME_EXIT_CODE" # 转义 $
            log_warn "将为 \$DOMAIN 回退到自签名证书" # 转义 $
            CERT_TYPE="self-signed-fallback" # 标记为acme签发失败回退
        fi
    fi
fi


# 如果证书类型不是acme或lets_encrypt，或acme签发失败，则生成自签名证书
if [ "\$CERT_TYPE" != "acme" ] && [ "\$CERT_TYPE" != "lets_encrypt" ]; then # 转义 $
    log_info "为 \$DOMAIN 使用自签名证书..." # 转义 $
    # 确保SSL目录存在（现在是TARGET_DIR）
    mkdir -p \$SSL_DIR # 转义 $
    # 证书和密钥文件已定义在\$TARGET_DIR中
    # CERT_FILE="\$SSL_DIR/\$DOMAIN.crt"
    # KEY_FILE="\$SSL_DIR/\$DOMAIN.key"
    log_info "调试: 在 \$CERT_FILE 生成 \$DOMAIN 的自签名证书，密钥在 \$KEY_FILE" # 转义 $

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout \$KEY_FILE -out \$CERT_FILE -subj "/CN=\$DOMAIN" # 转义 $
    OPENSSL_EXIT_CODE=\$? # 转义 $
    if [ \$OPENSSL_EXIT_CODE -eq 0 ]; then # 已修正变量名并转义 $
        log_success "\$DOMAIN 的自签名证书成功生成" # 转义 $
        log_info "证书类型是 自签名证书"
         # 获取证书过期时间
        log_info "从 \$CERT_FILE 获取 \$DOMAIN 的证书过期时间..." # 转义 $
        expiry_info=\$(openssl x509 -noout -dates -in \$CERT_FILE 2>/dev/null || echo "无法获取证书信息") # 转义 $
        echo "\${DOMAIN} 证书到期时间是 \$expiry_info" # 转义 $

        log_info "调试: \$DOMAIN 自签名证书生成后 \$TARGET_DIR 中的文件列表:" # 转义 $
        ls -al \$TARGET_DIR # 转义 $

    else
        log_error "\$DOMAIN 的自签名证书生成失败，退出代码: \$OPENSSL_EXIT_CODE" # 转义 $
        echo "\${DOMAIN} 证书到期时间是 未知" # 转义 $
        exit 1 # 如果自签名证书生成失败则退出
    fi
    chmod 600 \$KEY_FILE # 转义 $
    chmod 644 \$CERT_FILE # 转义 $
fi


# 配置Nginx
log_info "===== 为 \$DOMAIN 配置Nginx =====" # 转义 $
if command -v nginx &> /dev/null; then
    NGINX_CONF="/etc/nginx/sites-available/\$DOMAIN" # 转义 $

    cat > \$NGINX_CONF << EOF # 转义 $
server {
    listen 80;
    server_name \$DOMAIN; # 转义 $

    location / {
        return 301 https://\$host\$request_uri; # 转义 $
    }
}

server {
    listen 443 ssl;
    server_name \$DOMAIN; # 转义 $

    ssl_certificate \$CERT_FILE; # 使用动态证书文件路径 # 转义 $
    ssl_certificate_key \$KEY_FILE; # 使用动态密钥文件路径 # 转义 $
    ssl_protocols TLSv1.2 TLSv1.3;

    root \$TARGET_DIR; # 转义 $
    index \$TEMPLATE_FILE_NAME; # 使用原始模板文件名 # 转义 $

    location / {
        try_files \$uri \$uri/ =404; # 转义 $
    }
}
EOF

    # 启用站点
    sudo ln -sf \$NGINX_CONF /etc/nginx/sites-enabled/ # 转义 $

    # 测试Nginx配置
    log_info "调试: 测试 \$DOMAIN 的Nginx配置..." # 调试Nginx测试 # 转义 $
    sudo nginx -t

    if [ \$? -eq 0 ]; then # 转义 $
        # 确保Nginx服务已启动
        log_info "确保Nginx服务已启动..."
        sudo systemctl start nginx 2>/dev/null || sudo service nginx start 2>/dev/null || true
        
        # 重新加载Nginx（acme.sh install-cert可能已经完成了这一步）
        log_info "尝试重新加载Nginx..."
        sudo systemctl reload nginx || sudo service nginx reload || true
        log_success "\$DOMAIN 的Nginx配置已应用" # 转义 $
    else
        log_error "\$DOMAIN 的Nginx配置测试失败，请手动检查配置" # 转义 $
        # 打印Nginx配置文件内容以进行调试
        log_error "Nginx配置文件内容:"
        cat \$NGINX_CONF >&2 # 输出到标准错误 # 转义 $
        exit 1 # 如果Nginx配置失败则退出
    fi
else
    log_error "Nginx未安装，请先安装Nginx"
    exit 1
fi


log_success "===== 部署完成 ====="
log_success "网站现在可通过以下地址访问:"
log_success "https://$DOMAIN"

echo ""
echo ""
# 添加DNS记录信息 
echo "------------------------------------------------------------------------" >&2
echo "                >>>>> 请添加以下DNS记录: <<<<<" >&2 # 增加前导空格
echo "" >&2
echo "                       域名: \${DOMAIN}" >&2 # 增加前导空格
echo "                         类型: A记录" >&2 # 增加前导空格
echo "                      指向IP: $SERVER_IP" >&2 # 增加前导空格
echo "" >&2
echo "------------------------------------------------------------------------" >&2


exit 0
`;
}

// =====================================================
// Deployment Script Generation - Special Server (serv00/hostuno)
// =====================================================

// Generate deployment script for special servers (serv00/hostuno)
function generateNodeJsDeployScript(domain, baseDir, templateFile, certType, serverIp) {
    // 在serv00环境中，不需要baseDir，网站文件位置由系统决定

    return `#!/bin/bash

# 域名部署脚本 (serv00/hostuno专用)
# 自动生成于 $(date '+%Y-%m-%d %H:%M:%S') # 使用date命令获取当前时间

# 定义日志函数
log_info() {
    echo "[信息] \$1" # 转义 $
}

log_success() {
    echo "[成功] \$1" # 转义 $
}

log_error() {
    echo "[错误] \$1" # 转义 $
}

log_warn() {
    echo "[警告] \$1" # 转义 $
}

# 主机名检查 - 确保在正确的环境中执行
CURRENT_HOSTNAME=\$(hostname) # 转义 $
log_info "当前主机名: \$CURRENT_HOSTNAME" # 转义 $

# 检查是否不在serv00/hostuno环境
if [[ "\$CURRENT_HOSTNAME" != *"serv00"* && "\$CURRENT_HOSTNAME" != *"hostuno"* ]]; then # 转义 $
    log_warn "未检测到serv00/hostuno环境（主机名: \$CURRENT_HOSTNAME），但使用的是serv00/hostuno专用部署脚本" # 转义 $
    log_warn "当前脚本可能不适用于此环境，某些命令如devil可能无法使用"
    log_warn "将尝试检测devil命令是否可用，如不可用则会退出脚本"
    
    # 检查devil命令是否可用
    if ! command -v devil &> /dev/null; then
        log_error "devil命令不可用，此脚本需要serv00/hostuno环境，退出执行"
        exit 1
    else
        log_success "devil命令可用，继续执行脚本"
    fi
fi

# 定义变量
DOMAIN="${domain}"
TEMPLATE_FILE_NAME="${templateFile}" # 使用原始模板文件名
CERT_TYPE="${certType}" # 证书类型变量

echo "=== 开始为 \$DOMAIN 部署 (serv00/hostuno环境) ===" # Escaped $
echo "证书类型: \$CERT_TYPE" # Escaped $
echo "模板文件: \$TEMPLATE_FILE_NAME" # Escaped $


# 定义获取webip的函数
get_webip() {
  # 获取当前主机名
  local hostname=\$(hostname) # Escaped $
  echo "当前主机名: \$hostname" >&2 # 日志输出到标准错误 # Escaped $

  # 从主机名中提取数字（例如，从s16.serv00.com中提取"16"）
  local host_number=\$(echo "\$hostname" | awk -F'[s.]' '{print \$2}') # Escaped $
  echo "提取的数字: \$host_number" >&2 # 日志输出到标准错误 # Escaped $

  # 设置域名为serv00.com
  local domain="serv00.com"
  # 构建要尝试查询的域名数组
  local hosts=("web\${host_number}.\${domain}" "cache\${host_number}.\${domain}") # Escaped $
  echo "要尝试的域名: \${hosts[*]}" >&2 # 日志输出到标准错误 # Escaped $

  # 尝试使用dig查询IP
  # 遍历hosts数组
  for host in "\${hosts[@]}"; do # Escaped $
    echo "尝试dig查询: \$host" >&2 # 日志输出到标准错误 # Escaped $
    # 使用dig +short查询域名，并通过管道获取第一行结果
    ip=\$(dig +short "\$host" | head -n 1) # Escaped $
    # 检查是否成功获取IP（ip变量不为空）
    if [[ -n "\$ip" ]]; then # Escaped $
      echo "成功获取IP: \$ip" >&2 # 日志输出到标准错误 # Escaped $
      # 将获取的IP输出到标准输出，并退出函数
      echo "\$ip" # <-- 仅将纯IP输出到标准输出 # Escaped $
      return
    else
      echo "未获取到IP" >&2 # 日志输出到标准错误
    fi
  done

  # 如果所有dig尝试都失败，尝试使用devil vhost list作为备选方案
  # 检查devil命令是否存在
  if command -v devil >/dev/null 2>&2; then
    echo "dig失败，尝试使用devil vhost list" >&2 # 日志输出到标准错误
    # 使用devil vhost list获取web IP，并取第一行结果
    fallback_ip=\$(devil vhost list | grep web | awk '{print \$1}' | head -n 1) # Escaped $
    # 检查是否成功获取IP（fallback_ip变量不为空）
    if [[ -n "\$fallback_ip" ]]; then # Escaped $
      echo "使用备选IP: \$fallback_ip" >&2 # 日志输出到标准错误 # Escaped $
      # 将获取的IP输出到标准输出，并退出函数
      echo "\$fallback_ip" # <-- 仅将纯IP输出到标准输出 # Escaped $
      return
    fi
  fi

  # 如果dig和devil都失败
  echo "无法获取任何IP" >&2 # 错误信息输出到标准错误
  # 函数在此结束，没有IP输出到标准输出，调用者将捕获一个空字符串或日志
}

# 调用get_webip函数获取IP地址
webIp=\$(get_webip) # Escaped $
echo "获取到的webIp: \$webIp" # Escaped $

# 如果webIp为空，尝试使用旧方法获取
if [[ -z "\$webIp" ]]; then # Escaped $
  echo "使用替代方法获取IP..."
  webIp=\$(devil vhost list | grep web | awk '{print \$1}') # Escaped $
  echo "通过替代方法获取的WebIp: \$webIp" # Escaped $
fi

# 创建网站目录
mkdir -p ~/domains/\$DOMAIN/public_html/ # Escaped $
echo "目录创建成功: ~/domains/\$DOMAIN/public_html/" # Escaped $

# Set up website files
echo "=== Setting up website files ==="
# 将模板文件从临时位置（~/domainName/template.filename）
# 复制到public_html目录作为index.html，以便与devil www add兼容。
# Node.js应用上传到TARGET_DIR，即~/domainName（假设webroot是~）。
# 源文件是~/domainName/TEMPLATE_FILE_NAME
SOURCE_TEMPLATE_PATH="~/domains/\$DOMAIN/\$TEMPLATE_FILE_NAME" # 根据Node.js上传逻辑修正的源路径，转义 $
DEST_INDEX_PATH="~/domains/\$DOMAIN/public_html/index.html" # 转义 $

log_info "调试: 从 \$SOURCE_TEMPLATE_PATH 复制模板到 \$DEST_INDEX_PATH" # 调试复制命令，转义 $
if [ -f "\$SOURCE_TEMPLATE_PATH" ]; then # 转义 $
    cp "\$SOURCE_TEMPLATE_PATH" "\$DEST_INDEX_PATH" # 转义 $
    chmod 644 "\$DEST_INDEX_PATH" # 转义 $
    log_success "网站模板文件已从 \$SOURCE_TEMPLATE_PATH 复制到 \$DEST_INDEX_PATH" # 转义 $
else
    log_error "错误: 在 \$SOURCE_TEMPLATE_PATH 中未找到模板文件。" # 转义 $
    # 如果上述操作失败，尝试从Node.js临时上传位置复制
    # Node.js应用上传到TARGET_DIR，该目录基于webroot。对于serv00，webroot可能是home目录(~)。
    # 所以TARGET_DIR是~/domainName。假设文件在那里。
    # 如果在~/domains/\$DOMAIN/\$TEMPLATE_FILE_NAME没有找到文件，也许它直接在~/domainName/\$TEMPLATE_FILE_NAME？
    # 让我们添加一个备选检查。
    FALLBACK_SOURCE_TEMPLATE_PATH="~/\$DOMAIN/\$TEMPLATE_FILE_NAME" # 转义 $
    log_warn "尝试从 \$FALLBACK_SOURCE_TEMPLATE_PATH 备选复制" # 调试备选复制，转义 $
     if [ -f "\$FALLBACK_SOURCE_TEMPLATE_PATH" ]; then # 转义 $
         cp "\$FALLBACK_SOURCE_TEMPLATE_PATH" "\$DEST_INDEX_PATH" # 转义 $
         chmod 644 "\$DEST_INDEX_PATH" # 转义 $
         log_success "网站模板文件已从 \$FALLBACK_SOURCE_TEMPLATE_PATH 复制到 \$DEST_INDEX_PATH（备选）" # 转义 $
     else
         log_error "错误: 模板文件在 \$SOURCE_TEMPLATE_PATH 和 \$FALLBACK_SOURCE_TEMPLATE_PATH 都未找到" # 转义 $
         exit 1
     fi
fi


# 获取服务器IP地址
echo "=== 获取服务器IP地址 ==="
SNI_IP=\$webIp # 转义 $
echo "获取到的服务器IP: \$SNI_IP" # 转义 $

# 绑定域名到PHP环境
echo "=== 绑定域名到PHP环境 ==="
devil www add \$DOMAIN php # 转义 $
echo "域名绑定状态: \$?" # 转义 $

# 应用Let's Encrypt证书（serv00/hostuno使用devil命令）
echo "=== 应用SSL证书 ==="

if [ "\$CERT_TYPE" == "acme" ]; then # Escaped $
    log_info "尝试使用devil ssl www add（acme）为 \$DOMAIN 获取证书..." # 转义 $
    log_info "调试: devil ssl命令: devil ssl www add \$SNI_IP le le \$DOMAIN" # 调试devil ssl命令，转义 $
    resp=\$(devil ssl www add \$SNI_IP le le \$DOMAIN) # 转义 $
    if [[ "\$resp" =~ .*succesfully.*$ ]]; then # 转义 $
        echo "证书申请成功 \$DOMAIN！" # 添加域名到成功信息，转义 $
        echo "证书类型是 Let's Encrypt"
    else
        echo "证书申请失败 \$DOMAIN: \$resp" # 添加域名到错误信息，转义 $
        echo "请确保域名 \$DOMAIN 的DNS A记录正确指向 \$SNI_IP" # 转义 $
        log_warn "devil ssl应用失败 \$DOMAIN，serv00/hostuno环境无法回退到自签名证书，请手动检查DNS或服务器配置。" # 转义 $
        echo "证书类型是 Unknown"
        # 在serv00/hostuno环境中，devil命令是唯一的证书申请方法，失败无法回退，但脚本继续以便用户查看日志
    fi
else
    log_info "证书类型不是acme（\$CERT_TYPE），跳过devil ssl应用 \$DOMAIN" # 转义 $
    log_warn "在serv00/hostuno环境中，通常需要acme证书。请手动配置证书或更改证书类型。"
    echo "证书类型是 Unknown"
fi


# Get certificate expiry time (certificate paths are different in serv00/hostuno environment)
echo "获取证书到期时间 \$DOMAIN..." # 添加域名到日志，转义 $
# 尝试从acme.sh默认路径获取（如果devil命令内部使用acme.sh）
if [ -d "\$HOME/.acme.sh/\$DOMAIN_ecc" ]; then # 转义 $
    expiry_info=\$(openssl x509 -noout -dates -in "\$HOME/.acme.sh/\$DOMAIN_ecc/fullchain.cer" 2>/dev/null || echo "无法获取证书信息") # 转义 $
    echo "\${DOMAIN} 证书到期时间是 \$expiry_info" # 添加域名到输出行，转义 $
elif [ -d "\$HOME/.acme.sh/\$DOMAIN" ]; then # 转义 $
     expiry_info=\$(openssl x509 -noout -dates -in "\$HOME/.acme.sh/\$DOMAIN/fullchain.cer" 2>/dev/null || echo "无法获取证书信息") # 转义 $
     echo "\${DOMAIN} 证书到期时间是 \$expiry_info" # 添加域名到输出行，转义 $
# 尝试从devil命令可能放置证书的路径获取（如果devil命令不使用acme.sh）
elif [ -f "\$HOME/domains/\$DOMAIN/ssl/\$DOMAIN.crt" ]; then # 转义 $
    expiry_info=\$(openssl x509 -noout -dates -in "\$HOME/domains/\$DOMAIN/ssl/\$DOMAIN.crt" 2>/dev/null || echo "无法获取证书信息") # 转义 $
    echo "\${DOMAIN} 证书到期时间是 \$expiry_info" # 添加域名到输出行，转义 $
else
    echo "\${DOMAIN} 证书到期时间是 未知（未找到证书文件）" # 添加域名到输出行，转义 $
fi


# Record special SNI IP information for the deployment system to recognize
echo "SNI_IP=\$SNI_IP" # Escaped $

# Create certificate renewal script (serv00/hostuno)
echo "=== 设置自动证书续期 \$DOMAIN ===" # 添加域名到日志，转义 $
mkdir -p ~/scripts/
cat > ~/scripts/renew_cert_\$DOMAIN.sh << EOF # 转义 $
#!/bin/bash
webIp=\$SNI_IP # 转义 $
domain=\$DOMAIN # 转义 $
devil ssl www add \$webIp le le \$domain # 转义 $
EOF
chmod +x ~/scripts/renew_cert_\$DOMAIN.sh # 转义 $

# Set up automatic certificate renewal cron job (serv00/hostuno)
(crontab -l 2>/dev/null | grep -v "renew_cert_\$DOMAIN.sh") | crontab - # 转义 $
(crontab -l 2>/dev/null; echo "0 0 1 * * ~/scripts/renew_cert_\$DOMAIN.sh > /dev/null 2>&1") | crontab - # 转义 $
(crontab -l 2>/dev/null | grep -v "curl.*\$DOMAIN") | crontab - # 转义 $
(crontab -l 2>/dev/null; echo "0 9 * * * curl -s https://\$DOMAIN/ > /dev/null 2>&1") | crontab - # 转义 $

echo "=== 验证配置 \$DOMAIN ===" # 添加域名到日志，转义 $
# 验证域名配置
devil www list | grep \$DOMAIN # 转义 $

# 验证SSL证书状态
devil ssl www list | grep \$DOMAIN # 转义 $

# 验证crontab任务
crontab -l | grep "\$DOMAIN" # 转义 $

echo "=== 部署完成 ==="
echo "网站现在可通过以下地址访问:"
echo "https://$DOMAIN"

echo ""
echo ""
# 添加DNS记录信息 
echo "------------------------------------------------------------------------" >&2
echo "                >>>>> 请添加以下DNS记录: <<<<<" >&2 # 增加前导空格
echo "" >&2
echo "                       域名: \${DOMAIN}" >&2 # 增加前导空格
echo "                         类型: A记录" >&2 # 增加前导空格
echo "                      指向IP: $SNI_IP" >&2 # 增加前导空格
echo "" >&2
echo "------------------------------------------------------------------------" >&2


exit 0
`;
}

// =====================================================
// 部署信息更新 - 更新数据库中已部署域名记录
// =====================================================

// 成功部署后更新信息
function updateDeployedDomainInfo(deployConfig, callback) {
    // 从部署配置中提取信息
    const deployInfo = {
        domain_name: deployConfig.domain.name,
        server_name: deployConfig.server.name,
        server_ip: deployConfig.server.ip,
        sni_ip: deployConfig.sni_ip || deployConfig.webip || null, // 添加SNI IP支持
        cert_expiry_date: deployConfig.cert_expiry_date || deployConfig.certificate?.expiry_date || null,
        cert_type: deployConfig.cert_type || deployConfig.certificate?.type || 'unknown', // 确保从配置获取或使用unknown
        template_name: deployConfig.template?.name || null,
        deploy_date: new Date().toISOString(),
        status: '在线',
        notes: '自动部署',
        bcid: uuidv4() // 添加唯一标识符
    };

    console.log('更新已部署域名信息:', JSON.stringify({
        domain: deployInfo.domain_name,
        server: deployInfo.server_name,
        ip: deployInfo.server_ip,
        sni_ip: deployInfo.sni_ip, // 记录SNI IP
        cert_type: deployInfo.cert_type,
        cert_expiry: deployInfo.cert_expiry_date,
        bcid: deployInfo.bcid // 记录唯一标识符
    }));

    // 更新或插入部署记录
    DeployedDomain.upsert(deployInfo, callback);
}

// =====================================================
// 模块导出
// =====================================================

module.exports = router;
