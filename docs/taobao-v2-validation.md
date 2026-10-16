# 淘宝 v2 验证边界

2026-10-16：用户报告切回前台出现 FILA 热启动广告。

- `2026-10-16-154049.har` 只有 5 条 `/amdc/mobileDispatch` 响应；没有开屏 API、素材或曝光请求。
- 返回的 Base64 JSON `dns` 列表只有 `chaoshi.m.tmall.com`、`pages.tmall.com`、`www.tmall.com`。没有证据把这些业务调度记录删除。
- [fmz200 Loon 淘宝源码](https://github.com/fmz200/wool_scripts/blob/main/Loon/plugin/split/partT/Taobao.lpx)继续使用 `guide-acs.m.taobao.com` 开屏配置响应清理。现有模块已有该路径，缺少本次响应，不能判断其数据结构是否已变化。
- v2 仅补充 `[MITM] tcp-connection = true`，使符合最终 MITM hostname 列表的直接 TLS 连接进入 HTTP 引擎。广告过滤范围、业务响应脚本保持 v1 原样。
- 这是传输层兼容更新，原始 TCP 绕过仍是待验证假设。规则测试和配置解析不能证明截图广告已消失。

注意：该选项作用于主配置合并后的全部 MITM hostname。若主配置包含通配符，需评估解密范围；异常时停用本模块或关闭该选项回滚。

设备验收：更新模块确认 v2，信任证书并开启重写/MITM，启动抓包后强退淘宝、重新打开，再切出并切回两次。检查广告及首页、搜索、商品详情和订单。再次复现时应保留覆盖完整过程、包含 HTTPS 响应正文的 HAR。Surge 不能删除 App 本地缓存。
