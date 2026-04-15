# 仓库文件索引（逐文件说明）

本文覆盖当前仓库所有 Git 已跟踪文件，按目录分组说明用途、依赖与维护要点。

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

### `JS/JHSH_PRO.js`
- 作用：建行生活参数化广告净化脚本，支持开关参数。
- 适用客户端/APP：建行生活 App。
- 依赖关系：被 `Module/jhsh_pro.sgmodule` 通过 `script-path` 引用。
- 维护建议：保持参数名与 `.sgmodule` `#!arguments` 一致。

### `JS/didi_carowner.js`
- 作用：滴滴车主端响应体清理脚本。
- 适用客户端/APP：滴滴车主/顺风车车主端。
- 依赖关系：被 `Module/Didichuxing-CarOwner.sgmodule` 本地引用。

### `JS/jf.js`
- 作用：京粉接口广告项过滤脚本。
- 适用客户端/APP：京粉。
- 依赖关系：被 `Module/jf.sgmodule` 通过 raw 链接引用。

### `JS/jhsh.js`
- 作用：建行生活基础净化脚本。
- 适用客户端/APP：建行生活。
- 依赖关系：被 `Module/jhsh.sgmodule` 通过 raw 链接引用。

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

### `JS/tests/jhsh_pro_toggle.test.js`
- 作用：`JHSH_PRO.js` 参数开关烟雾测试。
- 适用客户端/APP：Node 本地测试。
- 依赖关系：`require('../JHSH_PRO.js')`。
- 维护建议：新增参数时同步新增断言。

## `Module/`

### `Module/Didichuxing-CarOwner.sgmodule`
- 作用：滴滴车主端去广告主模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为滴滴车主/顺风车车主。
- 类型：Rule + Map Local + Script + MITM。
- 依赖关系：本地脚本 `JS/didi_carowner.js`；无外部脚本仓库依赖。

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

### `Module/jdad.sgmodule`
- 作用：京东去开屏补充模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为京东。
- 类型：Map Local + MITM。
- 依赖关系：无脚本依赖。

### `Module/jf.sgmodule`
- 作用：京粉广告拦截模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为京粉。
- 类型：Script + Map Local + MITM。
- 依赖关系：引用本仓库 raw 脚本 `JS/jf.js`。

### `Module/jhsh.sgmodule`
- 作用：建行生活基础广告净化模块。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为建行生活（含美团内嵌场景）。
- 类型：Script + Map Local + MITM。
- 依赖关系：引用本仓库 raw 脚本 `JS/jhsh.js`。

### `Module/jhsh_pro.sgmodule`
- 作用：建行生活参数化净化模块（可开关广告项）。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为建行生活。
- 类型：Script + Map Local + MITM。
- 依赖关系：引用本仓库 raw 脚本 `JS/JHSH_PRO.js`。

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

## `modules/`

### `modules/didi-adblock.sgmodule`
- 作用：滴滴开屏/弹窗去广告精简版（实验/并行模块）。
- 适用客户端/APP：Surge iOS/Mac/tvOS；APP 为滴滴乘客/车主。
- 类型：URL Rewrite + MITM。
- 依赖关系：无本地脚本、无外部脚本仓库依赖。
- 与 `Module/Didichuxing-CarOwner.sgmodule` 的差异：本文件为关键词精简拦截，后者为接口级脚本精细清理。

## `docs/`

### `docs/superpowers/plans/2026-03-26-jhsh-pro-ad-toggle-plan.md`
- 作用：建行生活参数开关改造计划文档。
- 适用客户端/APP：维护文档。
- 依赖关系：对应 `JS/JHSH_PRO.js`、`Module/jhsh_pro.sgmodule`。

### `docs/superpowers/plans/2026-03-27-didi-carowner-plan.md`
- 作用：滴滴车主模块改造计划文档。
- 适用客户端/APP：维护文档。
- 依赖关系：对应 `JS/didi_carowner.js`、`Module/Didichuxing-CarOwner.sgmodule`。

### `docs/superpowers/specs/2026-03-26-jhsh-pro-ad-toggle-design.md`
- 作用：建行生活参数化设计说明。
- 适用客户端/APP：维护文档。
- 依赖关系：对应 `JHSH_PRO` 方案设计。

### `docs/superpowers/specs/2026-03-27-didi-carowner-design.md`
- 作用：滴滴车主模块设计说明。
- 适用客户端/APP：维护文档。
- 依赖关系：对应滴滴车主模块设计。

### `docs/repo-file-index.md`
- 作用：本文件，仓库逐文件索引。
- 适用客户端/APP：维护者与协作者。
- 依赖关系：与 `README.md` 互链。
