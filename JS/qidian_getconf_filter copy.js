/**
 * Qidian Purify Script
 * 逻辑：抹除 TopModules 布局、强制关闭 DailyRecommendGray 灰度开关 [cite: 1, 7]
 */

(function () {
  const url = $request?.url || "";
  const method = ($request?.method || "GET").toUpperCase();

  if (!$response || typeof $response.body !== "string") return $done({});

  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    return $done({});
  }

  if (!body || !body.Data) return $done({});

  // 匹配关键字正则 
  const SHELF_BLOCK_RE = /(每日导读|签到|领福利|福利中心)/;

  try {
    // 1. 书架数据处理：移除顶部 UI 行 [cite: 10]
    if (url.includes("bookshelf/refresh") || url.includes("bookshelf/getBookshelf")) {
      // 抹除 TopModules 中的广告和运营入口
      if (Array.isArray(body.Data.TopModules)) {
        body.Data.TopModules = body.Data.TopModules.filter(item => {
          const itemStr = JSON.stringify(item);
          return !SHELF_BLOCK_RE.test(itemStr);
        });
      }
      // 抹除安全区（红包/签到悬浮）
      if (body.Data.SafetyArea) body.Data.SafetyArea = null;
    }

    // 2. 配置下发处理：关闭功能开关 
    if (url.includes("argus/api/v1/client/getconf")) {
      body.Data.DailyRecommendGray = 0; // 强制关闭每日导读灰度 [cite: 7]
      body.Data.ActivityPopup = null;   // 活动弹窗 
      
      if (body.Data.ActivityIcon) {
        body.Data.ActivityIcon = null; // 书架右下角悬浮 
      }

      // 移除书架底部指定的找书入口 
      if (Array.isArray(body.Data.BookShelfBottomIcons)) {
        const removeTitles = ["书城找书", "找书"];
        body.Data.BookShelfBottomIcons = body.Data.BookShelfBottomIcons.filter(
          i => !removeTitles.includes(i?.Title)
        );
      }
    }

    // 3. 每日导读内容清理（确保 Items 为空） [cite: 10]
    if (url.includes("dailyrecommend/getdailyrecommend")) {
      if (body.Data && Array.isArray(body.Data.Items)) {
        body.Data.Items = [];
      }
    }

    // 4. “我的”页面精简 
    if (url.includes("argus/api/v3/user/getaccountpage")) {
      body.Data.BenefitButtonList = [];
      body.Data.FunctionButtonList = [];
      body.Data.BottomButtonList = [];
      body.Data.Member = null;
    }

    // 5. 开屏与冷启动优化 
    if (url.includes("client/getsplashscreen")) {
      if (body.Data) {
        body.Data.List = null;
        body.Data.EnableGDT = 0;
      }
    }

    $done({ body: JSON.stringify(body) });
  } catch (e) {
    console.log(`Qidian purify error: ${e}`);
    $done({});
  }
})();