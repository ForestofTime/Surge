/**
 * 起点净化脚本 - 2026.03.02 修复版
 * 目标：书架顶栏、猜你喜欢、我的页面全面屏蔽
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

  // 屏蔽关键词定义
  const BLACKLIST_RE = /(每日导读|签到|福利|猜你喜欢|推荐|发现你喜欢)/;

  try {
    // 1. 彻底解决“每日导读”与“猜你喜欢”数据 
    if (url.includes("dailyrecommend/getdailyrecommend")) {
      if (body.Data.Items) body.Data.Items = []; // 清空书籍推荐列表 
      if (body.Data.BgInfo) body.Data.BgInfo = null; // 移除背景文案
    }

    // 2. 书架布局清理 (针对 TopModules 和 SafetyArea)
    if (url.includes("bookshelf/refresh") || url.includes("bookshelf/getBookshelf")) {
      if (Array.isArray(body.Data.TopModules)) {
        body.Data.TopModules = body.Data.TopModules.filter(m => !BLACKLIST_RE.test(JSON.stringify(m)));
      }
      if (body.Data.SafetyArea) body.Data.SafetyArea = null;
      // 深度递归移除所有带推荐属性的节点
      const deepClean = (obj) => {
        if (Array.isArray(obj)) {
          for (let i = obj.length - 1; i >= 0; i--) {
            if (BLACKLIST_RE.test(JSON.stringify(obj[i]))) obj.splice(i, 1);
            else deepClean(obj[i]);
          }
        } else if (obj && typeof obj === 'object') {
          for (let key in obj) deepClean(obj[key]);
        }
      };
      deepClean(body.Data);
    }

    // 3. 修复“我的”页面屏蔽
    if (url.includes("user/getaccountpage")) {
      body.Data.BenefitButtonList = [];  // 福利中心
      body.Data.FunctionButtonList = []; // 我发布的
      body.Data.BottomButtonList = [];   // 帮助与客服
      body.Data.Member = null;           // 会员入口
      if (body.Data.AccountBalance) body.Data.AccountBalance.Hints = [];
    }

    // 4. 配置下发
    if (url.includes("client/getconf")) {
      body.Data.DailyRecommendGray = 0;  // 灰度导读开关
      body.Data.ActivityPopup = null;    // 活动弹窗
      body.Data.ActivityIcon = null;     // 书架悬浮图标
      body.Data.BookShelfBottomIcons = []; // 底部找书
    }

    // 5. 开屏清理
    if (url.includes("client/getsplashscreen")) {
      if (body.Data) {
        body.Data.List = null;
        body.Data.EnableGDT = 0;
      }
    }

    $done({ body: JSON.stringify(body) });
  } catch (e) {
    $done({});
  }
})();