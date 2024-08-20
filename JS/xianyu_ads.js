/**
 * 闲鱼去除指定广告图片
 */
const url = $request.url;
if (!$response.body) $done({});

let obj = JSON.parse($response.body);

if (url.includes("/gw/mtop.taobao.idlehome.home.nextfresh")) {
  // 定位到特定广告图片并删除
  if (obj.data?.coverImage?.url && obj.data.coverImage.url.includes("https://gw.alicdn.com/imgextra/i2/O1CN01jXhjL41dthebh5k4e_!!6000000003794-1-tps-1125-264.gif")) {
    delete obj.data.coverImage;
  }
}

$done({body: JSON.stringify(obj)});
