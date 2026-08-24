---
name: debug-surge-qx-parity
description: 诊断、修复并发布 iOS Surge 的 HAR 驱动模块回归，覆盖去广告失效、开屏视频轮换、页面业务误杀、QX 生效但 Surge 失效、HTTPDNS 或原始 TLS 绕过、QUIC/HTTP3 回退、网络失败触发持久缓存、App 本地缓存以及共享接口被过宽重写。遇到“广告随机复现”“已拦素材仍显示容器”“更新后搜索、详情或刷新失效”“清缓存后开屏仍出现”等场景时使用。
---

# Surge HAR 模块修复与 QX 一致性

## 目标与边界

以最新 HAR、当前模块和设备现象建立完整证据链，再做最小修改。

- 保留已验证业务功能，并为每个历史回归增加测试。
- 优先处理广告配置、布局或专用媒体请求。避免素材 ID、图片哈希、广告位编号和文案硬编码。
- 将状态分成 `prepared`、`observed`、`verified`。HAR 回放和自动化测试通过后，设备 UI 仍需冷启动验收。
- 先做只读分析。只有用户要求修复或发布时才修改仓库、推送或打标签。
- 无法承诺永久杜绝服务端轮换。用稳定上下文和结构覆盖已观测的请求族，并明确剩余边界。

处理广告、缓存或业务误杀时，读取 [证据与修复模式](references/evidence-playbook.md)。

## 选择最新证据

1. 按修改时间定位最新 HAR，不依赖文件名日期。
2. 记录 creator、Surge 版本、App User-Agent、抓包起止时间、页面操作和截图时间。
3. 检查当前模块版本、脚本查询版本、MITM 主机、规则命中注释和工作树状态。
4. 有 QX 基线时，确保 App 版本、账号、页面路径和启动方式一致，再运行：

```bash
python3 scripts/har_endpoint_diff.py QX.har Surge.har --host api.example.com
```

5. 只有 Surge HAR 时，按时间检查目标 API、曝光、素材和脚本命中：

```bash
python3 scripts/har_timeline.py latest.har \
  --match 'target\.api|exposure|FAIL_SYS_NETWORK_ERROR'
```

时间线工具只输出请求元数据和匹配来源，不打印 headers、cookies 或 body。

## 建立请求链

对每条关键请求记录：

- URL、host、method、status、协议、响应大小和时间顺序。
- 请求上下文字段，例如 `page_sn`、`page_id`、`scene`、`refer_page_sn`、播放器 Referer 和 App UA。
- HAR `comment` 中的 `Handled by VIF`、SNI、协议协商、脚本找到和响应已修改。
- 原始响应是否完整，改写后哪些字段被删除，以及 UI 曝光发生在请求前还是请求后。

不得只比较图片数量。图片被拦后容器仍存在时，继续追踪布局 API、缓存或本地配置。

## 先建立 QX 语义基线

逐条读取 QX HAR 的实际状态和 body：

| QX 行为 | Surge 等价实现 |
|---|---|
| `url REJECT` | `Map Local` 返回抓包一致的显式状态码和空 body |
| `reject-dict` | `Map Local` 返回 `200`、`{}` 和 JSON Content-Type |
| `script-response-body` | `type=http-response`、`requires-body=true`，脚本只调用一次 `$done` |
| `hostname` | `[MITM] hostname = %APPEND% ...` |

某些 App 会区别处理连接失败、空 404、空 200、`{}` 和业务协议的成功空 JSON。优先复现客户端已接受的响应语义。

## 按证据选择修复层

### 接口存在但规则未修改

检查 MITM、证书、脚本与重写开关、pattern、query/version 后缀、body 编码、`requires-body` 和脚本异常。对复杂 API 家族可用较宽入口，再在脚本内部严格按 host、path、method 和上下文分派。

### 关键接口完全缺失

先查 HTTPDNS、VIF 原始连接和协议回退：

```ini
[General]
force-http-engine-hosts = %APPEND% HTTPDNS_IP:PORT

[MITM]
hostname = %APPEND% api.example.com
tcp-connection = true
```

- 明文 HTTPDNS 使用 `force-http-engine-hosts`。
- 原始 TLS 使用 `tcp-connection = true`，让匹配 hostname 的 Type 3 连接进入 HTTP 引擎。
- QUIC/HTTP3 绕过时，只对有证据的主机拒绝 QUIC，促使其回落到可执行脚本的 TCP HTTP。
- 专用 reply 主机确认只承载广告响应时，可精确全协议阻断；不要扩大到业务主域后缀。
- 禁止默认使用 `<ip-address>`，也不要覆盖用户已有 MITM hostname 列表。

### 请求失败后旧广告随机复现

比较曝光和请求顺序。若广告接口报网络错误，随后复用相同素材，优先返回协议正确的 HTTP 200 成功空响应，避免客户端走持久缓存回退。混合业务接口只能按广告展示结构过滤，不能清空整个响应。

### UI 在请求前出现且没有新鲜响应

将其标记为 App 或小程序本地缓存。Surge 无法删除本地文件。安装修复后强退 App、清理一次适用缓存并冷启动；仍出现时再抓包。不要继续盲目增加域名规则。

### 视频或图片素材定期轮换

用稳定上下文分类：专用 host/path 家族、App 媒体 UA、页面或播放器 Referer 前缀。覆盖抓包确认的 MP4、M3U8、TS 等回退链，保留商品详情、直播和共享媒体主机的其它上下文。

### 修复广告后业务功能损坏

确认服务端原始响应是否 HTTP 200 且结构完整，再检查连续 Body Rewrite 或共享接口规则。共享商品流必须结合页面上下文判断，单个 refer 字段不足时宁可透传。删除导致破坏的宽规则，并把广告清理收窄到专用接口或稳定结构。

## TDD 与回归保护

1. 先写失败测试，回放最新 HAR 并证明当前版本确实失败。
2. 同一测试锁定需保留的首页入口、搜索、刷新、商品详情、包裹、聊天或个人数据。
3. 做单一根因的最小修改。不要同轮扩大传输、API、素材和页面字段四个层级。
4. 运行目标测试、覆盖率和全仓测试；业务脚本覆盖率至少 80%。
5. 运行 `node --check` 或相应语法检查及 `git diff --check`。
6. 用 Surge 原生解析器验证完整合并配置：

```bash
/Applications/Surge.app/Contents/Applications/surge-cli --check merged-test.conf
```

模块片段可能报告 `Rules must end with FINAL`。临时合并配置必须包含 `[Rule]` 和 `FINAL,DIRECT`，验证后删除。

## 发布与设备验收

用户授权发布后：

1. 确认分支、远端差异和工作树，仅暂存相关文件。
2. 保留 RED 和 GREEN 提交，推送当前分支并创建模块版本标签。
3. 下载 GitHub Raw，比较本地与远端字节或 SHA-256。
4. 完整打印 Raw URL 和 `surge:///install-module?url=<URL-encoded-raw-url>`。
5. 要求设备确认模块版本，强退 App 后冷启动，逐项测试广告位置和被保护业务。
6. 若设备仍失败，收集新 HAR 并从证据分类重新开始，避免在旧假设上叠加规则。

## 风险控制

- `tcp-connection = true` 会影响最终有效 MITM hostname 列表。主配置含 `*` 时范围明显扩大。
- 错把非 HTTP/TLS 协议送入 HTTP 引擎会中断连接；证书固定也可能导致回归。
- 全协议 `REJECT` 可能触发旧缓存；成功空响应也必须符合业务协议形状。
- 结构过滤必须同时测试广告被删除和业务兄弟字段被保留。
- 精确 API IP 只适合处理现有 HTTPDNS 缓存，长期规则应依赖域名 SNI 和 HTTPDNS 清理。

## 交付清单

最终报告必须包含：

1. 最新 HAR 与模块版本证据。
2. 根因层级和时间顺序。
3. 修复范围及保留的业务功能。
4. 修改文件、版本、提交、标签和完整订阅地址。
5. RED、GREEN、覆盖率、全仓测试、Surge 解析和 Raw 哈希结果。
6. `prepared`、`observed`、`verified` 状态，以及设备冷启动待验项。
7. 优势、风险和置信度。
