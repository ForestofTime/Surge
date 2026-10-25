# 喜马拉雅金币兼容模块

来源：[墨鱼配置](https://github.com/ddgksf2013/Rewrite/blob/dc3ea2c1fb2db870676b26da24006083eb1d44d3/AdBlock/Ximalaya.conf)及其 ximalaya_json.js、[奶思 Loon 配置](https://github.com/fmz200/wool_scripts/blob/5d5f63fcf98bc69d5f8f1b1bae6f86a01ee4bb97/Loon/plugin/split/partX/Ximalaya.lpx)。社区源不等于金币兼容保证；采用其接口及结构，删去与本次目标冲突的宽拦截。

旧配置拒绝 GSLB 整个路径、广告主机、多个业务提示接口，并对白名单外的我的入口做移除；这些是重试、金币无法刷新候选原因，没有故障 HAR 不能确定是哪一项。奶思源同样包含签到 getHomePageSignInInfo 拒绝，未移入。

新模块只过滤三个精确业务主机上的五类响应：首页信息流明确广告标记、轮播 isAd 标记、直播分类 ID 1005，以及我的 freeListenV2 推广。普通 bigCard、非广告链接、金币钱包入口、签到、播放调度和奖励广告接口保留。不对广告请求伪造奖励或成功结果。

不包含全局域名/IP拒绝、通配 CDN 素材阻断、搜索/金币/签到/奖励广告拦截。因金币任务可能依赖广告回调，开屏和激励广告不承诺全部消失。若要更全面移除开屏，需要含实际广告请求的故障 HAR 精确区分。

安装后必须停用原 ScriptHub 喜马拉雅模块及其它同 App 规则；旧规则仍启用时，新模块不能撤销其拦截。此版本已做合成回归和 Surge 解析，没有设备金币刷新、实际播放及请求频率测量，不宣称已消除设备请求风暴。
