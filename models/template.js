const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const Setting = require('./setting');

// 模板模型
const Template = {
    // 获取所有模板
    getAll: (callback) => {
        db.all('SELECT * FROM templates', [], callback);
    },

    // 获取单个模板
    getById: (id, callback) => {
        db.get('SELECT * FROM templates WHERE id = ?', [id], callback);
    },

    // 新增模板
    create: (template, callback) => {
        const sql = `
            INSERT INTO templates (name, filename, content, size)
            VALUES (?, ?, ?, ?)
        `;
        
        // 计算内容大小（字节数）
        const size = Buffer.from(template.content).length;
        
        db.run(sql, [
            template.name,
            template.filename,
            template.content,
            size
        ], function(err) {
            if (err) return callback(err);
            
            // 保存模板文件到服务器
            Template.saveTemplateFile(this.lastID, template, (err) => {
                callback(err, this.lastID);
            });
        });
    },

    // 保存模板文件到服务器
    saveTemplateFile: (id, template, callback) => {
        Setting.get('upload_path', (err, uploadPath) => {
            if (err) return callback(err);
            
            const templatesDir = path.join(uploadPath, 'templates');
            
            // 创建模板目录（如果不存在）
            if (!fs.existsSync(templatesDir)) {
                fs.mkdirSync(templatesDir, { recursive: true });
            }
            
            const filePath = path.join(templatesDir, template.filename);
            
            fs.writeFile(filePath, template.content, (err) => {
                if (err) return callback(err);
                
                callback(null);
            });
        });
    },

    // 更新模板
    update: (id, template, callback) => {
        const sql = `
            UPDATE templates
            SET name = ?, filename = ?, content = ?, size = ?
            WHERE id = ?
        `;
        
        // 计算内容大小（字节数）
        const size = Buffer.from(template.content).length;
        
        db.run(sql, [
            template.name,
            template.filename,
            template.content,
            size,
            id
        ], (err) => {
            if (err) return callback(err);
            
            // 更新模板文件
            Template.saveTemplateFile(id, template, callback);
        });
    },

    // 删除模板
    delete: (id, callback) => {
        // 先获取模板信息，以便删除文件
        Template.getById(id, (err, template) => {
            if (err) return callback(err);
            if (!template) return callback(new Error('模板不存在'));
            
            // 删除数据库记录
            db.run('DELETE FROM templates WHERE id = ?', [id], (err) => {
                if (err) return callback(err);
                
                // 删除模板文件
                Setting.get('upload_path', (err, uploadPath) => {
                    if (err) return callback(err);
                    
                    const filePath = path.join(uploadPath, 'templates', template.filename);
                    
                    // 检查文件是否存在
                    if (fs.existsSync(filePath)) {
                        fs.unlink(filePath, callback);
                    } else {
                        callback(null);
                    }
                });
            });
        });
    },

    // 批量删除模板
    deleteMultiple: (ids, callback) => {
        if (!ids.length) return callback(null);
        
        // 获取所有要删除的模板
        const placeholders = ids.map(() => '?').join(',');
        db.all(`SELECT * FROM templates WHERE id IN (${placeholders})`, ids, (err, templates) => {
            if (err) return callback(err);
            
            // 删除数据库记录
            db.run(`DELETE FROM templates WHERE id IN (${placeholders})`, ids, (err) => {
                if (err) return callback(err);
                
                Setting.get('upload_path', (err, uploadPath) => {
                    if (err) return callback(err);
                    
                    const templatesDir = path.join(uploadPath, 'templates');
                    let completed = 0;
                    
                    // 删除文件
                    templates.forEach(template => {
                        const filePath = path.join(templatesDir, template.filename);
                        
                        // 检查文件是否存在
                        if (fs.existsSync(filePath)) {
                            fs.unlink(filePath, () => {
                                completed++;
                                if (completed === templates.length) {
                                    callback(null);
                                }
                            });
                        } else {
                            completed++;
                            if (completed === templates.length) {
                                callback(null);
                            }
                        }
                    });
                });
            });
        });
    }
};

module.exports = Template; 