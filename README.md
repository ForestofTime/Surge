# Surge 配置、模块与规则仓库

这是一个面向个人使用的 Surge 配置资产仓库，集中维护模块、脚本、规则集、任务模块和最小主配置示例。仓库同时包含一套经过校验的兜底规则学习流程，用于采集显式兜底命中的域名或 IP，经私有 Inbox 审核后生成公开规则产物。

## 仓库内容

| 内容 | 说明 |
| --- | --- |
| Surge 模块 | 去广告、响应体清理、URL 重写、Host IP 覆盖、面板和定时任务 |
| 脚本 | Surge JavaScript，包括广告字段清理、开屏处理和兜底规则采集上传 |
| 规则集 | 代理、直连、拒绝、国内服务、工作网段、Emby、IBKR 和 ZA Bank 等场景规则 |
| 生成规则 | `generated` 分支中的 `Direct+` 与 `Proxy+` 规则产物，供主配置远程引用 |
| 兼容配置 | Clash for Windows 配置模板 |
| 自动化 | 上游规则锁定、提案复验、规则编译、生成分支发布和安全检查 |

## 支持的客户端

- Surge for iOS
- Surge for Mac
- Surge for tvOS，具体以模块中的平台标记和语法为准
- Clash for Windows 或 ClashVerge，仅使用 `Clash/ClashforWindows.yaml`

## 快速开始

1. 从 `Module/` 或 `modules/` 选择目标 APP 的 `.sgmodule`。
2. 在 Surge 中导入并启用模块。
3. 模块包含 `MITM`、脚本或响应体改写时，在 Surge 中开启对应域名的 HTTPS 解密并信任证书。
4. 需要分流时，在主配置中通过 `RULE-SET` 引入 `Rule/` 下的规则集。
5. 基础配置可参考 `min.conf`。

仅使用兜底规则学习功能时，可导入 `Task/FallbackRules.sgmodule`。该模块只声明脚本，`SCRIPT,fallback-capture,Proxy` 必须放在主配置的正式规则末尾，并位于 `FINAL` 之前。首次使用还需要按照 [操作说明](docs/fallback-rule-learning-operation.md) 配置私有 GitHub Inbox 和 Token。

## 模块索引

### 广告过滤与响应改写

`.sgmodule` 文件提供 Raw 链接和一键导入 Surge 链接。GitHub 会过滤 `surge:///` 自定义协议，因此一键导入使用 [BoxJS URL Scheme](https://docs.boxjs.app/dev/url-scheme) 提供的 HTTPS 中转地址。分类统一使用 `AdBlock`、`System` 和 `Pannel`，分别对应去广告、系统优化与面板工具。`ad.conf` 是 Rewrite 合集，BoxJS JSON 属于独立配置资源，因此只提供 Raw 链接。

| 序号 | 模块 | 分类 | 作用 | RAW 链接 | 一键导入 Surge |
| ---: | --- | --- | --- | --- | --- |
| 1 | `Module/Didichuxing.sgmodule` | AdBlock | 滴滴出行首页、活动、推荐流和个人页净化 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/Didichuxing.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FDidichuxing.sgmodule) |
| 2 | `Module/MeiYou-Extra-AdBlock.sgmodule` | AdBlock | 美柚广告接口、信息流字段和埋点拦截 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/MeiYou-Extra-AdBlock.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FMeiYou-Extra-AdBlock.sgmodule) |
| 3 | `Module/PuPuSupermarket.sgmodule` | AdBlock | 朴朴超市广告接口、HTTPDNS 和开屏素材处理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/PuPuSupermarket.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FPuPuSupermarket.sgmodule) |
| 4 | `Module/Qidian_Ad2.sgmodule` | AdBlock | 起点读书开屏、每日导读、活动弹窗、悬浮广告和页面字段清理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/Qidian_Ad2.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FQidian_Ad2.sgmodule) |
| 5 | `Module/SuperDeer.sgmodule` | AdBlock | 超鹿运动开屏配置响应改写，清空 `data.splashes` | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/SuperDeer.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FSuperDeer.sgmodule) |
| 6 | `Module/XHS.sgmodule` | AdBlock | 小红书开屏、信息流、搜索和详情页广告处理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/XHS.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FXHS.sgmodule) |
| 7 | `Module/ZhiHu.sgmodule` | AdBlock | 知乎广告域名、推荐内容、横幅和卡片处理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ZhiHu.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FZhiHu.sgmodule) |
| 8 | `Module/ad.conf` | AdBlock | 多 APP Rewrite 去广告合集 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ad.conf) | 不适用 |
| 9 | `Module/jdad.sgmodule` | AdBlock | 京东开屏补充拦截 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/jdad.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fjdad.sgmodule) |
| 10 | `Module/JingdongAds.sgmodule` | AdBlock | 京东仅去开屏，不修改页面或业务接口 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/JingdongAds.sgmodule) | [一键导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJingdongAds.sgmodule) |
| 11 | `Module/jf.sgmodule` | AdBlock | 京粉开屏和首页横幅广告处理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/jf.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fjf.sgmodule) |
| 12 | `Module/nyyh.sgmodule` | AdBlock | 农业银行开屏广告拦截 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/nyyh.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fnyyh.sgmodule) |
| 13 | `Module/sams.sgmodule` | AdBlock | 山姆会员商店开屏处理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/sams.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fsams.sgmodule) |
| 14 | `Module/xysh.sgmodule` | AdBlock | 兴业生活广告处理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/xysh.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fxysh.sgmodule) |
| 15 | `Module/yj.sgmodule` | AdBlock | 易捷加油广告处理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/yj.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fyj.sgmodule) |
| 16 | `modules/didi-adblock.sgmodule` | AdBlock | 滴滴开屏和弹窗的精简实验模块 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/modules/didi-adblock.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2Fmodules%2Fdidi-adblock.sgmodule) |
| 17 | `Module/ICBCLife.sgmodule` | AdBlock | 工银e生活 App 去开屏，自动学习全屏画布并在后续请求前跳过 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ICBCLife.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FICBCLife.sgmodule) |
| 18 | `Module/ICBCLifeMiniProgram.sgmodule` | AdBlock | 工银e生活微信小程序去开屏，会影响原生 App，不能同时启用 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ICBCLifeMiniProgram.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FICBCLifeMiniProgram.sgmodule) |
| 19 | `Module/CCBLife.sgmodule` | AdBlock | 建行生活开屏默认拦截，其它页面广告可按模块参数启用 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/CCBLife.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FCCBLife.sgmodule) |
| 20 | `Module/CainiaoMiniProgram.sgmodule` | AdBlock | 菜鸟淘宝小程序定向清理 HTTPDNS，并过滤抓包曝光的 1308、205、1381 广告位 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/CainiaoMiniProgram.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FCainiaoMiniProgram.sgmodule) |
| 21 | `Module/GoofishAds.sgmodule` | AdBlock | 闲鱼开屏、曝光接口及 11 处页面广告响应净化，使用闲鱼专属 HTTPDNS 清理 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/GoofishAds.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FGoofishAds.sgmodule) |
| 22 | `Module/PinduoduoNative.sgmodule` | AdBlock | 完整保留 QingRex 原生净化，恢复其历史版本中 meta 配置可达行为 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/PinduoduoNative.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FPinduoduoNative.sgmodule) |

### 连接与工具

| 序号 | 模块 | 分类 | 作用 | RAW 链接 | 一键导入 Surge |
| ---: | --- | --- | --- | --- | --- |
| 21 | `Module/Telegram-DC.sgmodule` | System | 将已验证的 Telegram DC2、DC5 劣化 IP 改写到同数据中心的备用地址 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/Telegram-DC.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FTelegram-DC.sgmodule) |
| 22 | `Module/GoogleRewrite.sgmodule` | System | iOS Safari 将 Google.cn 重定向到 Google.com | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/GoogleRewrite.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FGoogleRewrite.sgmodule) |
| 23 | `Module/panel/Flush-DNS.sgmodule` | Pannel | Surge iOS 面板一键清理 DNS 缓存 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/panel/Flush-DNS.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fpanel%2FFlush-DNS.sgmodule) |
| 24 | `Task/Task.sgmodule` | System | 欧可林、贴吧等定时签到任务集合 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Task/Task.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FTask%2FTask.sgmodule) |
| 25 | `Task/FallbackRules.sgmodule` | System | 兜底命中采集、上传和配置脚本集合 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Task/FallbackRules.sgmodule) | [一键导入](https://api.boxjs.app/surge/install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FTask%2FFallbackRules.sgmodule) |
| 26 | `Module/boxjs/smzdm.boxjs.json` | 不适用 | 什么值得买 BoxJS 配置模板，当前仍含占位链接 | [RAW](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/boxjs/smzdm.boxjs.json) | 不适用 |

## 目录导航

| 目录 | 用途 |
| --- | --- |
| `Module/` | 主要 Surge 模块和 `.conf` Rewrite 集合 |
| `modules/` | 独立实验或精简模块 |
| `JS/` | Surge JavaScript 源码 |
| `JS/tests/` | JavaScript 模块和脚本测试 |
| `Rule/` | 手工维护和生成后的 Surge 规则集 |
| `Source/` | 规则源、手工规则和自动生成源 |
| `Automation/` | 规则编译、来源锁定、提案校验和发布前检查 |
| `Task/` | Surge 定时任务及兜底学习模块 |
| `Clash/` | Clash for Windows 配置模板 |
| `docs/` | 自动化操作说明、设计文档和私有 Inbox 模板 |
| `min.conf` | Surge 最小主配置示例 |

## 兜底规则学习流程

该流程只处理主配置中显式触发 `SCRIPT,fallback-capture,Proxy` 的请求，避免把普通请求误采集为学习样本。整体链路如下：

1. Surge 本地脚本规范化并按天去重观察结果。
2. `fallback-upload.js` 将不可变批次投递到私有 `Surge-Rule-Inbox`。
3. 私有 Inbox 负责入库、分类、审核和提案准备。
4. 公开仓库的 Workflow 重新校验提案、来源锁、Public Suffix List 快照和生成目录。
5. 通过复验后，只更新 `generated` 分支中的 `Direct+`、`Proxy+` 及清单产物。

相关入口：

- `Automation/control-plane.json`：仓库和 kill switch 配置
- `Automation/sources.json`：允许使用的上游规则来源
- `Automation/sources.lock.json`：上游提交和内容 SHA-256 锁定
- `Automation/vendor/public_suffix_list.dat`：Public Suffix List 快照
- `Automation/rule-compiler.mjs`：规则编译和安全门禁
- `Automation/generate-rules.mjs`：生成规则产物
- `Automation/verify-rules.mjs`：规则文件校验
- `.github/workflows/publish-fallback.yml`：复验并发布到 `generated`
- `.github/workflows/update-source-locks.yml`：定期准备来源锁更新
- `docs/fallback-rule-learning-operation.md`：部署、dry-run、回滚和数据删除说明

## 测试与校验

仓库使用 Node.js 内置测试运行器，无需额外依赖：

```bash
node --test JS/tests/*.test.js Automation/tests/*.test.mjs
git diff --check
```

规则自动化还提供以下专项校验：

```bash
node Automation/verify-rules.mjs --rule-dir /path/to/generated-tree/Rule \
  --psl Automation/vendor/public_suffix_list.dat \
  --policies Direct,Proxy
node Automation/verify-generated-tree.mjs --root /path/to/generated-tree
```

执行 `verify-generated-tree.mjs` 时，应将 `--root` 指向只包含生成分支允许产物的目录。主分支目录包含完整源码和文档，适合使用测试命令及针对性脚本检查。

## 外部依赖

仓库部分模块和规则引用社区项目。引用第三方 raw 脚本时，建议固定提交版本或定期核验上游内容。

| 项目 | 用途 |
| --- | --- |
| [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) | 贴吧签到脚本及部分规则来源 |
| [RuCu6/QuanX](https://github.com/RuCu6/QuanX) | Rewrite 和广告处理方案来源 |
| [Rabbit-Spec/Surge](https://github.com/Rabbit-Spec/Surge) | Flush DNS 面板脚本 |
| [zZPiglet/Task](https://github.com/zZPiglet/Task) | 欧可林签到脚本 |
| [ForestofTime/RuCu6-main](https://github.com/ForestofTime/RuCu6-main) | 小红书和知乎脚本 |
| [soffchen/GeoIP2-CN](https://github.com/soffchen/GeoIP2-CN) | Clash ChinaIP 规则来源 |

## 风险提示

- 去广告和响应改写可能造成误杀，APP 更新后需要重新验证接口和字段。
- 使用 `MITM` 前请评估隐私、证书信任和合规要求。
- Telegram Host 映射只应保留已验证的劣化地址和同数据中心备用地址。
- 自动化流程中的 Token 只能保存在 Surge 持久存储或 GitHub Secrets，不要写入仓库文件、日志或 issue。
- `Module/boxjs/smzdm.boxjs.json` 仍含 `YourUsername/YourRepo` 等占位内容，发布前需要替换为真实链接。

## 维护说明

模块接口和脚本大多来自抓包验证或社区方案。修改后建议同时检查对应测试、MITM hostname、raw 脚本路径、规则顺序和目标客户端兼容性。

补充的逐文件说明见 [docs/repo-file-index.md](docs/repo-file-index.md)。
