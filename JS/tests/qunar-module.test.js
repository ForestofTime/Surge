const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../../Module/QunarAds.sgmodule');
const text = fs.readFileSync(file, 'utf8');
const rules = text.split('\n').filter(line => line.startsWith('^'));
const matching = url => rules.filter(line => new RegExp(line.split(' ')[0]).test(url));

test('Qunar uses only three native endpoint-scoped rules and exact MITM hosts', () => {
  assert.equal(rules.length, 3);
  assert.match(text, /#!desc=.*v1/);
  assert.match(text, /hostname = %APPEND% client.qunar.com, homefront.qunar.com, qde.qunar.com/);
  assert.doesNotMatch(text, /\[Script\]|script-path=|DOMAIN-SUFFIX|source\\\.qunarzz/);
});
test('splash configuration returns JSON and preload returns an empty success', () => {
  for (const scheme of ['http', 'https']) {
    for (const suffix of ['', '?v=1']) {
      const config = matching(`${scheme}://homefront.qunar.com/front/splash/ad${suffix}`);
      assert.equal(config.length, 1);
      assert.match(config[0], /data="\{\}".*status-code=200.*Content-Type:application\/json/);
      const preload = matching(`${scheme}://qde.qunar.com/preload${suffix}`);
      assert.equal(preload.length, 1);
      assert.match(preload[0], /data="" status-code=200/);
    }
  }
});
test('splash proxy supports reordered parameters but matches the complete parameter value', () => {
  for (const query of ['qrt=p_splashAd', 'a=1&qrt=p_splashAd', 'qrt=p_splashAd&a=1']) {
    const matches = matching(`https://client.qunar.com/pitcher-proxy?${query}`);
    assert.equal(matches.length, 1);
    assert.match(matches[0], / - reject$/);
  }
});
test('business routes, lookalike hosts, parameters and shared images remain untouched', () => {
  for (const url of [
    'https://client.qunar.com/pitcher-proxy?qrt=p_flightSearch',
    'https://client.qunar.com/pitcher-proxy?qrt=p_splashAdOther',
    'https://client.qunar.com/pitcher-proxy?xqrt=p_splashAd',
    'https://client.qunar.com/pitcher-proxy?redirect=qrt=p_splashAd',
    'https://client.qunar.com/order/detail?qrt=p_splashAd',
    'https://homefront.qunar.com/front/splash/adBusiness',
    'https://homefront.qunar.com/front/splash/ad/booking',
    'https://qde.qunar.com/preloadBooking',
    'https://homefront.qunar.com.evil.test/front/splash/ad',
    'https://source.qunarzz.com/site/images/wns/hotel.jpg',
    'https://user.qunar.com/login',
  ]) assert.equal(matching(url).length, 0, url);
});
