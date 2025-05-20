const db = require('../config/db');

// 域名模型
const Domain = {
    // 获取所有域名
    getAll: (callback) => {
        const sql = `
            SELECT d.*, s.ip AS server_ip 
            FROM domains d
            LEFT JOIN servers s ON d.server_id = s.id
        `;
        db.all(sql, [], callback);
    },

    // 获取单个域名
    getById: (id, callback) => {
        const sql = `
            SELECT d.*, s.ip AS server_ip, s.name AS server_name
            FROM domains d
            LEFT JOIN servers s ON d.server_id = s.id
            WHERE d.id = ?
        `;
        db.get(sql, [id], callback);
    },

    // 新增域名
    create: (domain, callback) => {
        const sql = `
            INSERT INTO domains (domain_name, registrar, url, username, password, 
                expiry_date, server_id, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, [
            domain.domain_name,
            domain.registrar,
            domain.url,
            domain.username,
            domain.password,
            domain.expiry_date,
            domain.server_id,
            domain.notes
        ], function(err) {
            callback(err, this.lastID);
        });
    },

    // 更新域名
    update: (id, domain, callback) => {
        const sql = `
            UPDATE domains
            SET domain_name = ?, registrar = ?, url = ?, username = ?, 
                password = ?, expiry_date = ?, cert_expiry_date = ?, 
                server_id = ?, status = ?, notes = ?
            WHERE id = ?
        `;
        db.run(sql, [
            domain.domain_name,
            domain.registrar,
            domain.url,
            domain.username,
            domain.password,
            domain.expiry_date,
            domain.cert_expiry_date,
            domain.server_id,
            domain.status,
            domain.notes,
            id
        ], callback);
    },

    // 删除域名
    delete: (id, callback) => {
        db.run('DELETE FROM domains WHERE id = ?', [id], callback);
    },

    // 批量删除域名
    deleteMultiple: (ids, callback) => {
        const placeholders = ids.map(() => '?').join(',');
        db.run(`DELETE FROM domains WHERE id IN (${placeholders})`, ids, callback);
    }
};

module.exports = Domain; 