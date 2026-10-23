# 高德 v6 完整合并墨鱼规则

来源：[墨鱼 QX 配置](https://github.com/ddgksf2013/Rewrite/blob/dc3ea2c1fb2db870676b26da24006083eb1d44d3/AdBlock/AmapAds.conf)，18 类 URL 规则及 optimus-ads 直连均有 Surge 对应。Surge 直接执行仓库脚本，不依赖 ScriptHub。

两个原始脚本固定于 ddgksf2013/Scripts 提交 `0cddbb6bc31344315afba773ebb4e7ce29f7fd8f`，署名与正文保存在 `JS/vendor/amap-ddgks.js`、`JS/vendor/amdc-ddgks.js`。执行 `node Automation/build-amap-merged.mjs` 构建 `JS/AmapMerged.js`；`--check` 验证生成物未过期。

配置、我的页、打车共享接口合并为一个响应处理流水线，先执行上游，再运行对应原生处理器；每段失败保留该段原响应，最终只调用一次 Surge `$done`。处理结果不回传旧 Content-Length/Content-Encoding。

冲突处理：订单卡和足迹卡先保护再恢复；我的页面保留原生入口过滤。搜索推荐采用源配置的空 JSON；旧 aos 开屏及 Tip 请求用 HTTP 200 空文本，GIF 用透明图片。AMDC 改用上游响应策略，仅对高德 UA 执行，其它 App 透传。保留 v5 的高德 UA 平台/HTTPDNS 规则。

完整覆盖涉及所有 amap.com 子域，MITM 改为 `*.amap.com`，需要证书信任；tcp-connection 继续启用。上游会改变天气、消息角标、附近推荐等展示，不仅是商业广告。未加入第三方 App 的通用前置规则。

验证包括源规则路由覆盖、原生单元测试和完整流水线集成测试。2026-10-23-161452.har 仍缺首页/我的布局接口，HAR 回放只能验证已有配置等响应，不能证明手机两处 UI 已恢复。更新后强退高德重开两页验收，异常时停用模块回滚。
