/**
 * 日志工具模块
 * 用于记录应用程序日志到控制台和文件
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// 日志级别
const LOG_LEVELS = {
    ERROR: 0,   // 错误
    WARN: 1,    // 警告
    INFO: 2,    // 信息
    DEBUG: 3    // 调试
};

// 颜色定义
const COLORS = {
    ERROR: '\x1b[31m%s\x1b[0m', // 红色
    WARN: '\x1b[33m%s\x1b[0m',  // 黄色
    INFO: '\x1b[36m%s\x1b[0m',  // 青色
    DEBUG: '\x1b[90m%s\x1b[0m', // 灰色
    SUCCESS: '\x1b[32m%s\x1b[0m' // 绿色
};

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志文件路径
const LOG_FILE = path.join(LOG_DIR, 'application.log');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'error.log');

// 当前日志级别，默认为 INFO
let currentLogLevel = process.env.LOG_LEVEL 
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] 
    : LOG_LEVELS.INFO;

/**
 * 将日志写入文件
 * @param {string} message 日志消息
 * @param {string} level 日志级别
 */
function writeToFile(message, level) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;

    // 写入到主日志文件
    fs.appendFile(LOG_FILE, logEntry, err => {
        if (err) console.error(`写入日志文件失败: ${err.message}`);
    });

    // 如果是错误级别，也写入到错误日志文件
    if (level === 'ERROR') {
        fs.appendFile(ERROR_LOG_FILE, logEntry, err => {
            if (err) console.error(`写入错误日志文件失败: ${err.message}`);
        });
    }
}

/**
 * 格式化参数
 * @param {Array} args 参数数组
 * @returns {string} 格式化后的字符串
 */
function formatArgs(args) {
    return args.map(arg => {
        if (typeof arg === 'object') {
            return util.inspect(arg, { depth: null });
        }
        return arg;
    }).join(' ');
}

const logger = {
    /**
     * 设置日志级别
     * @param {string} level 日志级别 ('ERROR', 'WARN', 'INFO', 'DEBUG')
     */
    setLevel(level) {
        if (LOG_LEVELS[level] !== undefined) {
            currentLogLevel = LOG_LEVELS[level];
            logger.info(`日志级别设置为: ${level}`);
        } else {
            logger.warn(`无效的日志级别: ${level}`);
        }
    },

    /**
     * 记录错误日志
     * @param {...any} args 日志参数
     */
    error(...args) {
        const message = formatArgs(args);
        console.error(COLORS.ERROR, `[错误] ${message}`);
        writeToFile(message, 'ERROR');
    },

    /**
     * 记录警告日志
     * @param {...any} args 日志参数
     */
    warn(...args) {
        if (currentLogLevel >= LOG_LEVELS.WARN) {
            const message = formatArgs(args);
            console.warn(COLORS.WARN, `[警告] ${message}`);
            writeToFile(message, 'WARN');
        }
    },

    /**
     * 记录信息日志
     * @param {...any} args 日志参数
     */
    info(...args) {
        if (currentLogLevel >= LOG_LEVELS.INFO) {
            const message = formatArgs(args);
            console.info(COLORS.INFO, `[信息] ${message}`);
            writeToFile(message, 'INFO');
        }
    },

    /**
     * 记录调试日志
     * @param {...any} args 日志参数
     */
    debug(...args) {
        if (currentLogLevel >= LOG_LEVELS.DEBUG) {
            const message = formatArgs(args);
            console.debug(COLORS.DEBUG, `[调试] ${message}`);
            writeToFile(message, 'DEBUG');
        }
    },

    /**
     * 记录成功日志
     * @param {...any} args 日志参数
     */
    success(...args) {
        if (currentLogLevel >= LOG_LEVELS.INFO) {
            const message = formatArgs(args);
            console.log(COLORS.SUCCESS, `[成功] ${message}`);
            writeToFile(message, 'SUCCESS');
        }
    },

    /**
     * 记录请求日志
     * @param {Object} req 请求对象
     * @param {Object} res 响应对象
     * @param {Function} next 下一个中间件
     */
    request(req, res, next) {
        const start = Date.now();
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        logger.info(`请求: ${req.method} ${req.url} 来自 ${ip}`);
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            const level = res.statusCode >= 400 ? 'warn' : 'info';
            
            logger[level](`响应: ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
        });
        
        next();
    }
};

module.exports = logger; 