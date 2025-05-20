/**
 * Debian系统下的domain-manager应用测试脚本
 * 用于检查系统环境和应用所需的各项配置
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 应用根目录
const appRoot = path.resolve(__dirname, '..');

// 彩色日志输出
const log = {
  info: (msg) => console.log('\x1b[36m%s\x1b[0m', '[信息] ' + msg),
  success: (msg) => console.log('\x1b[32m%s\x1b[0m', '[成功] ' + msg),
  warn: (msg) => console.log('\x1b[33m%s\x1b[0m', '[警告] ' + msg),
  error: (msg) => console.log('\x1b[31m%s\x1b[0m', '[错误] ' + msg)
};

// 主测试函数
async function runTests() {
  log.info('开始在Debian系统上测试domain-manager应用...');
  log.info('当前工作目录: ' + process.cwd());
  
  try {
    // 检查系统环境
    await checkSystemEnvironment();
    
    // 检查Node.js环境
    await checkNodeEnvironment();
    
    // 检查SQLite
    await checkSQLite();
    
    // 检查应用依赖
    await checkDependencies();
    
    // 检查文件权限
    await checkFilePermissions();
    
    // 检查网络服务
    await checkNetworkServices();
    
    // 测试数据库初始化
    await testDatabaseInit();
    
    // 总结
    log.success('所有测试完成!');
  } catch (error) {
    log.error('测试过程中发生错误: ' + error.message);
    process.exit(1);
  }
}

// 检查系统环境
async function checkSystemEnvironment() {
  log.info('检查系统环境...');
  
  // 检查操作系统
  const isDebian = await executeCommand('cat /etc/os-release | grep -i debian');
  if (!isDebian) {
    log.warn('当前系统似乎不是Debian，可能会有兼容性问题');
  } else {
    log.success('系统确认为Debian');
  }
  
  // 检查系统版本
  const debianVersion = await executeCommand('cat /etc/debian_version');
  log.info('Debian版本: ' + debianVersion.trim());
  
  // 检查系统资源
  const memInfo = await executeCommand('free -h | grep Mem');
  log.info('内存信息: ' + memInfo.trim());
  
  const diskInfo = await executeCommand('df -h / | tail -1');
  log.info('磁盘信息: ' + diskInfo.trim());
  
  return true;
}

// 检查Node.js环境
async function checkNodeEnvironment() {
  log.info('检查Node.js环境...');
  
  try {
    // 检查Node.js版本
    const nodeVersion = await executeCommand('node -v');
    log.success('Node.js版本: ' + nodeVersion.trim());
    
    // 检查npm版本
    const npmVersion = await executeCommand('npm -v');
    log.success('npm版本: ' + npmVersion.trim());
    
    // 确认版本符合要求
    const nodeVersionNum = nodeVersion.trim().substring(1).split('.')[0];
    if (parseInt(nodeVersionNum) < 14) {
      log.warn('Node.js版本低于推荐版本(14.x)，可能会有兼容性问题');
    }
    
    return true;
  } catch (error) {
    log.error('Node.js检查失败。请确保已安装Node.js和npm');
    log.info('可以使用以下命令安装Node.js (Debian):\n' +
            'curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -\n' +
            'sudo apt-get install -y nodejs');
    throw new Error('Node.js环境检查失败');
  }
}

// 检查SQLite
async function checkSQLite() {
  log.info('检查SQLite...');
  
  try {
    // 检查SQLite版本
    const sqliteVersion = await executeCommand('sqlite3 --version');
    log.success('SQLite版本: ' + sqliteVersion.trim());
    
    return true;
  } catch (error) {
    log.warn('SQLite命令行工具未安装。这不影响应用运行，但对调试可能有帮助');
    log.info('可以使用以下命令安装SQLite命令行工具:\n' +
            'sudo apt-get install -y sqlite3');
    
    // 即使没有SQLite命令行工具，node-sqlite3也可以工作
    return true;
  }
}

// 检查应用依赖
async function checkDependencies() {
  log.info('检查应用依赖...');
  
  // 检查package.json是否存在
  const packageJsonPath = path.join(appRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('找不到package.json文件');
  }
  
  // 检查node_modules是否存在
  const nodeModulesPath = path.join(appRoot, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    log.warn('未找到node_modules目录，需要安装依赖');
    log.info('正在安装依赖，请稍候...');
    
    try {
      await executeCommand('cd ' + appRoot + ' && npm install');
      log.success('依赖安装完成');
    } catch (error) {
      throw new Error('依赖安装失败: ' + error.message);
    }
  } else {
    log.success('依赖已安装');
  }
  
  return true;
}

// 检查文件权限
async function checkFilePermissions() {
  log.info('检查文件权限...');
  
  // 检查data目录
  const dataDir = path.join(appRoot, 'data');
  if (!fs.existsSync(dataDir)) {
    log.info('data目录不存在，尝试创建...');
    try {
      fs.mkdirSync(dataDir);
      log.success('创建data目录成功');
    } catch (error) {
      throw new Error('创建data目录失败: ' + error.message);
    }
  }
  
  // 检查data目录权限
  try {
    // 创建测试文件
    const testFile = path.join(dataDir, 'permission_test.txt');
    fs.writeFileSync(testFile, 'Permission test');
    fs.unlinkSync(testFile);
    log.success('文件权限检查通过，应用有足够权限写入data目录');
  } catch (error) {
    log.error('文件权限检查失败: ' + error.message);
    log.info('请确保应用有足够权限访问data目录:\n' +
            'sudo chown -R ' + os.userInfo().username + ' ' + dataDir);
    throw new Error('文件权限检查失败');
  }
  
  return true;
}

// 检查网络服务
async function checkNetworkServices() {
  log.info('检查网络服务...');
  
  // 检查3000端口是否被占用
  try {
    const portCheck = await executeCommand('netstat -tuln | grep :3000');
    if (portCheck.trim()) {
      log.warn('端口3000已被占用，应用可能无法启动。请检查端口占用情况');
    } else {
      log.success('端口3000未被占用，可以正常启动应用');
    }
  } catch (error) {
    // netstat可能未安装，忽略错误
    log.info('无法检查端口状态，请确保端口3000未被占用');
  }
  
  return true;
}

// 测试数据库初始化
async function testDatabaseInit() {
  log.info('测试数据库初始化...');
  
  // 导入数据库模块
  try {
    const dbPath = path.join(appRoot, 'config', 'db.js');
    if (!fs.existsSync(dbPath)) {
      throw new Error('找不到数据库配置文件: ' + dbPath);
    }
    
    log.info('尝试加载数据库模块...');
    const db = require(dbPath);
    log.success('数据库模块加载成功');
    
    // 检查数据库文件是否创建
    const dbFilePath = path.join(appRoot, 'data', 'domain_manager.db');
    if (fs.existsSync(dbFilePath)) {
      const stats = fs.statSync(dbFilePath);
      log.success('数据库文件已创建，大小: ' + Math.round(stats.size / 1024) + 'KB');
    } else {
      throw new Error('数据库文件未创建，初始化可能失败');
    }
    
    return true;
  } catch (error) {
    log.error('数据库初始化测试失败: ' + error.message);
    throw error;
  }
}

// 执行命令并返回结果
function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

// 创建简单的服务器测试应用启动
async function testAppStart() {
  log.info('测试应用启动...');
  
  const appPath = path.join(appRoot, 'app.js');
  if (!fs.existsSync(appPath)) {
    throw new Error('找不到应用入口文件: ' + appPath);
  }
  
  log.info('启动应用(按Ctrl+C终止)...');
  const { spawn } = require('child_process');
  const app = spawn('node', [appPath], { stdio: 'inherit' });
  
  app.on('error', (error) => {
    log.error('应用启动失败: ' + error.message);
  });
  
  return new Promise((resolve) => {
    setTimeout(() => {
      log.info('应用已启动，请访问 http://localhost:3000 测试');
      log.info('5秒后自动终止测试...');
      
      setTimeout(() => {
        app.kill();
        resolve(true);
      }, 5000);
    }, 2000);
  });
}

// 运行所有测试
runTests().catch(error => {
  log.error('测试失败: ' + error.message);
  process.exit(1);
}); 