/**
 * 工银 e 生活原生 App 开屏素材过滤
 *
 * HAR 证实开屏是 1125x2436 的完整 JPEG 画布。按画布尺寸识别，
 * 不依赖文件名、活动 ID、日期或广告文案，也不接管业务接口。
 */

const SPLASH_WIDTH = 1125;
const SPLASH_HEIGHT = 2436;

function requestHeader(name) {
  const headers = $request.headers || {};
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((header) => header.toLowerCase() === target);
  return key ? String(headers[key]) : '';
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function isStartOfFrame(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readJpegDimensions(body) {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  if (bytes.length < 11 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      return null;
    }

    const segmentLength = readUint16BE(bytes, offset);
    const segmentStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) {
      return null;
    }

    if (isStartOfFrame(marker) && segmentStart + 5 <= segmentEnd) {
      return {
        width: readUint16BE(bytes, segmentStart + 3),
        height: readUint16BE(bytes, segmentStart + 1),
      };
    }

    offset = segmentEnd;
  }

  return null;
}

try {
  if (!/\beLife\//i.test(requestHeader('User-Agent'))) {
    $done({});
  } else {
    const dimensions = readJpegDimensions($response.body);
    if (dimensions?.width === SPLASH_WIDTH && dimensions?.height === SPLASH_HEIGHT) {
      $done({
        status: 204,
        headers: { 'Content-Length': '0' },
        body: new Uint8Array(0),
      });
    } else {
      $done({});
    }
  }
} catch (error) {
  console.log(`ICBCLifeAppSplashImage: ${error}`);
  $done({});
}
