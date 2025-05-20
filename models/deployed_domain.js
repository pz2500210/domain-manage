const db = require('../config/db');

// 已部署域名模型
const DeployedDomain = {
    // 获取所有已部署域名
    getAll: (callback) => {
        const sql = `SELECT * FROM deployed_domains ORDER BY deploy_date DESC`;
        db.all(sql, [], callback);
    },

    // 根据ID获取部署记录
    getById: (id, callback) => {
        const sql = `SELECT * FROM deployed_domains WHERE id = ? LIMIT 1`;
        db.get(sql, [id], callback);
    },

    // 根据域名获取部署记录
    getByDomain: (domainName, callback) => {
        const sql = `SELECT * FROM deployed_domains WHERE domain_name = ? LIMIT 1`;
        db.get(sql, [domainName], callback);
    },

    // 根据bcid获取部署记录
    getByBcid: (bcid, callback) => {
        const sql = `SELECT * FROM deployed_domains WHERE bcid = ? LIMIT 1`;
        db.get(sql, [bcid], callback);
    },

    // 更新或插入部署记录 - 仅根据域名判断是否存在
    upsert: (deployInfo, callback) => {
        // 先检查是否已存在相同域名的记录
        const checkSql = `
            SELECT id FROM deployed_domains
            WHERE domain_name = ?
        `;

        db.get(checkSql, [deployInfo.domain_name], (err, row) => {
            if (err) return callback(err);

            if (row) {
                // 已存在记录，更新它
                const updateSql = `
                    UPDATE deployed_domains
                    SET server_name = ?,
                        server_ip = ?, -- 更新服务器IP
                        sni_ip = ?, -- 更新SNI IP
                        cert_expiry_date = ?,
                        cert_type = ?,
                        template_name = ?,
                        deploy_date = ?,
                        status = ?,
                        notes = ?,
                        bcid = ?
                    WHERE id = ?
                `;

                db.run(updateSql, [
                    deployInfo.server_name,
                    deployInfo.server_ip, // 更新服务器IP
                    deployInfo.sni_ip,
                    deployInfo.cert_expiry_date,
                    deployInfo.cert_type,
                    deployInfo.template_name,
                    deployInfo.deploy_date || new Date().toISOString(),
                    deployInfo.status || '在线',
                    deployInfo.notes,
                    deployInfo.bcid,
                    row.id
                ], callback);
            } else {
                // 不存在记录，插入新记录
                const insertSql = `
                    INSERT INTO deployed_domains (
                        domain_name, server_name, server_ip, sni_ip,
                        cert_expiry_date, cert_type, template_name, deploy_date,
                        status, notes, bcid
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                db.run(insertSql, [
                    deployInfo.domain_name,
                    deployInfo.server_name,
                    deployInfo.server_ip,
                    deployInfo.sni_ip,
                    deployInfo.cert_expiry_date,
                    deployInfo.cert_type,
                    deployInfo.template_name,
                    deployInfo.deploy_date || new Date().toISOString(),
                    deployInfo.status || '在线',
                    deployInfo.notes,
                    deployInfo.bcid
                ], function(err) {
                    callback(err, this ? this.lastID : null);
                });
            }
        });
    },

    // 删除部署记录 (按域名删除，而不是 ID)
    delete: (domainName, callback) => { // <--- 删除方法应该按域名删除
        db.run('DELETE FROM deployed_domains WHERE domain_name = ?', [domainName], callback);
    },

    // 根据ID删除部署记录
    deleteById: (id, callback) => {
        db.run('DELETE FROM deployed_domains WHERE id = ?', [id], callback);
    },

    // 根据bcid删除部署记录
    deleteByBcid: (bcid, callback) => {
        db.run('DELETE FROM deployed_domains WHERE bcid = ?', [bcid], callback);
    },

    init: (callback) => {
        const sql = `
            CREATE TABLE IF NOT EXISTS deployed_domains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                domain_name TEXT NOT NULL,
                server_name TEXT,
                server_ip TEXT NOT NULL,
                sni_ip TEXT,
                cert_expiry_date TEXT,
                cert_type TEXT,
                template_name TEXT,
                deploy_date TEXT,
                status TEXT,
                notes TEXT,
                bcid TEXT
            )
        `;
        db.run(sql, callback);
    }
};

console.log('DeployedDomain model loaded. Type of init:', typeof DeployedDomain.init);
module.exports = DeployedDomain;