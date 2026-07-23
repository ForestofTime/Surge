/**
 * 朴朴超市缓存广告素材兜底
 *
 * 当前 iOS 版会从本地布局直接加载开屏及个人页广告素材。
 * 开屏按画布尺寸识别；个人页按服务端广告分类识别，并保留 QX
 * 抓包中仍会加载的 228x228 直播入口。不依赖素材文件名或哈希。
 */

const url = $request.url;

function readAscii(bytes, offset, length) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16)
  );
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function findVp8FrameMarker(bytes, start, end) {
  for (let offset = start; offset + 7 <= end; offset += 1) {
    if (
      bytes[offset] === 0x9d &&
      bytes[offset + 1] === 0x01 &&
      bytes[offset + 2] === 0x2a
    ) {
      return offset;
    }
  }
  return -1;
}

function readWebpDimensions(bytes) {
  if (
    !bytes ||
    bytes.length < 30 ||
    readAscii(bytes, 0, 4) !== 'RIFF' ||
    readAscii(bytes, 8, 4) !== 'WEBP'
  ) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkLength = readUint32LE(bytes, offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(chunkStart + chunkLength, bytes.length);

    if (chunkType === 'VP8X' && chunkStart + 10 <= chunkEnd) {
      return {
        width: readUint24LE(bytes, chunkStart + 4) + 1,
        height: readUint24LE(bytes, chunkStart + 7) + 1,
      };
    }

    if (chunkType === 'VP8 ') {
      const marker = findVp8FrameMarker(bytes, chunkStart, chunkEnd);
      if (marker >= 0) {
        return {
          width: readUint16LE(bytes, marker + 3) & 0x3fff,
          height: readUint16LE(bytes, marker + 5) & 0x3fff,
        };
      }
    }

    if (
      chunkType === 'VP8L' &&
      chunkStart + 5 <= chunkEnd &&
      bytes[chunkStart] === 0x2f
    ) {
      const byte1 = bytes[chunkStart + 1];
      const byte2 = bytes[chunkStart + 2];
      const byte3 = bytes[chunkStart + 3];
      const byte4 = bytes[chunkStart + 4];
      return {
        width: 1 + byte1 + ((byte2 & 0x3f) << 8),
        height:
          1 +
          (byte2 >> 6) +
          (byte3 << 2) +
          ((byte4 & 0x0f) << 10),
      };
    }

    offset = chunkEnd + (chunkLength % 2);
  }

  return null;
}

try {
  const dimensions = readWebpDimensions($response.body);
  const isPersonalAdCategory = url.includes(
    '://banner-files.pupumall.com/ADVERTISING_INTERNAL/'
  );
  const isQxLiveEntry =
    dimensions?.width === 228 && dimensions?.height === 228;
  const isSplash =
    dimensions?.width === 1080 && dimensions?.height === 2240;

  if ((isPersonalAdCategory && !isQxLiveEntry) || isSplash) {
    $done({ status: 404, body: new Uint8Array(0) });
  } else {
    $done({});
  }
} catch (error) {
  console.log(`PuPuSplashImage: ${error}`);
  $done({});
}
