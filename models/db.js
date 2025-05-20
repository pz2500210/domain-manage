const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 确保数据目录存在
const dbDir = path.join(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 数据库文件路径
const dbPath = path.join(dbDir, 'domain_manager.db');

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('无法连接到数据库:', err.message);
    } else {
        console.log('已连接到SQLite数据库');
        initDatabase();
    }
});

// 初始化数据库表
function initDatabase() {
    // 创建服务器表
    db.run(`
        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            ip TEXT NOT NULL,
            port INTEGER DEFAULT 22,
            username TEXT,
            password TEXT,
            auth_type TEXT DEFAULT 'password',
            key_file TEXT,
            webroot TEXT DEFAULT '/var/www/html',
            notes TEXT,
            status TEXT DEFAULT '未知',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建服务器状态表
    db.run(`
        CREATE TABLE IF NOT EXISTS server_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER NOT NULL,
            nginx_installed BOOLEAN DEFAULT 0,
            nginx_running BOOLEAN DEFAULT 0,
            nginx_version TEXT,
            nginx_config_status TEXT,
            last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
        )
    `);

    // 其他表已省略...
    console.log('数据库表初始化完成');
}

/**
 * 更新服务器的Nginx状态
 * @param {Number} serverId 服务器ID
 * @param {Object} statusData Nginx状态数据
 * @returns {Promise}
 */
function updateServerNginxStatus(serverId, statusData) {
    return new Promise((resolve, reject) => {
        const { installed, running, version, configStatus } = statusData;
        
        // 首先检查是否已存在记录
        db.get('SELECT id FROM server_status WHERE server_id = ?', [serverId], (err, row) => {
            if (err) {
                return reject(err);
            }
            
            if (row) {
                // 更新现有记录
                db.run(`
                    UPDATE server_status SET 
                    nginx_installed = ?, 
                    nginx_running = ?, 
                    nginx_version = ?, 
                    nginx_config_status = ?,
                    last_checked = CURRENT_TIMESTAMP
                    WHERE server_id = ?
                `, [
                    installed ? 1 : 0, 
                    running ? 1 : 0, 
                    version, 
                    configStatus,
                    serverId
                ], function(err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve({ id: row.id, changes: this.changes });
                });
            } else {
                // 创建新记录
                db.run(`
                    INSERT INTO server_status (
                        server_id, nginx_installed, nginx_running, 
                        nginx_version, nginx_config_status
                    ) VALUES (?, ?, ?, ?, ?)
                `, [
                    serverId, 
                    installed ? 1 : 0, 
                    running ? 1 : 0,
                    version, 
                    configStatus
                ], function(err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve({ id: this.lastID, changes: this.changes });
                });
            }
        });
    });
}

/**
 * 获取服务器的Nginx状态
 * @param {Number} serverId 服务器ID
 * @returns {Promise<Object>}
 */
function getServerNginxStatus(serverId) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT nginx_installed, nginx_running, nginx_version, 
                   nginx_config_status, last_checked
            FROM server_status
            WHERE server_id = ?
        `, [serverId], (err, row) => {
            if (err) {
                return reject(err);
            }
            
            if (row) {
                resolve({
                    installed: row.nginx_installed === 1,
                    running: row.nginx_running === 1,
                    version: row.nginx_version,
                    configStatus: row.nginx_config_status,
                    lastChecked: row.last_checked
                });
            } else {
                resolve({
                    installed: false,
                    running: false,
                    version: null,
                    configStatus: null,
                    lastChecked: null
                });
            }
        });
    });
}

/**
 * 获取服务器信息
 * @param {Number} serverId 服务器ID
 * @returns {Promise<Object>}
 */
function getServerById(serverId) {
    return new Promise((resolve, reject) => {
        if (!serverId) {
            console.error('getServerById: 未提供服务器ID');
            return reject(new Error('服务器ID不能为空'));
        }
        
        console.log(`正在查询服务器ID: ${serverId}`);
        
        db.get('SELECT * FROM servers WHERE id = ?', [serverId], (err, row) => {
            if (err) {
                console.error(`查询服务器ID ${serverId} 失败:`, err);
                return reject(err);
            }
            
            if (!row) {
                console.warn(`未找到ID为 ${serverId} 的服务器`);
                return resolve(null);
            }
            
            if (!row.ip) {
                console.warn(`服务器ID ${serverId} 没有IP地址`);
            } else {
                console.log(`找到服务器 ${row.name || row.ip} (ID: ${serverId})`);
            }
            
            resolve(row);
        });
    });
}

// 导出数据库模块
module.exports = {
    db,
    updateServerNginxStatus,
    getServerNginxStatus,
    getServerById
}; 