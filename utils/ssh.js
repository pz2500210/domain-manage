const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
// Assuming db is needed for other methods in a full SSHClient implementation
// const db = require('../models/db');

/**
 * SSH工具类，用于连接服务器并执行命令 (直接使用 ssh2 库)
 */
class SSHClient {
    constructor() {
        this.conn = new Client(); // Directly use ssh2 Client
        this.isConnected = false; // Track connection state
        console.log('SSHClient (using ssh2) 实例创建成功'); // Added log

        // Add event listeners for the underlying ssh2 client
        this.conn.on('ready', () => {
            this.isConnected = true;
            console.log('SSHClient (ssh2): 连接成功 (ready 事件)'); // Added log
            // The 'ready' event indicates the connection is established and ready for use
            // We will resolve the connect promise when this event fires
        });

        this.conn.on('error', (err) => {
            this.isConnected = false;
            console.error('SSHClient (ssh2) 连接错误:', err.message); // Added log
            // Handle connection errors
        });

        this.conn.on('end', () => {
             this.isConnected = false;
             console.log('SSHClient (ssh2) 连接已结束 (end 事件)'); // Added log
             // Handle connection end
        });

        this.conn.on('close', (hadError) => {
            this.isConnected = false;
            console.log('SSHClient (ssh2) 连接已关闭 (close 事件). Had Error:', hadError); // Added log
            // Handle connection closure
        });

        // Add 'keyboard-interactive' event listener for password prompts
        this.conn.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
             console.log('SSHClient (ssh2): 收到 Keyboard-Interactive 提示...'); // Added log
             // Typically, the server will prompt for a password here
             // Find the password prompt and respond with the stored password
             // Note: The password needs to be stored temporarily or passed during connect
             // For simplicity here, we assume the password is part of the initial config
             // A more robust solution might involve storing the password in a class property temporarily
             const passwordPrompt = prompts.find(p => p.prompt.toLowerCase().includes('password'));
             if (passwordPrompt && this._tempPassword) { // Check if password prompt exists and temp password is available
                 console.log('SSHClient (ssh2): 尝试使用提供的密码响应 Keyboard-Interactive'); // Added log
                 finish([this._tempPassword]); // Respond with the temporary password
                 this._tempPassword = null; // Clear the temporary password after use
             } else {
                 console.warn('SSHClient (ssh2): 收到未预期的 Keyboard-Interactive 提示或密码不可用，无法自动响应。'); // Added log
                 finish([]); // Send an empty response
             }
        });
    }

    /**
     * 连接到服务器
     * @param {Object} serverConfig 服务器配置信息
     * @returns {Promise<SSHClient>}
     */
    async connect(serverConfig) {
        console.log('SSHClient.connect (ssh2): 开始连接...'); // Added log
        return new Promise((resolve, reject) => {
            // Validate server config
            if (!serverConfig) {
                return reject(new Error('未提供服务器配置'));
            }
            if (!serverConfig.ip && !serverConfig.host) {
                return reject(new Error('服务器IP地址或主机名不能为空'));
            }

            const sshConfig = {
                host: serverConfig.ip || serverConfig.host,
                port: serverConfig.port || 22,
                username: serverConfig.username,
                readyTimeout: serverConfig.readyTimeout || 30000, // Default to 30 seconds
                keepaliveInterval: serverConfig.keepaliveInterval || 10000,
                // debug: console.log // Uncomment for detailed ssh2 debug logs
            };

            // Handle authentication
            if (serverConfig.auth_type === 'password') {
                if (!serverConfig.password) {
                    return reject(new Error('密码认证需要提供密码'));
                }
                sshConfig.password = serverConfig.password;
                this._tempPassword = serverConfig.password; // Store password temporarily for keyboard-interactive
                console.log('SSHClient.connect (ssh2): 使用密码认证'); // Added log
            } else if (serverConfig.auth_type === 'key') {
                if (!serverConfig.privateKey && serverConfig.key_file) {
                    const keyPath = path.join(process.cwd(), 'keys', serverConfig.key_file);
                    if (fs.existsSync(keyPath)) {
                        sshConfig.privateKey = fs.readFileSync(keyPath);
                        console.log(`SSHClient.connect (ssh2): 已读取密钥文件: ${serverConfig.key_file}`); // Added log
                    } else {
                        return reject(new Error(`密钥文件未找到: ${serverConfig.key_file}`));
                    }
                } else if (serverConfig.privateKey) {
                     sshConfig.privateKey = serverConfig.privateKey;
                     console.log('SSHClient.connect (ssh2): 使用提供的私钥内容'); // Added log
                } else {
                    return reject(new Error('密钥认证需要提供 privateKey 内容或 key_file 路径'));
                }
                if (serverConfig.passphrase) {
                    sshConfig.passphrase = serverConfig.passphrase;
                }
                console.log('SSHClient.connect (ssh2): 使用密钥认证'); // Added log
            } else {
                 return reject(new Error(`不支持的认证方式: ${serverConfig.auth_type}`));
            }

            // Resolve the promise when the 'ready' event fires
            this.conn.once('ready', () => {
                console.log(`SSHClient.connect (ssh2): 连接成功到 ${sshConfig.host}:${sshConfig.port}`); // Added log
                resolve(this); // Resolve with the SSHClient instance
            });

            // Reject the promise on connection errors
            this.conn.once('error', (err) => {
                console.error('SSHClient.connect (ssh2): 连接失败:', err.message); // Added log
                reject(err);
            });

            // Initiate the connection
            console.log(`SSHClient.connect (ssh2): 尝试连接到 ${sshConfig.host}:${sshConfig.port} (用户名: ${sshConfig.username}, 认证: ${serverConfig.auth_type})...`); // Added log
            this.conn.connect(sshConfig);
        });
    }

    /**
     * 执行命令
     * @param {string} command 要执行的命令
     * @returns {Promise<{stdout: string, stderr: string, code: number, signal: string}>}
     */
    async execCommand(command) {
        console.log(`SSHClient.execCommand (ssh2): 尝试执行命令: "${command}"`); // Added log
        if (!this.isConnected) {
             console.error('SSHClient.execCommand (ssh2): SSH 连接未建立或已断开'); // Added log
            throw new Error('SSH 连接未建立');
        }

        return new Promise((resolve, reject) => {
            this.conn.exec(command, (err, stream) => {
                if (err) {
                    console.error(`SSHClient.execCommand (ssh2): 执行命令 "${command}" 失败:`, err.message); // Added log
                    return reject(new Error(`执行 SSH 命令失败 "${command}": ${err.message}`));
                }

                let stdout = '';
                let stderr = '';

                stream.on('data', (data) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                stream.on('close', (code, signal) => {
                    console.log(`SSHClient.execCommand (ssh2): 命令 "${command}" 执行完成，退出码: ${code}, 信号: ${signal}`); // Added log
                    resolve({ stdout, stderr, code, signal });
                });

                stream.on('end', () => {
                     console.log(`SSHClient.execCommand (ssh2): 命令 "${command}" 输出流结束`); // Added log
                });
            });
        });
    }

    /**
     * 上传文件
     * @param {string} localPath 本地文件路径
     * @param {string} remotePath 远程文件路径
     * @returns {Promise<void>}
     */
    async putFile(localPath, remotePath) {
        console.log(`SSHClient.putFile (ssh2): 尝试上传文件: ${localPath} -> ${remotePath}`); // Added log
        if (!this.isConnected) {
             console.error('SSHClient.putFile (ssh2): SSH 连接未建立或已断开'); // Added log
            throw new Error('SSH 连接未建立');
        }

        return new Promise((resolve, reject) => {
            this.conn.sftp((err, sftp) => {
                if (err) {
                    console.error('SSHClient.putFile (ssh2): SFTP 连接失败:', err.message); // Added log
                    return reject(new Error(`SFTP 连接失败: ${err.message}`));
                }

                const readStream = fs.createReadStream(localPath);
                const writeStream = sftp.createWriteStream(remotePath);

                writeStream.on('close', () => {
                    console.log(`SSHClient.putFile (ssh2): 文件上传成功: ${localPath} -> ${remotePath}`); // Added log
                    resolve();
                });

                writeStream.on('error', (err) => {
                    console.error(`SSHClient.putFile (ssh2): 文件上传失败 ${localPath} -> ${remotePath}:`, err.message); // Added log
                    reject(new Error(`上传文件失败 "${localPath}" 到 "${remotePath}": ${err.message}`));
                });

                readStream.pipe(writeStream);
            });
        });
    }

     /**
      * 下载文件
      * @param {string} remotePath 远程文件路径
      * @param {string} localPath 本地文件路径
      * @returns {Promise<void>}
      */
     async getFile(remotePath, localPath) {
         console.log(`SSHClient.getFile (ssh2): 尝试下载文件: ${remotePath} -> ${localPath}`); // Added log
         if (!this.isConnected) {
              console.error('SSHClient.getFile (ssh2): SSH 连接未建立或已断开'); // Added log
             throw new Error('SSH 连接未建立');
         }

         return new Promise((resolve, reject) => {
             this.conn.sftp((err, sftp) => {
                 if (err) {
                     console.error('SSHClient.getFile (ssh2): SFTP 连接失败:', err.message); // Added log
                     return reject(new Error(`SFTP 连接失败: ${err.message}`));
                 }

                 const readStream = sftp.createReadStream(remotePath);
                 const writeStream = fs.createWriteStream(localPath);

                 writeStream.on('close', () => {
                     console.log(`SSHClient.getFile (ssh2): 文件下载成功: ${remotePath} -> ${localPath}`); // Added log
                     resolve();
                 });

                 readStream.on('error', (err) => {
                     console.error(`SSHClient.getFile (ssh2): 文件下载失败 ${remotePath} -> ${localPath}:`, err.message); // Added log
                     reject(new Error(`下载文件失败 "${remotePath}" 到 "${localPath}": ${err.message}`));
                 });

                 writeStream.on('error', (err) => {
                     console.error(`SSHClient.getFile (ssh2): 本地文件写入失败 ${localPath}:`, err.message); // Added log
                     reject(new Error(`下载文件失败 "${remotePath}" 到 "${localPath}": ${err.message}`));
                 });


                 readStream.pipe(writeStream);
             });
         });
     }


    /**
     * 断开连接
     */
    disconnect() {
        console.log('SSHClient.disconnect (ssh2): 尝试断开连接...'); // Added log
        if (this.conn && this.isConnected) {
            this.conn.end(); // Use conn.end() for ssh2 Client
            console.log('SSHClient.disconnect (ssh2): conn.end() called.'); // Added log
        } else {
            console.log('SSHClient.disconnect (ssh2): SSH 连接未建立或已断开，无需断开。'); // Added log
        }
        this.isConnected = false; // Ensure state is updated
    }

    /**
     * 检查Nginx状态
     * @returns {Promise<{installed: boolean, running: boolean, version: string, configStatus: string}>}
     */
    async checkNginxStatus() {
        console.log('SSHClient.checkNginxStatus: 开始检查Nginx状态...');
        if (!this.isConnected) {
            console.error('SSHClient.checkNginxStatus: SSH 连接未建立');
            throw new Error('SSH 连接未建立');
        }

        const result = {
            installed: false,
            running: false,
            version: '',
            configStatus: 'unknown'
        };

        try {
            // 检查Nginx是否安装
            const versionCheck = await this.execCommand('nginx -v 2>&1 || echo "Nginx not found"');
            console.log('SSHClient.checkNginxStatus: 版本检查结果:', versionCheck);
            
            if (versionCheck.stdout.includes('not found') && versionCheck.stderr.includes('not found')) {
                console.log('SSHClient.checkNginxStatus: Nginx未安装');
                return result;
            }

            // Nginx已安装，获取版本
            result.installed = true;
            const versionOutput = versionCheck.stdout || versionCheck.stderr;
            const versionMatch = versionOutput.match(/nginx\/(\d+\.\d+\.\d+)/);
            if (versionMatch) {
                result.version = versionMatch[1];
            }

            // 检查Nginx是否运行
            const statusCheck = await this.execCommand('systemctl status nginx || service nginx status || ps aux | grep nginx | grep -v grep');
            console.log('SSHClient.checkNginxStatus: 状态检查结果:', statusCheck);
            
            // 如果包含"active (running)"或发现nginx进程，认为Nginx正在运行
            if (
                statusCheck.stdout.includes('active (running)') || 
                statusCheck.stdout.includes('is running') ||
                statusCheck.stdout.includes('nginx: master process')
            ) {
                result.running = true;
            }

            // 检查Nginx配置语法
            const configCheck = await this.execCommand('nginx -t 2>&1');
            console.log('SSHClient.checkNginxStatus: 配置检查结果:', configCheck);
            
            if (configCheck.stdout.includes('syntax is ok') || configCheck.stderr.includes('syntax is ok')) {
                result.configStatus = 'ok';
            } else if (configCheck.stderr) {
                result.configStatus = 'error';
            }

            return result;
        } catch (error) {
            console.error('SSHClient.checkNginxStatus: 检查Nginx状态失败:', error);
            throw new Error(`检查Nginx状态失败: ${error.message}`);
        }
    }

    // Add other methods as needed, e.g., shell, etc.
    // Ensure all methods check this.isConnected before proceeding
}

module.exports = SSHClient;
