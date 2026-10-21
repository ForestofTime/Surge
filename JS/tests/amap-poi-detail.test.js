const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const source = fs.readFileSync(path.join(__dirname, "../AmapPoiDetail.js"), "utf8");
const url = "https://info.amap.com/ws/shield/search/poi/detail?foo=bar";
function run(value, target = url, raw = false) {
  const results = [];
  vm.runInNewContext(source, { $request: { url: target }, $response: { body: raw ? value : JSON.stringify(value) }, $done: result => results.push(result) }, { filename: path.join(__dirname, '../AmapPoiDetail.js') });
  assert.equal(results.length, 1);
  return results[0].body === undefined ? value : JSON.parse(results[0].body);
}
test("POI modules and every region retain business refs and non-string entries", () => {
  const input = { data: { regions: { header: ["baseInfo", "ad", null, 2], footer: ["scenic_ticket", "ad"], unusual: { untouched: true } }, modules: { baseInfo: { data: { name: "museum", user: { userLocRgeo: 1, homeInfo: 2, companyInfo: 3, name: "user" } } }, scenic_ticket: { booking: true }, ad: {} }, meta: { half_hidden_modules: ["hotelRooms", "ad", 9], token: "keep" } }, ret: "OK" };
  const output = run(input);
  assert.deepEqual(output.data.regions, { header: ["baseInfo", null, 2], footer: ["scenic_ticket"], unusual: { untouched: true } });
  assert.deepEqual(output.data.modules.baseInfo.data.user, { name: "user" });
  assert.deepEqual(output.data.modules.scenic_ticket, { booking: true });
  assert.equal(output.data.modules.ad, undefined);
  assert.deepEqual(output.data.meta, { half_hidden_modules: ["hotelRooms", 9], token: "keep" });
  assert.equal(output.ret, "OK");
});
test("anchors and swipe panels retain valid later-batch targets with original JQ selection semantics", () => {
  const items = [{ anchor: ["ad"] }, { anchor: ["hotelRooms", "ad"] }, { anchor: [null] }, null, { title: "missing" }];
  const panels = [{ modulesMap: ["ad"] }, { modulesMap: ["scenic_ticket", "ad"] }, { modulesMap: [] }, { title: "keep" }, null, 5];
  const output = run({ data: { modules: { anchor: { data: { items } }, poiDetailCommonConfig: { data: { swipeUpPanelConfig: { swipeUpPanelTextList: panels } } } } } });
  assert.deepEqual(output.data.modules.anchor.data.items, [items[1]]);
  assert.deepEqual(output.data.modules.poiDetailCommonConfig.data.swipeUpPanelConfig.swipeUpPanelTextList, [panels[1], panels[3], null, 5]);
});
test("review promotion removed but review action and text retained", () => {
  assert.deepEqual(run({ data: { modules: { combineReviews: { data: { write_comment: { btnRightTag: "gift", title: "promo", action: "write" }, reviews: ["real review"] } } } } }).data.modules.combineReviews.data, { write_comment: { action: "write" }, reviews: ["real review"] });
});
test("strict endpoint and unknown response shape pass through", () => {
  const input = { data: { modules: { ad: {} } } };
  for (const target of [url.replace("https:", "http:"), url.replace("info.amap.com", "evil.info.amap.com"), url.replace("/detail?", "/detail/more?")]) assert.deepEqual(run(input, target), input);
  assert.equal(run(input, url.split("?")[0]).data.modules.ad, undefined);
  for (const value of [null, [], {}, { data: null }, { data: [] }, { data: { unfamiliar: 1 } }]) assert.deepEqual(run(value), value);
  assert.equal(run("not json", url, true), "not json");
});
test("malformed nested business data is left intact and cannot throw", () => {
  for (const value of [null, [], 0, "x"]) {
    const input = { data: { regions: value, modules: { baseInfo: { data: { user: value } }, combineReviews: { data: { write_comment: value } }, anchor: { data: { items: value } }, poiDetailCommonConfig: { data: { swipeUpPanelConfig: value } } }, meta: value } };
    assert.deepEqual(run(input), input);
  }
});
test("converted whitelist and structure match original JQ on all 94 business modules", t => {
  const probe = spawnSync("jq", ["--version"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") return t.skip("jq unavailable");
  const jqFile = path.join(__dirname, "../AmapPoiDetail.jq");
  const jq = fs.readFileSync(jqFile, "utf8");
  const names = [...jq.slice(0, jq.indexOf("def keep_module")).matchAll(/^\s*"([^"]+)"|,\s*"([^"]+)"/gm)].map(match => match[1] || match[2]);
  assert.equal(names.length, 94);
  const input = { data: { regions: { content: [...names, "ad", null] }, modules: Object.fromEntries([...names, "ad"].map(name => [name, { data: {} }])), meta: { half_hidden_modules: [...names, "ad", false] } } };
  input.data.modules.anchor.data.items = [{ anchor: ["hotelRooms"] }, { anchor: ["ad"] }];
  input.data.modules.poiDetailCommonConfig.data.swipeUpPanelConfig = { swipeUpPanelTextList: [{ modulesMap: ["ad"] }, { modulesMap: ["scenic_ticket"] }] };
  const result = spawnSync("jq", ["-c", "-f", jqFile], { input: JSON.stringify(input), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(run(input), JSON.parse(result.stdout));
});
