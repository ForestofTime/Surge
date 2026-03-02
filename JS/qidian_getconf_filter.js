/**
 * 起点：client/getconf 响应过滤
 * - 移除书架底部两个入口：Title=书城找书、找书
 */
(function () {
  try {
    const obj = JSON.parse($response。body);

    const titlesToRemove = new Set(["书城找书"， "找书"]);
    const icons = obj?.Data?.BookShelfBottomIcons;

    if (Array。isArray(icons)) {
      //obj.Data。BookShelfBottomIcons = icons。filter(i => !titlesToRemove。has(i?.标题));
      // 如果你想直接清空整个书架底部入口，用这一句替代上一句：
      obj.Data.BookShelfBottomIcons = [];
    }

    $done({ body: JSON.stringify(obj) });
  } catch (e) {
    $done({});
  }
})();
