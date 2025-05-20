const express = require('express');
const router = express.Router();
const SSHClient = require('../../utils/ssh');
const { getServerById, updateServerNginxStatus, getServerNginxStatus } = require('../../models/db');
const Server = require('../../models/server');

/**
 * 获取服务器列表
 * GET /api/servers
 */
router.get('/', (req, res) => {
    Server.getAll((err, servers) => {
        if (err) {
            console.error('获取服务器列表失败:', err);
            return res.status(500).json({ error: '获取服务器列表失败' });
        }
        res.json(servers);
    });
});

/**
 * 获取单个服务器详情
 * GET /api/servers/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const serverId = req.params.id;
        
        // 使用模型方法获取服务器
        Server.getById(serverId, (err, server) => {
            if (err) {
                console.error('获取服务器信息失败:', err);
                return res.status(500).json({ error: '获取服务器信息失败', details: err.message });
            }
            
            if (!server) {
                return res.status(404).json({ error: '服务器不存在' });
            }
            
            // 不返回敏感信息
            if (server.password) {
                server.password = '********'; // 隐藏真实密码
            }
            
            res.json(server);
        });
    } catch (error) {
        console.error('获取服务器信息失败:', error);
        res.status(500).json({ error: '获取服务器信息失败' });
    }
});

/**
 * 通过SSH检查Nginx状态并更新数据库
 * GET /api/servers/:id/nginx-status/check
 */
router.get('/:id/nginx-status/check', async (req, res) => {
    const serverId = req.params.id;
    try {
        // 获取服务器信息
        const server = await getServerById(serverId);
        if (!server) {
            return res.status(404).json({ error: '服务器不存在' });
        }

        // 创建SSH客户端并连接
        const sshClient = new SSHClient();
        await sshClient.connect(server);

        // 检查Nginx状态
        const nginxStatus = await sshClient.checkNginxStatus();
        
        // 断开SSH连接
        sshClient.disconnect();

        // 更新数据库中的状态
        await updateServerNginxStatus(serverId, nginxStatus);

        // 返回结果
        res.json({
            success: true,
            installed: nginxStatus.installed,
            running: nginxStatus.running,
            version: nginxStatus.version,
            configStatus: nginxStatus.configStatus,
            lastChecked: new Date().toISOString()
        });
    } catch (error) {
        console.error(`检查服务器${serverId}的Nginx状态失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message || '检查Nginx状态失败'
        });
    }
});

/**
 * 通过SSH检查Nginx状态并更新数据库 (POST版本)
 * POST /api/servers/:id/nginx-status/check
 */
router.post('/:id/nginx-status/check', async (req, res) => {
    const serverId = req.params.id;
    try {
        console.log(`[POST] 开始检查服务器 ${serverId} 的Nginx状态...`);
        
        // 获取服务器信息
        const server = await new Promise((resolve, reject) => {
            Server.getById(serverId, (err, serverData) => {
                if (err) reject(err);
                else resolve(serverData);
            });
        });
        
        if (!server) {
            console.error(`服务器ID ${serverId} 不存在`);
            return res.status(404).json({ 
                success: false, 
                error: '服务器不存在' 
            });
        }
        
        console.log(`检查服务器 ${server.ip} (${serverId}) 的Nginx状态...`);

        // 创建SSH客户端并连接
        const sshClient = new SSHClient();
        await sshClient.connect(server);

        // 检查Nginx状态
        const nginxStatus = await sshClient.checkNginxStatus();
        
        // 断开SSH连接
        sshClient.disconnect();

        // 更新数据库中的状态 (如果需要的话)
        try {
            await updateServerNginxStatus(serverId, nginxStatus);
            console.log(`已更新服务器 ${serverId} 的Nginx状态到数据库`);
        } catch (dbError) {
            console.warn(`更新服务器 ${serverId} 的Nginx状态到数据库失败:`, dbError);
            // 继续执行，即使数据库更新失败
        }

        // 返回结果
        res.json({
            success: true,
            installed: nginxStatus.installed,
            running: nginxStatus.running,
            version: nginxStatus.version,
            configStatus: nginxStatus.configStatus,
            lastChecked: new Date().toISOString()
        });
    } catch (error) {
        console.error(`检查服务器 ${serverId} 的Nginx状态失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message || '检查Nginx状态失败'
        });
    }
});

/**
 * 从数据库获取Nginx状态
 * GET /api/servers/:id/nginx-status
 */
router.get('/:id/nginx-status', async (req, res) => {
    const serverId = req.params.id;
    try {
        // 从数据库获取状态
        const nginxStatus = await getServerNginxStatus(serverId);
        
        res.json({
            success: true,
            installed: nginxStatus.installed,
            running: nginxStatus.running,
            version: nginxStatus.version,
            configStatus: nginxStatus.configStatus,
            lastChecked: nginxStatus.lastChecked
        });
    } catch (error) {
        console.error(`获取服务器${serverId}的Nginx状态失败:`, error);
        res.status(500).json({
            success: false,
            error: error.message || '获取Nginx状态失败'
        });
    }
});

/**
 * 添加服务器
 * POST /api/servers
 */
router.post('/', (req, res) => {
    const serverData = {
        name: req.body.name,
        ip: req.body.ip,
        port: req.body.port || 22,
        username: req.body.username,
        auth_type: req.body.auth_type,
        password: req.body.password,
        key_file: req.body.key_file,
        webroot: req.body.webroot,
        notes: req.body.notes,
        hostname: req.body.hostname
    };
    
    // 检查IP地址
    if (!serverData.ip) {
        return res.status(400).json({ 
            success: false, 
            error: 'IP地址不能为空' 
        });
    }
    
    // 允许localhost和主机名作为IP地址
    const isValidIP = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(serverData.ip);
    const isLocalhost = serverData.ip === 'localhost' || serverData.ip === '127.0.0.1';
    const isHostname = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*$/.test(serverData.ip);
    
    if (!isValidIP && !isLocalhost && !isHostname) {
        return res.status(400).json({ 
            success: false, 
            error: `IP地址/主机名 "${serverData.ip}" 格式无效` 
        });
    }
    
    // 如果webroot为空，根据用户名自动设置
    if (!serverData.webroot && serverData.username) {
        if (serverData.username === 'root') {
            serverData.webroot = '/root';
        } else {
            serverData.webroot = `/home/${serverData.username}`;
        }
        console.log(`[自动设置] 服务器webroot: ${serverData.webroot}`);
    }
    
    Server.create(serverData, (err, id) => {
        if (err) {
            console.error('添加服务器失败:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || '添加服务器失败' 
            });
        }
        
        res.status(201).json({
            success: true,
            id: id,
            message: '服务器添加成功'
        });
    });
});

/**
 * 删除服务器
 * DELETE /api/servers
 */
router.delete('/', (req, res) => {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: '无效的请求参数' 
        });
    }
    
    Server.deleteMultiple(ids, (err) => {
        if (err) {
            console.error('删除服务器失败:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || '删除服务器失败' 
            });
        }
        
        res.json({
            success: true,
            message: '服务器删除成功',
            deleted: ids
        });
    });
});

/**
 * 更新服务器信息
 * PUT /api/servers/:id
 */
router.put('/:id', (req, res) => {
    const serverId = req.params.id;
    const serverData = {
        name: req.body.name,
        ip: req.body.ip,
        port: req.body.port || 22,
        username: req.body.username,
        auth_type: req.body.auth_type,
        webroot: req.body.webroot,
        notes: req.body.notes,
        hostname: req.body.hostname
    };
    
    // 检查IP地址
    if (!serverData.ip) {
        return res.status(400).json({ 
            success: false, 
            error: 'IP地址不能为空' 
        });
    }
    
    // 允许localhost和主机名作为IP地址
    const isValidIP = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(serverData.ip);
    const isLocalhost = serverData.ip === 'localhost' || serverData.ip === '127.0.0.1';
    const isHostname = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*$/.test(serverData.ip);
    
    if (!isValidIP && !isLocalhost && !isHostname) {
        return res.status(400).json({ 
            success: false, 
            error: `IP地址/主机名 "${serverData.ip}" 格式无效` 
        });
    }
    
    // 如果webroot为空，根据用户名自动设置
    if (!serverData.webroot && serverData.username) {
        if (serverData.username === 'root') {
            serverData.webroot = '/root';
        } else {
            serverData.webroot = `/home/${serverData.username}`;
        }
        console.log(`[自动设置] 服务器webroot: ${serverData.webroot}`);
    }
    
    // 只在提供密码时更新密码
    if (req.body.password) {
        serverData.password = req.body.password;
    }
    
    // 只在提供密钥文件时更新密钥信息
    if (req.body.key_file) {
        serverData.key_file = req.body.key_file;
    }
    
    Server.update(serverId, serverData, (err) => {
        if (err) {
            console.error('更新服务器失败:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message || '更新服务器失败'
            });
        }
        
        res.json({
            success: true,
            message: '服务器更新成功'
        });
    });
});

/**
 * 验证服务器配置
 * GET /api/servers/:id/validate
 */
router.get('/:id/validate', async (req, res) => {
    try {
        const serverId = req.params.id;
        
        // 使用模型方法获取服务器
        Server.getById(serverId, (err, server) => {
            if (err) {
                console.error('获取服务器信息失败:', err);
                return res.status(500).json({ 
                    valid: false, 
                    error: '获取服务器信息失败', 
                    details: err.message 
                });
            }
            
            if (!server) {
                return res.status(404).json({ 
                    valid: false, 
                    error: '服务器不存在' 
                });
            }
            
            // 验证必要字段
            const validationErrors = [];
            
            if (!server.ip) {
                validationErrors.push('IP地址不能为空');
            } else {
                // 检查IP地址格式
                const isValidIP = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(server.ip);
                const isLocalhost = server.ip === 'localhost' || server.ip === '127.0.0.1';
                const isHostname = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*$/.test(server.ip);
                
                if (!isValidIP && !isLocalhost && !isHostname) {
                    validationErrors.push(`IP地址/主机名 "${server.ip}" 格式无效`);
                }
            }
            
            if (!server.port) {
                validationErrors.push('SSH端口未指定');
            }
            
            if (!server.username) {
                validationErrors.push('用户名未指定');
            }
            
            if (server.auth_type === 'password' && !server.password) {
                validationErrors.push('认证方式为密码，但密码未提供');
            }
            
            if (server.auth_type === 'key' && !server.key_file) {
                validationErrors.push('认证方式为密钥，但密钥文件未提供');
            }
            
            // 返回验证结果
            if (validationErrors.length > 0) {
                res.json({
                    valid: false,
                    server: {
                        id: server.id,
                        name: server.name || '未命名服务器',
                        ip: server.ip
                    },
                    errors: validationErrors
                });
            } else {
                res.json({
                    valid: true,
                    server: {
                        id: server.id,
                        name: server.name || '未命名服务器',
                        ip: server.ip,
                        port: server.port
                    }
                });
            }
        });
    } catch (error) {
        console.error('验证服务器失败:', error);
        res.status(500).json({ 
            valid: false, 
            error: '验证服务器失败', 
            details: error.message 
        });
    }
});

// 通过IP地址获取服务器
router.get('/ip/:ip', async (req, res) => {
    try {
        const serverIp = req.params.ip;
        const server = await Server.getByIp(serverIp);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: `找不到IP为 ${serverIp} 的服务器`
            });
        }
        
        // 隐藏密码和敏感信息
        if (server.password) {
            server.password = '******';
        }
        if (server.key_file) {
            server.key_file = server.key_file;
        }
        
        res.json(server);
    } catch (error) {
        console.error('通过IP获取服务器失败:', error);
        res.status(500).json({
            success: false,
            error: `获取服务器失败: ${error.message}`
        });
    }
});

module.exports = router; 