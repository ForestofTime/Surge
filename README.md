# Surge 配置与模块仓库

本仓库用于维护个人使用的网络配置资产，覆盖以下内容：
- Surge 模块（去广告、重写、脚本、面板、任务）
- Surge 规则集（按场景分流）
- Surge 最小主配置示例
- Clash for Windows 兼容配置
- 脚本源码与简单测试

## 适用客户端
- Surge for iOS
- Surge for Mac
- Surge for tvOS（按模块兼容性使用）
- Clash for Windows（仅 `Clash/ClashforWindows.yaml`）

## 目录导航
| 目录 | 作用 | 入口文件 |
|---|---|---|
| `Module/` | 主模块仓库（.sgmodule/.conf） | `Module/*.sgmodule` |
| `modules/` | 独立实验/精简模块 | `modules/didi-adblock.sgmodule` |
| `JS/` | 本地脚本源码 | `JS/*.js` |
| `JS/tests/` | 脚本测试 | `JS/tests/jhsh_pro_toggle.test.js` |
| `Rule/` | 自定义规则集 | `Rule/*.list` |
| `Task/` | Surge 定时任务模块 | `Task/Task.sgmodule` |
| `Clash/` | Clash 配置 | `Clash/ClashforWindows.yaml` |
| `docs/` | 设计与计划文档 | `docs/repo-file-index.md` |
| 根目录 | 主配置与说明 | `min.conf`, `README.md` |

## 快速开始
1. 选择模块：从 `Module/` 或 `modules/` 挑选对应 APP 的 `.sgmodule`。
2. 在 Surge 导入模块并启用。
3. 对包含 `MITM`/脚本的模块，在 Surge 中开启 HTTPS 解密，并信任证书。
4. 如需规则分流，在主配置加入 `Rule/` 对应规则集。
5. 如需最小化示例，参考 `min.conf`。

## 模块索引
| 模块文件 | 适用 APP | 类型 | 适用平台 | 本仓库本地脚本 | 外部依赖仓库 |
|---|---|---|---|---|---|
| `Module/Didichuxing-CarOwner.sgmodule` | 滴滴车主/顺风车车主端 | Rule + Map Local + Script + MITM | Surge iOS/Mac/tvOS | `JS/didi_carowner.js` | 无 |
| `Module/GoogleRewrite.sgmodule` | Safari Google.cn 重定向 | URL Rewrite + MITM | Surge iOS（标注 `#!system=ios`） | 无 | 无 |
| `Module/MeiYou-Extra-AdBlock.sgmodule` | 美柚 | Rule + Map Local + Script + MITM | Surge iOS/Mac/tvOS | `JS/meiyou-strip-ads.js`, `JS/meiyou-body-clean.js` | 无 |
| `Module/Qidian_Ad2.sgmodule` | 起点读书 | Script + Map Local + MITM | Surge iOS/Mac/tvOS | `JS/qidian_getconf_filter_fixed.js`, `JS/qidian_hide_daily.js` | 无 |
| `Module/XHS.sgmodule` | 小红书 | Rule + Map Local + Script + MITM | Surge iOS/Mac/tvOS | 无 | `ForestofTime/RuCu6-main` |
| `Module/ZhiHu.sgmodule` | 知乎 | Rule + URL Rewrite + Map Local + Script + MITM | Surge iOS/Mac/tvOS | 无 | `ForestofTime/RuCu6-main` |
| `Module/ad.conf` | 多 APP 广告拦截合集 | Rewrite + MITM | Surge iOS/Mac（语法偏 Rewrite 集合） | 无 | `RuCu6/QuanX` |
| `Module/jdad.sgmodule` | 京东开屏补充 | Map Local + MITM | Surge iOS/Mac/tvOS | 无 | 无 |
| `Module/jf.sgmodule` | 京粉 | Script + Map Local + MITM | Surge iOS/Mac/tvOS | `JS/jf.js`（以 raw 引用） | 无 |
| `Module/jhsh.sgmodule` | 建行生活（含美团内嵌场景） | Script + Map Local + MITM | Surge iOS/Mac/tvOS | `JS/jhsh.js`（以 raw 引用） | 无 |
| `Module/jhsh_pro.sgmodule` | 建行生活（参数化净化版） | Script + Map Local + MITM | Surge iOS/Mac/tvOS | `JS/JHSH_PRO.js`（以 raw 引用） | 无 |
| `Module/nyyh.sgmodule` | 农业银行 | URL Rewrite + MITM | Surge iOS/Mac/tvOS | 无 | 无 |
| `Module/panel/Flush-DNS.sgmodule` | Surge 面板工具 | Panel + Script | Surge iOS（标注 `#!system=ios`） | 无 | `Rabbit-Spec/Surge` |
| `Module/sams.sgmodule` | 山姆会员商店 | Map Local + MITM | Surge iOS/Mac/tvOS | 无 | 无 |
| `Module/xysh.sgmodule` | 兴业生活 | URL Rewrite + Map Local + MITM | Surge iOS/Mac/tvOS | 无 | 无 |
| `Module/yj.sgmodule` | 易捷加油 | Script + Map Local + MITM | Surge iOS/Mac/tvOS | `JS/yjjy.js`（以 raw 引用） | 无 |
| `Task/Task.sgmodule` | 定时签到任务 | Script(Cron) + MITM | Surge iOS/Mac | 无 | `zZPiglet/Task`, `blackmatrix7/ios_rule_script`, `Voldeemort/Surge`(注释) |
| `modules/didi-adblock.sgmodule` | 滴滴（乘客/车主）开屏弹窗精简拦截 | URL Rewrite + MITM | Surge iOS/Mac/tvOS | 无 | 无 |

## 外部依赖与引用仓库
| 仓库 | 用途 |
|---|---|
| [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) | Task 签到脚本、Clash 规则提供者 |
| [RuCu6/QuanX](https://github.com/RuCu6/QuanX) | `Module/ad.conf` 外部脚本来源 |
| [Rabbit-Spec/Surge](https://github.com/Rabbit-Spec/Surge) | Flush DNS 面板脚本 |
| [zZPiglet/Task](https://github.com/zZPiglet/Task) | 欧可林签到脚本 |
| [Voldeemort/Surge](https://github.com/Voldeemort/Surge) | 贴吧签到备用脚本（注释） |
| [soffchen/GeoIP2-CN](https://github.com/soffchen/GeoIP2-CN) | Clash ChinaIP 规则来源 |
| [ForestofTime/RuCu6-main](https://github.com/ForestofTime/RuCu6-main) | 小红书/知乎脚本镜像仓库 |

## 已知占位与待修复项
- `Module/boxjs/smzdm.boxjs.json` 仍包含占位内容：`YourUsername/YourRepo`、示例 icon/script 链接。
- 若需要发布可用 BoxJS 配置，应替换为真实仓库链接与脚本路径。

## 风险提示
- 去广告规则存在误杀风险，升级 APP 后可能需要重新抓包与调规则。
- 开启 MITM 前请评估隐私与合规要求。
- 引用第三方 raw 脚本时，建议固定版本或定期校验上游变更。

## 致谢
- 本仓库整合并二次维护了多个社区方案，感谢各开源作者与规则维护者。

## 详细文件说明
完整逐文件说明见：`docs/repo-file-index.md`
