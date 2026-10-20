# 高德附件规则的 Surge 模块 v2

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
