/**
 * 起点净化脚本 - 终极修正版
 * 处理目标：书架顶栏、底部推荐、我的页面失效问题
 */

(function () {
  const url = $request.url;
  if (!$response || typeof $response.body !== "string") return $done({});

  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    return $done({});
  }

  if (!body || !body.Data) return $done({});

  // 扩展清理关键词
  const BLACKLIST_RE = /(每日导读|签到|福利|猜你喜欢|推荐)/;

  // 深度递归清理函数
  function cleanNode(node) {
    if (!node || typeof node !== "object") return;
    
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        const itemStr = JSON.stringify(node[i]);
        if (BLACKLIST_RE.test(itemStr)) {
          node.splice(i, 1);
        } else {
          cleanNode(node[i]);
        }
      }
    } else {
      for (const key in node) {
        if (typeof node[key] === "object") cleanNode(node[key]);
      }
    }
  }

  try {
    // 1. 修复：书架数据（顶部导读 + 底部猜你喜欢） [cite: 1, 4]
    if (url.indexOf("bookshelf/refresh") !== -1 || url.indexOf("bookshelf/getBookshelf") !== -1) {
      // 抹除顶部布局块 
      if (Array.isArray(body.Data.TopModules)) {
        body.Data.TopModules = body.Data.TopModules.filter(m => !BLACKLIST_RE.test(JSON.stringify(m)));
      }
      // 深度清理包含“猜你喜欢”或其他推荐的数据 
      cleanNode(body.Data);
      // 额外处理安全区
      if (body.Data.SafetyArea) body.Data.SafetyArea = null;
    }

    // 2. 修复：我的页面屏蔽失效问题 
    if (url.indexOf("user/getaccountpage") !== -1) {
      body.Data.BenefitButtonList = []; // 福利中心 
      body.Data.FunctionButtonList = []; // 我发布的 
      body.Data.BottomButtonList = []; // 客服帮助 
      body.Data.Member = null;
      if (body.Data.AccountBalance) body.Data.AccountBalance.Hints = []; [cite: 1]
    }

    // 3. 配置下发：关闭灰度开关 
    if (url.indexOf("client/getconf") !== -1) {
      body.Data.DailyRecommendGray = 0; // 每日导读开关 
      body.Data.ActivityPopup = null; // 弹窗 
      body.Data.ActivityIcon = null; // 悬浮窗 
      body.Data.BookShelfBottomIcons = []; // 书架底部找书入口 
    }

    // 4. 每日导读内容置空 
    if (url.indexOf("dailyrecommend/getdailyrecommend") !== -1) {
      if (body.Data.Items) body.Data.Items = []; [cite: 1]
    }

    $done({ body: JSON.stringify(body) });
  } catch (e) {
    $done({});
  }
})();