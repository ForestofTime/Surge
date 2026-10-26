# 京东 v21 Loon 兼容适配

依据用户提供的 Loon 规则文本和 9_1792929058598.har。HAR creator 为 Loon 1.0，328 条记录，记录时间为 2026-10-25 19:51；不提交原始 HAR、账户信息或素材地址。

## 本次合入

- basicConfig 响应仅将已有 data.JDMessage.socketmonitor.isSocketEstablishedAhead、isSocketReport 和 data.JDHttpToolKit.httpdns.httpdns 置 0。缺失字段不创建，保留其余配置。支持 URL functionId、POST 表单或 JSON，以及原有明文/Base64 响应。
- dns.jd.com 的 /v6/b 和 /v6/d 返回空 404，复现该 HAR 的已观测响应语义，增加精确 MITM 主机。HAR 共 11 次请求，10 次空 404、1 次状态 0；用户提供的文本本身没有该规则，不能归因于单一插件。
- 保留 v20 开屏配置、透明图及启动播放器媒体处理，不增加 CDN 全域阻断。POST 明确为其它 functionId 时不再仅凭 images 猜测为开屏。

## 未合入

文本中的订单、物流、个人中心楼层清理，以及搜索词、推荐接口拒绝均不属于当前去开屏目标，故不合入。JD debug 诊断拒绝也不影响开屏内容，未增加。

## 验证边界

HAR 没有 start 或 basicConfig，8 次 startup 的响应只有 deviceLevel；这些配置响应应保持不变。HAR 中存在一条全屏尺寸 AVIF，但没有证明广告是否显示的设备截图，也没有可回放的开屏配置，不能据此声称配置改写或开屏移除已在设备验证。

文本引用的 RuCu6/QuanX/main/Scripts/jingdong.js 在核查时返回 404；此版本基于用户提供的具体字段做原生适配，不运行失效远端脚本，也不把该文本认定为社区最新版。

更新后启用 Surge MITM 和脚本，确认 v21，仅启用一个京东净化模块，再强退冷启动。需同时核验开屏、商品详情、视频播放及订单业务。Surge 无法直接删除 App 已落盘的广告素材；必要时清理一次 App 缓存后重测。

工程验证：33 项京东回归通过，无跳过；配置脚本行覆盖率 100%、分支 93.90%。真实 HAR 的 18 条 client.action 响应均透传。Surge 原生解析、模块 lint、脚本语法和 diff 检查通过。全仓 JS 测试 285 通过、26 跳过、2 失败，失败为既有 CMCCHebaoCapture 描述长度和 README 索引检查；本次未修改该模块。尚无更新后的 Surge iPhone 冷启动验收。
