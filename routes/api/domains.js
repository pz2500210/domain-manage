router.get('/domains', async (req, res) => {
    try {
        // 获取所有域名
        const domains = await Domain.findAll();
        // 获取所有已部署域名
        const deployed = await DeployedDomain.findAll();
        // 构建以domain_name为key的映射
        const deployedMap = {};
        deployed.forEach(d => { deployedMap[d.domain_name] = d; });
        // 合并数据
        const result = domains.map(domain => {
            const deployInfo = deployedMap[domain.domain_name] || {};
            return {
                ...domain.dataValues,
                bcid: deployInfo.bcid || null,
                server_ip: deployInfo.server_ip || null,
                cert_expiry_date: deployInfo.cert_expiry_date || null,
                // 可根据需要添加更多部署相关字段
            };
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}); 