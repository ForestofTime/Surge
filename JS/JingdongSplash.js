/**
 * 京东 App 开屏视频请求跳过
 *
 * 仅处理 HAR 已确认的主页面启动播放器请求：
 *   vod.300hu.com + 1030 MP4 + 京东 ffmpeg UA + 固定启动播放器 Referer 前缀。
 * 不按创意 URL、文件名或素材 ID 判断，普通商品视频和直播请求透传。
 */

const LAUNCH_PLAYER_REFERER = /^play:ijkplayerSH_JDMainPageViewController_999_161_130000-/i;

function requestHeader(name) {
  const headers = $request.headers || {};
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((header) => header.toLowerCase() === target);
  return key ? String(headers[key]) : '';
}

function isLaunchVideoRequest() {
  try {
    return (
      /^https?:\/\/vod\.300hu\.com\/1030\/.*\.mp4(?:\?.*)?$/i.test(String($request.url || '')) &&
      /\bffmpeg\/[^;]+;jdmall;(?:iphone|ipad);/i.test(requestHeader('User-Agent')) &&
      LAUNCH_PLAYER_REFERER.test(requestHeader('Referer'))
    );
  } catch (_) {
    return false;
  }
}

try {
  $done(isLaunchVideoRequest() ? { response: { status: 204 } } : {});
} catch (error) {
  console.log(`JingdongSplash: ${error}`);
  $done({});
}
