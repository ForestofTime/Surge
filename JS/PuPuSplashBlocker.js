// 朴朴开屏广告素材拦截脚本
// 作用：在 http-request 阶段直接拒绝 product-files/marketing-files 下的 gif/mp4 素材请求（含 OSS query string）
// 触发：模块 [Script] 段中引用

const url = $request.url;

// 匹配开屏/推广素材：大体积 gif/mp4，常见于 STORE_PRODUCT 目录，也可能出现在营销目录
const blocked =
  /^https:\/\/product-files\.pupumall\.com\/STORE_PRODUCT\/.*\.(gif|mp4)(\?.*)?$/i.test(url) ||
  /^https:\/\/marketing-files\.pupumall\.com\/.*\.(gif|mp4)(\?.*)?$/i.test(url);

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
