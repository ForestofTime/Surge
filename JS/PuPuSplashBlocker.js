// 朴朴开屏广告素材拦截脚本
// 作用：在 http-request 阶段直接拒绝本轮"夏日疆至"开屏广告素材请求（gif/png/mp4/webp，含 OSS query string）
// 触发：模块 [Script] 段中引用
// 2026-07-22 修正：开屏素材会轮换 png/webp 格式，故扩展格式并锁定容器 uuid 019cc0d94ea573e79e38e471f3d79b83

const url = $request.url;

// 本轮开屏广告素材容器（2026-07-22 多次抓包确认）：仅此 uuid 用于开屏广告，不会误伤普通商品图
const blocked = /^https:\/\/product-files\.pupumall\.com\/STORE_PRODUCT\/019cc0d94ea573e79e38e471f3d79b83\/.*\.(gif|mp4|png|webp)(\?.*)?$/i.test(url);

if (blocked) {
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
