/**
 * 京东开屏配置清理。参考 fmz200/wool_scripts 的 start.images/showTimesDaily
 * 及 zbsdsb/loon-adblock-plugins 的明文/Base64 双协议处理。
 * 兼容用户提供的 Loon basicConfig 配置；不清理首页、订单或物流楼层。
 */
(function () {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function encode(text) {
    const bytes = unescape(encodeURIComponent(text));
    let result = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes.charCodeAt(i);
      const b = i + 1 < bytes.length ? bytes.charCodeAt(i + 1) : 0;
      const c = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) : 0;
      result += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)]
        + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=')
        + (i + 2 < bytes.length ? alphabet[c & 63] : '=');
    }
    return result;
  }
  function decode(text) {
    if (!text || text.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
      throw new Error('Invalid Base64');
    }
    let bytes = '', bits = 0, buffer = 0;
    for (const char of text.replace(/=+$/, '')) {
      buffer = (buffer << 6) | alphabet.indexOf(char);
      bits += 6;
      if (bits >= 8) { bits -= 8; bytes += String.fromCharCode((buffer >>> bits) & 255); }
    }
    const decoded = decodeURIComponent(escape(bytes));
    if (encode(decoded) !== text) throw new Error('Noncanonical Base64');
    return decoded;
  }
  function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function promotionalFullscreenLayer(layer) {
    if (!plainObject(layer) || typeof layer.name !== 'string') return false;
    if (layer.name.includes('多买多返')) return true;
    if (/登录|隐私|协议|支付|订单|物流|认证|安全/.test(layer.name)) return false;
    if (!/红包|优惠券|弹窗|推广|权益|CPS|新客|拉新|新人/.test(layer.name)) return false;
    const layout = layer.layout;
    if (Number(layer.renderType) !== 6 || !plainObject(layout) || !plainObject(layer.renderData)) return false;
    const w = Number(layout.screenWidth), h = Number(layout.screenHeight);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
    return Number(layout.width) >= w * 0.9 && Number(layout.height) >= h * 0.9
      && /^https:\/\/storage\.360buyimg\.com\/xview\//i.test(String(layer.renderData.url || ''));
  }
  try {
    const url = String($request.url || '');
    if (!/^https?:\/\/api\.m\.jd\.com\/client\.action(?:\?|$)/i.test(url)) return $done({});
    const body = $response.body;
    if (typeof body !== 'string' || !body || body.length > 2000000) return $done({});
    const match = url.match(/[?&]functionId=([^&]*)/i);
    let functionId = match ? decodeURIComponent(match[1]) : '';
    if (!match && String($request.method || '').toUpperCase() === 'POST' && typeof $request.body === 'string') {
      const requestBody = $request.body;
      if (/^\s*\{/.test(requestBody)) {
        const requestData = JSON.parse(requestBody);
        if (plainObject(requestData) && typeof requestData.functionId === 'string') functionId = requestData.functionId;
      } else {
        const bodyMatch = requestBody.match(/(?:^|&)functionId=([^&]*)/);
        if (bodyMatch) functionId = decodeURIComponent(bodyMatch[1].replace(/\+/g, ' '));
      }
    }
    if (functionId && !['start', 'startup', 'queryMaterialAdverts', 'basicConfig', 'xview2Config'].includes(functionId)) return $done({});
    let payload, encoded = false;
    try { payload = JSON.parse(body); }
    catch (_) { payload = JSON.parse(decode(body)); encoded = true; }
    if (!plainObject(payload)) return $done({});
    if (functionId === 'xview2Config') {
      // 用户接受过滤疑似组合开屏：按全屏布局、资源包及促销标记判定，保留业务层。
      if (!plainObject(payload.data) || !Array.isArray(payload.data.targets)) return $done({});
      let changed = false;
      for (const target of payload.data.targets) {
        if (!plainObject(target) || !Array.isArray(target.layers)) continue;
        const remaining = target.layers.filter(layer => !promotionalFullscreenLayer(layer));
        if (remaining.length !== target.layers.length) { target.layers = remaining; changed = true; }
      }
      if (!changed) return $done({});
      const result = JSON.stringify(payload);
      return $done({ body: encoded ? encode(result) : result });
    }
    if (functionId === 'basicConfig') {
      // 只修改已存在的三个控制字段，保留其它 DNS、业务和通知设置。
      const paths = [
        ['data', 'JDMessage', 'socketmonitor', 'isSocketEstablishedAhead'],
        ['data', 'JDMessage', 'socketmonitor', 'isSocketReport'],
        ['data', 'JDHttpToolKit', 'httpdns', 'httpdns'],
      ];
      let changed = false;
      for (const keys of paths) {
        let parent = payload;
        for (const key of keys.slice(0, -1)) parent = plainObject(parent) ? parent[key] : undefined;
        const key = keys[keys.length - 1];
        if (plainObject(parent) && Object.prototype.hasOwnProperty.call(parent, key) && parent[key] !== 0) {
          parent[key] = 0;
          changed = true;
        }
      }
      if (!changed) return $done({});
      const result = JSON.stringify(payload);
      return $done({ body: encoded ? encode(result) : result });
    }
    const target = plainObject(payload.data) && Array.isArray(payload.data.images) ? payload.data : payload;
    if (!Array.isArray(target.images)) return $done({});
    if (!functionId) {
      // POST 函数不在 URL 时，只接受完整开屏结构；不把普通商品图片列表当开屏。
      if (String($request.method || '').toUpperCase() !== 'POST'
        || !Object.prototype.hasOwnProperty.call(target, 'showTimesDaily')
        || typeof target.showTimesDaily !== 'number'
        || !target.images.every(item => plainObject(item)
          && ['image', 'imageUrl', 'imgUrl', 'url', 'videoUrl'].some(key => typeof item[key] === 'string' && item[key]))) {
        return $done({});
      }
    }
    let changed = target.images.length > 0;
    target.images = [];
    if (Object.prototype.hasOwnProperty.call(target, 'showTimesDaily') && target.showTimesDaily !== 0) {
      target.showTimesDaily = 0;
      changed = true;
    }
    // images 已为空时也必须清理容器控制，不能把透明素材等同于关闭开屏。
    // 仅在已确认的开屏 images 结构中处理现有字段，不触碰普通启动/订单配置。
    const presentation = {
      countdown: 0, dynamicDisplay: 0, firework: 0,
      saoasaoSwitch: 0, isNewCarousel: 0, saoasaoUrl: '', callback: '',
    };
    for (const key of Object.keys(presentation)) {
      if (!Object.prototype.hasOwnProperty.call(target, key) || target[key] === presentation[key]) continue;
      target[key] = presentation[key];
      changed = true;
    }
    for (const key of ['controlMaterials', 'layOut']) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
      const value = target[key];
      const empty = typeof value === 'string' ? (key === 'controlMaterials' ? 'null' : '{}')
        : Array.isArray(value) ? [] : plainObject(value) ? {} : null;
      if (JSON.stringify(value) === JSON.stringify(empty)) continue;
      target[key] = empty;
      changed = true;
    }
    if (!changed) return $done({});
    const result = JSON.stringify(payload);
    return $done({ body: encoded ? encode(result) : result });
  } catch (_) {
    // 不打印请求或响应，避免带出账户、设备与认证数据。
    return $done({});
  }
}());
