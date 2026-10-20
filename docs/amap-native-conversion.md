# 高德附件规则的 Surge 原生转换 v1

来源为用户于 2026-10-20 提供的文本附件；不包含聊天署名、时间及其他聊天内容。

## 已转换

附件共 23 条：7 条 `reject_dict(200)` 转为 Map Local HTTP 200 空 JSON，14 条可见 `response.json.delete/jq` 加 2 条从 GitHub 固定版本取得的 `jq_file` 共转为 16 条原生 JQ Body Rewrite。原始接口、大小写不敏感匹配及同接口执行顺序保持不变。删除路径转为 `delpaths`，带 `$` 的 JSONPath 去掉根标记，数字开头的对象键仍按字符串处理。

每条 JQ 以原始输入兜底，执行出错时保留该条规则执行前的数据。该保护不代表白名单筛选不会移除功能入口：原附件会精简我的卡片、工具入口、打车工具和搜索建议，采用前应确认这些取舍。尤其 `scene/recommend` 先删除 shadingWords，后续针对该字段的 JQ 因字段缺失不会生效，此处保留原顺序而不猜测作者意图。

## 两份 JQ 的固定来源与适配

附件未附正文的两份 JQ 从 GitHub 镜像 `ifflagged/Romeo` 的提交 `5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4` 读取，保留原逻辑并删除注释内联；不声称该镜像与原站当前版本完全一致。

- [kelee_updatable.jq](https://github.com/ifflagged/Romeo/blob/5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4/Modules/JavaScript/Kelee/Amap_remove_ads/kelee_updatable.jq)：原始字节 SHA-256 `dba0888e3e4491e282ce58e547e3a4125f6fd96057d0d5eaf878450fa40bd647`。
- [kelee_search_poi_detail.jq](https://github.com/ifflagged/Romeo/blob/5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4/Modules/JavaScript/Kelee/Amap_remove_ads/kelee_search_poi_detail.jq)：原始字节 SHA-256 `7def102b752835f8cbe63167b75dbe19997cb532f7e35d8283de4eeb5f2d4eb6`。

两个内联表达式以数组收集运行结果，恰好一条输出才采用；异常、空输出或多输出均透传该步骤原始输入。上游白名单及数值开关保留，不扩大到其它接口。POI 删除用户实时周边、家庭/公司信息属于源规则页面精简行为，并非把这些字段认定为广告。

## 使用与验证

- 需 Surge iOS 5.14.0+ / Mac 5.9.0+，且当前版本支持 JQ Body Rewrite；证书需安装并信任，开启 MITM 与重写。
- [Surge 官方语法](https://manual.nssurge.com/http/body-rewrite.html)。原生 JQ 对 iOS 超过 1 MB / Mac 超过 10 MB 的响应会放弃改写，具体以当前客户端行为为准。
- 不使用 ScriptHub、JS、远程 JQ；MITM 仅追加附件中的 6 个精确主机，不做全域拦截、QUIC 或 HTTPDNS 改动。
- 自动化检查 JQ 编译、合成响应清理与兄弟字段保护、路径边界及 Surge 配置解析；没有高德 HAR 或真机 UI 验收，不能称导航、打车或广告过滤已在设备验证。
- 启用后冷启动，检查开屏、地图定位、路线规划、导航、搜索地点、打车订单和我的页面。异常时停用本模块回滚并保留 HAR；避免与其它高德净化模块叠加。
