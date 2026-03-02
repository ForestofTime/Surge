/**
 * Qidian Purify Script
 * 修复目标：书架顶部每日导读行、底部猜你喜欢模块
 */

(function () {
  const url = $request?.url || "";
  if (!$response || typeof $response.body !== "string") return $done({});

  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    return $done({});
  }

  if (!body || !body.Data) return $done({});

  // 扩展关键词：增加“猜你喜欢”和“领福利”
  const PURGE_RE = /(每日导读|签到|领福利|福利中心|猜你喜欢)/;

  function deepClean(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        if (JSON.stringify(node[i]).match(PURGE_RE)) {
          node.splice(i, 1);
        } else {
          deepClean(node[i]);
        }
      }
    } else {
      for (const key in node) {
        if (typeof node[key] === "object") deepClean(node[key]);
      }
    }
  }

  try {
    // 1. 处理书架主数据：刷新及获取列表
    if (url.includes("bookshelf/refresh") || url.includes("bookshelf/getBookshelf")) {
      // 彻底移除顶部模块布局（每日导读/福利入口）
      if (Array.isArray(body.Data.TopModules)) {
        body.Data.TopModules = body.Data.TopModules.filter(m => !JSON.stringify(m).match(PURGE_RE));
      }
      // 移除安全区和运营位
      if (body.Data.SafetyArea) body.Data.SafetyArea = null;
      // 深度递归移除“猜你喜欢”等卡片
      deepClean(body.Data);
    }

    // 2. 配置下发：关闭功能开关
    if (url.includes("argus/api/v1/client/getconf")) {
      body.Data.DailyRecommendGray = 0; // 强制关闭每日导读入口 
      body.Data.ActivityPopup = null;   // 活动弹窗 
      if (body.Data.ActivityIcon) body.Data.ActivityIcon = null; // 悬浮图标 
      
      // 移除书架底部冗余按钮 
      if (Array.isArray(body.Data.BookShelfBottomIcons)) {
        body.Data.BookShelfBottomIcons = [];
      }
    }

    // 3. 每日导读数据置空 
    if (url.includes("dailyrecommend/getdailyrecommend")) {
      if (body.Data.Items) body.Data.Items = [];
    }

    // 4. “我的”页面精简 
    if (url.includes("user/getaccountpage")) {
      body.Data.BenefitButtonList = [];
      body.Data.FunctionButtonList = [];
      body.Data.BottomButtonList = [];
      body.Data.Member = null;
    }

    $done({ body: JSON.stringify(body) });
  } catch (e) {
    $done({});
  }
})();