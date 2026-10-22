/**
 * CMCCHebaoCapture.js — 和包悦看凭据抓取 · Surge 版 v2（哑捕获 + 原样转发）
 *
 * 架构约定（2026-10-22 与用户对齐）：Surge 只负责「截到 → 原样传 Mac」，
 * 一切处理（解密 / 归一化 / 校验 / 去重 / 落库）都在 Mac receiver
 * （cmcc-hebao-receiver.js）里做，再进青龙。设备端保持哑、瘦、无状态。
 *
 * 此前自动捕获脚本踩过的坑，本脚本刻意规避：
 *   1. 设备端做复杂链路（CMCCMiniCapture 的三步识别链）→ 这里零处理，只透传原文；
 *   2. 设备端去重吃票（票是单次性的，一旦上报失败就永久丢）→ 不去重，
 *      幂等交给 receiver（同值不重写）；配合 receiver 的限速，重复流量无害；
 *   3. 失败通知刷屏 → 设备端只 console.log，可观测性全在 Mac 侧；
 *   4. key 名漂移（钩子写 cmcc_cmpay_sid、CLI 读 cmcc_cmpay_act_sid 的历史 bug）
 *      → 设备端不碰 key 名，只报 type，映射在 receiver 一处完成；
 *   5. $persistentStore 长期累积 → 本脚本零持久化读写。
 *
 * 上报体（全部原文，Mac 可复核）：
 *   { type: 'cred'|'sso'|'sid'|'opdfp', value, raw?, phone? }
 *     cred : client.app.coc.10086.cn autoLogin 请求体（和包 App 一键登录密文，原样）
 *     sso  : p.10086.cn get_mbl 302 Location（原样 + 从中提取的 ssoToken）
 *     sid  : ump.cmpay.com ssoTokenLogin 响应 Set-Cookie（原样 + act_sid）
 *     opdfp: ump.cmpay.com activities URL 的 opDfp 参数
 *   另含 meta: { url, ts } 便于 Mac 侧审计。
 *
 * MITM：client.app.coc.10086.cn, p.10086.cn, ump.cmpay.com（详见 sgmodule）
 */

/* global $httpClient, $done, $request, $response, $argument */

(function () {
  'use strict';

  // ---- script-arguments（Surge 里未声明的全局直接引用会 ReferenceError，
  //      http-request 脚本中根本没有 $response —— 必须一律 typeof 守卫）----
  var ARGS = {};
  try {
    var argStr = (typeof $argument !== 'undefined' && $argument) ? String($argument) : '';
    argStr.split('&').forEach(function (kv) {
      var p = String(kv).split('=');
      if (p[0]) ARGS[p[0]] = decodeURIComponent(p.slice(1).join('='));
    });
  } catch (e) {}
  var RECEIVER = ARGS.receiver_url || 'https://hynmac-mini.taila66285.ts.net/cmcc-hebao';
  var PHONE = (ARGS.phone || '').replace(/\D/g, '');

  var REQ = (typeof $request !== 'undefined' && $request) ? $request : null;
  var RESP = (typeof $response !== 'undefined' && $response) ? $response : null;
  var url = (REQ && REQ.url) || '';
  var inResponse = !!RESP; // 同一 URL 会挂 request 与 response 两类脚本，按相区分
  var meta = { url: url.slice(0, 300), ts: Math.floor(Date.now() / 1000) };

  function forward(type, value, raw) {
    if (!value) return;
    var payload = { type: type, value: String(value), meta: meta };
    if (raw) payload.raw = String(raw).slice(0, 600);
    if (type === 'cred' && /^1\d{10}$/.test(PHONE)) payload.phone = PHONE;
    var body = JSON.stringify(payload);
    $httpClient.post(
      { url: RECEIVER, headers: { 'Content-Type': 'application/json' }, body: body },
      function (err) { try { console.log('[HebaoCap] ' + type + (err ? ' 失败:' + err : ' 已转发')); } catch (e) {} }
    );
  }

  // ① cred —— autoLogin 请求体（http-request, requires-body=true）
  if (!inResponse && /\/biz-orange\/LN\/uam(?:onekey|randcode)login\/autoLogin/.test(url)) {
    var b = (REQ && REQ.body) || '';
    if (typeof b === 'string' && b.trim().length > 200) {
      forward('cred', b.trim());
    }
    $done({}); // 原样放行
    return;
  }

  // ② get_mbl（p.10086.cn）——请求阶段含 authToken=bigck；响应阶段 302 Location 含 ssoToken
  if (/\/ptw\/arrtifact_get_mbl\.xhtml/.test(url)) {
    if (inResponse) {
      var h = RESP.headers || {};
      var loc = h.Location || h.location || '';
      var ms = String(loc).match(/[?&]ssoToken=(\d{8,32})/);
      if (ms) forward('sso', ms[1], loc);
    } else {
      var m = url.match(/[?&]authToken=([^&#]+)/);
      var bigck = m ? decodeURIComponent(m[1]) : '';
      if (!bigck) {
        var ck = (REQ && REQ.headers && (REQ.headers.Cookie || REQ.headers.cookie)) || '';
        var m2 = String(ck).match(/cmccssotoken=([^;]+)/);
        if (m2) bigck = m2[1].trim();
      }
      if (bigck && bigck.length >= 20) forward('bigck', bigck);
    }
    $done({});
    return;
  }

  // ③ sid —— ssoTokenLogin 响应 Set-Cookie: act_sid=...（http-response）
  if (inResponse && /\/login-common\/ssoTokenLogin/.test(url)) {
    var hr = RESP.headers || {};
    var sc = hr['Set-Cookie'] || hr['set-cookie'] || '';
    var mi = String(sc).match(/act_sid=([^;]+)/);
    if (mi) forward('sid', mi[1].trim(), sc.slice(0, 400));
    $done({});
    return;
  }

  // ④ opdfp —— ump 活动接口 URL（http-request, requires-body=false）
  if (!inResponse && /^https?:\/\/ump\.cmpay\.com\/activities\//.test(url)) {
    var mo = url.match(/[?&]opDfp=([A-Za-z0-9_-]{40,160})/);
    if (mo) forward('opdfp', mo[1]);
    $done({});
    return;
  }

  // 兜底：未命中的挂载点原样放行
  $done({});
})();
