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

// ── v17：开屏图 AVIF 分支 ─────────────────────────────────────────
// 京东客户端升级后开屏图 URL 尾巴从 .jpg/.png 变 .jpg.avif/.png.avif。
// 对 AVIF 请求回 tiny-gif 会被 AVIF 解码器拒绝 → App 回退本地缓存广告图。
// 返回合法 1x1 透明 AVIF（473 字节），解码成功 → 开屏画面空白消失。
var ONE_PIXEL_AVIF_B64 = 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAGGbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAHCAAAAFwACAAAAAQAAAa4AAAAUAAAAQmlpbmYAAAAAAAIAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAABppbmZlAgAAAAACAABhdjAxQWxwaGEAAAAAGmlyZWYAAAAAAAAADmF1eGwAAgABAAEAAADDaXBycAAAAJ1pcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAAA5waXhpAAAAAAEIAAAADGF2MUOBABwAAAAAOGF1eEMAAAAAdXJuOm1wZWc6bXBlZ0I6Y2ljcDpzeXN0ZW1zOmF1eGlsaWFyeTphbHBoYQAAAAAeaXBtYQAAAAAAAAACAAEEAQKDBAACBAEFhgcAAAAzbWRhdBIACgQYAAYVMgoUAAwxAAF1VEgIEgAKBRgABgQgMgwUAAMMMMQAAHlM04Y=';

function handleAvifSplash() {
  var url = String($request.url || '');
  if (!/^https?:\/\/(?:m|m\d{1,2}|img\d{1,2}|storage\d{0,2})\.360buyimg\.com\/mobilecms\/s(?:1125x2436|1170x2532|1242x2688|1284x2778|1290x2796|1320x2868)_jfs\/.*\.avif(?:\?.*)?$/i.test(url)) {
    return false;
  }
  console.log('JingdongSplash v17: AVIF 开屏图命中，返回 1x1 透明 AVIF');
  $done({
    response: {
      status: 200,
      headers: { 'Content-Type': 'image/avif', 'Cache-Control': 'no-store' },
      body: 'data:image/avif;base64,' + ONE_PIXEL_AVIF_B64,
    },
  });
  return true;
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
  if (!handleAvifSplash()) {
    $done(isLaunchMediaRequest() ? { response: { status: 204 } } : {});
  }
} catch (error) {
  console.log(`JingdongSplash: ${error}`);
  $done({});
}
