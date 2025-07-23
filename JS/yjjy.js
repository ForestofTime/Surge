try {
  let obj = JSON.parse($response.body);

  // 清除开屏广告
  if (obj.start?.list) {
    obj.start.list = [];
  }

  // 清除弹窗广告
  if (obj.dialog?.list) {
    obj.dialog.list = [];
  }

  // 清除首页轮播图广告（center 区域）
  if (obj.center?.list) {
    obj.center.list = [];
  }

  // 清除新闻栏广告
  if (obj.news?.list) {
    obj.news.list = obj.news.list.filter(item => {
      return !/油惠|绑卡|广告/.test(item.caption || "");
    });
  }

  // 清除销售推荐（sales）广告
  if (obj.sales?.list) {
    obj.sales.list = [];
  }

  // 清除充值页广告
  if (obj.chargePage?.list) {
    obj.chargePage.list = [];
  }

  // 可选：检测和移除带某类关键字的图片字段
  const imageFilter = url => {
    return !/b37ebce745\.jpg/.test(url);
  };

  // 通用过滤器：移除指定字段中包含特定图片的内容
  const cleanImageList = list => {
    return list.filter(item => imageFilter(item.url || ""));
  };

  // 应用于所有相关字段
  ['start', 'dialog', 'center', 'sales', 'chargePage'].forEach(section => {
    if (obj[section]?.list) {
      obj[section].list = cleanImageList(obj[section].list);
    }
  });

  $done({ body: JSON.stringify(obj) });
} catch (e) {
  console.log("中石化广告清理异常: " + e);
  $done({});
}
