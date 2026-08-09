const headers = $request.headers || {};
const userAgent = headers['User-Agent'] || headers['user-agent'] || '';
const isMiniProgram = /MicroMessenger/i.test(userAgent);

if (!isMiniProgram) {
  $done({});
} else {
  try {
    const payload = JSON.parse($response.body);

    if (!Array.isArray(payload.data)) {
      $done({});
    } else {
      let changed = false;
      const data = payload.data.map((floor) => {
        if (!floor || typeof floor !== 'object') return floor;

        const isStartupFloor = floor.floorId === 'qdp' || floor.floorName === '启动屏';
        if (!isStartupFloor || !Array.isArray(floor.startupDto)) return floor;

        changed = true;
        return Object.assign({}, floor, { startupDto: [] });
      });

      $done(changed ? { body: JSON.stringify(Object.assign({}, payload, { data })) } : {});
    }
  } catch (_) {
    $done({});
  }
}
