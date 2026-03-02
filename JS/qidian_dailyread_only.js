/**
 * 起点书架顶栏净化脚本
 * 目标：仅移除“每日导读”和“签到/领福利”
 */

(function () {
  const url = $request.url;
  if (!$response || !$response.body) return $done({});

  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    return $done({});
  }

  if (!body || !body.Data) return $done({});

  // 针对性的屏蔽关键字
  const TARGET_KEYWORDS = /(每日导读|签到|领福利|福利中心)/;

  try {
    // 1. 修改配置开关 
    if (url.includes("client/getconf")) {
      // 强制关闭灰度导读入口
      body.Data.DailyRecommendGray = 0; 
    }

    // 2. 清空导读数据内容 
    if (url.includes("dailyrecommend/getdailyrecommend")) {
      if (Array.isArray(body.Data.Items)) {
        body.Data.Items = []; // 抹除推荐书籍数据
      }
      if (body.Data.BgInfo) body.Data.BgInfo = null; // 抹除文案背景
    }

    // 3. 物理剔除书架布局模块
    if (url.includes("bookshelf/refresh") || url.includes("bookshelf/getBookshelf")) {
      // 过滤 TopModules 数组，移除匹配到的 UI 组件
      if (Array.isArray(body.Data.TopModules)) {
        body.Data.TopModules = body.Data.TopModules.filter(module => {
          const moduleStr = JSON.stringify(module);
          return !TARGET_KEYWORDS.test(moduleStr);
        });
      }
      
      // 移除 SafetyArea（通常包含签到或活动悬浮窗）
      if (body.Data.SafetyArea) body.Data.SafetyArea = null;
    }

    $done({ body: JSON.stringify(body) });
  } catch (err) {
    $done({});
  }
})();