const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.resolve(__dirname, '../../Module/GoofishAds.sgmodule');
const scriptPath = path.resolve(__dirname, '../GoofishAds.js');
const cainiaoModulePath = path.resolve(__dirname, '../../Module/CainiaoMiniProgram.sgmodule');
const readmePath = path.resolve(__dirname, '../../README.md');
const harPath = '/Users/huangyinan/Library/Mobile Documents/com~apple~CloudDocs/文档/2026-08-11-085636.har';
const moduleText = fs.existsSync(modulePath) ? fs.readFileSync(modulePath, 'utf8') : '';
const scriptText = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, 'utf8') : '';
const cainiaoModuleText = fs.readFileSync(cainiaoModulePath, 'utf8');
const readmeText = fs.readFileSync(readmePath, 'utf8');

const API_NAMES = [
  'mtop.taobao.idle.user.strategy.list',
  'mtop.taobao.idlehome.home.circle.list',
  'mtop.taobao.idlehome.home.nextfresh',
  'mtop.taobao.idlemtopsearch.search.shade',
  'mtop.taobao.idlemtopsearch.item.search.activate',
  'mtop.taobao.idlemtopsearch.search.discover',
  'mtop.idle.user.page.my.adapter',
  'mtop.taobao.idle.item.buy.feeds',
  'mtop.taobao.idle.local.home',
  'mtop.taobao.idlemtopsearch.search',
  'mtop.taobao.idle.item.recommend',
];

function sectionLines(text, sectionName) {
  const section = text.match(
    new RegExp('\\[' + sectionName + '\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)')
  );
  assert.ok(section, '[' + sectionName + '] section must exist');
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function runScript({ url, headers = {}, body }) {
  const doneCalls = [];
  vm.runInNewContext(
    scriptText,
    {
      $request: { url, headers },
      $response: { body },
      $done: (value) => doneCalls.push(value),
    },
    { filename: scriptPath }
  );
  assert.equal(doneCalls.length, 1, 'the response script must call $done once');
  return doneCalls[0];
}

function runJson(api, value) {
  const body = JSON.stringify(value);
  const result = runScript({
    url: `https://acs.m.goofish.com/gw/${api}/1.0?rnd=test`,
    headers: { 'User-Agent': '%E9%97%B2%E9%B1%BC/57010120' },
    body,
  });
  return result.body ? JSON.parse(result.body) : JSON.parse(body);
}

function scriptNames(text) {
  return sectionLines(text, 'Script').map((line) => line.slice(0, line.indexOf('=')).trim());
}

test('declares a native v1 module with unique scripts and no ScriptHub jq dependency', () => {
  assert.match(moduleText, /^#!name=闲鱼去广告$/m);
  assert.match(moduleText, /^#!desc=.*页面广告字段.*HTTPDNS.*v1$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/GoofishAds\.sgmodule$/m
  );
  assert.doesNotMatch(moduleText, /^\[Body Rewrite\]$/m);
  assert.doesNotMatch(moduleText, /http-response-jq|script\.hub|ddgksf2013\/Scripts/);

  const scripts = sectionLines(moduleText, 'Script');
  assert.equal(scripts.length, 2);
  assert.deepEqual(scriptNames(moduleText), ['闲鱼-HTTPDNS清理', '闲鱼-响应净化']);
  assert.equal(new Set(scriptNames(moduleText)).size, 2);
  for (const line of scripts) {
    assert.ok(line.includes('/JS/GoofishAds.js?v=1'));
    assert.ok(line.includes('type=http-response'));
    assert.ok(line.includes('requires-body=true'));
    assert.doesNotMatch(line, /max-size=-1/);
  }
});

test('keeps Goofish and Cainiao AMDC interception disjoint', () => {
  const goofishAmdc = sectionLines(moduleText, 'Script').find((line) => line.startsWith('闲鱼-HTTPDNS清理'));
  const cainiaoAmdc = sectionLines(cainiaoModuleText, 'Script').find((line) => line.includes('HTTPDNS清理'));
  assert.ok(goofishAmdc);
  assert.ok(cainiaoAmdc);
  assert.match(goofishAmdc, /appkey=12431167/);
  assert.doesNotMatch(goofishAmdc, /21380790/);
  assert.match(cainiaoAmdc, /appkey=21380790/);
  assert.doesNotMatch(cainiaoAmdc, /12431167/);
  assert.equal(
    new Set([...scriptNames(moduleText), ...scriptNames(cainiaoModuleText)]).size,
    scriptNames(moduleText).length + scriptNames(cainiaoModuleText).length
  );
  assert.doesNotMatch(moduleText, /^amdc\s*=/m);
});

test('covers all eleven QX jq endpoints with one bounded response script', () => {
  const responseScript = sectionLines(moduleText, 'Script').find((line) => line.startsWith('闲鱼-响应净化'));
  assert.ok(responseScript);
  assert.match(responseScript, /\(g-\)\?/);
  for (const api of API_NAMES) {
    const escaped = api.replaceAll('.', '\\.');
    assert.ok(responseScript.includes(escaped), `${api} must be present in the Surge pattern`);
  }
  assert.doesNotMatch(responseScript, /\/gw\/\.\*|<ip-address>/);
  assert.deepEqual(sectionLines(moduleText, 'MITM'), [
    'hostname = %APPEND% acs.m.goofish.com, g-acs.m.goofish.com',
  ]);
});

test('converts both QX reject-200 rules to valid JSON responses', () => {
  assert.deepEqual(sectionLines(moduleText, 'Map Local'), [
    '^https?:\\/\\/(?:g-)?acs\\.m\\.goofish\\.com\\/gw\\/mtop.*splash\\.ads(?:\\/|\\?|$) data-type=text data="{}" status-code=200 header="Content-Type:application/json"',
    '^https?:\\/\\/(?:g-)?acs\\.m\\.goofish\\.com\\/gw\\/mtop\\.idle\\.ad\\.expose(?:\\/|\\?|$) data-type=text data="{}" status-code=200 header="Content-Type:application/json"',
  ]);
  assert.deepEqual(sectionLines(moduleText, 'Rule'), [
    'DOMAIN-SUFFIX,iyes.youku.com,REJECT',
  ]);
  assert.doesNotMatch(moduleText, /data=" "|data="ddgksf2013"/);
});

test('selectively removes only confirmed Goofish hosts from a valid AMDC response', () => {
  const source = {
    dns: [
      { host: 'acs.m.goofish.com', ttl: 300, servers: ['59.82.121.58'] },
      { host: 'g-acs.m.goofish.com', ttl: 300, servers: ['59.82.121.59'] },
      { host: 'netflow-mtop.cainiao.com', ttl: 300, servers: ['203.119.252.113'] },
      { host: 'acs.m.taobao.com', ttl: 300, servers: ['203.119.238.48'] },
    ],
    config: { keep: '闲鱼正常配置' },
  };
  const result = runScript({
    url: 'http://59.82.113.219/amdc/mobileDispatch?appkey=12431167&v=6.5',
    headers: { 'User-Agent': '%E9%97%B2%E9%B1%BC/57010120 CFNetwork/3896.100.1.2.1' },
    body: Buffer.from(JSON.stringify(source), 'utf8').toString('base64'),
  });
  const output = JSON.parse(Buffer.from(result.body, 'base64').toString('utf8'));

  assert.deepEqual(output, {
    dns: [source.dns[2], source.dns[3]],
    config: source.config,
  });
});

test('passes foreign AMDC traffic and malformed responses through unchanged', () => {
  const body = Buffer.from(JSON.stringify({
    dns: [{ host: 'acs.m.goofish.com', servers: ['59.82.121.58'] }],
  })).toString('base64');
  const cases = [
    {
      url: 'http://59.82.113.219/amdc/mobileDispatch?appkey=21380790',
      headers: { 'User-Agent': '%E9%97%B2%E9%B1%BC/57010120' },
      body,
    },
    {
      url: 'http://59.82.113.219/amdc/mobileDispatch?appkey=12431167',
      headers: { 'User-Agent': '%E6%B7%98%E5%AE%9D/57035247' },
      body,
    },
    {
      url: 'http://59.82.113.219/amdc/mobileDispatch?appkey=12431167',
      headers: { 'User-Agent': '%E9%97%B2%E9%B1%BC/57010120' },
      body: 'ddgksf2013',
    },
  ];
  for (const input of cases) assert.equal(JSON.stringify(runScript(input)), '{}');
});

test('ports all eleven QX jq mutations while preserving functional siblings', () => {
  const strategy = runJson(API_NAMES[0], { data: { strategies: [{ ad: true }], serverTime: 1 } });
  assert.deepEqual(strategy.data, { strategies: [{}], serverTime: 1 });

  const circles = runJson(API_NAMES[1], {
    data: { circleList: [{ bizCode: 'follow' }, { bizCode: 'saveMoney' }, { bizCode: 'nearby' }], next: true },
  });
  assert.deepEqual(circles.data.circleList, [{ bizCode: 'follow' }, { bizCode: 'nearby' }]);
  assert.equal(circles.data.next, true);

  const home = runJson(API_NAMES[2], {
    data: {
      homeTopList: [{ type: 'functional-navigation' }, { type: 'promotion' }],
      sections: [
        { data: { bizType: 'item', id: 'real-item' } },
        { data: { bizType: 'mamaAD', id: 'ad' } },
      ],
      nextPage: 2,
    },
  });
  assert.deepEqual(home.data.homeTopList, [{ type: 'functional-navigation' }]);
  assert.deepEqual(home.data.sections, [{ data: { bizType: 'item', id: 'real-item' } }]);
  assert.equal(home.data.nextPage, 2);

  const shade = runJson(API_NAMES[3], { data: { singleShadeWords: [{ word: '广告' }], bucketId: 'keep' } });
  assert.deepEqual(shade.data, { singleShadeWords: [{}], bucketId: 'keep' });

  const activate = runJson(API_NAMES[4], { data: { cardList: [{ ad: true }], keep: true } });
  assert.deepEqual(activate.data, { cardList: [{}], keep: true });

  const discover = runJson(API_NAMES[5], { data: { resultList: [{ ad: true }], history: ['相机'] } });
  assert.deepEqual(discover.data, { history: ['相机'] });

  const mine = runJson(API_NAMES[6], {
    data: {
      ability: [{ promotion: true }],
      base: { nick: '用户' },
      container: {
        sections: [
          { sectionBizCode: 'headProfile', value: 'profile' },
          { sectionBizCode: 'userAssets', value: 'assets' },
          { sectionBizCode: 'tradeOrder', value: 'orders' },
          { sectionBizCode: 'marketingBanner', value: 'ad' },
        ],
      },
    },
  });
  assert.deepEqual(mine.data.ability, []);
  assert.deepEqual(mine.data.base, { nick: '用户' });
  assert.deepEqual(mine.data.container.sections.map((item) => item.value), ['profile', 'assets', 'orders']);

  const buyFeeds = runJson(API_NAMES[7], { data: { sections: [{ ad: true }], nextPage: 3 } });
  assert.deepEqual(buyFeeds.data, { nextPage: 3 });

  const local = runJson(API_NAMES[8], {
    data: { sections: [{ data: { bizType: 'item', id: 1 } }, { data: { bizType: 'ad', id: 2 } }], city: '厦门' },
  });
  assert.deepEqual(local.data.sections, [{ data: { bizType: 'item', id: 1 } }]);
  assert.equal(local.data.city, '厦门');

  const search = runJson(API_NAMES[9], {
    data: {
      resultList: [
        { data: { item: { main: { clickParam: { args: { biz_type: 'item' } } } } }, id: 'real' },
        { data: { item: { main: { clickParam: { args: { biz_type: 'ad' } } } } }, id: 'ad' },
      ],
      page: 1,
    },
  });
  assert.deepEqual(search.data.resultList.map((item) => item.id), ['real']);
  assert.equal(search.data.page, 1);

  const recommend = runJson(API_NAMES[10], {
    data: {
      cardList: [
        { cardData: { bizType: 'item' }, id: 'real' },
        { cardData: { bizType: 'mamaAD' }, id: 'ad' },
        { cardData: {}, id: 'functional-fallback' },
      ],
      next: true,
    },
  });
  assert.deepEqual(recommend.data.cardList.map((item) => item.id), ['real', 'functional-fallback']);
  assert.equal(recommend.data.next, true);
});

test('passes malformed and unrelated API responses through', () => {
  assert.equal(JSON.stringify(runScript({
    url: 'https://acs.m.goofish.com/gw/mtop.taobao.idle.rule.config/1.0',
    body: JSON.stringify({ data: { sections: [{ ad: true }] } }),
  })), '{}');
  assert.equal(JSON.stringify(runScript({
    url: 'https://acs.m.goofish.com/gw/mtop.taobao.idle.local.home/5.0',
    body: '{invalid',
  })), '{}');
});

test('replays the captured Goofish responses without deleting functional data', { skip: !fs.existsSync(harPath) }, () => {
  const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
  const replayed = new Set();
  for (const entry of har.log.entries) {
    const api = API_NAMES.find((name) => entry.request.url.includes(`/gw/${name}/`));
    const content = entry.response && entry.response.content;
    if (!api || !content || !content.text) continue;
    const body = content.encoding === 'base64'
      ? Buffer.from(content.text, 'base64').toString('utf8')
      : content.text;
    const output = runJson(api, JSON.parse(body));
    replayed.add(api);

    assert.ok(output.data && typeof output.data === 'object');
    if (api.endsWith('home.nextfresh') || api.endsWith('idle.local.home')) {
      assert.ok(output.data.sections.every((item) => item.data && item.data.bizType === 'item'));
      assert.ok(Object.hasOwn(output.data, 'nextPage'));
    }
    if (api.endsWith('user.page.my.adapter')) {
      assert.deepEqual(output.data.ability, []);
      assert.ok(output.data.base);
      assert.ok(output.data.container.sections.every((item) => /head|user|trade/.test(item.sectionBizCode)));
    }
  }

  assert.deepEqual([...replayed].sort(), [
    API_NAMES[0], API_NAMES[1], API_NAMES[2], API_NAMES[3], API_NAMES[6], API_NAMES[8],
  ].sort());
});

test('documents the raw module and one-click Surge import', () => {
  assert.match(readmeText, /Module\/GoofishAds\.sgmodule/);
  assert.match(
    readmeText,
    /surge:\/\/\/install-module\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2FForestofTime%2FSurge%2Fmain%2FModule%2FGoofishAds\.sgmodule/
  );
});
