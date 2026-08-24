# ForestofTime Surge

面向 Surge iOS 与 macOS 的个人配置仓库。内容包括原生模块、响应脚本、分流规则、定时任务、HAR 修复技能和发布校验工具。模块优先采用明确的接口边界，并用测试保护广告清理与业务透传。

## 仓库内容

| 目录 | 内容 |
| --- | --- |
| `Module/`、`modules/` | 去广告、响应改写、Host 覆盖和面板模块 |
| `JS/`、`JS/tests/` | Surge JavaScript 与回归测试 |
| `Rule/`、`Source/` | 手工规则、上游规则源和生成规则 |
| `Task/` | 定时任务与兜底规则学习模块 |
| `Skills/` | 可复用的 Surge HAR 诊断、修复与发布流程 |
| `Automation/` | 模块检查、规则编译和发布安全门禁 |
| `Clash/` | Clash for Windows 兼容模板 |
| `min.conf` | Surge 最小主配置示例 |

## 使用

1. 在下表选择模块，打开 Raw 或一键导入链接。
2. 模块包含 `MITM`、`Body Rewrite` 或响应脚本时，安装并信任 Surge 证书，启用对应功能。
3. 同一 App 存在互斥模块时，只启用一个。工银e生活 App 与微信小程序模块明确互斥。
4. App 更新后若出现广告回现或业务误杀，保留最新 HAR，并按仓库技能重新验证。

## 模块索引

| 序号 | 文件 | 名称 | 分类 | 精确范围 | Raw | Surge |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `Module/BaiduNetDisk.sgmodule` | 百度网盘去广告 | AdBlock | Surge 原生模块。清理百度网盘任务、活动、推荐和首页广告卡片。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/BaiduNetDisk.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FBaiduNetDisk.sgmodule) |
| 2 | `Module/CCBLife.sgmodule` | 建行生活去广告 | AdBlock | 默认清理建行生活开屏，可按参数启用页面广告过滤。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/CCBLife.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FCCBLife.sgmodule) |
| 3 | `Module/CainiaoMiniProgram.sgmodule` | 菜鸟淘宝小程序去广告 | AdBlock | 清理菜鸟小程序广告与 HTTPDNS，保留包裹和取寄件。v10 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/CainiaoMiniProgram.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FCainiaoMiniProgram.sgmodule) |
| 4 | `Module/ChinaMobile.sgmodule` | 中国移动去广告 | AdBlock | 原生清理启动页、顶部拉新、营销专区与导航横幅。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ChinaMobile.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FChinaMobile.sgmodule) |
| 5 | `Module/CaoCaoTravel.sgmodule` | 曹操出行去广告 | AdBlock | Surge 原生模块。拦截曹操出行广告、营销、推荐与资源更新接口。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/CaoCaoTravel.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FCaoCaoTravel.sgmodule) |
| 6 | `Module/Didichuxing.sgmodule` | 滴滴出行去广告 | AdBlock | 清理滴滴首页、推荐流、钱包营销和个人页广告。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/Didichuxing.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FDidichuxing.sgmodule) |
| 7 | `Module/GoofishAds.sgmodule` | 闲鱼去广告 | AdBlock | 清理闲鱼广告接口、页面广告字段和专属 HTTPDNS。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/GoofishAds.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FGoofishAds.sgmodule) |
| 8 | `Module/GoogleRewrite.sgmodule` | Google Rewrite | System | 将 iOS Safari 的 Google.cn 搜索重定向至 Google.com。 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/GoogleRewrite.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FGoogleRewrite.sgmodule) |
| 9 | `Module/ICBCLife.sgmodule` | 工银e生活 App 去开屏广告 | AdBlock | 学习工银e生活全屏开屏素材，后续请求直接跳过。v7 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ICBCLife.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FICBCLife.sgmodule) |
| 10 | `Module/ICBCLifeMiniProgram.sgmodule` | 工银e生活微信小程序去开屏 | AdBlock | 清理工银e生活微信小程序开屏；与原生 App 模块互斥。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ICBCLifeMiniProgram.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FICBCLifeMiniProgram.sgmodule) |
| 11 | `Module/JDFinance.sgmodule` | 京东金融去开屏 | AdBlock | 仅清空京东金融开屏配置，保留页面与金融业务。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/JDFinance.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJDFinance.sgmodule) |
| 12 | `Module/JingdongAds.sgmodule` | 京东去开屏 | AdBlock | 仅拦截京东开屏图片和启动媒体，保留页面业务。v15 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/JingdongAds.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FJingdongAds.sgmodule) |
| 13 | `Module/MeiYou-Extra-AdBlock.sgmodule` | MeiYou Extra AdBlock (HAR-based) | AdBlock | 清理美柚开屏、信息流广告和广告埋点。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/MeiYou-Extra-AdBlock.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FMeiYou-Extra-AdBlock.sgmodule) |
| 14 | `Module/PinduoduoNative.sgmodule` | 拼多多去广告（QingRex 原生兼容） | AdBlock | 清理拼多多聊天与个人中心广告，透传首页、搜索和详情。v14 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/PinduoduoNative.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FPinduoduoNative.sgmodule) |
| 15 | `Module/PuPuSupermarket.sgmodule` | 朴朴超市去广告 | AdBlock | 清理朴朴广告接口、HTTPDNS、原始 TLS 和开屏素材。v24 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/PuPuSupermarket.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FPuPuSupermarket.sgmodule) |
| 16 | `Module/Qidian_Ad2.sgmodule` | 起点读书去广告（iOS 修复版） | AdBlock | 清理起点开屏、导读、弹窗、悬浮广告和页面推广。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/Qidian_Ad2.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FQidian_Ad2.sgmodule) |
| 17 | `Module/SuperDeer.sgmodule` | 超鹿运动去开屏广告 | AdBlock | 清空超鹿运动开屏配置的 data.splashes。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/SuperDeer.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FSuperDeer.sgmodule) |
| 18 | `Module/TaobaoAds.sgmodule` | 淘宝广告净化 | AdBlock | 清理淘宝开屏、PopLayer 和 Tanx 广告，保留商品业务。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/TaobaoAds.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FTaobaoAds.sgmodule) |
| 19 | `Module/Telegram-DC.sgmodule` | Telegram 优选 IP 覆盖 | System | 将已验证的 Telegram DC2/DC5 劣化 IP 替换为同 DC 备用地址。 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/Telegram-DC.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FTelegram-DC.sgmodule) |
| 20 | `Module/XHS.sgmodule` | 去广告｜小红书 | AdBlock | 清理小红书开屏、信息流、搜索和详情页广告。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/XHS.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FXHS.sgmodule) |
| 21 | `Module/ZhiHu.sgmodule` | 去广告｜知乎 | AdBlock | 清理知乎开屏、推荐流、横幅、搜索和回答页广告。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ZhiHu.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FZhiHu.sgmodule) |
| 22 | `Module/ad.conf` | MyBlockAds | AdBlock | 多应用 URL Rewrite 去广告合集。 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/ad.conf) | 不适用 |
| 23 | `Module/jf.sgmodule` | 京粉去广告 | AdBlock | 清理京粉开屏和首页横幅，保留业务数据。v2 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/jf.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fjf.sgmodule) |
| 24 | `Module/nyyh.sgmodule` | 农业银行去开屏广告 | AdBlock | 拦截农业银行 App 开屏广告；清缓存后生效。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/nyyh.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fnyyh.sgmodule) |
| 25 | `Module/panel/Flush-DNS.sgmodule` | Flush DNS | Pannel | 清理 Surge DNS 缓存。v2 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/panel/Flush-DNS.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fpanel%2FFlush-DNS.sgmodule) |
| 26 | `Module/sams.sgmodule` | 山姆会员商店 App 去开屏广告 | AdBlock | 拦截山姆会员商店 App 开屏请求。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/sams.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fsams.sgmodule) |
| 27 | `Module/xysh.sgmodule` | 兴业生活去广告 | AdBlock | 拦截兴业生活开屏、弹窗和横幅广告。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/xysh.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fxysh.sgmodule) |
| 28 | `Module/yj.sgmodule` | 易捷加油广告拦截 | AdBlock | 清理易捷加油小程序开屏、弹窗和横幅广告。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/yj.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FModule%2Fyj.sgmodule) |
| 29 | `Task/FallbackRules.sgmodule` | 兜底规则学习 | System | 记录显式兜底域名或 IP，每日投递至私有 GitHub Inbox。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Task/FallbackRules.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FTask%2FFallbackRules.sgmodule) |
| 30 | `Task/Task.sgmodule` | 定时任务 | System | 运行欧可林与贴吧签到任务。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/Task/Task.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2FTask%2FTask.sgmodule) |
| 31 | `modules/didi-adblock.sgmodule` | 滴滴开屏/弹窗去广告（精简版） | AdBlock | 仅拦截滴滴乘客与车主 App 的开屏和弹窗请求。v1 | [Raw](https://raw.githubusercontent.com/ForestofTime/Surge/main/modules/didi-adblock.sgmodule) | [导入](surge:///install-module?url=https%3A%2F%2Fraw.githubusercontent.com%2FForestofTime%2FSurge%2Fmain%2Fmodules%2Fdidi-adblock.sgmodule) |

独立资源：[Module/boxjs/smzdm.boxjs.json](https://raw.githubusercontent.com/ForestofTime/Surge/main/Module/boxjs/smzdm.boxjs.json) 为 BoxJS 配置模板，发布前需要替换占位链接。

## Surge HAR 模块修复技能

仓库已发布 [Skills/debug-surge-qx-parity](Skills/debug-surge-qx-parity/SKILL.md)。该技能用于处理以下问题：

- 广告随机回现、视频素材轮换和持久缓存回退
- QX 生效而 Surge 未生效
- HTTPDNS、原始 TLS、QUIC 或 HTTP/3 绕过
- 搜索、刷新、商品详情、包裹和页面业务误杀
- RED、GREEN、覆盖率、Surge 解析、Raw 哈希与设备冷启动验收

工具入口：

```bash
python3 Skills/debug-surge-qx-parity/scripts/har_timeline.py latest.har \
  --match 'target\.api|exposure|FAIL_SYS_NETWORK_ERROR'
python3 Skills/debug-surge-qx-parity/scripts/har_endpoint_diff.py QX.har Surge.har \
  --host api.example.com
```

时间线工具只输出请求元数据和匹配来源，不打印请求头、Cookie 或正文。

## 验证

```bash
node --test
node Automation/lint-sgmodule.mjs
git diff --check
```

需要验证完整 Surge 配置时，将模块合并进含 `[Rule]` 与 `FINAL,DIRECT` 的临时配置，再运行：

```bash
/Applications/Surge.app/Contents/Applications/surge-cli --check merged-test.conf
```

## 规则学习与自动化

`Task/FallbackRules.sgmodule` 只声明采集脚本。主配置需将 `SCRIPT,fallback-capture,Proxy` 放在正式规则末尾和 `FINAL` 之前。部署、dry-run、回滚和数据删除见 [操作说明](docs/fallback-rule-learning-operation.md)。

公开规则发布受允许路径、来源锁、Public Suffix List 快照、规则语法和敏感信息检查约束。核心入口位于 `Automation/control-plane.json`、`Automation/sources.lock.json` 和 `.github/workflows/publish-fallback.yml`。

## 安全边界

- 去广告和响应改写可能随 App 接口变化产生误杀，自动化通过后仍需真机冷启动验证。
- `REJECT` 可能触发客户端旧缓存。抓包证明存在缓存回退时，优先返回客户端接受的成功空响应。
- 共享商品、媒体和业务接口只能按稳定上下文或结构过滤。
- `MITM`、`tcp-connection = true` 和 QUIC 回退会扩大流量接管范围，必须限定到已验证主机。
- Token、Cookie、订阅 URL、节点密码、私钥和 HAR 正文禁止提交。凭据只存 Surge 持久存储、环境变量或 GitHub Secrets。

逐文件维护说明见 [docs/repo-file-index.md](docs/repo-file-index.md)。
