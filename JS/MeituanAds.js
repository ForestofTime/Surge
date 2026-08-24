const requestUrl = String(($request && $request.url) || '');
const responseBody = String(($response && $response.body) || '');
let result = {};

try {
  const isTarget = /^https:\/\/h\.meituan\.com\/horn_ios\/mergeRequest(?:\?|$)/i.test(requestUrl);
  if (isTarget) {
    const payload = JSON.parse(responseBody);
    const customer = payload &&
      payload.pikeConfig &&
      payload.pikeConfig.data &&
      payload.pikeConfig.data.customer;

    if (customer && typeof customer === 'object' && !Array.isArray(customer)) {
      let changed = false;
      changed = disableExistingSwitch(customer, 'sharkpush_marketing_dsp_pop') || changed;
      changed = disableExistingSwitch(customer, 'sharkpush_meishi_float_picasso') || changed;
      if (changed) result = { body: JSON.stringify(payload) };
    }
  }
} catch (_) {
  result = {};
}

$done(result);

function disableExistingSwitch(container, key) {
  if (!Object.prototype.hasOwnProperty.call(container, key) || container[key] === false) return false;
  container[key] = false;
  return true;
}
