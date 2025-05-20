/**
 * 数据库初始化脚本
 * 用于创建域名管理系统所需的表结构
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 数据目录
const dataDir = path.join(__dirname, '..', 'data');
// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 数据库文件路径
const dbPath = path.join(dataDir, 'domain_manager.db');

console.log(`[信息] 初始化数据库: ${dbPath}`);

// 创建/连接数据库
const db = new sqlite3.Database(dbPath);

// 创建表结构
db.serialize(() => {
  // 1. 设置表
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. 域名表
  db.run(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'inactive',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. 服务器表
  db.run(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      password TEXT,
      auth_type TEXT DEFAULT 'password',
      key_file TEXT,
      status TEXT DEFAULT 'inactive',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. 证书表
  db.run(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain_id INTEGER,
      server_id INTEGER,
      type TEXT NOT NULL,
      expiry_date TIMESTAMP,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (server_id) REFERENCES servers(id)
    )
  `);

  // 5. 模板表
  db.run(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. 配置表
  db.run(`
    CREATE TABLE IF NOT EXISTS configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER,
      server_id INTEGER,
      certificate_id INTEGER,
      template_id INTEGER,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (domain_id) REFERENCES domains(id),
      FOREIGN KEY (server_id) REFERENCES servers(id),
      FOREIGN KEY (certificate_id) REFERENCES certificates(id),
      FOREIGN KEY (template_id) REFERENCES templates(id)
    )
  `);

  // 插入一些基本设置
  db.run(`
    INSERT OR IGNORE INTO settings (key, value) VALUES 
    ('app_name', '域名管理系统'),
    ('version', '1.0.0'),
    ('created_at', datetime('now'))
  `);

  console.log('[成功] 数据库表创建完成');
});

// 关闭数据库连接
db.close((err) => {
  if (err) {
    console.error('[错误] 关闭数据库连接失败:', err.message);
  } else {
    console.log('[成功] 数据库初始化完成');
  }
}); 