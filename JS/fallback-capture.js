/*
 * Surge Rule Script: collect only requests that reached the explicit fallback rule.
 *
 * The hot path intentionally has no network, DNS, PSL, GeoIP, URL or crypto work.
 * The persistent store is best effort. A failed write never blocks the request.
 */

(function (root) {
  "use strict";

  var SHARD_COUNT = 32;
  var LIVE_PREFIX = "frq.live.";
  var CONFIG_KEY = "frq.config";
  var LOCK_PREFIX = "frq.lock.capture.";
  var MAX_SHARD_BYTES = 64 * 1024;
  var LOCK_TTL_MS = 4000;
  var CONTROL_PLANE_SUFFIXES = [
    "api.github.com",
    "github.com",
    "raw.githubusercontent.com",
    "githubusercontent.com",
    "githubassets.com",
    "objects.githubusercontent.com",
    "codeload.github.com",
    "surge.run"
  ];

  function asString(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function readStore(store, key) {
    try {
      if (!store || typeof store.read !== "function") return null;
      return store.read(key);
    } catch (_) {
      return null;
    }
  }

  function writeStore(store, key, value) {
    try {
      if (!store || typeof store.write !== "function") return false;
      // Surge API signature: $persistentStore.write(data, key).
      return store.write(String(value), key) !== false;
    } catch (_) {
      return false;
    }
  }

  function removeStore(store, key) {
    try {
      if (store && typeof store.remove === "function") store.remove(key);
    } catch (_) {
      // A stale lock is safe to expire. Do not expose storage failures.
    }
  }

  function parseJson(value, fallback) {
    try {
      if (value === null || value === undefined || value === "") return fallback;
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function nowMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number" && isFinite(value)) return value;
    return Date.now();
  }

  function utcDay(value) {
    var date = new Date(nowMs(value));
    function two(number) { return number < 10 ? "0" + number : String(number); }
    return date.getUTCFullYear() + "-" + two(date.getUTCMonth() + 1) + "-" + two(date.getUTCDate());
  }

  function randomOwner(prefix) {
    var random = Math.floor(Math.random() * 0x7fffffff).toString(36);
    return prefix + "-" + String(nowMs()) + "-" + random;
  }

  function withBestEffortLock(store, key, timestamp, fn) {
    var now = nowMs(timestamp);
    var existing = parseJson(readStore(store, key), null);
    if (existing && Number(existing.expires) > now) return { ok: false, reason: "busy" };
    var owner = randomOwner("capture");
    if (!writeStore(store, key, JSON.stringify({ v: 1, owner: owner, expires: now + LOCK_TTL_MS }))) {
      return { ok: false, reason: "store-write" };
    }
    try {
      return fn();
    } finally {
      var current = parseJson(readStore(store, key), null);
      if (!current || current.owner === owner) removeStore(store, key);
    }
  }

  function fnv1a(value) {
    var hash = 0x811c9dc5;
    var input = String(value);
    for (var index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function shardFor(value) {
    return fnv1a(value) % SHARD_COUNT;
  }

  function isIPv4(value) {
    var parts = value.split(".");
    if (parts.length !== 4) return false;
    for (var index = 0; index < parts.length; index += 1) {
      if (!/^\d{1,3}$/.test(parts[index])) return false;
      if (parts[index].length > 1 && parts[index].charAt(0) === "0") return false;
      var number = Number(parts[index]);
      if (number > 255) return false;
    }
    return true;
  }

  function isPrivateIPv4(value) {
    var p = value.split(".").map(Number);
    var first = p[0];
    var second = p[1];
    return first === 0 || first === 10 || first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && second === 18) ||
      (first === 198 && second === 19) ||
      first >= 224;
  }

  function ipv4ToV6Groups(value) {
    var p = value.split(".").map(Number);
    return [((p[0] << 8) | p[1]).toString(16), ((p[2] << 8) | p[3]).toString(16)];
  }

  function normalizeIPv6(value) {
    var input = value.toLowerCase();
    var pieces = input.split("::");
    if (pieces.length > 2) return null;
    var left = pieces[0] ? pieces[0].split(":") : [];
    var right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
    if (left.some(function (part) { return part === ""; }) || right.some(function (part) { return part === ""; })) return null;
    if (left.length && isIPv4(left[left.length - 1])) {
      left = left.slice(0, -1).concat(ipv4ToV6Groups(left[left.length - 1]));
    }
    if (right.length && isIPv4(right[right.length - 1])) {
      right = right.slice(0, -1).concat(ipv4ToV6Groups(right[right.length - 1]));
    }
    var all = left.concat(right);
    for (var index = 0; index < all.length; index += 1) {
      if (!/^[0-9a-f]{1,4}$/.test(all[index])) return null;
    }
    if (pieces.length === 1 && all.length !== 8) return null;
    if (pieces.length === 2 && all.length >= 8) return null;
    while (all.length < 8) all.splice(left.length, 0, "0");
    var groups = all.map(function (part) { return parseInt(part, 16); });
    var bestStart = -1;
    var bestLength = 0;
    var start = -1;
    for (var i = 0; i <= groups.length; i += 1) {
      if (i < groups.length && groups[i] === 0) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        if (i - start > bestLength) {
          bestStart = start;
          bestLength = i - start;
        }
        start = -1;
      }
    }
    if (bestLength < 2) {
      return groups.map(function (part) { return part.toString(16); }).join(":");
    }
    var before = groups.slice(0, bestStart).map(function (part) { return part.toString(16); }).join(":");
    var after = groups.slice(bestStart + bestLength).map(function (part) { return part.toString(16); }).join(":");
    if (before && after) return before + "::" + after;
    if (before) return before + "::";
    if (after) return "::" + after;
    return "::";
  }

  function isPrivateIPv6(value) {
    var normalized = normalizeIPv6(value);
    if (!normalized) return true;
    if (normalized === "::" || normalized === "::1") return true;
    var first = parseInt(normalized.split(":")[0] || "0", 16);
    return (first >= 0xfc00 && first <= 0xfdff) ||
      (first >= 0xfe80 && first <= 0xfebf) ||
      (first >= 0xff00 && first <= 0xffff);
  }

  function isControlPlane(hostname, extra) {
    var list = CONTROL_PLANE_SUFFIXES.slice();
    if (Array.isArray(extra)) list = list.concat(extra);
    for (var index = 0; index < list.length; index += 1) {
      var suffix = asString(list[index]).toLowerCase().replace(/^\.+/, "");
      if (hostname === suffix || hostname.slice(-(suffix.length + 1)) === "." + suffix) return true;
    }
    return false;
  }

  function basicHostname(value) {
    var normalized = asString(value).trim().toLowerCase();
    if (normalized.charAt(0) === "[" && normalized.charAt(normalized.length - 1) === "]") normalized = normalized.slice(1, -1);
    while (normalized.charAt(normalized.length - 1) === ".") normalized = normalized.slice(0, -1);
    return normalized;
  }

  function normalizeTarget(raw, config) {
    var value = asString(raw).trim().toLowerCase();
    if (!value || value.length > 253 || /[\u0000-\u0020\u007f]/.test(value)) return null;
    if (value.charAt(0) === "[" && value.charAt(value.length - 1) === "]") value = value.slice(1, -1);
    if (isIPv4(value)) {
      if (isPrivateIPv4(value)) return null;
      return { kind: "4", value: value };
    }
    if (value.indexOf(":") >= 0) {
      var v6 = normalizeIPv6(value);
      if (!v6 || isPrivateIPv6(v6)) return null;
      return { kind: "6", value: v6 };
    }
    while (value.charAt(value.length - 1) === ".") value = value.slice(0, -1);
    if (value.length > 253 || value.indexOf(".") < 1 || value.indexOf("..") >= 0) return null;
    if (!/^[a-z0-9.-]+$/.test(value)) return null;
    var labels = value.split(".");
    for (var index = 0; index < labels.length; index += 1) {
      if (!labels[index] || labels[index].length > 63 || labels[index].charAt(0) === "-" || labels[index].charAt(labels[index].length - 1) === "-" || !/^[a-z0-9-]+$/.test(labels[index])) return null;
    }
    if (labels.length < 2 || labels[labels.length - 1] === "local" || value === "home.arpa" || value.slice(-10) === ".home.arpa") return null;
    if (isControlPlane(value, config && config.controlPlane)) return null;
    return { kind: "d", value: value };
  }

  function queueKey(shard) {
    return LIVE_PREFIX + (shard < 10 ? "0" : "") + shard;
  }

  function parseQueue(raw) {
    var parsed = parseJson(raw, null);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.q)) return { v: 1, q: [] };
    var clean = [];
    for (var index = 0; index < parsed.q.length; index += 1) {
      var bucket = parsed.q[index];
      if (!bucket || typeof bucket.d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bucket.d) || !Array.isArray(bucket.i)) continue;
      var items = [];
      for (var itemIndex = 0; itemIndex < bucket.i.length; itemIndex += 1) {
        var item = bucket.i[itemIndex];
        if (Array.isArray(item) && item.length === 2 && (item[0] === "d" || item[0] === "4" || item[0] === "6") && typeof item[1] === "string") items.push([item[0], item[1]]);
      }
      if (items.length) clean.push({ d: bucket.d, i: items });
    }
    return { v: 1, q: clean };
  }

  function byteLength(value) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
    try { return unescape(encodeURIComponent(value)).length; } catch (_) { return String(value).length; }
  }

  function capture(env) {
    var store = env && env.store;
    var config = parseJson(readStore(store, CONFIG_KEY), {});
    if (config.captureEnabled === false) return { accepted: false, reason: "disabled" };
    var request = env && env.request ? env.request : {};
    if (isControlPlane(basicHostname(request.hostname), config && config.controlPlane)) return { accepted: false, reason: "control-plane" };
    var target = normalizeTarget(request.hostname, config);
    if (!target) return { accepted: false, reason: "ignored" };
    var day = utcDay(env && env.now);
    var shard = shardFor(target.kind + ":" + target.value);
    var result = withBestEffortLock(store, LOCK_PREFIX + (shard < 10 ? "0" : "") + shard, env && env.now, function () {
      var queue = parseQueue(readStore(store, queueKey(shard)));
      var found = false;
      for (var bucketIndex = 0; bucketIndex < queue.q.length && !found; bucketIndex += 1) {
        var bucket = queue.q[bucketIndex];
        for (var itemIndex = 0; itemIndex < bucket.i.length; itemIndex += 1) {
          if (bucket.i[itemIndex][0] === target.kind && bucket.i[itemIndex][1] === target.value) {
            found = true;
            break;
          }
        }
      }
      if (found) return { accepted: false, reason: "duplicate" };
      var bucketForDay = null;
      for (var index = 0; index < queue.q.length; index += 1) {
        if (queue.q[index].d === day) bucketForDay = queue.q[index];
      }
      if (!bucketForDay) {
        bucketForDay = { d: day, i: [] };
        queue.q.push(bucketForDay);
      }
      bucketForDay.i.push([target.kind, target.value]);
      var serialized = JSON.stringify(queue);
      if (byteLength(serialized) > MAX_SHARD_BYTES) {
        bucketForDay.i.pop();
        if (!bucketForDay.i.length) queue.q = queue.q.filter(function (item) { return item !== bucketForDay; });
        return { accepted: false, reason: "capacity" };
      }
      if (!writeStore(store, queueKey(shard), serialized)) return { accepted: false, reason: "store-write" };
      return { accepted: true, kind: target.kind, shard: shard };
    });
    if (!result || result.ok === false) return { accepted: false, reason: result && result.reason ? result.reason : "busy" };
    return result;
  }

  function main() {
    var outcome = capture({
      store: typeof $persistentStore !== "undefined" ? $persistentStore : null,
      request: typeof $request !== "undefined" ? $request : {},
      now: new Date()
    });
    if (typeof $done === "function") $done({ matched: true });
    return outcome;
  }

  var api = {
    SHARD_COUNT: SHARD_COUNT,
    MAX_SHARD_BYTES: MAX_SHARD_BYTES,
    capture: capture,
    normalizeTarget: normalizeTarget,
    normalizeIPv6: normalizeIPv6,
    isIPv4: isIPv4,
    isPrivateIPv4: isPrivateIPv4,
    isPrivateIPv6: isPrivateIPv6,
    shardFor: shardFor,
    parseQueue: parseQueue,
    queueKey: queueKey,
    byteLength: byteLength,
    utcDay: utcDay,
    withBestEffortLock: withBestEffortLock,
    CONTROL_PLANE_SUFFIXES: CONTROL_PLANE_SUFFIXES.slice()
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof $done === "function") main();
}(typeof globalThis !== "undefined" ? globalThis : this));
