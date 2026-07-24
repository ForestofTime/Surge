const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const modulePath = path.resolve(__dirname, '../../Module/Didichuxing.sgmodule');
const moduleText = fs.existsSync(modulePath)
  ? fs.readFileSync(modulePath, 'utf8')
  : '';

function sectionLines(sectionName) {
  const section = moduleText.match(
    new RegExp(`\\[${sectionName}\\]\\n([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)`)
  );

  assert.ok(section, `[${sectionName}] section must exist`);
  return section[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function jqExpressionsFor(fragment) {
  return sectionLines('Body Rewrite')
    .filter((line) => line.includes(fragment))
    .map((line) => {
      const firstQuote = line.indexOf("'");
      const lastQuote = line.lastIndexOf("'");
      assert.ok(firstQuote > 0 && lastQuote > firstQuote, `invalid jq rule: ${line}`);
      return line.slice(firstQuote + 1, lastQuote);
    });
}

function runJq(fragment, value) {
  const expressions = jqExpressionsFor(fragment);
  assert.ok(expressions.length > 0, `missing jq rule for ${fragment}`);

  return expressions.reduce((current, expression) => {
    const result = spawnSync('jq', ['-c', expression], {
      encoding: 'utf8',
      input: JSON.stringify(current),
    });

    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }, value);
}

function mapLocalMatches(url) {
  return sectionLines('Map Local').some((line) => {
    const pattern = line.split(/\s+/, 1)[0];
    return new RegExp(pattern).test(url);
  });
}

test('declares a dedicated v1 passenger module', () => {
  assert.notEqual(moduleText, '', 'Module/Didichuxing.sgmodule must exist');
  assert.match(moduleText, /^#!name=滴滴出行去广告$/m);
  assert.match(moduleText, /^#!desc=.*v1$/m);
  assert.match(
    moduleText,
    /^#!raw-url=https:\/\/raw\.githubusercontent\.com\/ForestofTime\/Surge\/main\/Module\/Didichuxing\.sgmodule$/m
  );
});

test('combines the QX exact TCP blocks with the Surge ASN blocks', () => {
  const rules = sectionLines('Rule');
  const qxAddresses = [
    '139.199.244.6',
    '113.46.225.9',
    '139.199.244.7',
    '113.46.225.8',
    '123.207.209.39',
    '123.207.209.60',
    '139.199.240.15',
    '139.199.240.12',
    '116.85.3.37',
    '162.14.157.2',
    '162.14.157.24',
    '116.85.1.0',
    '116.85.1.17',
    '116.85.1.22',
    '116.85.3.25',
  ];

  assert.ok(
    rules.includes(
      'DOMAIN,gwp.xiaojukeji.com,REJECT,extended-matching,pre-matching'
    )
  );
  for (const address of qxAddresses) {
    assert.ok(rules.includes(`IP-CIDR,${address}/32,REJECT,no-resolve`));
  }
  for (const asn of [45090, 55990, 63646]) {
    assert.ok(
      rules.includes(
        `AND,((IP-ASN,${asn},no-resolve),(DEST-PORT,25641),(PROTOCOL,TCP)),REJECT`
      )
    );
  }
});

test('returns empty dictionaries for home advertisement feeds only', () => {
  const blocked = [
    'https://res.xiaojukeji.com/resapi/activity/getMulti?x=1',
    'https://res.xiaojukeji.com/resapi/activity/xpget',
    'https://res.xiaojukeji.com/resapi/activity/mget?x=1',
    'https://res.xiaojukeji.com/resapi/activity/getInsActivityV2',
    'https://ct.xiaojukeji.com/agent/v3/feeds?x=1',
    'https://conf.diditaxi.com.cn/homepage/v1/other/fast?x=1',
    'https://conf.diditaxi.com.cn/homepage/v2/other/slow?x=1',
    'https://conf.diditaxi.com.cn/dynamic/conf',
    'https://api.udache.com/gulfstream/watson/v1/bubble/getBubble',
    'https://conf.diditaxi.com.cn/ota/na/yuantu/infoList',
  ];

  for (const url of blocked) {
    assert.equal(mapLocalMatches(url), true, url);
  }

  for (const functionalUrl of [
    'https://freight.xiaojukeji.com/gateway',
    'https://daijia.kuaidadi.com:443/gateway',
    'https://poi.map.xiaojukeji.com/mapapi/recommend?x=1',
    'https://lion.didialift.com/broker/?x=1',
  ]) {
    assert.equal(mapLocalMatches(functionalUrl), false, functionalUrl);
  }

  for (const line of sectionLines('Map Local')) {
    assert.match(
      line,
      /data-type=text data="\{\}" status-code=200 header="Content-Type:application\/json"$/
    );
  }
});

test('reproduces the QX-clean home navigation from the current HAR', () => {
  const result = runJq('homepage\\/v\\d+\\/core', {
    data: {
      order_cards: {
        nav_list_card: {
          data: [
            { nav_id: 'dache_anycar' },
            { nav_id: 'carmate' },
            { nav_id: 'driverservice' },
            { nav_id: 'zhandianbashi' },
            { nav_id: 'bike' },
            { nav_id: 'zuche' },
            { nav_id: 'nav_more_v3' },
          ],
        },
      },
      disorder_cards: {
        bottom_nav_list: {
          data: [
            { id: 'v6x_home' },
            { id: 'home_page' },
            { id: 'travel' },
            { id: 'user_center' },
          ],
        },
        top_nav_list: {
          data: {
            top_nav_info: [
              { name: '出行' },
              { name: '送货' },
              { name: '旅行' },
              { name: '车主' },
            ],
          },
        },
      },
    },
  });

  assert.deepEqual(
    result.data.order_cards.nav_list_card.data.map((item) => item.nav_id),
    ['dache_anycar', 'carmate', 'driverservice', 'bike', 'nav_more_v3']
  );
  assert.deepEqual(
    result.data.disorder_cards.bottom_nav_list.data.map((item) => item.id),
    ['v6x_home', 'home_page', 'user_center']
  );
  assert.deepEqual(
    result.data.disorder_cards.top_nav_list.data.top_nav_info.map(
      (item) => item.name
    ),
    ['出行', '送货']
  );
});

test('keeps the Surge-clean personal cards and removes financial promotion', () => {
  const result = runJq('usercenter\\/layout', {
    data: {
      layout: {
        order: [
          'center_base_info_card',
          'center_member_card',
          'center_order_related_card',
          'center_wallet_finance_card',
          'center_tool_card',
          'center_marketing_card',
        ],
      },
      instances: {
        center_base_info_card: { data: {} },
        center_member_card: { data: { title: 'V5会员' } },
        center_order_related_card: { data: {} },
        center_wallet_finance_card: {
          data: {
            view_info: [
              { title: '优惠卡券' },
              { title: '余额' },
              { title: '福利金' },
              { title: '单单返现' },
              { title: '账单月结' },
              { title: '预估可借' },
            ],
          },
        },
        center_tool_card: { data: { title: '工具' } },
        center_marketing_card: { data: { title: '推广' } },
        center_widget_list: { data: {} },
      },
    },
  });

  assert.deepEqual(result.data.layout.order, [
    'center_base_info_card',
    'center_order_related_card',
    'center_wallet_finance_card',
    'center_tool_card',
  ]);
  assert.deepEqual(Object.keys(result.data.instances), [
    'center_base_info_card',
    'center_order_related_card',
    'center_wallet_finance_card',
    'center_tool_card',
  ]);
  assert.deepEqual(
    result.data.instances.center_wallet_finance_card.data.view_info.map(
      (item) => item.title
    ),
    ['优惠卡券', '余额', '福利金']
  );
});

test('cleans the alternate personal endpoint without deleting wallet basics', () => {
  const result = runJq('usercenter\\/me', {
    data: {
      cards: [
        {
          title: '钱包',
          tag: 'wallet',
          card_type: 4,
          items: [{ title: '优惠券' }, { title: '借钱' }],
          bottom_items: [
            { title: '省钱套餐' },
            { title: '出行里程' },
            { title: '金融推广' },
          ],
        },
        { title: '天天领福利' },
        { title: '金融服务' },
        { title: '订单' },
      ],
    },
  });

  assert.deepEqual(result.data.cards, [
    {
      title: '钱包',
      tag: 'wallet',
      card_type: 4,
      items: [{ title: '优惠券' }],
      bottom_items: [{ title: '省钱套餐' }, { title: '出行里程' }],
    },
    { title: '订单' },
  ]);
});

test('filters ad fields instead of rejecting functional service gateways', () => {
  const daijia = runJq('daijia\\.kuaidadi', {
    data: {
      variantInfo: { experiment: true },
      keep: { isAd: 0 },
      advertisement: { isAd: 1 },
    },
  });
  assert.deepEqual(daijia, { data: { keep: { isAd: 0 } } });

  const rideHome = runJq('dache_homepage_layout', {
    data: {
      instances: {
        dache_main_member: {},
        order_container_current: {},
        dache_main_core_icon: {},
        'xp-card-01': {},
        marketing_banner: {},
      },
    },
  });
  assert.deepEqual(Object.keys(rideHome.data.instances), [
    'dache_main_member',
    'order_container_current',
    'dache_main_core_icon',
  ]);
});

test('uses bounded MITM hosts and raw TLS processing', () => {
  const mitm = sectionLines('MITM');
  assert.equal(mitm.at(-1), 'tcp-connection = true');
  assert.match(mitm[0], /^hostname = %APPEND% /);

  for (const hostname of [
    'conf.diditaxi.com.cn',
    'common.diditaxi.com.cn',
    'api.udache.com',
    'res.xiaojukeji.com',
    'daijia.kuaidadi.com',
    'htwkop.xiaojukeji.com',
    'mapi.xiaojukeji.com',
    'manhattan.webapp.xiaojukeji.com',
    'ddpay.xiaojukeji.com',
  ]) {
    assert.ok(mitm[0].includes(hostname), hostname);
  }
  assert.doesNotMatch(moduleText, /<ip-address>/);
});
