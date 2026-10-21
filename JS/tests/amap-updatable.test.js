const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../AmapUpdatable.js"), "utf8");
const endpoint = "https://m5.amap.com/ws/shield/frogserver/aocs/updatable/1?version=1";
function run(body, url = endpoint) {
  const calls = [];
  vm.runInNewContext(source, {$request: {url}, $response: {body}, $done: v => calls.push(v)}, {filename: path.join(__dirname, '../AmapUpdatable.js')});
  assert.equal(calls.length, 1);
  return JSON.parse(JSON.stringify(calls[0]));
}
const config = value => ({value: JSON.stringify(value), version: "preserve"});
test("updatable strips only original top-level paths and keeps business siblings", () => {
  const input = {code:1, data:{adStatementConfig:1,"920bestwishes":2,custom_consultdata:{widget_guide:3,navigation:4},order:5}};
  assert.deepEqual(JSON.parse(run(JSON.stringify(input)).body), {code:1,data:{custom_consultdata:{navigation:4},order:5}});
});
test("updatable keeps absent, malformed, non-string and non-object configs unchanged", () => {
  for (const data of [{}, {taxi:{value:"broken"}},{taxi:{value:{"denghuo_ad":1}}},{taxi:{value:"null"}},{taxi:{value:"[]"}}])
    assert.deepEqual(run(JSON.stringify({data})), {});
});
test("updatable preserves bad config independently of valid configs", () => {
  const data = {his_input_tip:{value:"broken"},navi_end:config({operator_btns:[1],route:2})};
  const out = JSON.parse(run(JSON.stringify({data})).body).data;
  assert.deepEqual(out.his_input_tip, data.his_input_tip);
  assert.deepEqual(JSON.parse(out.navi_end.value), {route:2});
});
test("updatable embedded object field mapping preserves encoding and business fields", () => {
  const data = {
    sportsGroupConfig:config({group_banner:1,route:2}), sportsRouteConfig:config({group_banner:1,route:2}),
    his_input_tip:config({channel_zhitiao:1,nearby_hotword:{search_detail:1,history:2}}),
    engine_render:config({can_show_advert:1,advert_note_num:2,map:3}),
    detail_config:config({shelf_coupon_refresh:1,poiDetailScreenCacheConfig:{keep:2}}),
    amap_basemap_config:config({splash:1,"2024greetingTofireworks":2,map:3}),
    navi_cloud:config({etc_banner:1,route:2}),
    taxi:config({denghuo_ad:1,"long-dis_preferential":2,order:3}),
    poi_folder_modules:config({folder_modules:["evaluateVO","ad","enhanceIMQuestions"],newFolderModules:["platformCustomerComplianceInfo","platformCustomerCommonModule","ad"],keep:4}),
    favorites_info:config({keep:1}),container_isolation:config({keep:1}),nore_rec:config({keep:1}),
    engine_eyrie:config({poi_area_bubble:1,keep:2}),WIA:config({orgGuideVideoConfig:1,keep:2})
  };
  const out = JSON.parse(run(JSON.stringify({data})).body).data;
  for (const entry of Object.values(out)) {assert.equal(typeof entry.value,"string");assert.equal(entry.version,"preserve");}
  const inner = name => JSON.parse(out[name].value);
  assert.deepEqual(inner("amap_basemap_config"), {map:3});
  assert.deepEqual(inner("navi_cloud"), {route:2,end_auto_foot_explore:0,ExtremelyRecommendCount:0});
  assert.deepEqual(inner("taxi"), {order:3,recommend_point_optimization:0,recommend_point_service_overview:0,end_point_optimization:0,hitch_way_point_nav_default:0});
  assert.deepEqual(inner("sportsGroupConfig"), {route:2});
  assert.deepEqual(inner("sportsRouteConfig"), {route:2});
  assert.equal(inner("his_input_tip").nearby_hotword.history,2);
  assert.equal(inner("his_input_tip").nearby_hotword.search_detail,0);
  assert.equal(inner("detail_config").poiDetailScreenCacheConfig.keep,2);
  assert.equal(inner("detail_config").poiDetailScreenCacheConfig.secondScreenAnchorModule,"");
  assert.deepEqual(inner("engine_render"),{map:3});
  assert.deepEqual(inner("poi_folder_modules").folder_modules,["evaluateVO","enhanceIMQuestions"]);
  assert.equal(inner("poi_folder_modules").newFolderModules.length,2);
  assert.equal(inner("favorites_info").nearby_picture_on,0);
  assert.equal(inner("container_isolation").nearby_feed_poi_card_v2_multi_img,0);
  assert.equal(inner("nore_rec").recommend,0);
  assert.deepEqual(inner("engine_eyrie"),{keep:2});
  assert.deepEqual(inner("WIA"),{keep:2});
});
test("updatable passthrough invalid bodies and protects other hosts/paths", () => {
  for (const body of ["bad","null","[]","{}",undefined])
    assert.deepEqual(run(body),{});
  const body = JSON.stringify({data:{splashscreen:1}});
  for (const url of ["https://other.example/ws/shield/frogserver/aocs/updatable/1?x=1",endpoint.replace("/1?","/2?"),endpoint.replace("https:","http:")])
    assert.deepEqual(run(body,url),{});
  assert.deepEqual(JSON.parse(run(body,endpoint.split("?")[0]).body),{data:{}});
});
test("updatable preserves original string bytes when there is no target change", () => {
  assert.deepEqual(run(JSON.stringify({data:{WIA:{value:'{ "safe": 1 }'}, sportsGroupConfig:{value:'{ "safe": 2 }'}}})),{});
});

