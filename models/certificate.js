const db = require('../config/db');

// 证书模型
const Certificate = {
    // 获取所有证书
    getAll: (callback) => {
        const sql = `
            SELECT c.*, d.domain_name, s.name AS server_name, s.ip AS server_ip
            FROM certificates c
            LEFT JOIN domains d ON c.domain_id = d.id
            LEFT JOIN servers s ON c.server_id = s.id
        `;
        db.all(sql, [], callback);
    },

    // 获取单个证书
    getById: (id, callback) => {
        const sql = `
            SELECT c.*, d.domain_name, s.name AS server_name, s.ip AS server_ip
            FROM certificates c
            LEFT JOIN domains d ON c.domain_id = d.id
            LEFT JOIN servers s ON c.server_id = s.id
            WHERE c.id = ?
        `;
        db.get(sql, [id], callback);
    },

    // 根据域名ID获取证书
    getByDomainId: (domainId, callback) => {
        const sql = `
            SELECT c.*, d.domain_name, s.name AS server_name, s.ip AS server_ip
            FROM certificates c
            LEFT JOIN domains d ON c.domain_id = d.id
            LEFT JOIN servers s ON c.server_id = s.id
            WHERE c.domain_id = ?
        `;
        db.all(sql, [domainId], callback);
    },

    // 新增证书
    create: (certificate, callback) => {
        const sql = `
            INSERT INTO certificates (domain_id, server_id, name, type, expiry_date, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, [
            certificate.domain_id,
            certificate.server_id,
            certificate.name,
            certificate.type || 'acme',
            certificate.expiry_date,
            certificate.status || '有效'
        ], function(err) {
            callback(err, this.lastID);
        });
    },

    // 更新证书
    update: (id, certificate, callback) => {
        const sql = `
            UPDATE certificates
            SET domain_id = ?, server_id = ?, name = ?, type = ?, 
                expiry_date = ?, status = ?
            WHERE id = ?
        `;
        db.run(sql, [
            certificate.domain_id,
            certificate.server_id,
            certificate.name,
            certificate.type,
            certificate.expiry_date,
            certificate.status,
            id
        ], callback);
    },

    // 删除证书
    delete: (id, callback) => {
        db.run('DELETE FROM certificates WHERE id = ?', [id], callback);
    },

    // 批量删除证书
    deleteMultiple: (ids, callback) => {
        const placeholders = ids.map(() => '?').join(',');
        db.run(`DELETE FROM certificates WHERE id IN (${placeholders})`, ids, callback);
    },

    // 更新证书到期日期
    updateExpiryDate: (id, expiryDate, callback) => {
        const sql = 'UPDATE certificates SET expiry_date = ? WHERE id = ?';
        db.run(sql, [expiryDate, id], callback);
    }
};

module.exports = Certificate; 