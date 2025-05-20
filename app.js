const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const serversRouter = require('./routes/api/servers');
const deployRouter = require('./routes/api/deploy');
const http = require('http');
const io = require('socket.io');

// 导入日志模块
const logger = require('./utils/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// 设置环境变量
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// 输出启动信息
logger.info('初始化应用程序...');
logger.info(`运行环境: ${process.env.NODE_ENV}`);

// 数据库初始化，确保在导入模型前完成
logger.info('初始化数据库...');
try {
    const db = require('./config/db');
} catch (error) {
    logger.error('数据库初始化失败:', error.message);
    logger.error(error.stack);
    process.exit(1);
}

// 导入模型
logger.info('加载应用模型...');
const Domain = require('./models/domain');
const Server = require('./models/server');
const Certificate = require('./models/certificate');
const Template = require('./models/template');
const Setting = require('./models/setting');
const DeployedDomain = require('./models/deployed_domain');

try {
    // 确认模型加载
    logger.info('模型加载成功');
} catch (error) {
    logger.error('模型加载失败:', error.message);
    logger.error(error.stack);
    process.exit(1);
}

// 创建Express应用
const app = express();
const port = process.env.PORT || 3000;

// 设置视图引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 设置布局
app.use(expressLayouts);
app.set('layout', 'layout');

// 中间件
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 请求日志中间件
app.use(logger.request);

// 路由
app.get('/', (req, res) => {
    res.render('index', { title: '域名管理系统' });
});

// 添加/app路由，重定向到主页
app.get('/app', (req, res) => {
    res.redirect('/');
});

// 功能页面路由
app.get('/domains', (req, res) => {
    res.render('domains', { title: '域名管理' });
});

app.get('/servers', (req, res) => {
    res.render('servers', { title: '服务器管理' });
});

app.get('/certificates', (req, res) => {
    res.render('certificates', { title: '证书管理' });
});

app.get('/templates', (req, res) => {
    res.render('templates', { title: '模板管理' });
});

app.get('/settings', (req, res) => {
    res.render('settings', { title: '系统设置' });
});

// API路由

// 域名API
app.get('/api/domains', (req, res, next) => {
    Domain.getAll((err, domains) => {
        if (err) {
            return next(err);
        }
        res.json(domains);
    });
});

app.get('/api/domains/:id', (req, res, next) => {
    Domain.getById(req.params.id, (err, domain) => {
        if (err) {
            return next(err);
        }
        if (!domain) {
            return res.status(404).json({ error: '域名不存在' });
        }
        res.json(domain);
    });
});

app.post('/api/domains', (req, res, next) => {
    const domain = {
        domain_name: req.body.domain_name,
        registrar: req.body.registrar,
        url: req.body.url,
        username: req.body.username,
        password: req.body.password,
        expiry_date: req.body.expiry_date,
        server_id: req.body.server_id,
        notes: req.body.notes
    };

    Domain.create(domain, (err, id) => {
        if (err) {
            return next(err);
        }
        res.status(201).json({ id, message: '域名添加成功' });
    });
});

app.put('/api/domains/:id', (req, res, next) => {
    const domain = {
        domain_name: req.body.domain_name,
        registrar: req.body.registrar,
        url: req.body.url,
        username: req.body.username,
        password: req.body.password,
        expiry_date: req.body.expiry_date,
        cert_expiry_date: req.body.cert_expiry_date,
        server_id: req.body.server_id,
        status: req.body.status,
        notes: req.body.notes
    };

    Domain.update(req.params.id, domain, (err) => {
        if (err) {
            return next(err);
        }
        res.json({ message: '域名更新成功' });
    });
});

app.delete('/api/domains/:id', (req, res, next) => {
    Domain.delete(req.params.id, (err) => {
        if (err) {
            return next(err);
        }
        res.json({ message: '域名删除成功' });
    });
});

app.delete('/api/domains', (req, res, next) => {
    const ids = req.body.ids;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '无效的请求参数' });
    }

    Domain.deleteMultiple(ids, (err) => {
        if (err) {
            return next(err);
        }
        res.json({ message: '域名批量删除成功' });
    });
});

// 服务器API
app.use('/api/servers', serversRouter);

// 证书API
app.get('/api/certificates', (req, res, next) => {
    Certificate.getAll((err, certificates) => {
        if (err) {
            return next(err);
        }
        res.json(certificates);
    });
});

// 模板API
app.get('/api/templates', (req, res, next) => {
    Template.getAll((err, templates) => {
        if (err) {
            return next(err);
        }
        res.json(templates);
    });
});

// 获取单个模板API
app.get('/api/templates/:id', (req, res, next) => {
    Template.getById(req.params.id, (err, template) => {
        if (err) {
            return next(err);
        }
        if (!template) {
            return res.status(404).json({ error: '模板不存在' });
        }
        res.json(template);
    });
});

// 设置API
app.get('/api/settings', (req, res, next) => {
    Setting.getAll((err, settings) => {
        if (err) {
            return next(err);
        }
        
        // 过滤敏感信息
        const safeSettings = settings.filter(setting => setting.setting_key !== 'password');
        res.json(safeSettings);
    });
});

app.post('/api/settings/:key', (req, res, next) => {
    const key = req.params.key;
    const value = req.body.value;
    
    if (key === 'password') {
        Setting.changePassword(value, (err) => {
            if (err) {
                return next(err);
            }
            res.json({ message: '密码更新成功' });
        });
    } else {
        Setting.set(key, value, (err) => {
            if (err) {
                return next(err);
            }
            res.json({ message: '设置更新成功' });
        });
    }
});

app.post('/api/settings/verify-password', (req, res, next) => {
    Setting.verifyPassword(req.body.password, (err, isMatch) => {
        if (err) {
            return next(err);
        }
        res.json({ isValid: isMatch });
    });
});

app.post('/api/settings/reset', (req, res, next) => {
    Setting.resetToDefault((err) => {
        if (err) {
            return next(err);
        }
        res.json({ message: '设置已重置为默认值' });
    });
});

// 获取域名凭据（需要验证）
app.get('/api/domains/:id/credentials', (req, res, next) => {
  // 实际应用中应该验证用户权限
  Domain.getById(req.params.id, (err, domain) => {
    if (err) return next(err);
    if (!domain) return res.status(404).json({ error: '域名不存在' });
    
    res.json({
      username: domain.username,
      password: domain.password
    });
  });
});

// 应用配置到服务器
app.post('/api/apply-configuration', (req, res, next) => {
  // 实现配置应用逻辑
  const { domainId, serverId, certificateId, templateId } = req.body;
  
  // 调用相应模型方法执行配置
  // ...
  
  res.json({ success: true, message: '配置已成功应用' });
});

// 证书更新路由
app.post('/api/certificates/:id/update', (req, res, next) => {
    Certificate.update(req.params.id, { expiry_date: new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0] }, (err) => {
        if (err) return next(err);
        res.json({ success: true, message: '证书更新成功' });
    });
});

// 批量删除证书
app.delete('/api/certificates', (req, res, next) => {
    const ids = req.body.ids;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '无效的请求参数' });
    }
    
    Certificate.deleteMultiple(ids, (err) => {
        if (err) return next(err);
        res.json({ message: '证书批量删除成功' });
    });
});

// 批量删除服务器
app.delete('/api/servers', (req, res, next) => {
    const ids = req.body.ids;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '无效的请求参数' });
    }
    
    Server.deleteMultiple(ids, (err) => {
        if (err) return next(err);
        res.json({ message: '服务器批量删除成功' });
    });
});

// 批量删除模板
app.delete('/api/templates', (req, res, next) => {
    const ids = req.body.ids;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '无效的请求参数' });
    }
    
    Template.deleteMultiple(ids, (err) => {
        if (err) return next(err);
        res.json({ message: '模板批量删除成功' });
    });
});

// 添加服务器API
app.post('/api/servers', (req, res, next) => {
    const server = {
        name: req.body.name,
        ip: req.body.ip,
        port: req.body.port || 22,
        username: req.body.username,
        auth_type: req.body.auth_type,
        password: req.body.password,
        key_file: req.body.key_file,
        webroot: req.body.webroot,
        notes: req.body.notes
    };

    Server.create(server, (err, id) => {
        if (err) {
            return next(err);
        }
        res.status(201).json({ id, message: '服务器添加成功' });
    });
});

// 添加模板API
app.post('/api/templates', (req, res, next) => {
    const template = {
        name: req.body.name,
        filename: req.body.filename,
        content: req.body.content
    };

    Template.create(template, (err, id) => {
        if (err) {
            return next(err);
        }
        res.status(201).json({ id, message: '模板添加成功' });
    });
});

// 更新模板API
app.put('/api/templates/:id', (req, res, next) => {
    const id = req.params.id;
    const template = {
        name: req.body.name,
        filename: req.body.filename,
        content: req.body.content
    };

    Template.update(id, template, (err) => {
        if (err) {
            return next(err);
        }
        res.json({ message: '模板更新成功' });
    });
});

// 添加新的API路由
app.use('/api/deploy', deployRouter);

// 添加已部署域名API
app.get('/api/deployed-domains', (req, res, next) => {
    DeployedDomain.getAll((err, domains) => {
        if (err) {
            return next(err);
        }
        res.json(domains);
    });
});

// 导入并注册删除域名模块
const rmRouter = require('./routes/api/rmdomain');
app.use('/api/rmdomain', rmRouter);

// 添加未找到路由处理
app.use(notFoundHandler);

// 添加全局错误处理
app.use(errorHandler);

// 初始化部署域名表
DeployedDomain.init((err) => {
    if (err) {
        logger.error('初始化部署域名表失败:', err.message);
    } else {
        logger.info('部署域名表初始化完成');
    }
});

// 创建HTTP服务器
const server = http.createServer(app);
const ioServer = io(server);

ioServer.on('connection', (socket) => {
  console.log('客户端已连接');
  
  socket.on('disconnect', () => {
    console.log('客户端已断开连接');
  });
});

// 启动服务器
server.listen(port, () => {
    logger.success(`服务器运行在 http://localhost:${port}`);
    logger.info(`日志路径: ${path.join(__dirname, 'logs')}`);
});

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
    logger.error('未捕获的异常:', err.message);
    logger.error(err.stack);
    // 尝试优雅关闭
    gracefulShutdown();
});

// 处理未处理的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝:', reason);
    // 不退出进程，只记录错误
});

// 处理终止信号
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 优雅关闭函数
function gracefulShutdown() {
    logger.info('正在关闭应用...');
    server.close(() => {
        logger.info('HTTP服务器已关闭');
        // 关闭数据库连接等资源
        process.exit(0);
    });
    
    // 如果10秒内没有正常关闭，强制退出
    setTimeout(() => {
        logger.error('无法正常关闭，强制退出');
        process.exit(1);
    }, 10000);
}

module.exports = app; 