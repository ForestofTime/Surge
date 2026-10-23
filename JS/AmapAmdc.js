// 对齐成功 Loon HAR 的 AMDC 空 404；共享调度仅处理高德客户端。
(function () {
  const url=String($request.url||'');
  if(!/^http:\/\/amdc\.m\.taobao\.com\/amdc\/mobileDispatch(?:\?|$)/i.test(url))return $done({});
  const headers=$request.headers||{};
  const ua=Object.keys(headers).filter(k=>k.toLowerCase()==='user-agent').map(k=>headers[k]).join(' ');
  return $done(/AMap/i.test(ua)?{response:{status:404,headers:{'Content-Type':'text/plain'},body:''}}:{});
})();
