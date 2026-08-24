# 仓库文件索引（核心文件说明）

本文覆盖仓库的核心源码、模块、规则、技能和自动化入口，按目录说明用途与依赖。完整模块清单以根目录 `README.md` 为准。

## 根目录

### `.gitignore`
- 作用：定义 Git 忽略规则。
- 适用客户端/APP：无。
- 依赖关系：无。

### `README.md`
- 作用：仓库总览、模块索引、外部依赖说明、使用入口。
- 适用客户端/APP：Surge/Clash 用户与维护者。
- 依赖关系：引用本索引文档。

### `min.conf`
- 作用：Surge 最小主配置示例，包含基础 General、策略组与 Rule。
- 适用客户端/APP：Surge iOS/Mac/tvOS。
- 依赖关系：引用外部规则集（`Blankwonder/surge-list`）与 Surge 内建规则。
- 维护建议：按个人节点策略替换 `policy-path`，上线前检查规则顺序。

## `Clash/`

### `Clash/ClashforWindows.yaml`
- 作用：Clash for Windows/ClashVerge 兼容配置模板。
- 适用客户端/APP：Clash for Windows、ClashVerge。
- 依赖关系：大量引用外部规则仓库：`blackmatrix7/ios_rule_script`、`soffchen/GeoIP2-CN`、`anti-ad`。
- 维护建议：订阅 URL 与规则源需按实际可用性定期校验。

## `Rule/`

### `Rule/Emby.list`
- 作用：Emby 场景域名规则。
- 适用客户端/APP：Surge 规则集。
- 依赖关系：被主配置通过 `RULE-SET` 方式引用。

### `Rule/IBKR.list`
- 作用：IBKR/Bank of America 相关域名规则。
- 适用客户端/APP：Surge 规则集。
- 依赖关系：被主配置通过 `RULE-SET` 方式引用。

### `Rule/ZABANK.list`
- 作用：ZA Bank 相关域名规则。
- 适用客户端/APP：Surge 规则集。
- 依赖关系：被主配置通过 `RULE-SET` 方式引用。

### `Rule/cn.list`
- 作用：中国常见 APP/域名/IP 分流规则集合。
- 适用客户端/APP：Surge 规则集。
- 依赖关系：可被主配置通过 `RULE-SET` 引用。
- 维护建议：变更频繁，建议按 APP 分类保持注释。

### `Rule/work-related-ip.list`
- 作用：工作内网 IP 网段规则（CIDR 形式）。
- 适用客户端/APP：Surge 规则集。
- 依赖关系：可在主配置中作为 `RULE-SET` 引用。

## `JS/`

### `JS/BaiduNetDiskAds.js`
- 作用：清空百度网盘首页 `feed/cardinfos` 的 `data.cards`，保留同级业务字段。
- 依赖关系：被 `Module/BaiduNetDisk.sgmodule` 引用。
- 维护要点：只处理固定主机与路径，解析失败时透传。

### `JS/CCBLifeAdBlock.js`
- 作用：建行生活参数化广告净化脚本，默认只处理开屏配置，可按参数扩展页面广告字段。
- 适用客户端/APP：建行生活 App。
- 依赖关系：被 `Module/CCBLife.sgmodule` 通过 `script-path` 引用。
- 维护建议：保持参数名与 `.sgmodule` `#!arguments` 一致，只扩大已验证的接口范围。

### `JS/CainiaoMiniProgram.js`
- 作用：清理菜鸟淘宝小程序的定向 HTTPDNS 和已抓包确认的 MTop 广告位。
- 适用客户端/APP：菜鸟淘宝小程序。
- 依赖关系：被 `Module/CainiaoMiniProgram.sgmodule` 引用。
- 维护建议：保持菜鸟应用标识、MTop 主机和广告字段的边界，回归测试覆盖视频卡广告位。

### `JS/ChinaMobileAds.js`
- 作用：解密并净化中国移动六个广告响应，异常时透传。
- 适用客户端/APP：中国移动 App。
- 依赖关系：被 `Module/ChinaMobile.sgmodule` 引用，使用 Surge WebView Web Crypto。
- 维护建议：只增加 HAR 证实的路径与字段。

### `JS/MeituanAds.js`
- 作用：刷新并关闭美团 MSC 推荐平台与缓存，同时清理营销推送和公开推荐接口。
- 适用客户端/APP：美团 App。
- 依赖关系：被 `Module/MeituanAds.sgmodule` 引用。
- 维护建议：仅修改推荐平台开关、已确认的营销开关、推荐数组和个人页推荐区块。

### `JS/GoofishAds.js`
- 作用：清理闲鱼 HTTPDNS 绕过和已确认的响应广告字段。
- 适用客户端/APP：闲鱼。
- 依赖关系：被 `Module/GoofishAds.sgmodule` 引用。
- 维护建议：保留功能数据透传，新增接口前先用 HAR 证明。

### `JS/TaobaoAds.js`
- 作用：选择性删除淘宝开屏配置中的 `taobao-splash` 数据，并净化抓包命中的 PopLayer 固定配置。
- 适用客户端/APP：淘宝。
- 依赖关系：被 `Module/TaobaoAds.sgmodule` 引用。
- 维护建议：保留首页兄弟字段，不要将商品视频接口并入开屏清理。

### `JS/JingdongSplash.js`
- 作用：处理京东已确认的主页面启动视频。
- 适用客户端/APP：京东。
- 依赖关系：被 `Module/JingdongAds.sgmodule` 引用。
- 维护建议：京东模块保持开屏边界，不修改商品或业务接口。

### `JS/jf.js`
- 作用：京粉首页横幅响应过滤脚本，异常或无关响应保持透传。
- 适用客户端/APP：京粉。
- 依赖关系：被 `Module/jf.sgmodule` 通过 raw 链接引用。
- 维护建议：只沿用已确认的落地字段判断，不扩大到普通标题、图片或功能链接。

### `JS/meiyou-body-clean.js`
- 作用：美柚多接口字段清理共享脚本。
- 适用客户端/APP：美柚。
- 依赖关系：被 `Module/MeiYou-Extra-AdBlock.sgmodule` 通过 raw 链接引用。

### `JS/meiyou-strip-ads.js`
- 作用：美柚 feed/list 广告字段深度清理脚本。
- 适用客户端/APP：美柚。
- 依赖关系：被 `Module/MeiYou-Extra-AdBlock.sgmodule` 通过 raw 链接引用。

### `JS/qidian_getconf_filter_fixed.js`
- 作用：起点读书 iOS 修复版主净化脚本。
- 适用客户端/APP：起点读书。
- 依赖关系：被 `Module/Qidian_Ad2.sgmodule` 通过 raw 链接引用。

### `JS/qidian_hide_daily.js`
- 作用：起点每日导读/签到兜底隐藏脚本。
- 适用客户端/APP：起点读书。
- 依赖关系：被 `Module/Qidian_Ad2.sgmodule` 通过 raw 链接引用。

### `JS/yjjy.js`
- 作用：易捷加油广告清理脚本。
- 适用客户端/APP：易捷加油。
- 依赖关系：被 `Module/yj.sgmodule` 通过 raw 链接引用。

## `JS/tests/`

### `JS/tests/baidupan-caocao-modules.test.js`
- 作用：验证百度网盘和曹操出行原生模块的端点覆盖、脚本边界与依赖收敛。

### `JS/tests/china-mobile-module.test.js`
- 作用：验证中国移动加密响应、字段清理、异常透传与模块边界。

### `JS/tests/meituan-ads-module.test.js`
- 作用：验证美团素材路径、营销推送字段和业务透传边界。

### `JS/tests/repository-metadata.test.js`
- 作用：验证模块元数据、脚本任务名称和 README 索引完整性。

### `JS/tests/surge-har-skill.test.js`
- 作用：验证仓库内 HAR 修复技能文件及时间线工具的脱敏行为。

### `JS/tests/pinduoduo-native-module.test.js`
- 作用：验证拼多多原生模块的 HTTPDNS、首页、商品流、搜索、刷新和广告字段边界。
- 适用客户端/APP：Node 本地测试。
- 依赖关系：对应 `Module/PinduoduoNative.sgmodule` 的当前实现。
- 维护建议：新增规则前先增加回归样本，确保功能数据保持透传。

## `Module/`

### `Module/BaiduNetDisk.sgmodule`
- 作用：原生清理百度网盘任务、活动、推荐和首页广告卡片。
- 类型：Body Rewrite + Map Local + Script + MITM。
- 依赖关系：本地脚本 `JS/BaiduNetDiskAds.js`。

### `Module/CaoCaoTravel.sgmodule`
- 作用：原生拦截曹操出行广告、营销、推荐和资源更新接口。
- 类型：URL Rewrite + MITM。
- 维护要点：地址推荐、资源更新和热修复接口范围较高，App 更新后需回归业务功能。

### `Module/Didichuxing.sgmodule`
- 作用：滴滴出行首页、活动、推荐流和个人页净化模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为滴滴出行。
- 类型：Rule + Map Local + Body Rewrite + MITM。
- 依赖关系：规则与 jq 响应改写均内置于模块。

### `Module/CCBLife.sgmodule`
- 作用：建行生活开屏默认拦截，并按参数选择性清理页面广告。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为建行生活。
- 类型：Script + MITM。
- 依赖关系：本地脚本 `JS/CCBLifeAdBlock.js`。

### `Module/CainiaoMiniProgram.sgmodule`
- 作用：菜鸟淘宝小程序定向 HTTPDNS 和广告位清理。
- 适用客户端/APP：Surge iOS/Mac；小程序为菜鸟淘宝。
- 类型：Script + MITM。
- 依赖关系：本地脚本 `JS/CainiaoMiniProgram.js`。

### `Module/ChinaMobile.sgmodule`
- 作用：清理中国移动启动页、顶部拉新、营销专区和导航横幅。
- 适用客户端/APP：Surge iOS/Mac；APP 为中国移动。
- 类型：Map Local + Script + MITM。
- 依赖关系：本地脚本 `JS/ChinaMobileAds.js`。

### `Module/MeituanAds.sgmodule`
- 作用：清理美团开屏、营销素材、购物车与个人页推荐。
- 适用客户端/APP：Surge iOS/Mac；APP 为美团。
- 类型：Rule + Map Local + Script + MITM。
- 依赖关系：本地脚本 `JS/MeituanAds.js`。
- 维护建议：通过 Horn 关闭 MSC 推荐平台与缓存，并保留公开接口回退处理；禁止扩大到 Shark、`d.meituan.net`、HTTPDNS、共享商品图片和全部 Horn 配置。

### `Module/GoofishAds.sgmodule`
- 作用：闲鱼 HTTPDNS 和响应广告字段清理。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为闲鱼。
- 类型：Script + MITM。
- 依赖关系：本地脚本 `JS/GoofishAds.js`。

### `Module/TaobaoAds.sgmodule`
- 作用：拦截淘宝抓包命中的 Tanx 广告与曝光请求，按素材路径处理开屏图片，并净化开屏和 PopLayer 配置。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为淘宝。
- 类型：Rule + Map Local + Script + MITM。
- 依赖关系：本地脚本 `JS/TaobaoAds.js`；规则基线参考 QingRex、ishowshu、zirawell 与 Keywos 的社区方案。
- 维护建议：共享 CDN 只允许路径级规则；商品视频、首页通用接口和 AMDC 需要新的独立抓包证据后再评估。

### `Module/JingdongAds.sgmodule`
- 作用：京东开屏清理。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为京东。
- 类型：Rule + Map Local + Script + MITM。
- 依赖关系：本地脚本 `JS/JingdongSplash.js`。

### `Module/JDFinance.sgmodule`
- 作用：京东金融开屏配置清理，只返回两个开屏接口的空 JSON。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为京东金融。
- 类型：Map Local + MITM。
- 依赖关系：无脚本依赖；规则基线参考 `zirawell/R-Store` 与 `fmz200/wool_scripts`。
- 维护建议：不加入首页卡片、底部导航、通用广告接口或京东共享图片路径，新增端点前先用 HAR 证明。

### `Module/PinduoduoNative.sgmodule`
- 作用：拼多多原生规则移植，保留首页、商品流和搜索功能，清理已确认的广告接口。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为拼多多。
- 类型：Rule + MITM。
- 依赖关系：对应 `JS/tests/pinduoduo-native-module.test.js` 的回归样本。

### `Module/GoogleRewrite.sgmodule`
- 作用：Google.cn 到 Google.com 重定向。
- 适用客户端/APP：Surge iOS（文件内 `#!system=ios`）。
- 类型：URL Rewrite + MITM。
- 依赖关系：无脚本依赖。

### `Module/MeiYou-Extra-AdBlock.sgmodule`
- 作用：美柚广告与埋点补充拦截。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为美柚。
- 类型：Rule + Map Local + Script + MITM。
- 依赖关系：引用本仓库 raw 脚本 `JS/meiyou-strip-ads.js`、`JS/meiyou-body-clean.js`。

### `Module/Qidian_Ad2.sgmodule`
- 作用：起点读书去广告（iOS 修复版）模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为起点读书。
- 类型：Script + Map Local + MITM。
- 依赖关系：引用本仓库 raw 脚本 `JS/qidian_getconf_filter_fixed.js`、`JS/qidian_hide_daily.js`。

### `Module/Telegram-DC.sgmodule`
- 作用：Telegram 劣化 IP 绕行，将已验证的 DC2/DC5 劣化地址改写到同数据中心的备用地址。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为 Telegram。
- 类型：General + Host。
- 依赖关系：DC5 映射来自 FKTG 社区模块；DC2 备用端点采用 TDLib 默认 DC2 TCP 地址。
- 维护建议：不要保留 `IP-CIDR,95.161.76.100/31,REJECT`，否则会与该模块的 DC2 改写冲突。未验证的 DC1/DC3/DC4 地址不应凭猜测加入映射表。

### `Module/XHS.sgmodule`
- 作用：小红书去广告与去水印模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为小红书。
- 类型：Rule + Map Local + Script + MITM。
- 依赖关系：外部仓库 `ForestofTime/RuCu6-main`（`xiaohongshu.js`）。

### `Module/ZhiHu.sgmodule`
- 作用：知乎去广告模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为知乎。
- 类型：Rule + URL Rewrite + Map Local + Script + MITM。
- 依赖关系：外部仓库 `ForestofTime/RuCu6-main`（`zhihu.js`）。

### `Module/ad.conf`
- 作用：多 APP 去广告 Rewrite 合集。
- 适用客户端/APP：Surge（Rewrite 场景），覆盖 12306、阿里、京东、贴吧等多个 APP/站点。
- 类型：Rewrite + MITM。
- 依赖关系：大量引用外部仓库 `RuCu6/QuanX` 脚本。
- 维护建议：该文件覆盖面广，建议按字母分组继续维持注释结构。

### `Module/boxjs/smzdm.boxjs.json`
- 作用：什么值得买 BoxJS 配置模板。
- 适用客户端/APP：BoxJS 用户、什么值得买签到场景。
- 类型：配置 JSON。
- 依赖关系：当前为占位仓库链接（`YourUsername/YourRepo`）。
- 维护建议：发布前需替换为真实仓库与脚本 URL。

### `Module/jf.sgmodule`
- 作用：京粉开屏和首页横幅广告处理模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为京粉。
- 类型：Script + Map Local + MITM。
- 依赖关系：引用本仓库 raw 脚本 `JS/jf.js`。
- 维护建议：开屏保持显式 `200 + {}`，响应脚本保持 1 MiB 上限和异常透传。

### `Module/nyyh.sgmodule`
- 作用：农业银行开屏广告拦截。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为农业银行。
- 类型：URL Rewrite + MITM。
- 依赖关系：无脚本依赖。

### `Module/panel/Flush-DNS.sgmodule`
- 作用：Surge 面板一键清 DNS 缓存。
- 适用客户端/APP：Surge iOS（`#!system=ios`）。
- 类型：Panel + Script。
- 依赖关系：外部仓库 `Rabbit-Spec/Surge` 的脚本链接。

### `Module/sams.sgmodule`
- 作用：山姆会员商店开屏拦截。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为山姆会员商店。
- 类型：Map Local + MITM。
- 依赖关系：无脚本依赖。

### `Module/xysh.sgmodule`
- 作用：兴业生活去广告模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为兴业生活。
- 类型：URL Rewrite + Map Local + MITM。
- 依赖关系：无脚本依赖。

### `Module/yj.sgmodule`
- 作用：易捷加油去广告模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为易捷加油。
- 类型：Script + Map Local + MITM。
- 依赖关系：引用本仓库 raw 脚本 `JS/yjjy.js`。

## `Task/`

### `Task/Task.sgmodule`
- 作用：定时任务集合（签到类）。
- 适用客户端/APP：Surge iOS/Mac。
- 类型：Script(Cron) + MITM。
- 依赖关系：
  - `zZPiglet/Task`（欧可林签到）
  - `blackmatrix7/ios_rule_script`（贴吧签到）
  - `Voldeemort/Surge`（备用注释项）

## `Skills/`

### `Skills/debug-surge-qx-parity/`
- 作用：按 HAR 证据诊断、修复、测试并发布 Surge 模块回归。
- 工具：请求时间线、QX 与 Surge 端点对比。
- 边界：自动化验证完成后，真机冷启动仍需单独验收。

## `modules/`

### `modules/didi-adblock.sgmodule`
- 作用：滴滴开屏/弹窗去广告精简版（实验/并行模块）。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为滴滴乘客/车主。
- 类型：URL Rewrite + MITM。
- 依赖关系：无本地脚本、无外部脚本仓库依赖。
- 与 `Module/Didichuxing.sgmodule` 的差异：本文件为关键词精简拦截，后者为接口级脚本精细清理。

## `docs/`

### `docs/fallback-rule-learning-operation.md`
- 作用：兜底规则学习流程的部署、dry-run、发布、回滚和数据删除说明。
- 适用客户端/APP：Surge 与 GitHub Actions。
- 依赖关系：对应 `Task/FallbackRules.sgmodule` 和 `Automation/` 下的校验脚本。

### `docs/plans/01-fallback-rule-learning.md`
- 作用：兜底规则学习流程的威胁模型、权限边界和阶段计划。
- 适用客户端/APP：维护文档。
- 依赖关系：与公开 `main` 产物发布流程保持一致。

### `docs/repo-file-index.md`
- 作用：本文件，仓库逐文件索引。
- 适用客户端/APP：维护者与协作者。
- 依赖关系：与 `README.md` 互链。
