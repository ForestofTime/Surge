// 朴朴开屏广告素材拦截脚本
// 作用：在 http-request 阶段按精确文件 uuid 列表拒绝开屏素材请求（含 OSS query string）
// 触发：模块 [Script] 段中引用
// 2026-07-22 修正：之前按容器 uuid 或格式兜底会误伤首页普通图，改为只拦截已确认的开屏文件。

const url = $request.url;

// 已确认的开屏广告素材文件列表（路径片段，不含域名和查询参数）
// 格式：容器uuid/子目录/文件uuid.扩展名
const splashFiles = new Set([
  "89c0be43a77a4204aceed273bffb5424/b8cf/32cf2c3936e0a1f26956fb3cff0ce7bb.gif",
  "31beb0ed84fc482ab443633b6f4866c2/fd36/5f91765bada58524efaf0432e8bfade3.mp4",
  "12cdc95e7dfb4eaa822914c9e7cb4264/b85d/13617fe8a09c77e41be574c346943e9a.mp4",
  "12cdc95e7dfb4eaa822914c9e7cb4264/6e03/d4d478d83b55bda5525215e14a651944.mp4",
  "c635cc92742040c6b16a85d8e9efbaeb/3f6f/2cd39f29b69945288187f9462f2e82bf.gif",
  "019cc0d94ea573e79e38e471f3d79b83/1ce7/4ee39889093d7a6810380abcff659abf.gif",
  "019cc0d94ea573e79e38e471f3d79b83/04b5/94fd53b8ded7886803ce20ade2213dcf.png"
]);

// 去掉 query string，取 /STORE_PRODUCT/ 之后的路径
let pathOnly = url.split("?")[0];
let key = "";
const marker = "/STORE_PRODUCT/";
const idx = pathOnly.indexOf(marker);
if (idx !== -1) {
  key = pathOnly.substring(idx + marker.length);
}

if (key && splashFiles.has(key)) {
  // 返回 204 No Content，让 app 认为素材为空，从而跳过广告图/视频显示
  $done({
    response: {
      status: 204,
      headers: {
        "Content-Type": "image/gif"
      },
      body: ""
    }
  });
} else {
  $done({});
}
