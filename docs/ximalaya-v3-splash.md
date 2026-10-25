# 喜马拉雅 v3 开屏兼容修复

依据 2026-10-25-131627.har（Surge iOS 5.102.0）：金币接口恢复成功响应，用户确认金币页面可用；同时 /ting/loading 返回 10 条开屏广告，/ting/preload 返回 1 条预加载素材，/ting/screen 返回空数据。

沿用 v2 两个精确共享主机的放行，仅为 adse.ximalaya.com 和 adse.wsa.ximalaya.com 的 /ting/loading、/ting/preload、/ting/screen 增加响应净化。接受无后缀或 /ts-数字 路径和查询参数；成功响应且 data 为数组时清空广告及竞价/素材列表，保留成功状态和其余响应字段。异常、未知结构透传。

不处理 /incentive/、/adx/ad、/adx/adPreInfo 或通用初始化配置，以保留金币和奖励广告；不拒绝共享主机、不伪造奖励结果、不拦音频 CDN。首页净化逻辑保持不变。

社区参考：https://raw.githubusercontent.com/ddgksf2013/Rewrite/master/AdBlock/Ximalaya.conf 。社区原规则全主机拒绝会同时损伤金币，此处仅借鉴 /ting/loading 专用路径并结合本次 HAR 收窄。

HAR 回放和配置解析不能替代 iPhone 冷启动。安装 v3 后先强退再打开；若旧素材仍显示，可清理一次 App 广告缓存后重测。共享主机放行规则仍须优先于通用广告列表。此版本不承诺屏蔽主动观看的奖励广告。

验证：修改前新增回归测试失败，修改后 10 项通过；脚本行覆盖率 100%、分支 93.33%。HAR 回放覆盖 3 条开屏族请求，清除 11 条素材，19 条激励及 12 条 ADX 请求保持透传。Surge 原生解析、模块 lint、JS 语法与差异检查通过。JS 全套测试 279 通过、26 跳过、2 失败；失败均为已有 CMCCHebaoCapture 元数据过长和 README 缺少其索引，与本次改动无关。未执行 iPhone UI 验收。
