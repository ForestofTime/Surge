/* One-time Surge setup and kill-switch script for the private inbox. */

(function (root) {
  "use strict";

  var CONFIG_KEY = "frq.config";
  var WORKFLOW = "intake-fallback.yml";
  var REF = "main";
  var DEFAULT_POLICY = "Proxy";

  function readStore(store, key) {
    try { return store && typeof store.read === "function" ? store.read(key) : null; } catch (_) { return null; }
  }

  function writeStore(store, key, value) {
    try { return store && typeof store.write === "function" && store.write(String(value), key) !== false; } catch (_) { return false; }
  }

  function parseJson(value, fallback) {
    try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; }
  }

  function parseArgument(argument) {
    var result = {};
    var text = argument === undefined || argument === null ? "" : String(argument);
    text.split("&").forEach(function (part) {
      if (!part) return;
      var equal = part.indexOf("=");
      var key = equal < 0 ? part : part.slice(0, equal);
      var value = equal < 0 ? "" : part.slice(equal + 1);
      try {
        key = decodeURIComponent(key.replace(/\+/g, " "));
        value = decodeURIComponent(value.replace(/\+/g, " "));
      } catch (_) {
        return;
      }
      if (key && !Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
    });
    return result;
  }

  function isSafeName(value) {
    return typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value);
  }

  function isSafeToken(value) {
    return typeof value === "string" && /^(?:github_pat_|ghp_)[A-Za-z0-9_]{20,255}$/.test(value);
  }

  function asBool(value, fallback) {
    if (value === undefined) return fallback;
    var text = String(value).toLowerCase();
    if (text === "true" || text === "1" || text === "on") return true;
    if (text === "false" || text === "0" || text === "off") return false;
    return fallback;
  }

  function configure(env) {
    var store = env && env.store;
    var args = parseArgument(env && env.argument);
    var previous = parseJson(readStore(store, CONFIG_KEY), null);

    var togglesOnly = Object.keys(args).every(function (key) {
      return key === "enabled" || key === "capture" || key === "upload";
    });
    if (togglesOnly && previous) {
      var toggled = {
        v: 1,
        enabled: asBool(args.enabled, previous.enabled !== false),
        captureEnabled: asBool(args.capture, previous.captureEnabled !== false),
        uploadEnabled: asBool(args.upload, previous.uploadEnabled !== false),
        owner: previous.owner,
        repo: previous.repo,
        workflow: WORKFLOW,
        ref: REF,
        policy: DEFAULT_POLICY,
        token: previous.token
      };
      if (!previous.owner || !previous.repo || !isSafeToken(previous.token)) return { ok: false, reason: "not-configured" };
      if (!writeStore(store, CONFIG_KEY, JSON.stringify(toggled))) return { ok: false, reason: "store-write" };
      return { ok: true, action: "toggle" };
    }

    if (!isSafeName(args.owner) || !isSafeName(args.repo) || !isSafeToken(args.token)) return { ok: false, reason: "invalid-credentials" };
    if (args.workflow !== undefined && args.workflow !== WORKFLOW) return { ok: false, reason: "workflow-is-fixed" };
    if (args.ref !== undefined && args.ref !== REF) return { ok: false, reason: "ref-is-fixed" };
    if (args.url !== undefined) return { ok: false, reason: "url-is-fixed" };
    var config = {
      v: 1,
      enabled: asBool(args.enabled, true),
      captureEnabled: asBool(args.capture, true),
      uploadEnabled: asBool(args.upload, true),
      owner: args.owner,
      repo: args.repo,
      workflow: WORKFLOW,
      ref: REF,
      policy: DEFAULT_POLICY,
      token: args.token
    };
    if (!writeStore(store, CONFIG_KEY, JSON.stringify(config))) return { ok: false, reason: "store-write" };
    return { ok: true, action: "configure" };
  }

  function main() {
    configure({
      store: typeof $persistentStore !== "undefined" ? $persistentStore : null,
      argument: typeof $argument !== "undefined" ? $argument : ""
    });
    if (typeof $done === "function") $done({});
  }

  var api = {
    CONFIG_KEY: CONFIG_KEY,
    WORKFLOW: WORKFLOW,
    REF: REF,
    DEFAULT_POLICY: DEFAULT_POLICY,
    parseArgument: parseArgument,
    configure: configure,
    isSafeName: isSafeName,
    isSafeToken: isSafeToken
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof $done === "function") main();
}(typeof globalThis !== "undefined" ? globalThis : this));
