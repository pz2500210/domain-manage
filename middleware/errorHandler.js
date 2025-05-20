/**
 * 错误处理中间件
 * 用于统一处理应用程序中的错误
 */

const logger = require('../utils/logger');

/**
 * 未找到路由处理
 */
const notFoundHandler = (req, res, next) => {
    const error = new Error(`未找到: ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
};

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    
    // 记录错误到日志
    if (statusCode === 404) {
        logger.warn(`404错误: ${err.message}`);
    } else {
        logger.error(`服务器错误: ${err.message}`);
        logger.error(err.stack || '没有错误堆栈信息');
    }
    
    // API请求返回JSON格式错误
    if (req.originalUrl.startsWith('/api')) {
        return res.status(statusCode).json({
            error: err.message,
            statusCode,
            timestamp: new Date().toISOString()
        });
    }
    
    // 网页请求返回错误页面
    res.status(statusCode);
    
    // 根据错误类型返回不同的错误页面
    if (statusCode === 404) {
        return res.render('error', { 
            title: '页面未找到',
            statusCode,
            message: '您请求的页面不存在',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
    
    return res.render('error', {
        title: '服务器错误',
        statusCode,
        message: '服务器发生错误，请稍后再试',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
};

module.exports = {
    notFoundHandler,
    errorHandler
}; 