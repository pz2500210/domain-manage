const db = require('../config/db');
const { Client } = require('ssh2');

// 服务器模型
const Server = {
    // 获取所有服务器
    getAll: (callback) => {
        db.all('SELECT * FROM servers', [], callback);
    },

    // 获取单个服务器
    getById: (id, callback) => {
        db.get('SELECT * FROM servers WHERE id = ?', [id], callback);
    },

    // 新增服务器
    create: (server, callback) => {
        // 检查服务器名称和IP是否重复
        db.get('SELECT * FROM servers WHERE name = ? OR ip = ?', [server.name, server.ip], (err, existingServer) => {
            if (err) {
                return callback(err);
            }
            
            if (existingServer) {
                let errorMsg = '';
                if (existingServer.name === server.name) {
                    errorMsg = `服务器名称 "${server.name}" 已存在`;
                }
                if (existingServer.ip === server.ip) {
                    errorMsg = errorMsg ? `${errorMsg}，IP地址 "${server.ip}" 已存在` : `IP地址 "${server.ip}" 已存在`;
                }
                return callback(new Error(errorMsg));
            }
            
            const sql = `
                INSERT INTO servers (name, ip, port, username, auth_type, password, key_file, webroot, notes, hostname)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            db.run(sql, [
                server.name,
                server.ip,
                server.port || 22,
                server.username,
                server.auth_type || 'password',
                server.password,
                server.key_file,
                server.webroot,
                server.notes,
                server.hostname || ''
            ], function(err) {
                callback(err, this.lastID);
            });
        });
    },

    // 更新服务器
    update: (id, server, callback) => {
        // 检查服务器名称和IP是否与其他服务器重复
        db.get('SELECT * FROM servers WHERE (name = ? OR ip = ?) AND id != ?', 
            [server.name, server.ip, id], 
            (err, existingServer) => {
                if (err) {
                    return callback(err);
                }
                
                if (existingServer) {
                    let errorMsg = '';
                    if (existingServer.name === server.name) {
                        errorMsg = `服务器名称 "${server.name}" 已存在`;
                    }
                    if (existingServer.ip === server.ip) {
                        errorMsg = errorMsg ? `${errorMsg}，IP地址 "${server.ip}" 已存在` : `IP地址 "${server.ip}" 已存在`;
                    }
                    return callback(new Error(errorMsg));
                }
                
                // 先获取当前服务器信息
                db.get('SELECT * FROM servers WHERE id = ?', [id], (err, currentServer) => {
                    if (err) {
                        return callback(err);
                    }
                    
                    if (!currentServer) {
                        return callback(new Error('找不到要更新的服务器'));
                    }
                    
                    // 只更新提供的字段，未提供的字段保持原值
                    const updatedServer = {
                        name: server.name !== undefined ? server.name : currentServer.name,
                        ip: server.ip !== undefined ? server.ip : currentServer.ip,
                        port: server.port !== undefined ? server.port : currentServer.port,
                        username: server.username !== undefined ? server.username : currentServer.username,
                        auth_type: server.auth_type !== undefined ? server.auth_type : currentServer.auth_type,
                        // 只有明确提供了密码时才更新密码
                        password: server.password !== undefined ? server.password : currentServer.password,
                        // 只有明确提供了密钥文件时才更新密钥文件
                        key_file: server.key_file !== undefined ? server.key_file : currentServer.key_file,
                        webroot: server.webroot !== undefined ? server.webroot : currentServer.webroot,
                        status: server.status !== undefined ? server.status : currentServer.status,
                        notes: server.notes !== undefined ? server.notes : currentServer.notes,
                        hostname: server.hostname !== undefined ? server.hostname : currentServer.hostname
                    };
                    
                    const sql = `
                        UPDATE servers
                        SET name = ?, ip = ?, port = ?, username = ?, auth_type = ?, 
                            password = ?, key_file = ?, webroot = ?, status = ?, notes = ?, hostname = ?
                        WHERE id = ?
                    `;
                    db.run(sql, [
                        updatedServer.name,
                        updatedServer.ip,
                        updatedServer.port || 22,
                        updatedServer.username,
                        updatedServer.auth_type || 'password',
                        updatedServer.password,
                        updatedServer.key_file,
                        updatedServer.webroot,
                        updatedServer.status,
                        updatedServer.notes,
                        updatedServer.hostname || '',
                        id
                    ], callback);
                });
            }
        );
    },

    // 删除服务器
    delete: (id, callback) => {
        db.run('DELETE FROM servers WHERE id = ?', [id], callback);
    },

    // 批量删除服务器
    deleteMultiple: (ids, callback) => {
        const placeholders = ids.map(() => '?').join(',');
        db.run(`DELETE FROM servers WHERE id IN (${placeholders})`, ids, callback);
    },

    // 检查服务器连接
    checkConnection: (server, callback) => {
        const conn = new Client();
        
        conn.on('ready', () => {
            conn.end();
            callback(null, true);
        }).on('error', (err) => {
            callback(err, false);
        });

        try {
            if (server.auth_type === 'password') {
                conn.connect({
                    host: server.ip,
                    port: server.port || 22,
                    username: server.username,
                    password: server.password
                });
            } else {
                conn.connect({
                    host: server.ip,
                    port: server.port || 22,
                    username: server.username,
                    privateKey: require('fs').readFileSync(server.key_file)
                });
            }
        } catch (error) {
            callback(error, false);
        }
    },

    // 获取服务器Nginx状态
    getNginxStatus: (server, callback) => {
        this.checkConnection(server, (err, connected) => {
            if (err || !connected) {
                return callback(err, false);
            }

            const conn = new Client();
            conn.on('ready', () => {
                conn.exec('command -v nginx || echo "not installed"', (err, stream) => {
                    if (err) return callback(err, false);
                    
                    let data = '';
                    stream.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    stream.on('end', () => {
                        const isInstalled = !data.includes('not installed');
                        conn.end();
                        
                        // 更新数据库中的Nginx状态
                        db.run('UPDATE servers SET nginx_installed = ? WHERE id = ?', [isInstalled ? 1 : 0, server.id], () => {
                            callback(null, isInstalled);
                        });
                    });
                });
            }).connect({
                host: server.ip,
                port: server.port || 22,
                username: server.username,
                password: server.auth_type === 'password' ? server.password : undefined,
                privateKey: server.auth_type === 'key' ? require('fs').readFileSync(server.key_file) : undefined
            });
        });
    },

    /**
     * 通过IP地址获取服务器信息
     * @param {string} ip - 服务器IP地址或主机名
     * @returns {Promise<Object|null>} 服务器信息或null
     */
    getByIp: async (ip) => {
        return new Promise((resolve, reject) => {
            // 支持更灵活的匹配方式，同时匹配IP、主机名和服务器名称
            db.get(
                'SELECT * FROM servers WHERE ip = ? OR ip LIKE ? OR name = ? OR name LIKE ? OR hostname = ? OR hostname LIKE ?',
                [ip, `%${ip}%`, ip, `%${ip}%`, ip, `%${ip}%`],
                (err, row) => {
                    if (err) {
                        console.error('通过IP获取服务器失败:', err);
                        reject(err);
                    } else {
                        if (row) {
                            console.log(`找到服务器匹配: ${row.name} (${row.ip})`);
                            resolve(row);
                        } else {
                            // 如果没有找到精确匹配，尝试查询所有服务器然后在内存中比较
                            db.all('SELECT * FROM servers', [], (err, rows) => {
                                if (err) {
                                    console.error('获取所有服务器记录失败:', err);
                                    reject(err);
                                    return;
                                }
                                
                                // 尝试找到包含IP、主机名或服务器名称的记录
                                const matchedServer = rows.find(server => 
                                    (server.ip && server.ip.includes(ip)) || 
                                    (ip && ip.includes(server.ip)) ||
                                    (server.name && server.name.includes(ip)) ||
                                    (ip && ip.includes(server.name)) ||
                                    (server.hostname && server.hostname.includes(ip)) ||
                                    (ip && ip.includes(server.hostname))
                                );
                                
                                if (matchedServer) {
                                    console.log(`通过模糊匹配找到服务器: ${matchedServer.name} (${matchedServer.ip})`);
                                }
                                resolve(matchedServer || null);
                            });
                        }
                    }
                }
            );
        });
    }
};

module.exports = Server; 