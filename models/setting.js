const db = require('../config/db');
const bcrypt = require('bcrypt');

// 面板设置模型
const Setting = {
    // 获取所有设置
    getAll: (callback) => {
        db.all('SELECT * FROM settings', [], callback);
    },

    // 获取单个设置值
    get: (key, callback) => {
        db.get('SELECT setting_value FROM settings WHERE setting_key = ?', [key], (err, row) => {
            callback(err, row ? row.setting_value : null);
        });
    },

    // 更新设置
    set: (key, value, callback) => {
        db.get('SELECT setting_value FROM settings WHERE setting_key = ?', [key], (err, row) => {
            if (err) return callback(err);
            
            if (row) {
                db.run('UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?', [value, key], callback);
            } else {
                db.run('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value], callback);
            }
        });
    },

    // 更改密码
    changePassword: (newPassword, callback) => {
        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) return callback(err);
            
            Setting.set('password', hash, callback);
        });
    },

    // 验证密码
    verifyPassword: (password, callback) => {
        Setting.get('password', (err, hash) => {
            if (err) return callback(err, false);
            if (!hash) return callback(new Error('未设置密码'), false);
            
            bcrypt.compare(password, hash, callback);
        });
    },

    // 重置为默认设置
    resetToDefault: (callback) => {
        const defaultSettings = [
            { key: 'username', value: 'admin' },
            { key: 'password', value: '$2b$10$pWrECgKmeUUP.ChQZ0XzWeWIhWjzpmS3VWcKFELc9d8d2MrfEewZa' }, // admin123
            { key: 'upload_path', value: '/var/www/html' },
            { key: 'create_path', value: 'true' },
            { key: 'default_permissions', value: '775' }
        ];
        
        let completed = 0;
        let hasError = false;
        
        defaultSettings.forEach(setting => {
            Setting.set(setting.key, setting.value, (err) => {
                if (err && !hasError) {
                    hasError = true;
                    return callback(err);
                }
                
                completed++;
                if (completed === defaultSettings.length && !hasError) {
                    callback(null);
                }
            });
        });
    }
};

module.exports = Setting; 