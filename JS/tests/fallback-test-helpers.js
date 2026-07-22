const assert = require('node:assert/strict');

function createStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    read(key) {
      calls.push(['read', key]);
      return values.has(key) ? values.get(key) : null;
    },
    write(value, key) {
      calls.push(['write', value, key]);
      values.set(key, String(value));
      return true;
    },
    remove(key) {
      calls.push(['remove', key]);
      values.delete(key);
      return true;
    },
    get(key) {
      return values.get(key);
    },
    values
  };
}

function surgeGlobals({ store, request, argument = '', now = new Date('2026-07-21T18:00:00.000Z'), httpClient } = {}) {
  return {
    $persistentStore: store,
    $request: request || {},
    $argument: argument,
    $httpClient: httpClient,
    __now: now
  };
}

function loadSurgeScript(path, globals) {
  const previous = {};
  for (const [key, value] of Object.entries(globals)) {
    previous[key] = global[key];
    global[key] = value;
  }
  delete require.cache[require.resolve(path)];
  const mod = require(path);
  for (const key of Object.keys(globals)) {
    if (previous[key] === undefined) delete global[key];
    else global[key] = previous[key];
  }
  return mod;
}

function assertNoSecretLogs(fn) {
  const logs = [];
  const previous = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    fn();
  } finally {
    console.log = previous;
  }
  assert.equal(logs.length, 0, `unexpected log output: ${logs.join(' | ')}`);
}

module.exports = { createStore, surgeGlobals, loadSurgeScript, assertNoSecretLogs };
