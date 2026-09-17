/*
#!name=夸克福利中心 Cookie 捕获
#!desc=自动捕获夸克福利中心与网盘核心凭据 (kps/ut)，自动持久化存储为环境变量供用户查看与取用。
#!author=Levi
#!icon=https://raw.githubusercontent.com/czy13724/LeviIcons/main/leviicons/quark.png
#!category=Cookie 捕获

================================================================================
适用工具: Quantumult X / Shadowrocket / Loon / Surge / Stash / Egern
单文件自包含设计，自动持久化存储环境变量、多账号聚合与防抖机制
================================================================================

📲 各代理软件配置规则（可直接整段复制粘贴）：

--------------------------------------------------------------------------------
1. Quantumult X
--------------------------------------------------------------------------------
[rewrite_local]
^https?:\/\/(coral2\.quark|broccoli\.uc)\.cn\/.+ url script-request-header https://gist.githubusercontent.com/czy13724/c52f94adcd25d99ade12ead1e0eb57d8/raw/quark_cookie.js

[mitm]
hostname = coral2.quark.cn, broccoli.uc.cn

--------------------------------------------------------------------------------
2. Shadowrocket (小火箭)
--------------------------------------------------------------------------------
[Script]
夸克Cookie抓包 = type=http-request,pattern=^https?:\/\/(coral2\.quark|broccoli\.uc)\.cn\/.+,script-path=https://gist.githubusercontent.com/czy13724/c52f94adcd25d99ade12ead1e0eb57d8/raw/quark_cookie.js,requires-body=false

[MITM]
hostname = coral2.quark.cn, broccoli.uc.cn

--------------------------------------------------------------------------------
3. Loon
--------------------------------------------------------------------------------
[Script]
http-request ^https?:\/\/(coral2\.quark|broccoli\.uc)\.cn\/.+ script-path=https://gist.githubusercontent.com/czy13724/c52f94adcd25d99ade12ead1e0eb57d8/raw/quark_cookie.js, requires-body=false, tag=夸克Cookie抓包

[Mitm]
hostname = coral2.quark.cn, broccoli.uc.cn

--------------------------------------------------------------------------------
4. Surge
--------------------------------------------------------------------------------
[Script]
夸克Cookie抓包 = type=http-request,pattern=^https?:\/\/(coral2\.quark|broccoli\.uc)\.cn\/.+,script-path=https://gist.githubusercontent.com/czy13724/c52f94adcd25d99ade12ead1e0eb57d8/raw/quark_cookie.js,requires-body=false

[MITM]
hostname = %APPEND% coral2.quark.cn, broccoli.uc.cn

--------------------------------------------------------------------------------
5. Stash
--------------------------------------------------------------------------------
http:
  mitm:
    - "coral2.quark.cn"
    - "broccoli.uc.cn"
  script:
    - match: ^https?:\/\/(coral2\.quark|broccoli\.uc)\.cn\/.+
      name: quark_cookie
      type: request
      require-body: false
      script-path: https://gist.githubusercontent.com/czy13724/c52f94adcd25d99ade12ead1e0eb57d8/raw/quark_cookie.js
================================================================================
*/

const $ = new Env("夸克福利中心");

(function main() {
    if (typeof $request === "undefined" || !$request.url) {
        $.done({});
        return;
    }

    const url = $request.url;
    const headers = $request.headers || {};

    // 仅拦截夸克福利中心与活动核心业务接口
    if (url.indexOf("coral2.quark.cn") === -1 && url.indexOf("broccoli.uc.cn") === -1) {
        $.done({});
        return;
    }

    const rawCookie = headers["Cookie"] || headers["cookie"] || "";

    // 1. 提取 kps (优先从 Cookie 提取，其次尝试 URL Query 参数)
    let kps = "";
    const kpsMatch = rawCookie.match(/(?:^|;\s*)kps=([^;]+)/);
    if (kpsMatch) {
        kps = kpsMatch[1].trim();
    } else {
        try {
            const u = new URL(url);
            kps = u.searchParams.get("kps") || "";
        } catch (e) {
            const urlKps = url.match(/[?&]kps=([^&]+)/);
            if (urlKps) kps = decodeURIComponent(urlKps[1]).trim();
        }
    }

    // 2. 提取 ut (broccoli-user-id 或 ut 设备/用户标识)
    let ut = "";
    const utMatch = rawCookie.match(/(?:^|;\s*)(?:broccoli-user-id|ut)=([^;]+)/);
    if (utMatch) {
        ut = utMatch[1].trim();
    } else {
        try {
            const u = new URL(url);
            ut = u.searchParams.get("ut") || u.searchParams.get("broccoli-user-id") || "";
        } catch (e) {
            const urlUt = url.match(/[?&](?:broccoli-user-id|ut)=([^&]+)/);
            if (urlUt) ut = decodeURIComponent(urlUt[1]).trim();
        }
    }

    // 核心凭据守卫：kps 是夸克一切业务接口与签名验证的绝对核心！
    // 若当前请求没有携带 kps，说明仅是普通静态资源或前置打点请求，绝不能作为有效凭据捕获，直接跳过
    if (!kps) {
        $.done({});
        return;
    }

    // 自动规范化 Cookie 格式，确保 kps 与 ut 齐全
    let fullCookie = rawCookie;
    if (kps && fullCookie.indexOf("kps=") === -1) {
        fullCookie = (fullCookie ? fullCookie.replace(/;?\s*$/, "; ") : "") + "kps=" + kps + ";";
    }
    if (ut && fullCookie.indexOf("ut=") === -1 && fullCookie.indexOf("broccoli-user-id=") === -1) {
        fullCookie = (fullCookie ? fullCookie.replace(/;?\s*$/, "; ") : "") + "ut=" + ut + ";";
    }

    // 提取账号恒定唯一身份标识（与存量匹配共用同一算法，保证一致性）
    function computeIdentity(cookieStr) {
        if (!cookieStr) return "";
        const b = cookieStr.match(/(?:^|;\s*)broccoli-user-id=([^;]+)/);
        if (b) return "broc_" + decodeURIComponent(b[1].trim());
        const bu = cookieStr.match(/(?:^|;\s*)b-user-id=([^;]+)/);
        if (bu) return "buid_" + decodeURIComponent(bu[1].trim());
        const u = cookieStr.match(/(?:^|;\s*)ut=([^;]+)/);
        if (u && u[1].trim().length > 8) return "ut_" + u[1].trim();
        const k = cookieStr.match(/(?:^|;\s*)kps=([^;]+)/);
        if (k) return "kps_" + decodeURIComponent(k[1]).trim().substring(0, 16);
        return "";
    }

    const curUid = computeIdentity(fullCookie) || "default_user";

    // 从唯一持久化环境变量 QUARK_COOKIE 中读取已存内容
    const storedEnv = $.getdata("QUARK_COOKIE") || "";
    const cookieList = storedEnv ? storedEnv.split("&").map(s => s.trim()).filter(Boolean) : [];

    // 检索当前账号在列表中是否已存在
    let matchIndex = -1;
    for (let i = 0; i < cookieList.length; i++) {
        const uid = computeIdentity(cookieList[i]);
        if (uid && uid === curUid) {
            matchIndex = i;
            break;
        }
    }

    // 兜底匹配：同一账号可能以不同形态出现——
    // ① 有时带 ut、有时不带（uid 在 ut_xxx 与 kps_xxx 间漂移）
    // ② kps 会随会话轮换而整体变化（kps 前缀比对无效）
    // 策略：ut 是账号恒定标识；kps 解码后相同亦必为同账号（每账号唯一票据）。
    // 优先按 ut 比对，其次按解码后的 kps 全值比对。
    if (matchIndex === -1) {
        const curKps = decodeURIComponent(kps || "");
        for (let i = 0; i < cookieList.length; i++) {
            const item = cookieList[i];
            const itemUt = (item.match(/(?:^|;\s*)ut=([^;]+)/) || [])[1];
            if (ut && ut.length > 8 && itemUt && decodeURIComponent(itemUt.trim()) === decodeURIComponent(ut)) {
                matchIndex = i; break;
            }
            const itemKps = decodeURIComponent((item.match(/(?:^|;\s*)kps=([^;]+)/) || [])[1] || "");
            if (curKps && itemKps === curKps) { matchIndex = i; break; }
        }
    }

    // 单账号容错：若本地仅有 1 个账号，直接归为当前已有账号更新
    if (matchIndex === -1 && cookieList.length === 1 && curUid === "default_user") {
        matchIndex = 0;
    }

    const isExisting = matchIndex !== -1;
    const isCookieChanged = !isExisting || cookieList[matchIndex] !== fullCookie;

    // 防抖：相同 Cookie 无需重复处理；新账号或凭据更新时持久化
    if (isCookieChanged) {
        const accHint = (curUid.replace(/^[a-z]+_/, "").substring(0, 10)) || "夸克账号";
        const actionType = isExisting ? "UPDATE" : "NEW";

        if (isExisting) {
            // 字段级联合合并：新凭据逐字段覆盖旧凭据，旧凭据中新增凭据缺失的字段保留。
            // 典型场景：无 ut 的请求若整体替换，会把 ut / _UP_A4A_11_ 设备指纹等锚点冲掉，
            // 导致后续 kps 轮换无法关联、或双端任务因缺设备指纹而失败。
            const mergeCookie = (fresh, old) => {
                const order = [];
                const map = {};
                const eat = (str) => {
                    (str || "").split(";").forEach(seg => {
                        const kv = seg.trim();
                        if (!kv) return;
                        const eq = kv.indexOf("=");
                        if (eq === -1) return;
                        const key = kv.slice(0, eq).trim();
                        const val = kv.slice(eq + 1).trim();
                        if (!key) return;
                        if (!(key in map)) order.push(key);
                        map[key] = val;   // 后写入者优先（fresh 在 old 之后 eat）
                    });
                };
                eat(old);   // 先旧
                eat(fresh); // 后新：同名字段覆盖为最新值
                return order.map(k => `${k}=${map[k]}`).join("; ") + ";";
            };
            cookieList[matchIndex] = mergeCookie(fullCookie, cookieList[matchIndex] || "");
        } else {
            cookieList.push(fullCookie);
        }

        // 统一生成环境变量字串 (单账号直接存储，多账号自动以 & 聚合拼接)
        const envVal = cookieList.join("&");
        const accountCount = cookieList.length;

        // 唯一持久化存储：仅保留环境变量 QUARK_COOKIE
        $.setdata(envVal, "QUARK_COOKIE");

        // 清理可能残留的历史冗余存储
        try {
            if ($.getdata("QUARK_ACCOUNTS")) $.setdata("", "QUARK_ACCOUNTS");
        } catch (e) { }

        const actionTitle = actionType === "UPDATE" ? "🔄 夸克账号凭据已刷新更新" : "🎉 成功捕获夸克新账号凭据";
        const actionDetail = actionType === "UPDATE" ? "旧凭据已自动覆盖淘汰" : "已自动写入环境变量";

        $.log("\n" + "=".repeat(64));
        $.log(`${actionTitle}！ [${new Date().toLocaleString()}]`);
        $.log("=".repeat(64));
        $.log(`【操作类型】: ${actionType === "UPDATE" ? "覆盖更新已有账号凭据 ✅" : "登记新增账号凭据 ✅"}`);
        $.log(`【账号标识】: ${curUid} (当前已存 ${accountCount} 个有效账号)`);
        $.log(`【提取 kps】: ${kps}`);
        $.log(`【提取 ut 】: ${ut}`);
        $.log(`【环境变量】: 已存入代理应用持久化存储 (QUARK_COOKIE) ✅`);
        $.log("-".repeat(64));
        $.log("【青龙面板环境变量 (QUARK_COOKIE)】");
        $.log(`变量值: ${envVal}`);
        $.log("=".repeat(64) + "\n");

        const multiNotice = accountCount > 1 ? ` (累计 ${accountCount} 个账号)` : "";

        $.msg(
            $.name,
            `${actionTitle}！`,
            `账号: ${accHint}${multiNotice}\n${actionDetail}，QUARK_COOKIE 已同步更新。`
        );
    }

    $.done({});
})();

// ==============================================================================
// 跨平台兼容运行环境 (Env.js - 遵循社区规范压缩为单行)
// ==============================================================================
function Env(name, opts) { return new class { constructor(t, e) { this.name = t, this.logs = [], this.isMute = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e) } platform() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : "undefined" != typeof Egern ? "Egern" : "Unknown" } isQuanX() { return "Quantumult X" === this.platform() } isSurge() { return "Surge" === this.platform() } isLoon() { return "Loon" === this.platform() } isShadowrocket() { return "Shadowrocket" === this.platform() } isStash() { return "Stash" === this.platform() } getdata(t) { switch (this.platform()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Egern": return "undefined" != typeof $persistentStore ? $persistentStore.read(t) : null; case "Quantumult X": return "undefined" != typeof $prefs ? $prefs.valueForKey(t) : null; default: return null } } setdata(t, e) { switch (this.platform()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Egern": return "undefined" != typeof $persistentStore && $persistentStore.write(t, e); case "Quantumult X": return "undefined" != typeof $prefs && $prefs.setValueForKey(t, e); default: return !1 } } setClipboard(t) { if (!t) return !1; try { if ("undefined" != typeof $clipboard && "function" == typeof $clipboard.write) return $clipboard.write(t), !0; if (this.isQuanX() && "undefined" != typeof $prefs) return $prefs.setValueForKey(t, "$clipboard"), !0; if ("undefined" != typeof $rocket && "function" == typeof $rocket.setClipboard) return $rocket.setClipboard(t), !0 } catch (e) { } return !1 } msg(t = this.name, e = "", s = "", o = {}) { if (!this.isMute) try { this.isSurge() || this.isLoon() || this.isShadowrocket() || this.isStash() ? "undefined" != typeof $notification && $notification.post(t, e, s, o) : this.isQuanX() && "undefined" != typeof $notify && $notify(t, e, s, o) } catch (r) { this.log(`[通知发送失败]: ${r.message}`) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } done(t = {}) { "undefined" != typeof $done && $done(t) } }(name, opts) }

