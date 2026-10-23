# 高德 v5 前置规则

按用户提供的 QingRex/LoonKissSurge main 分支 Surge/Beta 下“HTTPDNS拦截器.beta.sgmodule”和“广告平台拦截器.beta.sgmodule”于 2026-10-23 核对，选择阿里调度及抓包出现的平台请求内置。

- 高德 `AMapiPhone*` UA + HTTP `/amdc/mobileDispatch` 调度路径拒绝；amdc.m.taobao.com:80 强制进入 HTTP 引擎。
- 同一 UA + httpdns.alicdn.com、httpdns-api.aliyuncs.com、httpdns-sc.aliyuncs.com、amdc.alipay.com 拒绝。
- 同一 UA + atoken.m.taobao.com、qchannel01.cn 及其子域拒绝。抓包中有两个 atoken 和两个 qchannel01 请求，但未发现 AMDC/HTTPDNS 请求，后两者属于社区补充，未证明是本次页面问题的根因。

共享主机使用 extended-matching 和精确 MITM 项；不导入全局关键词及 IP 网段。UA 无法识别、原始加密连接无法解密或使用独立 HTTPDNS UA 时，本模块不会将它们作为高德拒绝。这是有意限定的适配范围，不能视为两个通用前置的完整替代。

三个页面脚本保持 v4 内容及缓存版本。更新模块后强退高德再打开首页和我的页面；仍出现时需新 HAR 检查页面请求。原始 TLS 接管仍受最终 MITM 主机范围影响。
