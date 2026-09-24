/**
 * 农业银行 App 开屏广告跳过（v1）
 * ============================================================================
 * 原理：
 *   农行开屏广告图由 midc.cdn-static.abchina.com.cn/distributecenterimg/file/download/
 *   下发，URL 无后缀、无尺寸信息，无法用 Map Local 正则区分开屏图与活动小图。
 *
 *   本脚本在 http-response 阶段解析 JPEG SOF 段取图片宽高：
 *     宽 ≥ 1000px 且 高/宽 ≥ 1.7（竖版全屏比例）→ 判定开屏广告 → 返回 1x1 透明 GIF
 *     其余（319x184 活动图、670x200 横幅、323x382 弹窗等）→ 原样放行
 *
 *   PNG 开屏罕见；若命中 PNG 走 magic 检查（IHDR 在固定偏移，解析同样简单）。
 * ============================================================================
 * Surge 模块引用：
 *   农行-开屏图过滤 = type=http-response,
 *     pattern=^https?:\/\/midc\.cdn-static\.abchina\.com\.cn\/distributecenterimg\/file\/download\/[0-9a-f]{32},
 *     script-path=…/ABCSplash.js, timeout=10, requires-body=true
 */

const TINY_GIF_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function jpegDimensions(bytes) {
  // 扫描 JPEG segment 找 SOF0-3（0xC0-0xC3）
  let i = 2;
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xC0 && marker <= 0xC3 && marker !== 0xC4) {
      // 高度在前
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      return { w, h };
    }
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2) return null;
    i += 2 + segLen;
  }
  return null;
}

function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  // 8 字节签名 + 4 长度 + 4 'IHDR' + 4 宽 + 4 高
  const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  return { w, h };
}

function isSplashImage(bytes) {
  if (!bytes || bytes.length < 32) return false;
  let dim = null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) dim = jpegDimensions(bytes);
  else if (bytes[0] === 0x89 && bytes[1] === 0x50) dim = pngDimensions(bytes);
  if (!dim) return false;
  return dim.w >= 1000 && dim.h / dim.w >= 1.7;
}

(() => {
  try {
    const url = String($request.url || '');
    // 双保险：URL 必须是 midc 下发素材路径
    if (!/^https?:\/\/midc\.cdn-static\.abchina\.com\.cn\/distributecenterimg\/file\/download\//i.test(url)) {
      $done({});
      return;
    }
    const body = $response.body;
    if (!body) { $done({}); return; }

    // Surge requires-body 下 body 可能是字符串（binary 会以 base64 提供 encoding 标记）
    let bytes;
    if (typeof body === 'string') {
      // 尝试按 base64 解（Surge 二进制 body 约定），失败按 latin1 字节串
      try {
        const raw = atob(body);
        bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      } catch (_) {
        bytes = new Uint8Array(body.length);
        for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xFF;
      }
    } else {
      bytes = new Uint8Array(body);
    }

    if (isSplashImage(bytes)) {
      console.log('ABCSplash: 命中开屏图（' + bytes.length + 'B）→ 返回 tiny-gif');
      $done({
        body: atob(TINY_GIF_B64),
        headers: { 'Content-Type': 'image/gif' },
      });
      return;
    }
    $done({});
  } catch (error) {
    console.log('ABCSplash: ' + error);
    $done({});
  }
})();
