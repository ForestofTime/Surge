# 去哪儿开屏模块 v1

2026-10-16 核对社区源码。发布文件：`Module/QunarAds.sgmodule`。

## 来源

- [fmz200 Surge](https://github.com/fmz200/wool_scripts/blob/main/Surge/module/split/partQ/Qunar.sgmodule)
- [fmz200 QX](https://github.com/fmz200/wool_scripts/blob/main/QuantumultX/rewrite/split/partQ/Qunar.snippet)
- [fmz200 Loon](https://github.com/fmz200/wool_scripts/blob/main/Loon/plugin/split/partQ/Qunar.lpx)
- [blackmatrix7 QX AdvertisingLite](https://github.com/blackmatrix7/ios_rule_script/blob/master/rewrite/QuantumultX/AdvertisingLite/AdvertisingLite.conf)

三个客户端版本采用相同接口：`homefront.qunar.com/front/splash/ad`、`qde.qunar.com/preload`、`client.qunar.com/pitcher-proxy?qrt=p_splashAd`。

## 整合范围

- 开屏配置返回 HTTP 200 与 JSON `{}`，对应社区 reject-dict。
- 预加载返回 HTTP 200 空正文，对应社区 reject-200。
- 开屏代理保持社区 reject 行为，只接受完整 `qrt=p_splashAd` 参数，支持参数换序。
- 添加路径与参数边界，防止命中同名前缀业务接口。
- 不合并共享图片目录拦截、业务域名拒绝、HTTPDNS 或 QUIC 改动；不依赖远程脚本及 ScriptHub。

## 验收边界

自动化测试仅证明规则匹配及配置语法。本次没有去哪儿 HAR，也没有 iPhone UI 实测，不能保证当前 App 的全部广告已去除。

启用后需信任 MITM 证书、开启重写并强退 App 冷启动，检查开屏、机票/酒店搜索、登录、订单和支付页面。缓存广告可在 App 内清理一次缓存后重测；不要求卸载 App。仍有广告或业务异常时保留最新 HAR。回滚时停用本模块即可。
