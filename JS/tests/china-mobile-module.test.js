const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const modulePath = path.join(repoRoot, 'Module/ChinaMobile.sgmodule');
const scriptPath = path.join(repoRoot, 'JS/ChinaMobileAds.js');
const readIfPresent = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const moduleText = readIfPresent(modulePath);
const scriptText = readIfPresent(scriptPath);

const KEYS = {
  default: Buffer.from('UVic06tpXgMNiApm'),
  mode2: Buffer.from('GS7velkJl5YT1uwQ'),
};
const IV = Buffer.from('9791027341711819');

function encryptPayload(value, mode = 14) {
  const cipher = crypto.createCipheriv('aes-128-cbc', mode === 2 ? KEYS.mode2 : KEYS.default, IV);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]).toString('base64');
  return mode === 1 ? JSON.stringify({ body: encrypted }) : encrypted;
}

function decryptPayload(body, mode = 14) {
  const envelope = mode === 1 ? JSON.parse(body).body : body;
  const decipher = crypto.createDecipheriv('aes-128-cbc', mode === 2 ? KEYS.mode2 : KEYS.default, IV);
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope, 'base64')),
    decipher.final(),
  ]).toString('utf8'));
}

async function runScript({ url, data, decryptMode = 14, encryptMode = 14, rawBody }) {
  let result;
  const execution = vm.runInNewContext(scriptText, {
    $request: { url },
    $response: {
      body: rawBody ?? encryptPayload(data, decryptMode),
      headers: { 'X-Pen': String(decryptMode), 'R-Token': String(encryptMode) },
    },
    $done(value) {
      result = value;
    },
    crypto: crypto.webcrypto,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    console: { log() {} },
  });
  await execution;
  return result;
}

test('publishes a bounded repository-native China Mobile module', () => {
  assert.ok(moduleText, 'Module/ChinaMobile.sgmodule must exist');
  assert.ok(scriptText, 'JS/ChinaMobileAds.js must exist');
  assert.match(moduleText, /^#!name=中国移动去广告$/m);
  assert.match(moduleText, /^#!desc=.*v1$/m);
  assert.match(moduleText, /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/ChinaMobile\.sgmodule$/m);
  assert.doesNotMatch(moduleText, /script\.hub|Yuheng0101|xchun5678/);
  assert.match(moduleText, /script-path=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/JS\/ChinaMobileAds\.js\?v=1/);
  assert.match(moduleText, /engine=webview/);
  assert.match(moduleText, /requires-body=true/);
  assert.match(moduleText, /max-size=1048576/);
  assert.doesNotMatch(moduleText, /max-size=-1/);
});

test('uses unique task names and only the two required MITM hosts', () => {
  const names = [...moduleText.matchAll(/^([^#\s][^=]+?)\s*=\s*type=http-response/gm)].map((match) => match[1].trim());
  assert.equal(names.length, 6);
  assert.equal(new Set(names).size, names.length);
  assert.match(moduleText, /hostname = %APPEND% client\.app\.coc\.10086\.cn, h\.app\.coc\.10086\.cn/);
  assert.doesNotMatch(moduleText, /wo\.cn|admarket\.10086\.cn|adimg\.10086\.cn/);
});

test('cleans startup advertising fields and preserves sibling business data', async () => {
  const source = {
    retCode: '000000',
    rspBody: {
      startImgurl: 'https://example.com/splash.jpg',
      actionUrl: 'cmcc://campaign',
      riskSwitch: '0',
      mZoneSwitchState: '1',
      appletLogSwitch: '1',
      gsmIsShow: '1',
      sdkAdWaitTime: 5,
      navigation: ['home', 'service'],
    },
    traceId: 'keep',
  };
  const result = await runScript({
    url: 'https://client.app.coc.10086.cn/biz-orange/DN/init/startInit',
    data: source,
  });
  const output = decryptPayload(result.body);
  assert.equal(output.rspBody.startImgurl, '');
  assert.equal(output.rspBody.actionUrl, '');
  assert.equal(output.rspBody.riskSwitch, '1');
  assert.equal(output.rspBody.mZoneSwitchState, '0');
  assert.equal(output.rspBody.appletLogSwitch, '0');
  assert.equal(output.rspBody.gsmIsShow, '0');
  assert.equal(output.rspBody.sdkAdWaitTime, -1);
  assert.deepEqual(output.rspBody.navigation, source.rspBody.navigation);
  assert.equal(output.traceId, 'keep');
});

test('filters only known home-area ad slots', async () => {
  const source = {
    rspBody: {
      areaList: [
        { areaId: '20230710006', moduleList: [{ moduleId: 'business-a' }] },
        { areaId: 'normal', moduleList: [{ moduleId: '1' }, { moduleId: 'business-b' }] },
        { areaId: 'business', moduleList: [{ moduleId: 'business-c' }] },
      ],
    },
  };
  const result = await runScript({
    url: 'https://h.app.coc.10086.cn/biz-orange/DH/homeArea/getTopAreaList',
    data: source,
  });
  const output = decryptPayload(result.body);
  assert.deepEqual(output.rspBody.areaList[0].moduleList, []);
  assert.deepEqual(output.rspBody.areaList[1].moduleList, [{ moduleId: 'business-b' }]);
  assert.deepEqual(output.rspBody.areaList[2].moduleList, source.rspBody.areaList[2].moduleList);
});

test('cleans the remaining supplied response families', async () => {
  const cases = [
    ['/biz-orange/DN/newTopPullSecond/getNewTopPullList', { rspBody: { areaList: [1], keep: true } }, 'areaList'],
    ['/biz-orange/DN/emotionMarket/getEmotionMarketNew', { rspBody: { pageList: [1], keep: true } }, 'pageList'],
    ['/biz-orange/DN/friendShake/getShakeList', { rspBody: { friendShakeDbs: [1], keep: true } }, 'friendShakeDbs'],
  ];
  for (const [pathname, source, field] of cases) {
    const result = await runScript({ url: `https://client.app.coc.10086.cn${pathname}`, data: source });
    const output = decryptPayload(result.body);
    assert.deepEqual(output.rspBody[field], [], pathname);
    assert.equal(output.rspBody.keep, true, pathname);
  }

  const navigation = await runScript({
    url: 'https://h.app.coc.10086.cn/biz-orange/DH/navigation/getNavigationNewInfo',
    data: { rspBody: { classificationList: [{ bannerList: [1], keep: 'a' }, { bannerList: [2], keep: 'b' }] } },
  });
  const output = decryptPayload(navigation.body);
  assert.deepEqual(output.rspBody.classificationList.map((item) => item.bannerList), [[], []]);
  assert.deepEqual(output.rspBody.classificationList.map((item) => item.keep), ['a', 'b']);
});

test('supports the mode-1 envelope and mode-2 key, then passes failures through', async () => {
  const mode1 = await runScript({
    url: 'https://client.app.coc.10086.cn/biz-orange/DN/init/startInit',
    data: { rspBody: { startImgurl: 'ad' } },
    decryptMode: 1,
    encryptMode: 1,
  });
  assert.equal(decryptPayload(mode1.body, 1).rspBody.startImgurl, '');

  const mode2 = await runScript({
    url: 'https://client.app.coc.10086.cn/biz-orange/DN/init/startInit',
    data: { rspBody: { startImgurl: 'ad' } },
    decryptMode: 2,
    encryptMode: 2,
  });
  assert.equal(decryptPayload(mode2.body, 2).rspBody.startImgurl, '');

  assert.deepEqual(await runScript({
    url: 'https://client.app.coc.10086.cn/biz-orange/DN/init/startInit',
    rawBody: 'invalid-ciphertext',
  }), {});
});

