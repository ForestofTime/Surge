# 高德广告净化 Surge 模块 v3

## v3 社区核对与纠错（2026-10-21）

保持一个模块、三个独立 JS，无内联 JQ。v2 的 7 条 Map Local 收敛为 5 条；两个混合接口改由页面脚本局部清理，避免清空业务响应。所有入口采用精确 host/path，允许有或没有查询参数，拒绝追加子路径。

- `marketingOperationStructured`：仅删除 `data.commonMaterial`、`data.tipsOperationLocation`、`data.resourcePlacement`。
- `promotion-web/resource` 和 `/home`：仅删除社区定义的 10 个营销字段，未知业务字段保留。
- 我的页保留 `MyOrderCard`，现有入口支持数字及等值字符串 ID，不转换输出类型。
- 合入旧版 `/ws/aos/alimama/splash_screen` 开屏路径，与现有 valueadded 路径共用一条 Map Local。
- 合入 `routeInfo`、`routePlan`，只在 `data.tbt.event`、`data.front_end.download` 两个数组过滤 `dynamic_id_s` 严格匹配 `^ads-\d+$` 的项；路线、普通事件、语音和其它容器透传。

社区对照来源：

- [可莉 Loon 插件快照](https://github.com/ifflagged/Romeo/blob/5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4/Modules/Loon/Kelee/Official/Amap_remove_ads.lpx)：与 v2 规则基线一致。原站本次返回 403，未声称直接取得原站最新内容。
- [RuCu6 Loon 规则快照](https://github.com/ifflagged/Romeo/blob/5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4/Modules/Loon/rucu6/Official/amap.lpx)与[响应脚本快照](https://github.com/ifflagged/Romeo/blob/5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4/Modules/JavaScript/rucu6/amap/rucu6_amap.js)：采用混合接口字段清理、订单卡和导航广告事件分类；未采用删除普通导航提示、天气、业务通知和整包路线卡等更激进操作。作者脚本地址本次返回 HTML，使用固定提交快照，不作为运行依赖。
- [墨鱼 QX 规则固定版本](https://github.com/ddgksf2013/Rewrite/blob/dc3ea2c1fb2db870676b26da24006083eb1d44d3/AdBlock/AmapAds.conf)：交叉确认 aos 开屏路径；未采用通配主机、全目录媒体拦截及 AMDC 改写。

本轮没有新高德 HAR。31 项合成回归通过，三个响应脚本行覆盖率 100%，总分支覆盖率 98.91%；覆盖率仅代表这些测试触达代码，不代表真实服务器结构或设备 UI 已验证。地点详情仍沿用 v2 的 94 项白名单，未来新增业务模块可能被过滤；不建议与其他高德模块叠加。

## v2 转换基线

来源为用户于 2026-10-20 提供的文本附件；不包含聊天署名、时间及其他聊天内容。

## 已转换

附件共 23 条：7 条 `reject_dict(200)` 保持 Map Local HTTP 200 空 JSON，其余响应操作移植为 3 个 Surge 原生 JS 响应脚本。模块不再包含 JQ 表达式。`JS/AmapUpdatable.jq`、`JS/AmapPoiDetail.jq` 独立保存源文件供审阅和差分测试，手机实际执行相应 `.js`，不下载或解释 `.jq`。

异常输入透传；内嵌 JSON 字符串损坏时独立保留该字段，其它正常配置继续处理。缺失字段不创建新配置。该保护不代表白名单筛选不会移除功能入口：原附件会精简我的卡片、工具入口、打车工具和搜索建议。`scene/recommend` 原先删除 shadingWords 后再筛选此字段的无效操作已折叠，最终效果保持一致。

## 两份 JQ 的固定来源与适配

附件未附正文的两份 JQ 从 GitHub 镜像 `ifflagged/Romeo` 的提交 `5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4` 读取并独立保存；不声称该镜像与原站当前版本完全一致。

- [kelee_updatable.jq](https://github.com/ifflagged/Romeo/blob/5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4/Modules/JavaScript/Kelee/Amap_remove_ads/kelee_updatable.jq)：原始字节 SHA-256 `dba0888e3e4491e282ce58e547e3a4125f6fd96057d0d5eaf878450fa40bd647`。
- [kelee_search_poi_detail.jq](https://github.com/ifflagged/Romeo/blob/5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4/Modules/JavaScript/Kelee/Amap_remove_ads/kelee_search_poi_detail.jq)：原始字节 SHA-256 `7def102b752835f8cbe63167b75dbe19997cb532f7e35d8283de4eeb5f2d4eb6`。

JS 实现保留上游白名单及数值开关，不扩大接口。POI 删除用户实时周边、家庭/公司信息属于源规则页面精简行为，并非广告判断。与源 JQ 的差分测试只覆盖给定合成输入，不能证明所有响应结构完全等价。

## 使用与验证

- 使用支持内联 Map Local 的 Surge iOS 5.10.0+ / Mac 5.6.0+；证书需安装并信任，开启 MITM、重写及脚本。
- [Surge 响应脚本语法](https://manual.nssurge.com/scripting/http-response.html)。模块缓冲上限 1 MB，超过时透传。
- 不使用 ScriptHub、远程 JQ；三个 JS 由 Surge 下载并缓存。MITM 仅追加附件中的 6 个精确主机，不做全域拦截、QUIC 或 HTTPDNS 改动。
- 自动化检查 JS、合成响应清理与兄弟字段保护、JQ/JS 差分、路径边界及 Surge 配置解析；没有高德 HAR 或真机 UI 验收，不能称导航、打车或广告过滤已在设备验证。
- 启用后冷启动，检查开屏、地图定位、路线规划、导航、搜索地点、打车订单和我的页面。异常时停用本模块回滚并保留 HAR；避免与其它高德净化模块叠加。
