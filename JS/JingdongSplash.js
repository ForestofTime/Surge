/**
 * 京东 App 开屏媒体请求跳过
 *
 * 仅处理 HAR 已确认的主页面启动播放器请求：
 *   vod.300hu.com 数字业务路径 MP4，或 discover.300hu.com 的 M3U8/TS；
 *   同时要求京东视频 UA + 主页面启动播放器 Referer。
 * 不依赖 Referer 后缀中会轮换的场景数字。
 * 不按创意 URL、文件名或素材 ID 判断，普通商品视频和直播请求透传。
 */

const LAUNCH_PLAYER_REFERER =
  /^play:(?:ijkplayer|avplayer)SH_JDMainPageViewController_/i;
const JD_VIDEO_USER_AGENT =
  /^(?:ffmpeg\/[^;]+|CFNetwork(?:\/[^;]+)?);jdmall;(?:iphone|ipad);/i;

function requestHeader(name) {
  const headers = $request.headers || {};
  const target = name.toLowerCase();
  const key = Object.keys(headers).find((header) => header.toLowerCase() === target);
  return key ? String(headers[key]) : '';
}

function isLaunchMediaRequest() {
  try {
    const url = String($request.url || '');
    const referer = requestHeader('Referer');
    return (
      (
        /^https?:\/\/vod\.300hu\.com\/\d+\/.*\.mp4(?:\?.*)?$/i.test(url) ||
        /^https?:\/\/discover\.300hu\.com\/.*\.(?:m3u8|ts)(?:\?.*)?$/i.test(url)
      ) &&
      JD_VIDEO_USER_AGENT.test(requestHeader('User-Agent')) &&
      LAUNCH_PLAYER_REFERER.test(referer)
    );
  } catch (_) {
    return false;
  }
}

try {
  $done(isLaunchMediaRequest() ? { response: { status: 204 } } : {});
} catch (error) {
  console.log(`JingdongSplash: ${error}`);
  $done({});
}
