# 喜马拉雅金币加载与通用规则冲突

2026-10-25-130610.har 包含 887 条记录。Advertising.list 命中 adse.ximalaya.com 55 次、adse.wsa.ximalaya.com 8 次，63 条均无服务器响应，其中 25 条为 /incentive/ 激励功能请求，涉及 currentDuration、incentivePositionConfig、downloadConfig、welfare/queryListenTime 等。金币页面其它业务接口有 HTTP 200 返回。由此确认通用广告域名规则正在阻断金币共享接口，但仍需更新后的设备 UI 验证加载恢复。

v2 给这两个精确主机增加 DIRECT、extended-matching，须使本模块规则优先于 Advertising.list 和其它广告平台模块。Surge 不允许 DIRECT 使用 pre-matching。仅添加模块并不能覆盖任何更高优先级的 REJECT；若新抓包仍显示 Advertising.list 命中，需在主配置把这两个放行规则移到该规则集之前。

两个主机也承载开屏及广告。恢复金币的代价是同域部分广告可能恢复，当前缺少成功响应基线，未猜测或伪造激励返回。原生页面净化脚本不变，仍保留金币入口、播放和签到。更新后强退重新打开金币页，检查新 HAR 是否得到真实响应；不得把 DIRECT 命中或 HTTP 200 单独等同于金币功能完成。
