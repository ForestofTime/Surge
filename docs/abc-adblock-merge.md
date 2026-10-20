# 农业银行模块合并 v2

2026-10-20 只保留 `Module/ABCSplash.sgmodule`，删除重复的 `Module/nyyh.sgmodule`。旧文件由 Git 历史保留，可恢复；已安装 nyyh 的设备需手动删除旧模块、导入新地址，GitHub Raw 不会自动重定向。

## 社区核对与取舍

- [fmz200 Surge 农行模块](https://github.com/fmz200/wool_scripts/blob/main/Surge/module/split/partN/ABC.sgmodule) 与 [Loon 版本](https://github.com/fmz200/wool_scripts/blob/main/Loon/plugin/split/partN/ABC.lpx)均使用 `midc` 下的 `ed64/74b5` 前缀，与原 nyyh 一致。
- 社区将 midc 除外白名单式宽规则注释。另一条 enjoy 负向前瞻尾部有空分支，不能当作有效的宽目录覆盖直接搬运。本文不启用这些规则，也不增加业务主域或遥测拦截。
- 保留两组已知前缀，改为合法透明 GIF 响应，避免素材请求返回 JSON/文本或连接错误。
- 其它 midc 素材只在 JPEG/PNG 宽至少 1000 且高宽比至少 1.7 时替换。横幅、小图及不识别格式透传。尺寸属于启发式，正常全屏海报也可能命中，出现误杀应停用并抓包。

## 二进制修正与验收边界

Surge 原生脚本使用 `binary-body-mode=true`，读写 Uint8Array，不再依赖测试环境模拟的 atob/Buffer 或把图片当 Base64 文本。增加 PNG 完整签名、IHDR 与 JPEG 段边界检查。仅覆盖 midc 素材目录，超过 1 MiB 响应由 Surge 透传。

测试使用合成 JPEG/PNG 头证明规则与尺寸解析，不能替代设备图片解码及业务验收。本次没有新农行 HAR 或真机记录。启用后应测试冷启动、切回前台、登录、账户查询及转账页面；不执行真实转账。可在停用模块后回滚。
