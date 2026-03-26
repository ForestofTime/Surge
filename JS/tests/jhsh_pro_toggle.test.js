// 简易 Node 烟雾测试：运行该脚本前请切换到仓库根目录，然后执行 `node JS/tests/jhsh_pro_toggle.test.js`

const BASE_RESPONSE_BODY = JSON.stringify({
  data: {
    WINNOW_V3_FESTIVAL: { AD_URL: 'festival' },
    HPBANNER_AD_INFO: { AD_ID: 'hp' },
    MYSELF_ENTRANCE_AD: ['entrance'],
    HPBANNER_X: { AD_IMAGE: 'x' },
    NOTICE_AD_INFO: 'should stay'
  }
});

function captureConsoleLogs() {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    const rendered = args.map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch (err) {
        return String(arg);
      }
    });
    logs.push(rendered.join(' '));
  };
  return {
    logs,
    restore() {
      console.log = originalLog;
    }
  };
}

function runScenario(argument = {}) {
  const capturer = captureConsoleLogs();
  global.$argument = argument;
  global.$response = { body: BASE_RESPONSE_BODY };
  let donePayload;
  global.$done = (payload) => {
    donePayload = payload;
  };

  delete require.cache[require.resolve('../JHSH_PRO.js')];
  require('../JHSH_PRO.js');

  capturer.restore();

  delete global.$argument;
  delete global.$response;
  delete global.$done;

  return {
    payload: donePayload,
    logs: capturer.logs
  };
}

function extractData(payload) {
  if (!payload || !payload.body) {
    throw new Error('测试依赖的 $done 返回值无效');
  }
  const parsed = JSON.parse(payload.body);
  return parsed.data || {};
}

function assertKeyPresence(scenarioName, data, key, shouldExist) {
  const exists = Object.prototype.hasOwnProperty.call(data, key);
  const pass = exists === shouldExist;
  console.log(
    `${scenarioName}: ${key} ${pass ? 'PASS' : 'FAIL'} (期望 ${shouldExist ? '存在' : '被移除'})`
  );
  if (!pass) {
    throw new Error(`${key} 在 ${scenarioName} 中${shouldExist ? '应当' : '不应该'}存在`);
  }
}

function reportLogs(scenarioName, logs) {
  if (logs.length === 0) return;
  console.log(`${scenarioName} 内部日志：`);
  logs.forEach((line) => console.log(`  ${line}`));
}

function runAll() {
  const defaultScenario = runScenario();
  const defaultData = extractData(defaultScenario.payload);
  console.log('=== 场景一：默认行为（未传入参数） ===');
  assertKeyPresence('默认行为', defaultData, 'WINNOW_V3_FESTIVAL', false);
  assertKeyPresence('默认行为', defaultData, 'HPBANNER_AD_INFO', false);
  assertKeyPresence('默认行为', defaultData, 'MYSELF_ENTRANCE_AD', false);
  assertKeyPresence('默认行为', defaultData, 'HPBANNER_X', false);
  assertKeyPresence('默认行为', defaultData, 'NOTICE_AD_INFO', true);
  reportLogs('默认行为', defaultScenario.logs);

  const overrideScenario = runScenario({ block_hpbanner_ad_info: 'false' });
  const overrideData = extractData(overrideScenario.payload);
  console.log('\n=== 场景二：关闭 block_hpbanner_ad_info ===');
  assertKeyPresence('参数 block_hpbanner_ad_info=false', overrideData, 'WINNOW_V3_FESTIVAL', false);
  assertKeyPresence('参数 block_hpbanner_ad_info=false', overrideData, 'HPBANNER_AD_INFO', true);
  assertKeyPresence('参数 block_hpbanner_ad_info=false', overrideData, 'MYSELF_ENTRANCE_AD', false);
  assertKeyPresence('参数 block_hpbanner_ad_info=false', overrideData, 'HPBANNER_X', false);
  reportLogs('参数 block_hpbanner_ad_info=false', overrideScenario.logs);
}

runAll();
