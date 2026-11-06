/*
 * 铛铛一下回收 — token 抓取 + 上报 (Tailnet receiver 版)
 * 基于独立最小版改造: 抓到后本地存 ddyxhs_data + POST 上报 Mac 青龙 receiver.
 * 依赖：无。语法：ES5 安全。兼容：Surge / Loon / Stash / Shadowrocket / QuantumultX / Node.js
 *
 * 抓取点：
 *   ① 响应体：^https?://vues\.dd1x\.cn/wechat/login      (recommended)
 *   ② 请求头：^https?://vues\.dd1x\.cn/                  (兜底)
 *
 * Surge 上报目标: https://hynmac-mini.taila66285.ts.net/ddyxhs (policy: Tailnet)
 */

var KEY = "ddyxhs_data";
var RECEIVER = "https://hynmac-mini.taila66285.ts.net/ddyxhs";

function isNode() {
    return typeof module !== "undefined" && typeof module.exports !== "undefined";
}

function readStore(k) {
    try {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
        if (isNode()) {
            var fs = require("fs");
            if (!fs.existsSync("./ddyxhs_box.dat")) return null;
            var o = JSON.parse(fs.readFileSync("./ddyxhs_box.dat", "utf8"));
            return o[k] || null;
        }
    } catch (e) {}
    return null;
}

function writeStore(k, v) {
    try {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
        if (isNode()) {
            var fs = require("fs");
            var o = {};
            if (fs.existsSync("./ddyxhs_box.dat")) o = JSON.parse(fs.readFileSync("./ddyxhs_box.dat", "utf8"));
            o[k] = v;
            fs.writeFileSync("./ddyxhs_box.dat", JSON.stringify(o));
            return true;
        }
    } catch (e) {}
    return false;
}

function log() {
    var a = [], i;
    for (i = 0; i < arguments.length; i++) a.push(arguments[i]);
    console.log(a.join(" "));
}

function notify(title, body) {
    try {
        if (typeof $notification !== "undefined") { $notification.post(title, "", body); return; }
        if (typeof $notify !== "undefined") { $notify(title, "", body); return; }
    } catch (e) {}
}

/* ---------- 手写 base64url -> utf8 ---------- */

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64ToBytes(str) {
    str = String(str).replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
    var out = [];
    var buf = 0, bits = 0, i, idx;
    for (i = 0; i < str.length; i++) {
        idx = B64.indexOf(str.charAt(i));
        if (idx < 0) continue;
        buf = (buf << 6) | idx;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buf >> bits) & 255);
        }
    }
    return out;
}

function bytesToUtf8(b) {
    var out = "", i = 0, c, c2, c3, c4, cp;
    while (i < b.length) {
        c = b[i++];
        if (c < 0x80) out += String.fromCharCode(c);
        else if (c >= 0xC0 && c < 0xE0) { c2 = b[i++]; out += String.fromCharCode(((c & 0x1F) << 6) | (c2 & 0x3F)); }
        else if (c >= 0xE0 && c < 0xF0) { c2 = b[i++]; c3 = b[i++]; out += String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F)); }
        else { c2 = b[i++]; c3 = b[i++]; c4 = b[i++]; cp = ((c & 0x07) << 18) | ((c2 & 0x3F) << 12) | ((c3 & 0x3F) << 6) | (c4 & 0x3F); cp -= 0x10000; out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
    }
    return out;
}

function telFromToken(token) {
    try {
        var seg = String(token).split(".");
        if (seg.length < 2) return "";
        var p = JSON.parse(bytesToUtf8(b64ToBytes(seg[1])));
        return p.mobile || p.tel || p.phone || "";
    } catch (e) { return ""; }
}

/* ---------- 上报 receiver ---------- */

function postReceiver(tel, token) {
    if (typeof $httpClient === "undefined") {
        log("跳过上报: 宿主无 $httpClient");
        return;
    }
    $httpClient.post({
        url: RECEIVER,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tel: tel, token: token }),
        timeout: 8,
        policy: "Tailnet"
    }, function (error, response, data) {
        if (error) {
            log("❌ 上报失败: " + String(error).slice(0, 120));
            notify("铛铛一下回收", "token 上报失败: " + String(error).slice(0, 60));
            return;
        }
        var status = response && (response.status || response.statusCode);
        if (status >= 200 && status < 300) {
            log("✅ 上报成功 HTTP=" + status);
        } else {
            log("❌ 上报失败 HTTP=" + status + " body=" + String(data).slice(0, 120));
            notify("铛铛一下回收", "token 上报失败 HTTP=" + status);
        }
    });
}

/* ---------- 取 token / tel ---------- */

function pick() {
    var token = "", tel = "", h, d, body, i, names;

    if (typeof $response !== "undefined" && $response && $response.body) {
        try {
            body = JSON.parse($response.body);
            d = body ? body.data : null;
            if (d && d.token) {
                token = d.token;
                tel = d.tel || telFromToken(token);
            }
        } catch (e) {}
    }

    if (!token && typeof $request !== "undefined" && $request) {
        h = $request.headers || {};
        names = ["token", "Token", "TOKEN", "x-token", "authorization", "Authorization"];
        for (i = 0; i < names.length; i++) {
            if (h[names[i]]) {
                token = String(h[names[i]]).replace(/^Bearer\s+/i, "");
                break;
            }
        }
        if (token) tel = telFromToken(token);
    }

    return { token: token, tel: tel };
}

function save(tel, token) {
    var list = [];
    try { list = JSON.parse(readStore(KEY) || "[]"); } catch (e) {}
    if (!(list instanceof Array)) list = [];

    var found = false, i;
    for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].tel === tel) { list[i].token = token; found = true; break; }
    }
    if (!found) list.push({ tel: tel, token: token });

    writeStore(KEY, JSON.stringify(list));
    return found;
}

/* ---------- 入口 ---------- */

(function main() {
    var r = pick();
    var msg;

    if (!r.token) {
        log("❌ 未取到 token");
    } else if (!r.tel) {
        log("⚠️ 有 token 但解不出手机号，跳过");
    } else {
        msg = (save(r.tel, r.token) ? "✅ 已更新账号: " : "✅ 新增账号: ") + r.tel;
        log(msg);
        notify("铛铛一下回收", msg);
        postReceiver(r.tel, r.token);
    }

    if (typeof $done === "function") $done({});
})();
