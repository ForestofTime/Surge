/*
 * Surge Cron/Event Script: rotate live shards into immutable batches and send
 * them to one fixed GitHub workflow. It never prints payloads, targets or token.
 */

(function (root) {
  "use strict";

  var SHARD_COUNT = 32;
  var LIVE_PREFIX = "frq.live.";
  var BATCH_PREFIX = "frq.batch.";
  var META_KEY = "frq.meta";
  var CONFIG_KEY = "frq.config";
  var LOCK_KEY = "frq.lock.upload";
  var CAPTURE_LOCK_PREFIX = "frq.lock.capture.";
  var WORKFLOW = "intake-fallback.yml";
  var REF = "main";
  var API_ROOT = "https://api.github.com";
  var API_VERSION = "2026-03-10";
  var USER_AGENT = "Surge-Fallback-Learner/1";
  var WIRE_MAX_BYTES = 32 * 1024;
  var MAX_TARGETS = 256;
  var MAX_BATCHES = 30;
  var MAX_BATCHES_PER_RUN = 4;
  var LOCK_TTL_MS = 45000;
  var POLL_DELAY_MS = 15000;

  function asString(value) { return value === undefined || value === null ? "" : String(value); }
  function nowMs(value) { return value instanceof Date ? value.getTime() : (typeof value === "number" ? value : Date.now()); }
  function readStore(store, key) {
    try { return store && typeof store.read === "function" ? store.read(key) : null; } catch (_) { return null; }
  }
  function writeStore(store, key, value) {
    try { return store && typeof store.write === "function" && store.write(String(value), key) !== false; } catch (_) { return false; }
  }
  function removeStore(store, key) {
    try { if (store && typeof store.remove === "function") store.remove(key); } catch (_) {}
  }
  function parseJson(value, fallback) {
    try { return value === null || value === undefined || value === "" ? fallback : JSON.parse(value); } catch (_) { return fallback; }
  }
  function utf8ByteLength(value) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(String(value)).length;
    try { return unescape(encodeURIComponent(String(value))).length; } catch (_) { return String(value).length; }
  }
  function pad(number, width) {
    var value = String(number);
    while (value.length < width) value = "0" + value;
    return value;
  }
  function utcDay(value) {
    var date = new Date(nowMs(value));
    return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1, 2) + "-" + pad(date.getUTCDate(), 2);
  }
  function dayStamp(value) {
    var date = new Date(nowMs(value));
    return date.getUTCFullYear() + pad(date.getUTCMonth() + 1, 2) + pad(date.getUTCDate(), 2) + "-" + pad(date.getUTCHours(), 2) + pad(date.getUTCMinutes(), 2) + pad(date.getUTCSeconds(), 2);
  }
  function randomToken() { return Math.floor(Math.random() * 0x7fffffff).toString(36); }
  function makeBatchId(day, idFactory) {
    if (typeof idFactory === "function") return String(idFactory(day));
    return dayStamp(new Date()) + "-" + randomToken();
  }

  function parseQueue(value) {
    var parsed = parseJson(value, null);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.q)) return { v: 1, q: [] };
    var queue = [];
    for (var index = 0; index < parsed.q.length; index += 1) {
      var bucket = parsed.q[index];
      if (!bucket || typeof bucket.d !== "string" || !Array.isArray(bucket.i)) continue;
      var items = [];
      for (var itemIndex = 0; itemIndex < bucket.i.length; itemIndex += 1) {
        var item = bucket.i[itemIndex];
        if (Array.isArray(item) && item.length === 2 && (item[0] === "d" || item[0] === "4" || item[0] === "6") && typeof item[1] === "string") items.push([item[0], item[1]]);
      }
      if (items.length) queue.push({ d: bucket.d, i: items });
    }
    return { v: 1, q: queue };
  }
  function queueKey(shard) { return LIVE_PREFIX + pad(shard, 2); }
  function batchKey(id) { return BATCH_PREFIX + id; }
  function readMeta(store) {
    var parsed = parseJson(readStore(store, META_KEY), null);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.batches)) return { v: 1, batches: [] };
    parsed.batches = parsed.batches.filter(function (id, index, all) { return typeof id === "string" && all.indexOf(id) === index; });
    return parsed;
  }
  function writeMeta(store, meta) { return writeStore(store, META_KEY, JSON.stringify({ v: 1, batches: meta.batches })); }

  function acquireShardLock(store, shard, now) {
    var timestamp = nowMs(now);
    var key = CAPTURE_LOCK_PREFIX + pad(shard, 2);
    var current = parseJson(readStore(store, key), null);
    if (current && Number(current.expires) > timestamp) return null;
    var owner = "rotate-" + timestamp + "-" + randomToken();
    if (!writeStore(store, key, JSON.stringify({ v: 1, owner: owner, expires: timestamp + 45000 }))) return null;
    return { key: key, owner: owner };
  }

  function releaseShardLock(store, lock) {
    if (!lock) return;
    var current = parseJson(readStore(store, lock.key), null);
    if (!current || current.owner === lock.owner) removeStore(store, lock.key);
  }

  function splitItems(items, day, idFactory) {
    var batches = [];
    var current = [];
    function makePayload(batchId, values) { return JSON.stringify([1, batchId, day, values]); }
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      if (!Array.isArray(item) || item.length !== 2 || (item[0] !== "d" && item[0] !== "4" && item[0] !== "6") || typeof item[1] !== "string") throw new Error("invalid-item");
      var candidate = current.concat([[item[0], item[1]]]);
      var candidateId = current.length ? batches.length + ":open" : makeBatchId(day, idFactory);
      var candidatePayload = makePayload(candidateId, candidate);
      if (current.length && (candidate.length > MAX_TARGETS || utf8ByteLength(candidatePayload) > WIRE_MAX_BYTES)) {
        var finalizedId = batches.length ? batches[batches.length - 1].id : candidateId;
        if (batches.length && batches[batches.length - 1].open) {
          finalizedId = batches[batches.length - 1].id;
          batches[batches.length - 1] = { id: finalizedId, day: day, items: current, payload: makePayload(finalizedId, current) };
        } else {
          finalizedId = makeBatchId(day, idFactory);
          batches.push({ id: finalizedId, day: day, items: current, payload: makePayload(finalizedId, current) });
        }
        current = [[item[0], item[1]]];
        var singleId = makeBatchId(day, idFactory);
        var singlePayload = makePayload(singleId, current);
        if (utf8ByteLength(singlePayload) > WIRE_MAX_BYTES) throw new Error("item-too-large");
        batches.push({ id: singleId, day: day, items: current, payload: singlePayload, open: true });
      } else {
        current = candidate;
        if (!batches.length || !batches[batches.length - 1].open) batches.push({ id: candidateId, day: day, items: current, payload: candidatePayload, open: true });
        else batches[batches.length - 1] = { id: batches[batches.length - 1].id, day: day, items: current, payload: makePayload(batches[batches.length - 1].id, current), open: true };
      }
    }
    return batches.map(function (batch) {
      return { id: batch.id, day: batch.day, items: batch.items, payload: makePayload(batch.id, batch.items) };
    });
  }

  function normalizeSplit(items, day, idFactory) {
    var result = [];
    var current = [];
    function finalize() {
      if (!current.length) return;
      var id = makeBatchId(day, idFactory);
      var payload = JSON.stringify([1, id, day, current]);
      if (utf8ByteLength(payload) > WIRE_MAX_BYTES) throw new Error("item-too-large");
      result.push({ id: id, day: day, items: current, payload: payload });
      current = [];
    }
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      if (!Array.isArray(item) || item.length !== 2 || (item[0] !== "d" && item[0] !== "4" && item[0] !== "6") || typeof item[1] !== "string") throw new Error("invalid-item");
      var candidate = current.concat([[item[0], item[1]]]);
      var preview = JSON.stringify([1, "preview", day, candidate]);
      if (current.length && (candidate.length > MAX_TARGETS || utf8ByteLength(preview) > WIRE_MAX_BYTES)) finalize();
      current.push([item[0], item[1]]);
    }
    finalize();
    return result;
  }

  function bestEffortLock(store, now) {
    var timestamp = nowMs(now);
    var current = parseJson(readStore(store, LOCK_KEY), null);
    if (current && Number(current.expires) > timestamp) return null;
    var owner = "upload-" + timestamp + "-" + randomToken();
    if (!writeStore(store, LOCK_KEY, JSON.stringify({ v: 1, owner: owner, expires: timestamp + LOCK_TTL_MS }))) return null;
    return owner;
  }
  function releaseLock(store, owner) {
    var current = parseJson(readStore(store, LOCK_KEY), null);
    if (!current || current.owner === owner) removeStore(store, LOCK_KEY);
  }

  function rotateQueues(env) {
    var store = env.store;
    var meta = readMeta(store);
    if (meta.batches.length >= MAX_BATCHES) return { created: 0, blocked: true };
    var created = 0;
    for (var shard = 0; shard < SHARD_COUNT; shard += 1) {
      if (meta.batches.length >= MAX_BATCHES) break;
      var shardLock = acquireShardLock(store, shard, env && env.now);
      if (!shardLock) continue;
      var key = queueKey(shard);
      var queue = parseQueue(readStore(store, key));
      if (!queue.q.length) {
        releaseShardLock(store, shardLock);
        continue;
      }
      var made = [];
      try {
        for (var bucketIndex = 0; bucketIndex < queue.q.length; bucketIndex += 1) {
          var bucketBatches = normalizeSplit(queue.q[bucketIndex].i, queue.q[bucketIndex].d);
          made = made.concat(bucketBatches);
        }
      } catch (_) {
        releaseShardLock(store, shardLock);
        continue;
      }
      var allWritten = true;
      for (var batchIndex = 0; batchIndex < made.length; batchIndex += 1) {
        if (meta.batches.length >= MAX_BATCHES) { allWritten = false; break; }
        var batch = made[batchIndex];
        if (!writeStore(store, batchKey(batch.id), JSON.stringify({ v: 1, id: batch.id, d: batch.day, payload: batch.payload, state: "pending", attempts: 0, nextRetryAt: 0 }))) { allWritten = false; break; }
        meta.batches.push(batch.id);
        if (!writeMeta(store, meta)) { removeStore(store, batchKey(batch.id)); meta.batches.pop(); allWritten = false; break; }
        created += 1;
      }
      if (allWritten) writeStore(store, key, JSON.stringify({ v: 1, q: [] }));
      releaseShardLock(store, shardLock);
    }
    return { created: created, blocked: false };
  }

  function safeName(value) { return typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value); }
  function buildDispatchRequest(config, payload) {
    if (!config || !safeName(config.owner) || !safeName(config.repo) || config.workflow !== WORKFLOW || config.ref !== REF || !config.token || /[\s\r\n]/.test(String(config.token))) throw new Error("invalid-config");
    if (utf8ByteLength(payload) > WIRE_MAX_BYTES) throw new Error("payload-too-large");
    var url = API_ROOT + "/repos/" + encodeURIComponent(config.owner) + "/" + encodeURIComponent(config.repo) + "/actions/workflows/" + WORKFLOW + "/dispatches";
    return {
      url: url,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": USER_AGENT
      },
      body: JSON.stringify({ ref: REF, inputs: { payload: payload } }),
      // Upload traffic must use the fixed proxy policy. Persistent state cannot
      // change the egress path after setup.
      policy: "Proxy",
      timeout: 10,
      "auto-cookie": false,
      "auto-redirect": false
    };
  }

  function buildRunRequest(config, runId) {
    if (!config || !safeName(config.owner) || !safeName(config.repo) || !/^\d+$/.test(String(runId))) throw new Error("invalid-run");
    return {
      url: API_ROOT + "/repos/" + encodeURIComponent(config.owner) + "/" + encodeURIComponent(config.repo) + "/actions/runs/" + String(runId),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + config.token,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": USER_AGENT
      },
      policy: "Proxy",
      timeout: 8,
      "auto-cookie": false,
      "auto-redirect": false
    };
  }

  function header(headers, name) {
    if (!headers) return "";
    var wanted = name.toLowerCase();
    for (var key in headers) if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === wanted) return asString(headers[key]);
    return "";
  }
  function classifyHttpResponse(response) {
    response = response || {};
    var status = Number(response.status || response.statusCode || 0);
    var body = asString(response.body || response.data || "");
    var headers = response.headers || {};
    if (status === 200) {
      var parsed = parseJson(body, null);
      var runId = parsed && (parsed.workflow_run_id || parsed.run_id);
      if (!runId || !/^\d+$/.test(String(runId))) return { kind: "fatal-schema" };
      return { kind: "accepted", runId: Number(runId) };
    }
    if (status === 401) return { kind: "fatal-auth" };
    if (status === 403) {
      var remaining = header(headers, "X-RateLimit-Remaining");
      var retry = header(headers, "Retry-After");
      if (retry || remaining === "0" || /rate.?limit|abuse.?detection|secondary rate/i.test(body)) return { kind: "retry", retryAfter: retry };
      return { kind: "fatal-permission" };
    }
    if (status === 404 || status === 422) return { kind: "fatal-config" };
    if (status === 408 || status === 425 || status === 429 || status >= 500 || status === 0) return { kind: "retry", retryAfter: header(headers, "Retry-After") };
    return { kind: "fatal-http" };
  }
  function retryAt(classification, attempts, now) {
    var retry = classification && classification.retryAfter;
    var timestamp = nowMs(now);
    if (retry && /^\d+(?:\.\d+)?$/.test(String(retry))) return timestamp + Math.min(6 * 60 * 60 * 1000, Number(retry) * 1000);
    if (retry) {
      var parsed = Date.parse(retry);
      if (!isNaN(parsed) && parsed > timestamp) return parsed;
    }
    var exponent = Math.min(8, Math.max(0, Number(attempts) || 0));
    return timestamp + Math.min(6 * 60 * 60 * 1000, 15000 * Math.pow(2, exponent));
  }
  function parseRun(data) {
    var parsed = parseJson(data, null);
    if (!parsed || typeof parsed.status !== "string") return null;
    return { status: parsed.status, conclusion: parsed.conclusion || null };
  }
  function isFatal(classification) {
    return classification && (classification.kind === "fatal-auth" || classification.kind === "fatal-permission" || classification.kind === "fatal-config" || classification.kind === "fatal-schema" || classification.kind === "fatal-http");
  }
  function updateBatch(store, batch) { return writeStore(store, batchKey(batch.id), JSON.stringify(batch)); }
  function removeBatch(store, meta, batch) {
    removeStore(store, batchKey(batch.id));
    meta.batches = meta.batches.filter(function (id) { return id !== batch.id; });
    writeMeta(store, meta);
  }

  function uploadOnce(env, callback) {
    var isNode = typeof module !== "undefined" && module.exports;
    if (!callback && isNode && typeof Promise === "function") return new Promise(function (resolve) { uploadOnce(env, resolve); });
    var store = env && env.store;
    var config = parseJson(readStore(store, CONFIG_KEY), null);
    var result = { created: 0, attempted: 0, removed: 0, skipped: false };
    if (!config || config.enabled === false || config.uploadEnabled === false || !config.owner || !config.repo || !config.token) {
      result.skipped = true;
      if (callback) callback(result);
      return result;
    }
    var owner = bestEffortLock(store, env && env.now);
    if (!owner) {
      result.skipped = true;
      if (callback) callback(result);
      return result;
    }
    var rotation = rotateQueues({ store: store, now: env && env.now });
    result.created = rotation.created;
    var meta = readMeta(store);
    var http = env && env.http;
    if (!http || typeof http.get !== "function") {
      releaseLock(store, owner);
      if (callback) callback(result);
      return result;
    }
    var index = 0;
    function finish() {
      releaseLock(store, owner);
      if (callback) callback(result);
    }
    function next() {
      if (index >= meta.batches.length || result.attempted >= MAX_BATCHES_PER_RUN) return finish();
      var id = meta.batches[index++];
      var batch = parseJson(readStore(store, batchKey(id)), null);
      if (!batch || batch.v !== 1 || typeof batch.payload !== "string") return next();
      if (batch.state === "blocked") return next();
      var now = nowMs(env && env.now);
      if (batch.nextRetryAt && Number(batch.nextRetryAt) > now) return next();
      result.attempted += 1;
      function poll() {
        var request;
        try { request = buildRunRequest(config, batch.runId); } catch (_) { batch.state = "pending"; batch.nextRetryAt = retryAt({ kind: "retry" }, batch.attempts, now); updateBatch(store, batch); return next(); }
        http.get(request, function (error, response, data) {
          var classification = error ? { kind: "retry" } : classifyHttpResponse(response);
          if (classification.kind === "retry") {
            batch.nextRetryAt = retryAt(classification, batch.attempts, now);
            updateBatch(store, batch);
            return next();
          }
          if (isFatal(classification) && classification.kind !== "fatal-schema") {
            batch.state = "blocked";
            batch.blockedReason = classification.kind;
            batch.nextRetryAt = 0;
            updateBatch(store, batch);
            return next();
          }
          if (classification.kind !== "accepted" && classification.kind !== "fatal-schema") {
            batch.state = "pending";
            batch.runId = null;
            batch.nextRetryAt = retryAt({ kind: "retry" }, batch.attempts, now);
            updateBatch(store, batch);
            return next();
          }
          var run = parseRun(data);
          if (!run) {
            batch.nextRetryAt = retryAt({ kind: "retry" }, batch.attempts, now);
            updateBatch(store, batch);
            return next();
          }
          if (run.status === "completed" && run.conclusion === "success") {
            removeBatch(store, meta, batch);
            result.removed += 1;
            return next();
          }
          if (run.status === "completed") {
            batch.state = "pending";
            batch.runId = null;
            batch.nextRetryAt = retryAt({ kind: "retry" }, batch.attempts, now);
          } else {
            batch.state = "dispatched";
            batch.nextPollAt = now + POLL_DELAY_MS;
            batch.nextRetryAt = now + POLL_DELAY_MS;
          }
          updateBatch(store, batch);
          next();
        });
      }
      function dispatch() {
        if (typeof http.post !== "function") {
          batch.nextRetryAt = retryAt({ kind: "retry" }, batch.attempts, now);
          updateBatch(store, batch);
          return next();
        }
        var request;
        try { request = buildDispatchRequest(config, batch.payload); } catch (_) { batch.nextRetryAt = retryAt({ kind: "retry" }, batch.attempts, now); updateBatch(store, batch); return next(); }
        batch.attempts = Number(batch.attempts || 0) + 1;
        http.post(request, function (error, response, data) {
          var classification = error ? { kind: "retry" } : classifyHttpResponse(response);
          if (isFatal(classification)) {
            batch.state = "blocked";
            batch.blockedReason = classification.kind;
            batch.nextRetryAt = 0;
            updateBatch(store, batch);
            return next();
          }
          if (classification.kind === "accepted") {
            batch.state = "dispatched";
            batch.runId = classification.runId;
            batch.nextRetryAt = 0;
            if (!updateBatch(store, batch)) return next();
            return poll();
          }
          batch.state = "pending";
          batch.nextRetryAt = retryAt(classification, batch.attempts, now);
          updateBatch(store, batch);
          next();
        });
      }
      if (batch.state === "dispatched" && batch.runId) poll();
      else dispatch();
    }
    next();
    return result;
  }

  function main() {
    uploadOnce({
      store: typeof $persistentStore !== "undefined" ? $persistentStore : null,
      http: typeof $httpClient !== "undefined" ? $httpClient : null,
      now: new Date()
    }, function () {
      if (typeof $done === "function") $done({});
    });
  }

  var api = {
    WIRE_MAX_BYTES: WIRE_MAX_BYTES,
    MAX_TARGETS: MAX_TARGETS,
    MAX_BATCHES: MAX_BATCHES,
    splitItems: normalizeSplit,
    utf8ByteLength: utf8ByteLength,
    buildDispatchRequest: buildDispatchRequest,
    buildRunRequest: buildRunRequest,
    classifyHttpResponse: classifyHttpResponse,
    retryAt: retryAt,
    parseRun: parseRun,
    rotateQueues: rotateQueues,
    uploadOnce: uploadOnce,
    parseQueue: parseQueue,
    queueKey: queueKey,
    batchKey: batchKey
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof $done === "function") main();
}(typeof globalThis !== "undefined" ? globalThis : this));
