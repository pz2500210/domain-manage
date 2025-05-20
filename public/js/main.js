document.addEventListener('DOMContentLoaded', function() {
    // 系统密码 - 实际应用中应该从服务器获取或使用更安全的方式
    let SYSTEM_PASSWORD = "admin123";
    
    // 当前选中的域名ID
    let currentDomainId = null;
    
    // 全局变量保存临时配置信息
    let tempDeployConfig = null;
    
    // 按钮全局变量，避免重复声明
    let saveConfigBtn = null;
    let applyConfigBtn = null;
    
    // 注册监听器，在模态框隐藏后自动清理
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('hidden.bs.modal', function() {
            cleanupModal();
        });
    });
    
    // 域名凭据数据 - 实际应用中这些信息应该是从服务器获取的
    // 这里仅为演示，实际应用中不应该将凭据存储在前端JavaScript中
    const domainCredentials = {
        "1": { username: "user123", password: "secure123" },
        "2": { username: "admin456", password: "pass456" }
    };
    
    // 详情按钮点击事件 - 填充域名详情模态框
    const detailButtons = document.querySelectorAll('.btn-detail');
    detailButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 获取按钮上的数据
            const domainData = {
                domain: this.getAttribute('data-domain'),
                registrar: this.getAttribute('data-registrar'),
                url: this.getAttribute('data-url'),
                id: this.getAttribute('data-id')
            };
            
            // 保存当前域名ID
            currentDomainId = domainData.id;
            
            // 填充基本信息
            document.getElementById('detailDomain').textContent = domainData.domain;
            document.getElementById('detailRegistrar').textContent = domainData.registrar;
            document.getElementById('detailUrl').textContent = domainData.url;
            
            // 重置敏感信息输入框
            document.getElementById('detailUsername').value = '';
            document.getElementById('detailPassword').value = '';
        });
    });
    
    // 查看凭据按钮点击 - 打开密码验证模态框
    document.getElementById('showCredentialsBtn').addEventListener('click', function() {
        // 关闭当前模态框
        const domainDetailModal = bootstrap.Modal.getInstance(document.getElementById('domainDetailModal'));
        domainDetailModal.hide();
        
        // 显示密码验证模态框
        const passwordVerifyModal = new bootstrap.Modal(document.getElementById('passwordVerifyModal'));
        passwordVerifyModal.show();
        
        // 清除错误信息和密码输入
        document.getElementById('passwordError').style.display = 'none';
        document.getElementById('securityPassword').value = '';
    });
    
    // 验证密码按钮点击
    document.getElementById('verifyPasswordBtn').addEventListener('click', function() {
        const passwordInput = document.getElementById('securityPassword').value;
        
        fetch('/api/settings/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: passwordInput })
        })
        .then(response => response.json())
        .then(result => {
            if (result.isValid) {
                // 密码正确处理逻辑
                const passwordVerifyModal = bootstrap.Modal.getInstance(document.getElementById('passwordVerifyModal'));
                passwordVerifyModal.hide();
                
                // 显示域名详情和敏感信息
                showDomainCredentials(currentDomainId);
            } else {
                // 密码错误
                document.getElementById('passwordError').style.display = 'block';
            }
        });
    });
    
    function showDomainCredentials(domainId) {
        fetch(`/api/domains/${domainId}/credentials`)
            .then(response => response.json())
            .then(credentials => {
                // 重新打开域名详情模态框
                const domainDetailModal = new bootstrap.Modal(document.getElementById('domainDetailModal'));
                domainDetailModal.show();
                
                document.getElementById('detailUsername').value = credentials.username;
                document.getElementById('detailUsername').type = "text";
                document.getElementById('detailPassword').value = credentials.password;
                document.getElementById('detailPassword').type = "text";
            });
    }
    
    // 域名选择变化时更新下方的设置面板
    const domainSelect = document.getElementById('domainSelect');
    domainSelect.addEventListener('change', function() {
        const selectedDomain = this.value;
        console.log(`选择了域名: ${selectedDomain}`);
        
        // 更新摘要信息
        if (selectedDomain) {
            const selectedOption = this.options[this.selectedIndex];
            document.getElementById('summaryDomain').textContent = selectedOption.text;
            document.querySelector('li:nth-child(1) .badge').className = 'badge bg-success rounded-pill';
            document.querySelector('li:nth-child(1) .badge').textContent = '已选择';
        } else {
            document.getElementById('summaryDomain').textContent = '未选择';
            document.querySelector('li:nth-child(1) .badge').className = 'badge bg-danger rounded-pill';
            document.querySelector('li:nth-child(1) .badge').textContent = '未选择';
        }
        
        // 更新进度条
        updateProgressBar();
    });
    
    // 服务器选择变化时更新摘要信息
    const serverSelect = document.getElementById('serverSelect');
    if (serverSelect) {
        serverSelect.addEventListener('change', function() {
            const selectedServer = this.value;
            console.log(`选择了服务器: ${selectedServer}`);
            
            // 更新摘要信息
            if (selectedServer) {
                const selectedOption = this.options[this.selectedIndex];
                document.getElementById('summaryServer').textContent = selectedOption.text;
                document.querySelector('li:nth-child(2) .badge').className = 'badge bg-success rounded-pill';
                document.querySelector('li:nth-child(2) .badge').textContent = '已选择';
            } else {
                document.getElementById('summaryServer').textContent = '未选择';
                document.querySelector('li:nth-child(2) .badge').className = 'badge bg-danger rounded-pill';
                document.querySelector('li:nth-child(2) .badge').textContent = '未选择';
            }
            
            // 检查服务器Nginx状态并更新UI
            if (selectedServer) {
                checkNginxStatus();
            }
            
            // 更新进度条
            updateProgressBar();
        });
    }
    
    // 证书选择变化时更新摘要信息
    const certificateSelect = document.getElementById('certificateSelect');
    if (certificateSelect) {
        certificateSelect.addEventListener('change', function() {
            const selectedCertificate = this.value;
            console.log(`选择了证书: ${selectedCertificate}`);
            const certStatusBadge = document.querySelector('.function-panel:nth-child(1) .badge');
            
            // 更新摘要信息
            if (selectedCertificate) {
                const selectedOption = this.options[this.selectedIndex];
                document.getElementById('summaryCertificate').textContent = selectedOption.text;
                document.querySelector('li:nth-child(3) .badge').className = 'badge bg-success rounded-pill';
                document.querySelector('li:nth-child(3) .badge').textContent = '已选择';
                if (certStatusBadge) {
                    certStatusBadge.className = 'badge bg-success';
                    certStatusBadge.textContent = '已选择';
                }
            } else {
                document.getElementById('summaryCertificate').textContent = '未配置';
                document.querySelector('li:nth-child(3) .badge').className = 'badge bg-danger rounded-pill';
                document.querySelector('li:nth-child(3) .badge').textContent = '未选择';
                if (certStatusBadge) {
                    certStatusBadge.className = 'badge bg-danger';
                    certStatusBadge.textContent = '未安装';
                }
            }
            
            // 更新进度条
            updateProgressBar();
        });
    }
    
    // 模板选择变化时更新摘要信息
    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.addEventListener('change', function() {
            const selectedTemplate = this.value;
            console.log(`选择了模板: ${selectedTemplate}`);
            const templateStatusBadge = document.querySelector('.function-panel:nth-child(2) .badge');
            
            // 更新摘要信息
            if (selectedTemplate) {
                const selectedOption = this.options[this.selectedIndex];
                document.getElementById('summaryTemplate').textContent = selectedOption.text;
                document.querySelector('li:nth-child(4) .badge').className = 'badge bg-success rounded-pill';
                document.querySelector('li:nth-child(4) .badge').textContent = '已选择';
                if (templateStatusBadge) {
                    templateStatusBadge.className = 'badge bg-success';
                    templateStatusBadge.textContent = '已选择';
                }
            } else {
                document.getElementById('summaryTemplate').textContent = '未配置';
                document.querySelector('li:nth-child(4) .badge').className = 'badge bg-danger rounded-pill';
                document.querySelector('li:nth-child(4) .badge').textContent = '未选择';
                if (templateStatusBadge) {
                    templateStatusBadge.className = 'badge bg-secondary';
                    templateStatusBadge.textContent = '未选择';
                }
            }
            
            // 更新进度条
            updateProgressBar();
        });
    }
    
    // 验证方式切换
    const authTypeSelect = document.getElementById('newServerAuthType');
    if (authTypeSelect) {
        authTypeSelect.addEventListener('change', function() {
            const passwordFields = document.getElementById('passwordAuthFields');
            const keyFields = document.getElementById('keyAuthFields');
            
            if (this.value === 'password') {
                passwordFields.style.display = 'block';
                keyFields.style.display = 'none';
                document.getElementById('newServerPassword').required = false;
                document.getElementById('newServerKeyFile').required = false;
            } else {
                passwordFields.style.display = 'none';
                keyFields.style.display = 'block';
                document.getElementById('newServerPassword').required = false;
                document.getElementById('newServerKeyFile').required = false;
            }
        });
    }
    
    // 保存域名按钮点击事件
    const saveDomainBtn = document.getElementById('saveDomainBtn');
    if (saveDomainBtn) {
        saveDomainBtn.addEventListener('click', function() {
            const form = document.getElementById('addDomainForm');
            if (form.checkValidity()) {
                // 获取表单数据
                let expiryDate = document.getElementById('newDomainExpiry').value;
                
                // 日期格式转换，处理多种可能的日期格式
                try {
                    // 尝试处理中文日期格式 "2024年12月31日"
                    if (expiryDate.includes('年') && expiryDate.includes('月') && expiryDate.includes('日')) {
                        const parts = expiryDate.match(/(\d+)年(\d+)月(\d+)日/);
                        if (parts && parts.length === 4) {
                            expiryDate = `${parts[1]}-${parts[2]}-${parts[3]}`;
                        }
                    }
                    // 如果包含斜杠，转换为标准格式
                    else if (expiryDate.includes('/')) {
                        const parts = expiryDate.split('/');
                        if (parts.length === 3) {
                            expiryDate = `${parts[0]}-${parts[1]}-${parts[2]}`;
                        }
                    }
                } catch (e) {
                    console.error('日期格式转换失败', e);
                    // 保持原始输入
                }
                
                const domainData = {
                    domain_name: document.getElementById('newDomainName').value,
                    registrar: document.getElementById('newDomainRegistrar').value,
                    url: document.getElementById('newDomainUrl').value, // 这里保持原样，不做URL验证
                    expiry_date: expiryDate,
                    username: document.getElementById('newDomainUsername').value,
                    password: document.getElementById('newDomainPassword').value,
                    notes: document.getElementById('newDomainNote').value
                };
                
                // 检查是添加还是编辑模式
                const isEditMode = this.getAttribute('data-mode') === 'edit';
                const domainId = this.getAttribute('data-id');
                
                let apiUrl = '/api/domains';
                let method = 'POST';
                
                if (isEditMode && domainId) {
                    apiUrl = `/api/domains/${domainId}`;
                    method = 'PUT';
                }
                
                fetch(apiUrl, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(domainData)
                })
                .then(response => response.json())
                .then(result => {
                    // 关闭模态框
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addDomainModal'));
                    modal.hide();
                    
                    // 清理模态框
                    cleanupModal();
                    
                    // 重新加载域名列表
                    loadDomains();
                    loadDeployedDomains(); // 确保同时更新已部署域名列表
                    loadDomainSelect();
                    
                    // 重置表单和按钮
                    form.reset();
                    this.removeAttribute('data-mode');
                    this.removeAttribute('data-id');
                    this.textContent = '保存';
                    document.getElementById('addDomainModalLabel').textContent = '增加域名';
                })
                .catch(error => {
                    console.error('保存域名失败:', error.message);
                    // 确保错误情况下也清理模态框
                    cleanupModal();
                });
            } else {
                form.reportValidity();
            }
        });
    }
    
    // 保存服务器按钮点击事件
    const saveServerBtn = document.getElementById('saveServerBtn');
    if (saveServerBtn) {
        saveServerBtn.addEventListener('click', function() {
            const form = document.getElementById('addServerForm');
            if (form.checkValidity()) {
                const serverIp = document.getElementById('newServerIP').value;
                
                // 验证IP地址
                if (!serverIp) {
                    alert('服务器IP地址不能为空');
                    document.getElementById('newServerIP').focus();
                    return;
                }
                
                // 检查IP格式，允许主机名和本地环境
                const isValidIP = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(serverIp);
                const isLocalhost = serverIp === 'localhost' || serverIp === '127.0.0.1';
                const isHostname = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*$/.test(serverIp);
                
                if (!isValidIP && !isLocalhost && !isHostname) {
                    alert(`IP地址/主机名 "${serverIp}" 格式无效，请输入有效的IPv4地址或主机名`);
                    document.getElementById('newServerIP').focus();
                    return;
                }
                
                const serverData = {
                    name: document.getElementById('newServerName').value,
                    ip: serverIp,
                    port: document.getElementById('newServerPort').value || 22,
                    username: document.getElementById('newServerUsername').value,
                    auth_type: document.getElementById('newServerAuthType').value,
                    password: document.getElementById('newServerPassword').value,
                    key_file: document.getElementById('newServerKeyFile').files[0]?.name || '',
                    webroot: document.getElementById('newServerWebRoot').value,
                    notes: document.getElementById('newServerNote').value
                };
                
                fetch('/api/servers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serverData)
                })
                .then(response => response.json())
                .then(result => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addServerModal'));
                    modal.hide();
                    
                    // 手动移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                    
                    // 重新加载服务器数据
                    loadServers(); // 重新加载服务器列表
                    loadServerSelect(); // 更新服务器选择下拉框
                    form.reset();
                })
                .catch(error => {
                    console.error('添加服务器失败:', error.message);
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                });
            } else {
                form.reportValidity();
            }
        });
    }
    
    // 修改保存面板按钮处理函数
    const savePanelSettingsBtn = document.getElementById('savePanelSettingsBtn');
    if (savePanelSettingsBtn) {
        savePanelSettingsBtn.addEventListener('click', function() {
            const username = document.getElementById('panelUsername').value;
            const password = document.getElementById('panelPassword').value;
            const confirmPassword = document.getElementById('confirmPanelPassword').value;
            
            if (!username || !password) {
                // 更改为控制台提示，不再弹出对话框
                console.error('请填写账号和密码');
                return;
            }
            
            if (password !== confirmPassword) {
                // 更改为控制台提示，不再弹出对话框
                console.error('两次输入的密码不一致');
                return;
            }
            
            // 保存用户名
            fetch('/api/settings/username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: username })
            })
            .then(response => response.json());
            
            // 保存密码
            fetch('/api/settings/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: password })
            })
            .then(response => response.json())
            .then(() => {
                // 更改为控制台提示，不再弹出对话框
                console.log('面板设置已保存');
            });
        });
    }
    
    // 更新进度条
    function updateProgressBar() {
        const progressBar = document.querySelector('.progress-bar');
        if (!progressBar) return;
        
        const items = document.querySelectorAll('.list-group-item .badge');
        let configured = 0;
        
        items.forEach(badge => {
            if (badge.textContent === '已选择') {
                configured++;
            }
        });
        
        const percentage = Math.round((configured / items.length) * 100);
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = `${percentage}%`;
        
        if (percentage === 100) {
            progressBar.className = 'progress-bar bg-success';
        } else {
            progressBar.className = 'progress-bar bg-warning';
        }
    }
    
    // 保存配置按钮点击事件
    saveConfigBtn = document.getElementById('saveConfigBtn');
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', function() {
            console.log('saveConfigBtn 点击事件被触发');
            // 收集配置信息
            const domainSelect = document.getElementById('domainSelect');
            const serverSelect = document.getElementById('serverSelect');
            const certificateSelect = document.getElementById('certificateSelect');
            const templateSelect = document.getElementById('templateSelect');
            
            // 检查是否所有必要项已选择
            if (!domainSelect.value || !serverSelect.value || 
                !certificateSelect.value || !templateSelect.value) {
                // 使用日志窗口显示错误
                addLogEntry('错误: 请先完成所有配置项', 'error');
                return;
            }
            
            // 获取选择的域名名称
            const domainName = domainSelect.options[domainSelect.selectedIndex].text;
            
            // 首先检查域名是否已部署
            addLogEntry('正在检查域名部署状态...', 'info');
            
            fetch('/api/deploy/check-domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domainName })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    if (result.exists) {
                        // 域名已经部署，显示更详细的确认对话框
                        const serverInfo = result.domain.server_name && result.domain.server_ip 
                            ? `${result.domain.server_name} (IP: ${result.domain.server_ip})`
                            : (result.domain.server_name || result.domain.server_ip || '未知服务器');
                        
                        const deployDate = result.domain.deploy_date 
                            ? new Date(result.domain.deploy_date).toLocaleString() 
                            : '未知时间';
                        
                        if (!confirm(`警告: 域名 "${domainName}" 已经部署!\n\n` +
                                     `该域名当前部署在: ${serverInfo}\n` +
                                     `部署日期: ${deployDate}\n` +
                                     `继续操作将覆盖现有部署。确定要继续吗？`)) {
                            addLogEntry('操作已取消: 域名已部署', 'warn');
                            return;
                        }
                        addLogEntry('继续部署: 将覆盖现有部署', 'warn');
                    }
                    
                    // 验证服务器配置
                    validateAndPrepare();
                } else {
                    addLogEntry(`检查域名失败: ${result.error || '未知错误'}`, 'error');
                }
            })
            .catch(error => {
                addLogEntry(`检查域名请求失败: ${error.message}`, 'error');
            });
            
            // 验证服务器并准备部署
            function validateAndPrepare() {
                addLogEntry('正在验证服务器配置...', 'info');
                
                fetch(`/api/servers/${serverSelect.value}/validate`)
                    .then(response => response.json())
                    .then(validation => {
                        if (!validation.valid) {
                            // 在日志窗口显示服务器验证错误
                            addLogEntry('服务器配置无效:', 'error');
                            validation.errors.forEach(error => {
                                addLogEntry(`- ${error}`, 'error');
                            });
                            addLogEntry('请先更新服务器配置后再保存。', 'error');
                            return;
                        }
                        
                        // 服务器有效，继续保存配置
                        const domain = {
                            id: domainSelect.value,
                            name: domainSelect.options[domainSelect.selectedIndex].text
                        };
                        
                        const server = {
                            id: serverSelect.value,
                            name: serverSelect.options[serverSelect.selectedIndex].text
                        };
                        
                        const certificate = {
                            id: certificateSelect.value,
                           // type: certificateSelect.options[certificateSelect.selectedIndex].text
                           type: certificateSelect.value
                        };
                        
                        const template = {
                            id: templateSelect.value,
                            name: templateSelect.options[templateSelect.selectedIndex].text
                        };
                        
                        // 创建配置对象
                        tempDeployConfig = {
                            domain,
                            server,
                            certificate,
                            template,
                            timestamp: new Date().getTime()
                        };
                        
                        // 在日志窗口显示准备信息
                        addLogEntry('正在准备部署文件...', 'info');
                        
                        // 向服务器请求生成部署文件
                        fetch('/api/deploy/prepare', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(tempDeployConfig)
                        })
                        .then(response => response.json())
                        .then(result => {
                            if (result.success) {
                                tempDeployConfig.fileId = result.fileId; // 保存文件ID以便后续使用
                                
                                // 使用日志窗口显示成功消息
                                addLogEntry('配置已保存成功!', 'success');
                                addLogEntry('您现在可以将配置应用到服务器。', 'success');
                                
                                // 启用应用按钮
                                applyConfigBtn = document.getElementById('applyConfigBtn');
                                if (applyConfigBtn) {
                                    applyConfigBtn.classList.remove('disabled');
                                }
                                
                                // 不再在操作区显示提示
                            } else {
                                // 使用日志窗口显示错误消息
                                addLogEntry(`配置准备失败: ${result.error}`, 'error');
                            }
                        })
                        .catch(error => {
                            addLogEntry(`配置保存请求失败: ${error.message}`, 'error');
                        });
                    })
                    .catch(error => {
                        addLogEntry(`验证服务器失败: ${error.message}`, 'error');
                    });
            }
        });
    }
    
    // 应用到服务器按钮点击事件
    applyConfigBtn = document.getElementById('applyConfigBtn');
    if (applyConfigBtn) {
        applyConfigBtn.addEventListener('click', function() {
            console.log('applyConfigBtn 点击事件被触发');
            // 检查是否已保存配置
            if (!tempDeployConfig || !tempDeployConfig.fileId) {
                addLogEntry('请先保存配置', 'error');
                return;
            }
            
            // 使用日志窗口显示部署状态
            addLogEntry('正在部署到服务器，请稍候...', 'info');
            
            // 请求服务器执行部署
            fetch('/api/deploy/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    fileId: tempDeployConfig.fileId
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    // 使用后端返回的hasCompletionMessage字段判断部署是否真正完成
                    if (result.hasCompletionMessage) {
                        // 显示成功消息
                        addLogEntry('部署成功完成！', 'success');
                        
                        // 标记为已应用，然后清除临时配置
                        if (tempDeployConfig) {
                            tempDeployConfig.applied = true; 
                            tempDeployConfig = null;
                        }
                        
                        // 如果有输出日志，显示完整日志
                        if (result.output) {
                            // 清除之前的日志
                            const deploymentLog = document.querySelector('.deployment-log');
                            if (deploymentLog) {
                                // 保留之前的成功消息
                                const successMsg = deploymentLog.querySelector('.log-success');
                                deploymentLog.innerHTML = '';
                                if (successMsg) deploymentLog.appendChild(successMsg);
                            }
                            
                            // 添加开始标题
                            addLogEntry('===== 部署日志开始 =====', 'success');
                            
                            // 将日志按行分割并添加
                            const lines = result.output.split('\n');
                            lines.forEach(line => {
                                // 根据行内容自动判断类型
                                let type = 'info';
                                if (line.includes('错误') || line.includes('Error') || 
                                    line.includes('Failed') || line.includes('失败')) {
                                    type = 'error';
                                } else if (line.includes('成功') || line.includes('完成')) {
                                    type = 'success';
                                } else if (line.includes('警告') || line.includes('Warning')) {
                                    type = 'warn';
                                }
                                
                                // 只添加非空行
                                if (line.trim()) {
                                    addLogEntry(line, type);
                                }
                            });
                            
                            // 添加结束提示
                            addLogEntry('===== 部署日志结束 =====', 'success');
                            
                            // 刷新已部署域名列表
                            setTimeout(() => {
                                loadDeployedDomains();
                            }, 1000);
                        }
                    } else {
                        // 没有找到部署完成的信息，可能部署未成功完成
                        addLogEntry('警告: 未检测到部署完成标志，部署可能未成功完成', 'warn');
                        
                        // 显示错误消息
                        addLogEntry('部署状态不明确: ' + (result.message || '未收到部署完成信息'), 'warn');
                        
                        // 如果有输出日志，显示完整日志
                        if (result.output) {
                            // 清除之前的日志
                            const deploymentLog = document.querySelector('.deployment-log');
                            if (deploymentLog) {
                                // 保留之前的警告消息
                                const warnMsg = deploymentLog.querySelector('.log-warn');
                                deploymentLog.innerHTML = '';
                                if (warnMsg) deploymentLog.appendChild(warnMsg);
                            }
                            
                            // 添加开始标题
                            addLogEntry('===== 部署日志开始 =====', 'warn');
                            
                            // 将日志按行分割并添加
                            const lines = result.output.split('\n');
                            lines.forEach(line => {
                                // 根据行内容自动判断类型
                                let type = 'info';
                                if (line.includes('错误') || line.includes('Error') || 
                                    line.includes('Failed') || line.includes('失败')) {
                                    type = 'error';
                                } else if (line.includes('成功') || line.includes('完成')) {
                                    type = 'success';
                                } else if (line.includes('警告') || line.includes('Warning')) {
                                    type = 'warn';
                                }
                                
                                // 只添加非空行
                                if (line.trim()) {
                                    addLogEntry(line, type);
                                }
                            });
                            
                            // 添加结束提示
                            addLogEntry('===== 部署日志结束 =====', 'warn');
                        }
                    }
                } else {
                    // 显示错误消息
                    addLogEntry(`部署失败: ${result.error || '未知错误'}`, 'error');
                    
                    // 如果有输出日志，显示完整日志
                    if (result.output) {
                        // 清除之前的日志
                        const deploymentLog = document.querySelector('.deployment-log');
                        if (deploymentLog) {
                            // 保留之前的错误消息
                            const errorMsg = deploymentLog.querySelector('.log-error');
                            deploymentLog.innerHTML = '';
                            if (errorMsg) deploymentLog.appendChild(errorMsg);
                        }
                        
                        // 添加错误标题
                        addLogEntry('===== 部署日志开始 =====', 'error');
                        
                        // 将日志按行分割并添加
                        const lines = result.output.split('\n');
                        lines.forEach(line => {
                            // 根据行内容自动判断类型
                            let type = 'info';
                            if (line.includes('错误') || line.includes('Error') || 
                                line.includes('Failed') || line.includes('失败')) {
                                type = 'error';
                            } else if (line.includes('成功') || line.includes('完成')) {
                                type = 'success';
                            } else if (line.includes('警告') || line.includes('Warning')) {
                                type = 'warn';
                            }
                            
                            // 只添加非空行
                            if (line.trim()) {
                                addLogEntry(line, type);
                            }
                        });
                        
                        // 添加结束提示
                        addLogEntry('===== 部署日志结束 =====', 'error');
                    }
                }
            })
            .catch(error => {
                // 显示连接错误消息
                addLogEntry(`连接错误: ${error.message}`, 'error');
            });
        });
    }
    
    // 页面离开前检查
    window.addEventListener('beforeunload', function(e) {
        if (tempDeployConfig && !tempDeployConfig.applied) {
            const message = '配置已保存但尚未应用到服务器，确定要离开吗？';
            e.returnValue = message;
            
            // 注意：现代浏览器的安全限制使得在beforeunload中无法清除tempDeployConfig
            // 用户点击"离开"后，浏览器刷新或关闭，无法执行后续代码
            // 必须在用户点击"留在此页面"时保持状态不变
            return message;
        }
    });

    // 标签切换检查
    document.querySelectorAll('#settingsTabs button').forEach(tab => {
        tab.addEventListener('click', function(e) {
            if (tempDeployConfig && !tempDeployConfig.applied) {
                if (!confirm('配置已保存但尚未应用到服务器，确定要切换标签吗？')) {
                    e.preventDefault();
                    e.stopPropagation();
                } else {
                    // 用户确认离开，清除临时配置
                    tempDeployConfig = null;
                    console.log('用户确认离开，临时配置已清除');
                }
            }
        });
    });
    
    // 选择所有域名复选框
    const selectAllDomains = document.getElementById('selectAllDomains');
    if (selectAllDomains) {
        selectAllDomains.addEventListener('change', function() {
            const domainCheckboxes = document.querySelectorAll('.domain-checkbox');
            domainCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            
            // 更新删除按钮状态
            const deleteBtn = document.getElementById('deleteDomainBtn');
            if (deleteBtn) {
                deleteBtn.disabled = !this.checked;
            }
        });
    }
    
    // 域名复选框变化
    const domainCheckboxes = document.querySelectorAll('.domain-checkbox');
    if (domainCheckboxes.length > 0) {
        domainCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const checkedCount = document.querySelectorAll('.domain-checkbox:checked').length;
                const deleteBtn = document.getElementById('deleteDomainBtn');
                if (deleteBtn) {
                    deleteBtn.disabled = checkedCount === 0;
                }
                
                // 更新全选复选框状态
                const selectAll = document.getElementById('selectAllDomains');
                if (selectAll) {
                    selectAll.checked = checkedCount === domainCheckboxes.length;
                    selectAll.indeterminate = checkedCount > 0 && checkedCount < domainCheckboxes.length;
                }
            });
        });
    } else {
        console.log('没有域名复选框元素需要绑定事件');
    }
    
    // 初始更新进度条
    if (document.querySelector('.progress-bar')) {
        updateProgressBar();
    }
    
    // 加载主数据
    loadDomains();
    loadDeployedDomains(); // 加载已部署域名数据
    loadDomainSelect();
    loadServerSelect();
    loadCertificateSelect();
    loadTemplateSelect();
    loadServers();
    loadCertificates();
    loadTemplates();
    
    // 加载统计数据
    loadStatistics();
    
    // 绑定事件监听器
    bindEventListeners();

    // 服务器全选功能
    const selectAllServers = document.getElementById('selectAllServers');
    if (selectAllServers) {
        selectAllServers.addEventListener('change', function() {
            const serverCheckboxes = document.querySelectorAll('.server-checkbox');
            serverCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            
            // 更新删除按钮状态
            const deleteBtn = document.getElementById('deleteServerBtn');
            if (deleteBtn) {
                deleteBtn.disabled = !this.checked;
            }
        });
    }

    // 证书全选功能
    const selectAllCertificates = document.getElementById('selectAllCertificates');
    if (selectAllCertificates) {
        selectAllCertificates.addEventListener('change', function() {
            const certificateCheckboxes = document.querySelectorAll('.certificate-checkbox');
            certificateCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            
            // 更新删除按钮状态
            const deleteBtn = document.getElementById('deleteCertificateBtn');
            if (deleteBtn) {
                deleteBtn.disabled = !this.checked;
            }
        });
    }

    // 模板全选功能
    const selectAllTemplates = document.getElementById('selectAllTemplates');
    if (selectAllTemplates) {
        selectAllTemplates.addEventListener('change', function() {
            const templateCheckboxes = document.querySelectorAll('.template-checkbox');
            templateCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            
            // 更新删除按钮状态
            const deleteBtn = document.getElementById('deleteTemplateBtn');
            if (deleteBtn) {
                deleteBtn.disabled = !this.checked;
            }
        });
    }

    // 服务器复选框变化处理
    const serverCheckboxes = document.querySelectorAll('.server-checkbox');
    if (serverCheckboxes.length > 0) {
        serverCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const checkedCount = document.querySelectorAll('.server-checkbox:checked').length;
                const deleteBtn = document.getElementById('deleteServerBtn');
                if (deleteBtn) {
                    deleteBtn.disabled = checkedCount === 0;
                }
                
                // 更新全选复选框状态
                const selectAll = document.getElementById('selectAllServers');
                if (selectAll) {
                    selectAll.checked = checkedCount === serverCheckboxes.length;
                    selectAll.indeterminate = checkedCount > 0 && checkedCount < serverCheckboxes.length;
                }
            });
        });
    } else {
        console.log('没有服务器复选框元素需要绑定事件');
    }

    // 绑定服务器详情和编辑按钮事件
    bindServerButtons();
    
    console.log('服务器列表加载完成');

    // 绑定证书更新按钮事件
    bindUpdateCertButtons();
    
    console.log('证书列表加载完成');

    // 绑定模板编辑按钮
    bindTemplateEditButtons();
    
    console.log('模板列表加载完成');

    // 绑定查看模板按钮事件
    bindViewTemplateButtons();
    
    // 不要在这里使用viewButtons变量，它还未定义
    console.log('模板相关操作绑定完成');

    // 删除服务器按钮点击事件
    const deleteServerBtn = document.getElementById('deleteServerBtn');
    if (deleteServerBtn) {
        deleteServerBtn.addEventListener('click', function() {
            const selectedIds = Array.from(document.querySelectorAll('.server-checkbox:checked'))
                .map(checkbox => checkbox.value);
                
            if (selectedIds.length === 0) return;
            
            if (confirm(`确定要删除选中的${selectedIds.length}个服务器吗？`)) {
                fetch('/api/servers', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                })
                .then(response => response.json())
                .then(result => {
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                    
                    loadServers();
                })
                .catch(error => {
                    console.error('删除服务器失败:', error.message);
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                });
            }
        });
    }

    // 删除证书按钮点击事件
    const deleteCertBtn = document.getElementById('deleteCertificateBtn');
    if (deleteCertBtn) {
        deleteCertBtn.addEventListener('click', function() {
            const selectedIds = Array.from(document.querySelectorAll('.certificate-checkbox:checked'))
                .map(checkbox => checkbox.value);
                
            if (selectedIds.length === 0) return;
            
            if (confirm(`确定要删除选中的${selectedIds.length}个证书吗？`)) {
                fetch('/api/certificates', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                })
                .then(response => response.json())
                .then(result => {
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                    
                    loadCertificates();
                })
                .catch(error => {
                    console.error('删除证书失败:', error.message);
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                });
            }
        });
    }

    // 删除域名按钮点击事件
    const deleteDomainBtn = document.getElementById('deleteDomainBtn');
    if (deleteDomainBtn) {
        deleteDomainBtn.addEventListener('click', function() {
            const selectedIds = Array.from(document.querySelectorAll('.domain-checkbox:checked'))
                .map(checkbox => checkbox.value);
                
            if (selectedIds.length === 0) return;
            
            if (confirm(`确定要删除选中的${selectedIds.length}个域名吗？`)) {
                fetch('/api/domains', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                })
                .then(response => response.json())
                .then(result => {
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                    
                    loadDomains();
                    loadDeployedDomains(); // 确保同时更新已部署域名列表
                    loadDomainSelect();
                })
                .catch(error => {
                    console.error('删除域名失败:', error.message);
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                });
            }
        });
    }
    
    // 删除模板按钮点击事件
    const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
    if (deleteTemplateBtn) {
        deleteTemplateBtn.addEventListener('click', function() {
            const selectedIds = Array.from(document.querySelectorAll('.template-checkbox:checked'))
                .map(checkbox => checkbox.value);
                
            if (selectedIds.length === 0) return;
            
            if (confirm(`确定要删除选中的${selectedIds.length}个模板吗？`)) {
                fetch('/api/templates', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                })
                .then(response => response.json())
                .then(result => {
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                    
                    // 重新加载模板列表和模板下拉框
                    loadTemplates();
                    loadTemplateSelect(); // 确保更新模板选择下拉框
                })
                .catch(error => {
                    console.error('删除模板失败:', error.message);
                    // 确保错误情况下也清理模态框
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                });
            }
        });
    }

    // 添加到main.js
    document.getElementById('saveTemplateBtn').addEventListener('click', function() {
        const form = document.getElementById('addTemplateForm');
        if (form.checkValidity()) {
            const templateData = {
                name: document.getElementById('newTemplateName').value,
                filename: document.getElementById('newTemplateFilename').value + '.html',
                content: document.getElementById('newTemplateContent').value
            };
            
            // 检查是添加还是编辑模式
            const isEditMode = this.getAttribute('data-mode') === 'edit';
            const templateId = this.getAttribute('data-id');
            
            let apiUrl = '/api/templates';
            let method = 'POST';
            
            if (isEditMode && templateId) {
                apiUrl = `/api/templates/${templateId}`;
                method = 'PUT';
            }
            
            fetch(apiUrl, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templateData)
            })
            .then(response => response.json())
            .then(result => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('addTemplateModal'));
                modal.hide();
                
                // 清理模态框
                cleanupModal();
                
                // 重新加载模板数据
                loadTemplates();
                loadTemplateSelect(); // 更新模板选择下拉框
                
                // 重置表单和按钮
                form.reset();
                this.removeAttribute('data-mode');
                this.removeAttribute('data-id');
                this.textContent = '保存';
                document.getElementById('addTemplateModalLabel').textContent = '添加模板';
            })
            .catch(error => {
                console.error('保存模板失败:', error.message);
                // 移除模态框背景
                cleanupModal();
            });
        } else {
            form.reportValidity();
        }
    });

    // 绑定详情页面的编辑按钮
    const editServerBtn = document.getElementById('editServerBtn');
    if (editServerBtn) {
        editServerBtn.addEventListener('click', function() {
            const serverId = document.getElementById('editServerId').value;
            
            // 关闭详情模态框
            const serverDetailModal = bootstrap.Modal.getInstance(document.getElementById('serverDetailModal'));
            serverDetailModal.hide();
            
            // 获取服务器详情并打开编辑模态框
            fetch(`/api/servers/${serverId}`)
                .then(response => response.json())
                .then(server => {
                    // 填充编辑模态框
                    document.getElementById('editServerId').value = server.id;
                    document.getElementById('editServerName').value = server.name || '';
                    document.getElementById('editServerIP').value = server.ip || '';
                    document.getElementById('editServerPort').value = server.port || '22';
                    document.getElementById('editServerUsername').value = server.username || '';
                    document.getElementById('editServerPassword').value = ''; // 不回显密码
                    document.getElementById('editServerAuthType').value = server.auth_type || 'password';
                    document.getElementById('editServerWebRoot').value = server.webroot || '';
                    document.getElementById('editServerNote').value = server.notes || '';
                    
                    // 根据认证方式显示不同的表单字段
                    if (server.auth_type === 'key') {
                        document.getElementById('editPasswordAuthFields').style.display = 'none';
                        document.getElementById('editKeyAuthFields').style.display = 'block';
                    } else {
                        document.getElementById('editPasswordAuthFields').style.display = 'block';
                        document.getElementById('editKeyAuthFields').style.display = 'none';
                    }
                    
                    // 显示模态框
                    const editServerModal = new bootstrap.Modal(document.getElementById('editServerModal'));
                    editServerModal.show();
                })
                .catch(error => {
                    console.error('获取服务器信息失败:', error);
                    alert('获取服务器信息失败: ' + error.message);
                });
        });
    }
    
    // 绑定编辑模态框的认证方式切换事件
    const editServerAuthType = document.getElementById('editServerAuthType');
    if (editServerAuthType) {
        editServerAuthType.addEventListener('change', function() {
            const passwordFields = document.getElementById('editPasswordAuthFields');
            const keyFields = document.getElementById('editKeyAuthFields');
            
            if (this.value === 'password') {
                passwordFields.style.display = 'block';
                keyFields.style.display = 'none';
            } else {
                passwordFields.style.display = 'none';
                keyFields.style.display = 'block';
            }
        });
    }
    
    // 绑定更新服务器按钮点击事件
    const updateServerBtn = document.getElementById('updateServerBtn');
    if (updateServerBtn) {
        updateServerBtn.addEventListener('click', function() {
            const form = document.getElementById('editServerForm');
            if (form.checkValidity()) {
                const serverIp = document.getElementById('editServerIP').value;
                
                // 验证IP地址
                if (!serverIp) {
                    alert('服务器IP地址不能为空');
                    document.getElementById('editServerIP').focus();
                    return;
                }
                
                // 检查IP格式，允许主机名和本地环境
                const isValidIP = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(serverIp);
                const isLocalhost = serverIp === 'localhost' || serverIp === '127.0.0.1';
                const isHostname = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*$/.test(serverIp);
                
                if (!isValidIP && !isLocalhost && !isHostname) {
                    alert(`IP地址/主机名 "${serverIp}" 格式无效，请输入有效的IPv4地址或主机名`);
                    document.getElementById('editServerIP').focus();
                    return;
                }
                
                const serverId = document.getElementById('editServerId').value;
                
                const serverData = {
                    name: document.getElementById('editServerName').value,
                    ip: serverIp,
                    port: document.getElementById('editServerPort').value || 22,
                    username: document.getElementById('editServerUsername').value,
                    auth_type: document.getElementById('editServerAuthType').value,
                    webroot: document.getElementById('editServerWebRoot').value,
                    notes: document.getElementById('editServerNote').value
                };
                
                // 只有在密码字段有值时才发送
                if (document.getElementById('editServerPassword').value) {
                    serverData.password = document.getElementById('editServerPassword').value;
                }
                
                // 只在密钥认证模式下处理密钥文件
                if (serverData.auth_type === 'key') {
                    const keyFileInput = document.getElementById('editServerKeyFile');
                    if (keyFileInput.files.length > 0) {
                        serverData.key_file = keyFileInput.files[0].name;
                    }
                }
                
                fetch(`/api/servers/${serverId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(serverData)
                })
                .then(response => response.json())
                .then(result => {
                    if (result.success) {
                        // 关闭模态框
                        const modal = bootstrap.Modal.getInstance(document.getElementById('editServerModal'));
                        modal.hide();
                        
                        // 移除模态框背景
                        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                        document.body.classList.remove('modal-open');
                        document.body.style.removeProperty('overflow');
                        document.body.style.removeProperty('padding-right');
                        
                        // 重新加载服务器列表
                        loadServers();
                        loadServerSelect();
                        
                        console.log('服务器更新成功');
                    } else {
                        console.error('更新服务器失败:', result.error);
                        alert('更新服务器失败: ' + result.error);
                    }
                })
                .catch(error => {
                    console.error('更新服务器请求失败:', error.message);
                    alert('更新服务器请求失败: ' + error.message);
                    
                    // 移除模态框背景
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('overflow');
                    document.body.style.removeProperty('padding-right');
                });
            } else {
                form.reportValidity();
            }
        });
    }
    
    console.log('服务器按钮事件绑定完成');

    // 监听用户名输入，自动设置网站根目录
    const newServerUsername = document.getElementById('newServerUsername');
    if (newServerUsername) {
        newServerUsername.addEventListener('blur', function() {
            const username = this.value.trim();
            const webroot = document.getElementById('newServerWebRoot');
            if (username && webroot) {
                if (username === 'root') {
                    webroot.value = '/root';
                } else {
                    webroot.value = `/home/${username}`;
                }
                console.log(`根据用户名 "${username}" 自动设置网站根目录: ${webroot.value}`);
            }
        });
    }
    
    // 编辑服务器时也自动设置网站根目录
    const editServerUsername = document.getElementById('editServerUsername');
    if (editServerUsername) {
        editServerUsername.addEventListener('blur', function() {
            const username = this.value.trim();
            const webroot = document.getElementById('editServerWebRoot');
            if (username && webroot) {
                if (username === 'root') {
                    webroot.value = '/root';
                } else {
                    webroot.value = `/home/${username}`;
                }
                console.log(`根据用户名 "${username}" 自动设置网站根目录: ${webroot.value}`);
            }
        });
    }

    // 绑定服务器按钮事件
    bindServerButtons();

    // 部署日志相关代码
    const deploymentLog = document.getElementById('deploymentLog');
    const clearLogBtn = document.getElementById('clearLogBtn');
    const copyLogBtn = document.getElementById('copyLogBtn');
    const toggleLogBtn = document.getElementById('toggleLogBtn');
    const logContainer = document.getElementById('deploymentLogContainer');

    // 清空日志
    clearLogBtn.addEventListener('click', () => {
        deploymentLog.innerHTML = '<div class="text-center text-muted my-3"><i class="bi bi-info-circle"></i> 日志已清空</div>';
    });

    // 复制日志
    copyLogBtn.addEventListener('click', () => {
        const logText = deploymentLog.innerText;
        navigator.clipboard.writeText(logText).then(() => {
            showToast('日志已复制到剪贴板');
        });
    });

    // 折叠/展开日志
    let logExpanded = true;
    toggleLogBtn.addEventListener('click', () => {
        logExpanded = !logExpanded;
        if (logExpanded) {
            logContainer.style.display = 'block';
            toggleLogBtn.innerHTML = '<i class="bi bi-chevron-up"></i>';
        } else {
            logContainer.style.display = 'none';
            toggleLogBtn.innerHTML = '<i class="bi bi-chevron-down"></i>';
        }
    });

    // 添加日志条目
    function addLogEntry(message, type = 'info') {
        const logEntry = document.createElement('div');
        logEntry.className = `log-${type}`;
        logEntry.textContent = message;
        deploymentLog.appendChild(logEntry);
        deploymentLog.scrollTop = deploymentLog.scrollHeight;
    }

    // WebSocket连接
    function connectWebSocket() {
        const socket = io();
        
        socket.on('deploy-log', (data) => {
            if (data.type === 'stderr') {
                addLogEntry(data.data, 'error');
            } else {
                addLogEntry(data.data, 'info');
            }
        });
        
        return socket;
    }

    // 在页面加载时连接WebSocket
    const socket = connectWebSocket();


});

/**
 * 加载统计数据
 */
function loadStatistics() {
    try {
        // API请求获取数量，这里使用模拟数据
        setTimeout(() => {
            const domainsCount = document.getElementById('domainsCount');
            const serversCount = document.getElementById('serversCount');
            const certificatesCount = document.getElementById('certificatesCount');
            const templatesCount = document.getElementById('templatesCount');
            
            if (domainsCount) domainsCount.textContent = "2";
            if (serversCount) serversCount.textContent = "2";
            if (certificatesCount) certificatesCount.textContent = "2";
            if (templatesCount) templatesCount.textContent = "3";
        }, 500);
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// API 通用函数
const API = {
    get: async (url) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`请求失败: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API 请求错误:', error);
            throw error;
        }
    },
    
    post: async (url, data) => {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(`请求失败: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API 请求错误:', error);
            throw error;
        }
    },
    
    put: async (url, data) => {
        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(`请求失败: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API 请求错误:', error);
            throw error;
        }
    },
    
    delete: async (url) => {
        try {
            const response = await fetch(url, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error(`请求失败: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API 请求错误:', error);
            throw error;
        }
    }
};

function loadDomains() {
    console.log('开始加载域名列表...');
    fetch('/api/domains')
        .then(response => {
            console.log('域名API响应状态:', response.status);
            return response.json();
        })
        .then(domains => {
            console.log(`获取到${domains.length}个域名`);
            // 更新主页域名表格
            const mainTbody = document.querySelector('.table-fixed-header tbody');
            if (mainTbody) {
                mainTbody.innerHTML = '';
                domains.forEach(domain => {
                    let serverIPDisplay = '-';
                    if (domain.server_ip) {
                        serverIPDisplay = domain.server_ip;
                    } else if (domain.server_name) {
                        serverIPDisplay = domain.server_name;
                    } else if (domain.server_id) {
                        serverIPDisplay = `<span class="text-warning">正在获取...</span>`;
                    }
                    mainTbody.innerHTML += `
                        <tr data-domain-id="${domain.id}" data-bcid="${domain.bcid || ''}">
                            <td>${domain.domain_name}</td>
                            <td>${domain.registrar || '-'}</td>
                            <td>
                                <button class="btn btn-sm btn-info btn-detail" 
                                    data-bs-toggle="modal" 
                                    data-bs-target="#domainDetailModal"
                                    data-domain="${domain.domain_name}"
                                    data-registrar="${domain.registrar || '-'}"
                                    data-url="${domain.url || '-'}"
                                    data-id="${domain.id}">
                                    查看详情
                                </button>
                            </td>
                            <td>${domain.expiry_date || '-'}</td>
                            <td>${domain.cert_expiry_date || '暂无证书'}</td>
                            <td>${serverIPDisplay}</td>
                            <td><span class="badge bg-${domain.status === '在线' ? 'success' : 'warning'}">${domain.status || '未知'}</span></td>
                            <td>${domain.notes || '-'}</td>
                            <td>
                                <button class="btn btn-sm btn-danger btn-delete-domain" 
                                    data-bcid="${domain.bcid || ''}" 
                                    data-domain="${domain.domain_name}" 
                                    data-server-ip="${domain.server_ip || ''}">
                                    <i class="bi bi-trash"></i> 删除
                                </button>
                            </td>
                        </tr>
                    `;
                });
                // 绑定删除事件
                document.querySelectorAll('.btn-delete-domain').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const bcid = this.getAttribute('data-bcid');
                        const domainName = this.getAttribute('data-domain');
                        const serverIp = this.getAttribute('data-server-ip');
                        if (bcid) {
                            if (confirm(`确定要删除域名 ${domainName} 吗？此操作不可恢复！`)) {
                                fetch('/api/deploy/delete-domain', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ bcid })
                                })
                                .then(res => res.json())
                                .then(result => {
                                    if (result.success) {
                                        loadDomains();
                                        loadDeployedDomains();
                                    } else {
                                        alert('删除失败: ' + result.error);
                                    }
                                });
                            }
                        } else if (domainName && serverIp) {
                            if (confirm(`确定要删除域名 ${domainName} 吗？此操作不可恢复！`)) {
                                fetch(`/api/servers/ip/${serverIp}`)
                                    .then(response => response.json())
                                    .then(server => {
                                        if (!server || !server.id) {
                                            throw new Error(`找不到服务器信息 (IP: ${serverIp})`);
                                        }
                                        return fetch('/api/deploy/delete-domain', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ domainName, serverId: server.id })
                                        });
                                    })
                                    .then(res => res.json())
                                    .then(result => {
                                        if (result.success) {
                                            loadDomains();
                                            loadDeployedDomains();
                                        } else {
                                            alert('删除失败: ' + result.error);
                                        }
                                    })
                                    .catch(error => {
                                        alert('删除失败: ' + error.message);
                                    });
                            }
                        } else {
                            alert('缺少必要信息，无法删除域名');
                        }
                    });
                });
            }
            // 域名管理表格
            const domainsTbody = document.querySelector('#domains-tab-pane tbody');
            if (domainsTbody) {
                domainsTbody.innerHTML = '';
                domains.forEach(domain => {
                    let serverIPDisplay = '-';
                    if (domain.server_ip) {
                        serverIPDisplay = domain.server_ip;
                    } else if (domain.server_name) {
                        serverIPDisplay = domain.server_name;
                    } else if (domain.server_id) {
                        serverIPDisplay = `<span class="text-warning">已绑定(ID:${domain.server_id})</span>`;
                    }
                    domainsTbody.innerHTML += `
                        <tr data-bcid="${domain.bcid || ''}">
                            <td>
                                <div class="form-check">
                                    <input class="form-check-input domain-checkbox" type="checkbox" value="${domain.id}">
                                </div>
                            </td>
                            <td>${domain.domain_name}</td>
                            <td>${domain.registrar || '-'}</td>
                            <td>${domain.expiry_date || '-'}</td>
                            <td>${domain.cert_expiry_date || '暂无证书'}</td>
                            <td>${serverIPDisplay}</td>
                            <td><span class="badge bg-${domain.status === '在线' ? 'success' : 'warning'}">${domain.status || '未知'}</span></td>
                            <td>
                                <button class="btn btn-sm btn-warning btn-domain-edit" data-id="${domain.id}">
                                    <i class="bi bi-pencil"></i> 编辑
                                </button>
                                <button class="btn btn-sm btn-danger btn-delete-domain" 
                                    data-bcid="${domain.bcid || ''}" 
                                    data-domain="${domain.domain_name}" 
                                    data-server-ip="${domain.server_ip || ''}">
                                    <i class="bi bi-trash"></i> 删除
                                </button>
                            </td>
                        </tr>
                    `;
                });
                // 绑定删除事件
                document.querySelectorAll('#domains-tab-pane .btn-delete-domain').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const bcid = this.getAttribute('data-bcid');
                        const domainName = this.getAttribute('data-domain');
                        const serverIp = this.getAttribute('data-server-ip');
                        if (bcid) {
                            if (confirm(`确定要删除域名 ${domainName} 吗？此操作不可恢复！`)) {
                                fetch('/api/deploy/delete-domain', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ bcid })
                                })
                                .then(res => res.json())
                                .then(result => {
                                    if (result.success) {
                                        loadDomains();
                                        loadDeployedDomains();
                                    } else {
                                        alert('删除失败: ' + result.error);
                                    }
                                });
                            }
                        } else if (domainName && serverIp) {
                            if (confirm(`确定要删除域名 ${domainName} 吗？此操作不可恢复！`)) {
                                fetch(`/api/servers/ip/${serverIp}`)
                                    .then(response => response.json())
                                    .then(server => {
                                        if (!server || !server.id) {
                                            throw new Error(`找不到服务器信息 (IP: ${serverIp})`);
                                        }
                                        return fetch('/api/deploy/delete-domain', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ domainName, serverId: server.id })
                                        });
                                    })
                                    .then(res => res.json())
                                    .then(result => {
                                        if (result.success) {
                                            loadDomains();
                                            loadDeployedDomains();
                                        } else {
                                            alert('删除失败: ' + result.error);
                                        }
                                    })
                                    .catch(error => {
                                        alert('删除失败: ' + error.message);
                                    });
                            }
                        } else {
                            alert('缺少必要信息，无法删除域名');
                        }
                    });
                });
            }
            // ... existing code ...
        });
}

function loadDomainSelect() {
    console.log('开始加载域名下拉框...');
    fetch('/api/domains')
        .then(response => {
            console.log('域名下拉框API响应状态:', response.status);
            return response.json();
        })
        .then(domains => {
            console.log(`下拉框获取到${domains.length}个域名`);
            const select = document.getElementById('domainSelect');
            if (!select) {
                console.error('找不到域名下拉框元素');
                return;
            }
            
            select.innerHTML = '<option value="">--选择域名--</option>';
            
            domains.forEach(domain => {
                select.innerHTML += `<option value="${domain.id}">${domain.domain_name}</option>`;
            });
            
            // 触发选择事件以更新设置面板
            select.dispatchEvent(new Event('change'));
            console.log('域名下拉框加载完成');
        })
        .catch(error => {
            console.error('加载域名下拉框失败:', error);
        });
}

function loadServerSelect() {
    console.log('开始加载服务器下拉框...');
    fetch('/api/servers')
        .then(response => {
            console.log('服务器下拉框API响应状态:', response.status);
            return response.json();
        })
        .then(servers => {
            console.log(`下拉框获取到${servers.length}个服务器`);
            const select = document.getElementById('serverSelect');
            if (!select) {
                console.error('找不到服务器下拉框元素');
                return;
            }
            
            select.innerHTML = '<option value="">--选择服务器--</option>';
            
            servers.forEach(server => {
                select.innerHTML += `<option value="${server.id}">${server.name || server.ip} (${server.ip})</option>`;
            });
            
            // 获取服务器Nginx状态
            if (servers.length > 0) {
                checkNginxStatus();
            }
            console.log('服务器下拉框加载完成');
        })
        .catch(error => {
            console.error('加载证书下拉框失败:', error);
        });
}

function loadCertificateSelect() {
    console.log('开始加载证书下拉框...');
    fetch('/api/certificates')
        .then(response => {
            console.log('证书下拉框API响应状态:', response.status);
            return response.json();
        })
        .then(certificates => {
            console.log(`下拉框获取到${certificates.length}个证书`);
            const select = document.getElementById('certificateSelect');
            if (!select) {
                console.error('找不到证书下拉框元素');
                return;
            }
            
            select.innerHTML = '<option value="">--选择证书--</option>';
            
            // 添加固定的证书类型选项
            select.innerHTML += '<option value="acme">ACME</option>';
            select.innerHTML += '<option value="buypass">必应</option>';
            
            certificates.forEach(cert => {
                if (cert.status === '有效') {
                    select.innerHTML += `<option value="${cert.id}">${cert.name} (${cert.domain_name || '未知域名'})</option>`;
                }
            });
            
            // 触发选择事件以更新UI
            select.dispatchEvent(new Event('change'));
            console.log('证书下拉框加载完成');
        })
        .catch(error => {
            console.error('加载证书下拉框失败:', error);
        });
}

function loadTemplateSelect() {
    console.log('开始加载模板下拉框...');
    fetch('/api/templates')
        .then(response => {
            console.log('模板下拉框API响应状态:', response.status);
            return response.json();
        })
        .then(templates => {
            console.log(`下拉框获取到${templates.length}个模板`);
            const select = document.getElementById('templateSelect');
            if (!select) {
                console.error('找不到模板下拉框元素');
                return;
            }
            
            select.innerHTML = '<option value="">--选择模板--</option>';
            
            templates.forEach(template => {
                select.innerHTML += `<option value="${template.id}">${template.name}</option>`;
            });
            
            // 触发选择事件以更新UI
            select.dispatchEvent(new Event('change'));
            console.log('模板下拉框加载完成');
        })
        .catch(error => {
            console.error('加载模板下拉框失败:', error);
        });
}

function bindEventListeners() {
    console.log('开始绑定事件监听器...');
    
    // 证书更新按钮
    bindUpdateCertButtons();
    
    // 绑定编辑按钮事件
    bindDomainEditButtons();
    bindServerButtons(); // 改为使用已有函数，不使用bindServerEditButtons
    bindTemplateEditButtons();
    
    // 绑定刷新状态按钮事件
    const refreshStatusBtn = document.querySelector('.refresh-status-btn');
    if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener('click', function() {
            // 调用SSH刷新功能而不是简单检查
            refreshNginxStatus();
            
            // 添加旋转动画效果
            const icon = this.querySelector('.bi-arrow-clockwise');
            icon.classList.add('rotate-animation');
            
            // 1秒后移除动画效果
            setTimeout(() => {
                icon.classList.remove('rotate-animation');
            }, 1000);
        });
    }
    
    console.log('事件监听器绑定完成');
}

function bindDetailButtons() {
    const detailButtons = document.querySelectorAll('.btn-detail');
    detailButtons.forEach(button => {
        button.addEventListener('click', function() {
            const domainData = {
                domain: this.getAttribute('data-domain'),
                registrar: this.getAttribute('data-registrar'),
                url: this.getAttribute('data-url'),
                id: this.getAttribute('data-id')
            };
            
            // 保存当前域名ID
            currentDomainId = domainData.id;
            
            // 填充基本信息
            document.getElementById('detailDomain').textContent = domainData.domain;
            document.getElementById('detailRegistrar').textContent = domainData.registrar;
            document.getElementById('detailUrl').textContent = domainData.url;
            
            // 重置敏感信息输入框
            document.getElementById('detailUsername').value = '';
            document.getElementById('detailPassword').value = '';
        });
    });
}

function checkNginxStatus() {
    // 获取当前选中的服务器
    const serverSelect = document.getElementById('serverSelect');
    if (!serverSelect || !serverSelect.value) return;
    
    const serverId = serverSelect.value;
    const statusBadge = document.querySelector('.function-panel:nth-child(1) .badge');
    
    // 首先从数据库获取最新状态
    fetch(`/api/servers/${serverId}/nginx-status`)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                updateNginxStatusUI(result);
            } else {
                console.error('获取Nginx状态失败:', result.error);
                if (statusBadge) {
                    statusBadge.className = 'badge bg-secondary';
                    statusBadge.textContent = '未知';
                }
            }
        })
        .catch(error => {
            console.error('获取Nginx状态失败:', error);
            if (statusBadge) {
                statusBadge.className = 'badge bg-secondary';
                statusBadge.textContent = '未知';
            }
        });
}

// 添加函数：通过SSH检查Nginx状态
function refreshNginxStatus() {
    // 获取当前选中的服务器
    const serverSelect = document.getElementById('serverSelect');
    if (!serverSelect || !serverSelect.value) return;
    
    const serverId = serverSelect.value;
    const statusBadge = document.querySelector('.function-panel:nth-child(1) .badge');
    
    // 状态加载中显示
    if (statusBadge) {
        statusBadge.className = 'badge bg-secondary';
        statusBadge.textContent = '检查中...';
    }
    
    // 通过SSH检查Nginx状态
    fetch(`/api/servers/${serverId}/nginx-status/check`)
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                updateNginxStatusUI(result);
            } else {
                console.error('检查Nginx状态失败:', result.error);
                if (statusBadge) {
                    statusBadge.className = 'badge bg-danger';
                    statusBadge.textContent = '检查失败';
                }
            }
        })
        .catch(error => {
            console.error('检查Nginx状态失败:', error);
            if (statusBadge) {
                statusBadge.className = 'badge bg-danger';
                statusBadge.textContent = '检查失败';
            }
        });
}

// 更新Nginx状态UI
function updateNginxStatusUI(statusData) {
    const nginxBadge = document.querySelector('.function-panel:nth-child(1) .badge');
    if (nginxBadge) {
        if (statusData.installed) {
            if (statusData.running) {
                nginxBadge.className = 'badge bg-success';
                nginxBadge.textContent = '运行中';
            } else {
                nginxBadge.className = 'badge bg-warning';
                nginxBadge.textContent = '已安装(未运行)';
            }
        } else {
            nginxBadge.className = 'badge bg-danger';
            nginxBadge.textContent = '未安装';
        }
    }
}

function loadCertificates() {
    console.log('开始加载证书列表...');
    fetch('/api/certificates')
        .then(response => {
            console.log('证书列表API响应状态:', response.status);
            return response.json();
        })
        .then(certificates => {
            console.log(`获取到${certificates.length}个证书`);
            const tbody = document.querySelector('#certificates-tab-pane tbody');
            if (!tbody) {
                console.error('找不到证书表格元素');
                return;
            }
            
            tbody.innerHTML = '';
            certificates.forEach(cert => {
                tbody.innerHTML += `
                    <tr>
                        <td>
                            <div class="form-check">
                                <input class="form-check-input certificate-checkbox" type="checkbox" value="${cert.id}">
                            </div>
                        </td>
                        <td>${cert.domain_name || '-'}</td>
                        <td>${cert.server_name || '-'} (${cert.server_ip || '-'})</td>
                        <td>${cert.name}</td>
                        <td>${cert.expiry_date || '-'}</td>
                        <td><span class="badge bg-${cert.status === '有效' ? 'success' : 'warning'}">${cert.status}</span></td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary btn-update-certificate" 
                                   data-id="${cert.id}">
                                <i class="bi bi-arrow-clockwise"></i> 更新
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            // 绑定复选框事件
            const certificateCheckboxes = document.querySelectorAll('.certificate-checkbox');
            if (certificateCheckboxes.length > 0) {
                certificateCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        const checkedCount = document.querySelectorAll('.certificate-checkbox:checked').length;
                        const deleteBtn = document.getElementById('deleteCertificateBtn');
                        if (deleteBtn) {
                            deleteBtn.disabled = checkedCount === 0;
                        }
                        
                        // 更新全选复选框状态
                        const selectAll = document.getElementById('selectAllCertificates');
                        if (selectAll) {
                            selectAll.checked = checkedCount === certificateCheckboxes.length;
                            selectAll.indeterminate = checkedCount > 0 && checkedCount < certificateCheckboxes.length;
                        }
                    });
                });
            } else {
                console.log('没有证书复选框元素需要绑定事件');
            }
            
            // 绑定证书更新按钮事件
            bindUpdateCertButtons();
            console.log('证书列表加载完成');
        })
        .catch(error => {
            console.error('加载证书列表失败:', error);
        });
}

function bindUpdateCertButtons() {
    const updateCertButtons = document.querySelectorAll('.btn-update-certificate');
    updateCertButtons.forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            updateCertificate(id);
        });
    });
    console.log(`绑定了${updateCertButtons.length}个证书更新按钮事件`);
}

function loadTemplates() {
    console.log('开始加载模板列表...');
    fetch('/api/templates')
        .then(response => {
            console.log('模板列表API响应状态:', response.status);
            return response.json();
        })
        .then(templates => {
            console.log(`获取到${templates.length}个模板`);
            const tbody = document.querySelector('#templates-tab-pane tbody');
            if (!tbody) {
                console.error('找不到模板表格元素');
                return;
            }
            
            tbody.innerHTML = '';
            templates.forEach(template => {
                tbody.innerHTML += `
                    <tr>
                        <td>
                            <div class="form-check">
                                <input class="form-check-input template-checkbox" type="checkbox" value="${template.id}">
                            </div>
                        </td>
                        <td>${template.name}</td>
                        <td>${template.filename}</td>
                        <td>${template.created_at || '-'}</td>
                        <td>${template.size || '-'} 字节</td>
                        <td>
                            <button class="btn btn-sm btn-warning btn-edit-template" data-id="${template.id}">
                                <i class="bi bi-pencil"></i> 编辑
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            // 绑定复选框事件
            const templateCheckboxes = document.querySelectorAll('.template-checkbox');
            if (templateCheckboxes.length > 0) {
                templateCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        const checkedCount = document.querySelectorAll('.template-checkbox:checked').length;
                        const deleteBtn = document.getElementById('deleteTemplateBtn');
                        if (deleteBtn) {
                            deleteBtn.disabled = checkedCount === 0;
                        }
                        
                        // 更新全选复选框状态
                        const selectAll = document.getElementById('selectAllTemplates');
                        if (selectAll) {
                            selectAll.checked = checkedCount === templateCheckboxes.length;
                            selectAll.indeterminate = checkedCount > 0 && checkedCount < templateCheckboxes.length;
                        }
                    });
                });
            } else {
                console.log('没有模板复选框元素需要绑定事件');
            }
            
            // 绑定编辑按钮事件
            bindTemplateEditButtons();
            
            console.log('模板列表加载完成');
        })
        .catch(error => {
            console.error('加载模板列表失败:', error);
        });
}

function bindViewTemplateButtons() {
    const viewButtons = document.querySelectorAll('.btn-view-template');
    viewButtons.forEach(button => {
        button.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const name = this.getAttribute('data-name');
            const filename = this.getAttribute('data-filename');
            
            document.getElementById('viewTemplateName').textContent = name;
            document.getElementById('viewTemplateFilename').textContent = filename;
            
            // 获取模板内容
            fetch(`/api/templates/${id}`)
                .then(response => response.json())
                .then(template => {
                    document.getElementById('viewTemplateContent').textContent = template.content;
                });
        });
    });
    console.log(`绑定了${viewButtons.length}个查看模板按钮事件`);
}

function updateCertificate(id) {
    if (confirm('确定要更新此证书信息吗？这将从服务器获取最新的证书状态。')) {
        fetch(`/api/certificates/${id}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('证书信息更新成功！');
                loadCertificates();
                loadCertificateSelect();
            } else {
                alert('更新证书失败: ' + result.message);
            }
        })
        .catch(error => {
            alert('更新证书失败: ' + error.message);
        });
    }
}

function loadServers() {
    console.log('开始加载服务器列表...');
    fetch('/api/servers')
        .then(response => {
            console.log('服务器列表API响应状态:', response.status);
            return response.json();
        })
        .then(servers => {
            console.log(`获取到${servers.length}个服务器`);
            const tbody = document.querySelector('#servers-tab-pane tbody');
            if (!tbody) {
                console.error('找不到服务器表格元素');
                return;
            }
            
            tbody.innerHTML = '';
            servers.forEach(server => {
                tbody.innerHTML += `
                    <tr>
                        <td>
                            <div class="form-check">
                                <input class="form-check-input server-checkbox" type="checkbox" value="${server.id}">
                            </div>
                        </td>
                        <td>${server.name || '-'}</td>
                        <td>${server.ip}</td>
                        <td>${server.port || '22'}</td>
                        <td>${server.username || '-'}</td>
                        <td>${server.auth_type || '密码'}</td>
                        <td><span class="badge bg-${server.status === '在线' ? 'success' : 'warning'}">${server.status || '未知'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-warning btn-server-edit" 
                                   data-id="${server.id}">
                                <i class="bi bi-pencil"></i> 编辑
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            // 绑定复选框事件
            const serverCheckboxes = document.querySelectorAll('.server-checkbox');
            if (serverCheckboxes.length > 0) {
                serverCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', function() {
                        const checkedCount = document.querySelectorAll('.server-checkbox:checked').length;
                        const deleteBtn = document.getElementById('deleteServerBtn');
                        if (deleteBtn) {
                            deleteBtn.disabled = checkedCount === 0;
                        }
                        
                        // 更新全选复选框状态
                        const selectAll = document.getElementById('selectAllServers');
                        if (selectAll) {
                            selectAll.checked = checkedCount === serverCheckboxes.length;
                            selectAll.indeterminate = checkedCount > 0 && checkedCount < serverCheckboxes.length;
                        }
                    });
                });
            } else {
                console.log('没有服务器复选框元素需要绑定事件');
            }
            
            // 绑定编辑按钮事件
            bindServerEditButtons();
            
            console.log('服务器列表加载完成');
        })
        .catch(error => {
            console.error('加载服务器列表失败:', error);
        });
}

// 绑定服务器详情和编辑按钮事件
function bindServerButtons() {
    // 绑定服务器详情按钮事件
    const serverDetailButtons = document.querySelectorAll('.btn-server-detail');
    serverDetailButtons.forEach(button => {
        button.addEventListener('click', function() {
            const serverId = this.getAttribute('data-id');
            
            // 获取服务器详情
            fetch(`/api/servers/${serverId}`)
                .then(response => response.json())
                .then(server => {
                    // 填充服务器详情模态框
                    document.getElementById('detailServerName').textContent = server.name || '-';
                    document.getElementById('detailServerIP').textContent = server.ip || '-';
                    document.getElementById('detailServerPort').textContent = server.port || '22';
                    document.getElementById('detailServerUsername').textContent = server.username || '-';
                    document.getElementById('detailServerAuthType').textContent = server.auth_type || '密码';
                    document.getElementById('detailServerWebroot').textContent = server.webroot || '-';
                    document.getElementById('detailServerNotes').textContent = server.notes || '-';
                    
                    // 存储当前服务器ID，方便编辑时使用
                    document.getElementById('editServerId').value = server.id;
                    
                    // 显示模态框
                    const serverDetailModal = new bootstrap.Modal(document.getElementById('serverDetailModal'));
                    serverDetailModal.show();
                    
                    // 如果IP地址为空，突出显示
                    const ipElement = document.getElementById('detailServerIP');
                    if (!server.ip) {
                        ipElement.classList.add('text-danger');
                        ipElement.textContent = '未设置 - 请先设置IP地址';
                    } else {
                        ipElement.classList.remove('text-danger');
                    }
                    
                    // 隐藏之前的测试结果
                    const testResult = document.getElementById('ipTestResult');
                    if (testResult) {
                        testResult.style.display = 'none';
                        testResult.textContent = '';
                        testResult.className = 'mt-2';
                    }
                })
                .catch(error => {
                    console.error('获取服务器详情失败:', error);
                    alert('获取服务器详情失败: ' + error.message);
                });
        });
    });
    
    // 绑定服务器编辑按钮事件
    const serverEditButtons = document.querySelectorAll('.btn-server-edit');
    serverEditButtons.forEach(button => {
        button.addEventListener('click', function() {
            const serverId = this.getAttribute('data-id');
            editServer(serverId);
        });
    });
    console.log(`绑定了${serverEditButtons.length}个服务器编辑按钮事件`);
}

// 服务器编辑功能
function editServer(serverId) {
    console.log(`编辑服务器ID: ${serverId}`);
    
    // 获取服务器信息
    fetch(`/api/servers/${serverId}`)
        .then(response => response.json())
        .then(server => {
            // 填充编辑表单
            document.getElementById('editServerId').value = server.id;
            document.getElementById('editServerName').value = server.name || '';
            document.getElementById('editServerIP').value = server.ip || '';
            document.getElementById('editServerPort').value = server.port || '22';
            document.getElementById('editServerUsername').value = server.username || '';
            document.getElementById('editServerPassword').value = ''; // 不显示密码
            document.getElementById('editServerAuthType').value = server.auth_type || 'password';
            document.getElementById('editServerWebRoot').value = server.webroot || '';
            document.getElementById('editServerNote').value = server.notes || '';
            
            // 根据认证方式显示不同的表单字段
            if (server.auth_type === 'key') {
                document.getElementById('editPasswordAuthFields').style.display = 'none';
                document.getElementById('editKeyAuthFields').style.display = 'block';
            } else {
                document.getElementById('editPasswordAuthFields').style.display = 'block';
                document.getElementById('editKeyAuthFields').style.display = 'none';
            }
            
            // 显示模态框
            const editServerModal = new bootstrap.Modal(document.getElementById('editServerModal'));
            editServerModal.show();
        })
        .catch(error => {
            console.error('获取服务器信息失败:', error);
            alert('获取服务器信息失败: ' + error.message);
        });
}

// 绑定模板编辑按钮
function bindTemplateEditButtons() {
    const editButtons = document.querySelectorAll('.btn-edit-template');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const templateId = this.getAttribute('data-id');
            editTemplate(templateId);
        });
    });
    console.log(`绑定了${editButtons.length}个模板编辑按钮事件`);
}

// 模板编辑功能
function editTemplate(templateId) {
    console.log(`编辑模板ID: ${templateId}`);
    
    // 获取模板信息
    fetch(`/api/templates/${templateId}`)
        .then(response => {
            console.log('模板API响应状态:', response.status);
            return response.json();
        })
        .then(template => {
            console.log('获取到模板数据:', template);
            
            // 填充表单
            document.getElementById('newTemplateName').value = template.name || '';
            document.getElementById('newTemplateFilename').value = template.filename ? template.filename.replace('.html', '') : '';
            document.getElementById('newTemplateContent').value = template.content || '';
            
            console.log('设置表单值完成 - 名称:', template.name, '文件名:', template.filename, '内容长度:', template.content?.length || 0);
            
            // 修改模态框标题
            document.getElementById('addTemplateModalLabel').textContent = '编辑模板';
            
            // 修改保存按钮行为
            const saveButton = document.getElementById('saveTemplateBtn');
            saveButton.textContent = '保存更改';
            saveButton.setAttribute('data-mode', 'edit');
            saveButton.setAttribute('data-id', templateId);
            
            // 显示模态框
            const modal = new bootstrap.Modal(document.getElementById('addTemplateModal'));
            modal.show();
        })
        .catch(error => {
            console.error('获取模板信息失败:', error);
            alert('获取模板信息失败: ' + error.message);
        });
}

// 添加通用函数，用于清理模态框和蒙版
function cleanupModal() {
    // 移除所有模态框背景
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    
    // 恢复body样式
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
}

// 绑定域名编辑按钮
function bindDomainEditButtons() {
    const editButtons = document.querySelectorAll('.btn-domain-edit');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const domainId = this.getAttribute('data-id');
            editDomain(domainId);
        });
    });
    console.log(`绑定了${editButtons.length}个域名编辑按钮事件`);
}

// 域名编辑功能
function editDomain(domainId) {
    console.log(`编辑域名ID: ${domainId}`);
    
    // 获取域名信息
    fetch(`/api/domains/${domainId}`)
        .then(response => response.json())
        .then(domain => {
            // 填充编辑表单
            document.getElementById('newDomainName').value = domain.domain_name || '';
            document.getElementById('newDomainRegistrar').value = domain.registrar || '';
            document.getElementById('newDomainUrl').value = domain.url || '';
            document.getElementById('newDomainExpiry').value = domain.expiry_date || '';
            document.getElementById('newDomainUsername').value = domain.username || '';
            document.getElementById('newDomainPassword').value = ''; // 不显示密码
            document.getElementById('newDomainNote').value = domain.notes || '';
            
            // 修改模态框标题
            document.getElementById('addDomainModalLabel').textContent = '编辑域名';
            
            // 修改保存按钮行为
            const saveButton = document.getElementById('saveDomainBtn');
            saveButton.textContent = '保存更改';
            saveButton.setAttribute('data-mode', 'edit');
            saveButton.setAttribute('data-id', domainId);
            
            // 显示模态框
            const modal = new bootstrap.Modal(document.getElementById('addDomainModal'));
            modal.show();
        })
        .catch(error => {
            console.error('获取域名信息失败:', error);
            alert('获取域名信息失败: ' + error.message);
        });
}

// 绑定服务器编辑按钮
function bindServerEditButtons() {
    const editButtons = document.querySelectorAll('.btn-server-edit');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const serverId = this.getAttribute('data-id');
            editServer(serverId);
        });
    });
    console.log(`绑定了${editButtons.length}个服务器编辑按钮事件`);
}

function loadDeployedDomains() {
    console.log('开始加载已部署域名列表...');
    
    // 先获取已部署域名数据
    fetch('/api/deployed-domains')
        .then(response => {
            console.log('已部署域名API响应状态:', response.status);
            return response.json();
        })
        .then(deployedDomains => {
            console.log(`获取到${deployedDomains.length}个已部署域名`);
            
            // 再获取域名管理数据库的数据，用于补充显示域名商、详情、过期时间等信息
            fetch('/api/domains')
                .then(response => response.json())
                .then(managedDomains => {
                    // 创建域名ID到域名管理数据的映射
                    const domainMap = {};
                    managedDomains.forEach(domain => {
                        domainMap[domain.domain_name] = domain;
                    });
                    
                    // 更新已部署域名表格
                    const deployedTbody = document.querySelector('#deployed-domains-table tbody');
                    if (deployedTbody) {
                        deployedTbody.innerHTML = '';
                        
                        deployedDomains.forEach(deployedDomain => {
                            // 尝试从域名管理数据库获取对应域名的信息
                            const managedDomain = domainMap[deployedDomain.domain_name] || {};
                            
                            deployedTbody.innerHTML += `
                                <tr data-domain-id="${deployedDomain.id}" data-bcid="${deployedDomain.bcid || ''}">
                                    <td>${deployedDomain.domain_name}</td>
                                    <td>${managedDomain.registrar || '-'}</td>
                                    <td>
                                        <button class="btn btn-sm btn-info btn-detail" 
                                            data-bs-toggle="modal" 
                                            data-bs-target="#domainDetailModal"
                                            data-domain="${deployedDomain.domain_name}"
                                            data-registrar="${managedDomain.registrar || '-'}"
                                            data-url="${managedDomain.url || '-'}"
                                            data-id="${managedDomain.id || ''}">
                                            查看详情
                                        </button>
                                    </td>
                                    <td>${managedDomain.expiry_date || '-'}</td>
                                    <td>${deployedDomain.cert_expiry_date || '暂无证书'}</td>
                                    <td>${deployedDomain.server_ip || '-'}</td>
                                    <td><span class="badge bg-${deployedDomain.status === '在线' ? 'success' : 'warning'}">${deployedDomain.status || '未知'}</span></td>
                                    <td>
                                        <input type="text" class="form-control form-control-sm notes-input" 
                                            data-domain-id="${deployedDomain.id}" 
                                            value="${deployedDomain.notes || ''}" 
                                            placeholder="添加备注">
                                    </td>
                                    <td>
                                        <button class="btn btn-sm btn-danger btn-delete-deployed-domain" 
                                            data-id="${deployedDomain.id}"
                                            data-domain="${deployedDomain.domain_name}"
                                            data-server-ip="${deployedDomain.server_ip || ''}"
                                            data-bcid="${deployedDomain.bcid || ''}">
                                            <i class="bi bi-trash"></i> 删除
                                        </button>
                                    </td>
                                </tr>
                            `;
                        });
                        
                        // 绑定备注输入框的变更事件
                        const notesInputs = document.querySelectorAll('.notes-input');
                        notesInputs.forEach(input => {
                            input.addEventListener('change', function() {
                                const domainId = this.getAttribute('data-domain-id');
                                const newNote = this.value;
                                
                                // 更新备注
                                fetch(`/api/deployed-domains/${domainId}/notes`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ notes: newNote })
                                })
                                .then(response => response.json())
                                .then(result => {
                                    console.log('备注更新成功', result);
                                })
                                .catch(error => {
                                    console.error('更新备注失败:', error);
                                });
                            });
                        });
                        
                        // 绑定删除按钮的点击事件
                        const deleteButtons = document.querySelectorAll('.btn-delete-deployed-domain');
                        deleteButtons.forEach(button => {
                            button.addEventListener('click', function() {
                                const domainId = this.getAttribute('data-id');
                                const domainName = this.getAttribute('data-domain');
                                const serverIp = this.getAttribute('data-server-ip');
                                const bcid = this.getAttribute('data-bcid');
                                deleteDeployedDomain(domainId, domainName, serverIp, bcid);
                            });
                        });
                        
                        console.log('已部署域名列表加载完成');
                    } else {
                        console.log('找不到已部署域名表格元素，可能尚未创建');
                    }
                })
                .catch(error => {
                    console.error('获取域名管理数据失败:', error);
                });
        })
        .catch(error => {
            console.error('加载已部署域名列表失败:', error);
        });
}

/**
 * 删除已部署域名
 * @param {string} domainId - 已部署域名ID (用于UI元素查找)
 * @param {string} domainName - 域名名称 (主要标识符)
 * @param {string} serverIp - 服务器IP
 */
function deleteDeployedDomain(domainId, domainName, serverIp, bcid) {
    if (bcid) {
        if (!confirm(`警告：此操作不可恢复！\n确定要删除域名 ${domainName} 吗？此操作将删除服务器上的网站文件和Nginx配置。`)) {
            return;
        }
        const button = document.querySelector(`.btn-delete-deployed-domain[data-bcid="${bcid}"]`) || 
                       document.querySelector(`.btn-delete-deployed-domain[data-domain="${domainName}"]`) ||
                       document.querySelector(`.btn-delete-deployed-domain[data-id="${domainId}"]`);
        if (button) {
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="bi bi-hourglass-split"></i> 删除中...';
            button.disabled = true;
            fetch('/api/deploy/delete-domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bcid })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    alert(`域名 ${domainName} 删除成功！`);
                    loadDeployedDomains();
                } else {
                    throw new Error(result.error || '未知错误');
                }
            })
            .catch(error => {
                console.error('删除域名失败:', error);
                alert(`删除域名失败: ${error.message}`);
                if (button) {
                    button.innerHTML = originalText;
                    button.disabled = false;
                }
            });
        }
    } else if (domainName && serverIp) {
        if (!confirm(`警告：此操作不可恢复！\n确定要删除域名 ${domainName} 吗？此操作将删除服务器上的网站文件和Nginx配置。`)) {
            return;
        }
        const button = document.querySelector(`.btn-delete-deployed-domain[data-domain="${domainName}"]`) || 
                       document.querySelector(`.btn-delete-deployed-domain[data-id="${domainId}"]`);
        if (button) {
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="bi bi-hourglass-split"></i> 删除中...';
            button.disabled = true;
            fetch(`/api/servers/ip/${serverIp}`)
                .then(response => response.json())
                .then(server => {
                    if (!server || !server.id) {
                        throw new Error(`找不到服务器信息 (IP: ${serverIp})`);
                    }
                    return fetch('/api/deploy/delete-domain', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domainName, serverId: server.id, domainId })
                    });
                })
                .then(response => response.json())
                .then(result => {
                    if (result.success) {
                        alert(`域名 ${domainName} 删除成功！`);
                        loadDeployedDomains();
                    } else {
                        throw new Error(result.error || '未知错误');
                    }
                })
                .catch(error => {
                    console.error('删除域名失败:', error);
                    alert(`删除域名失败: ${error.message}`);
                    if (button) {
                        button.innerHTML = originalText;
                        button.disabled = false;
                    }
                });
        }
    } else {
        alert('缺少必要信息，无法删除域名');
    }
}