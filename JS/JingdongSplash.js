/**
 * 京东 App 开屏视频请求跳过
 *
 * 仅处理 HAR 已确认的主页面启动播放器请求：
 *   vod.300hu.com 数字业务路径 MP4 + 京东视频 UA + 已确认的启动播放器 Referer。
 * 不按创意 URL、文件名或素材 ID 判断，普通商品视频和直播请求透传。
 */

const LAUNCH_PLAYER_REFERERS = [
  /^play:ijkplayerSH_JDMainPageViewController_999_161_130000-/i,
  /^play:avplayerSH_JDMainPageViewController_61_/i,
];
const JD_VIDEO_USER_AGENT =
  /^(?:ffmpeg\/[^;]+|CFNetwork(?:\/[^;]+)?);jdmall;(?:iphone|ipad);/i;

function requestHeader(name) {
  const headers = $request.headers || {};
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((header) => header.toLowerCase() === target);
  return key ? String(headers[key]) : '';
}

function isLaunchVideoRequest() {
  try {
    const referer = requestHeader('Referer');
    return (
      /^https?:\/\/vod\.300hu\.com\/\d+\/.*\.mp4(?:\?.*)?$/i.test(String($request.url || '')) &&
      JD_VIDEO_USER_AGENT.test(requestHeader('User-Agent')) &&
      LAUNCH_PLAYER_REFERERS.some((pattern) => pattern.test(referer))
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
