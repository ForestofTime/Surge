/**
 * 工银 e 生活原生 App 缓存开屏兜底
 *
 * 当前 HAR 证实开屏以 JPEG 完整画布直读，不依赖素材文件名、活动 ID 或文案。
 */

const SPLASH_WIDTH = 1125;
const SPLASH_HEIGHT = 2436;

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
  const dimensions = readJpegDimensions($response.body);
  if (
    dimensions?.width === SPLASH_WIDTH &&
    dimensions?.height === SPLASH_HEIGHT
  ) {
    $done({ status: 404, body: new Uint8Array(0) });
  } else {
    $done({});
  }
} catch (error) {
  console.log(`ICBCLifeSplashImage: ${error}`);
  $done({});
}
