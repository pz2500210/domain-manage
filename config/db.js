const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

// 确保数据目录存在
const dbDir = path.join(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 数据库文件路径
const dbPath = path.join(dbDir, 'domain_manager.db');
console.log(`[信息] 连接数据库: ${dbPath}`);

// 创建数据库连接
const db = new sqlite3.Database(dbPath);

// 初始化数据库结构
const initDatabase = () => {
    // 使用事务确保完整性
    db.serialize(() => {
        // 设置表
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 域名表
        db.run(`CREATE TABLE IF NOT EXISTS domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain_name TEXT NOT NULL,
            registrar TEXT,
            url TEXT,
            username TEXT,
            password TEXT,
            expiry_date TEXT,
            cert_expiry_date TEXT,
            server_id INTEGER,
            status TEXT DEFAULT '在线',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 服务器表
        db.run(`CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            ip TEXT NOT NULL,
            port INTEGER DEFAULT 22,
            username TEXT NOT NULL,
            auth_type TEXT DEFAULT 'password',
            password TEXT,
            key_file TEXT,
            webroot TEXT,
            nginx_installed BOOLEAN DEFAULT 0,
            status TEXT DEFAULT '在线',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 证书表
        db.run(`CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain_id INTEGER,
            server_id INTEGER,
            name TEXT NOT NULL,
            type TEXT DEFAULT 'acme',
            expiry_date TEXT,
            status TEXT DEFAULT '有效',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (domain_id) REFERENCES domains (id),
            FOREIGN KEY (server_id) REFERENCES servers (id)
        )`);

        // 模板表
        db.run(`CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            filename TEXT NOT NULL,
            content TEXT,
            size INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // 检查设置表是否有数据
        db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
            if (err) {
                console.error('[错误] 检查设置表时出错:', err.message);
                return;
            }

            // 如果没有数据，插入默认设置
            if (row.count === 0) {
                console.log('[信息] 插入默认设置...');
                
                // 插入默认设置
                db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('username', 'admin')`);
                db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('password', '$2b$10$pWrECgKmeUUP.ChQZ0XzWeWIhWjzpmS3VWcKFELc9d8d2MrfEewZa')`); // 默认密码: admin123
                db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('upload_path', '/var/www/html')`);
                db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('create_path', 'true')`);
                db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('default_permissions', '775')`);
                db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('app_name', '域名管理系统')`);
                db.run(`INSERT INTO settings (setting_key, setting_value) VALUES ('version', '1.0.0')`);
                
                console.log('[成功] 默认设置已创建');
            }
        });
    });
};

// 初始化数据库
initDatabase();

// 数据库迁移：添加webroot字段到servers表
db.all("PRAGMA table_info(servers)", (err, rows) => {
    if (err) {
        console.error('[错误] 检查服务器表结构失败:', err.message);
        return;
    }
    
    // 检查是否已存在webroot字段
    const hasWebroot = rows.some(row => row.name === 'webroot');
    
    if (!hasWebroot) {
        console.log('[信息] 添加webroot字段到服务器表...');
        db.run("ALTER TABLE servers ADD COLUMN webroot TEXT", (err) => {
            if (err) {
                console.error('[错误] 添加webroot字段失败:', err.message);
            } else {
                console.log('[成功] webroot字段已添加到服务器表');
                
                // 为现有记录设置默认值
                db.all("SELECT id, username FROM servers WHERE webroot IS NULL", (err, servers) => {
                    if (err) {
                        console.error('[错误] 读取服务器记录失败:', err.message);
                        return;
                    }
                    
                    // 根据用户名设置默认webroot
                    servers.forEach(server => {
                        let webroot = '/var/www/html'; // 默认值
                        
                        if (server.username) {
                            if (server.username === 'root') {
                                webroot = '/root';
                            } else {
                                webroot = `/home/${server.username}`;
                            }
                        }
                        
                        db.run("UPDATE servers SET webroot = ? WHERE id = ?", [webroot, server.id], (err) => {
                            if (err) {
                                console.error(`[错误] 更新服务器ID=${server.id}的webroot失败:`, err.message);
                            } else {
                                console.log(`[成功] 服务器ID=${server.id}的webroot已更新为${webroot}`);
                            }
                        });
                    });
                });
            }
        });
    }
});

// 数据库迁移：添加hostname字段到servers表
db.all("PRAGMA table_info(servers)", (err, rows) => {
    if (err) {
        console.error('[错误] 检查服务器表结构失败:', err.message);
        return;
    }
    
    // 检查是否已存在hostname字段
    const hasHostname = rows.some(row => row.name === 'hostname');
    
    if (!hasHostname) {
        console.log('[信息] 添加hostname字段到服务器表...');
        db.run("ALTER TABLE servers ADD COLUMN hostname TEXT", (err) => {
            if (err) {
                console.error('[错误] 添加hostname字段失败:', err.message);
            } else {
                console.log('[成功] hostname字段已添加到服务器表');
            }
        });
    }
});

// 检查数据库连接
db.get("SELECT sqlite_version() as version", (err, row) => {
    if (err) {
        console.error('[错误] 数据库连接失败:', err.message);
    } else {
        console.log(`[成功] 数据库连接成功，SQLite版本: ${row.version}`);
    }
});

// 导出数据库连接
module.exports = db; 