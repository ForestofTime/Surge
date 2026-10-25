// 参考 ddgksf2013 与 fmz200 的响应结构；共享业务不整包拒绝。
(function () {
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const target=/^https:\/\/(?:mobile|mobilehera|mobwsa)\.ximalaya\.com\/(discovery-feed\/v\d+\/mix|focus-mobile\/focusPic|discovery-category\/v\d+\/category|discovery-category\/customCategories|mobile-user\/v\d+\/homePage)(?:\/[^?]*)?(?:\?|$)/;
  try {
    const url=String($request.url||'');
    const m=url.match(target);
    const splash=/^https:\/\/adse(?:\.wsa)?\.ximalaya\.com\/ting\/(?:loading|preload|screen)(?:\/ts-\d+)?(?:\?|$)/.test(url);
    if((!m&&!splash)||typeof $response.body!=='string')return $done({});
    const root=JSON.parse($response.body);
    if(!object(root))return $done({});
    const before=JSON.stringify(root);
    // 开屏专用配置返回成功空列表；金币 /incentive/ 与奖励 /adx/ 不进入此分支。
    if(splash) {
      if(root.ret!==0||!Array.isArray(root.data))return $done({});
      for(const key of ['data','adIds','adTypes','landingPageResDatas','dataForVirtualAd'])if(Array.isArray(root[key]))root[key]=[];
      if(object(root.bidSlotList))root.bidSlotList={};
      if(typeof root.totalPageCount==='number')root.totalPageCount=0;
      const body=JSON.stringify(root);
      return $done(body===before?{}:{body});
    }
    const ad=v=>object(v)&&(v.isAd===true||v.isAd===1||object(v.item)&&((object(v.item.adInfo)&&Object.keys(v.item.adInfo).length>0)||v.item.moduleType==='mix_ad'));
    const clean=(parent,key)=>{if(object(parent)&&Array.isArray(parent[key]))parent[key]=parent[key].filter(v=>!ad(v));};
    const focus=v=>{if(object(v)&&Array.isArray(v.data))v.data=v.data.filter(i=>!object(i)||(i.isAd!==true&&i.isAd!==1));};
    if(m[1].startsWith('discovery-feed/')) {
      clean(root,'body');
      // 新版 heData 保留未知类型；只移除明确的广告标记。
      clean(root,'heData');
    } else if(m[1]==='focus-mobile/focusPic') {
      if(Array.isArray(root.header))for(const h of root.header)if(object(h)&&object(h.item)&&Array.isArray(h.item.list))for(const block of h.item.list)focus(block);
    } else if(m[1].startsWith('discovery-category/v'))focus(root.focusImages);
    else if(m[1]==='discovery-category/customCategories') {
      for(const key of ['customCategoryList','defaultTabList'])if(Array.isArray(root[key]))root[key]=root[key].filter(c=>!object(c)||c.categoryId!==1005);
    } else if(object(root.data))delete root.data.freeListenV2;
    const body=JSON.stringify(root);
    return $done(body===before?{}:{body});
  } catch (_) {return $done({});}
})();
