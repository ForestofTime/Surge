// 参考 ddgksf2013 与 fmz200 的响应结构；共享业务不整包拒绝。
(function () {
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const target=/^https:\/\/(?:mobile|mobilehera|mobwsa)\.ximalaya\.com\/(discovery-feed\/v\d+\/mix|focus-mobile\/focusPic|discovery-category\/v\d+\/category|discovery-category\/customCategories|mobile-user\/v\d+\/homePage)(?:\/[^?]*)?(?:\?|$)/;
  try {
    const m=String($request.url||'').match(target);
    if(!m||typeof $response.body!=='string')return $done({});
    const root=JSON.parse($response.body);
    if(!object(root))return $done({});
    const before=JSON.stringify(root);
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
