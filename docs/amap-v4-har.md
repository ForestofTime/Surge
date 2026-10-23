# 高德 v4 抓包修复

证据：2026-10-23-153856.har，抓包约 15:39。配置接口命中“高德-配置净化”且日志记录响应已修改；profile、redesign_quickservice 等配置返回 status=2、value 为空的增量结果。没有 nodefaasv3、scene/recommend 页面响应，因此无法从该 HAR 证明两处 UI 的具体字段或确认净化后的设备效果。

v4 增加 tcp-connection，让有效 MITM 主机下的原始 TLS 进入 HTTP 引擎；现有我的页过滤补 memberInfo/topMixedCard，继续保留订单与足迹。用户要求隐藏驾车等快捷入口，scene/recommend 的 toolsRecommend.data.default 改为空数组，v3 原先保留 102/103/106/151。此映射来自既有社区适配，未在本 HAR 获得新响应验证。

风险：tcp-connection 影响最终有效 MITM 主机列表，主配置含通配星号时范围扩大。截图中首页网络异常已有空 JSON 规则命中记录，但缺原响应，未猜测成功协议。若 v4 后仍显示，需强退后冷启动并打开两页重新抓包，以获得页面响应；单纯重复增量配置抓包无法验证。
