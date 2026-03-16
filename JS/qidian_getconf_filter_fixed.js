/**
 * 起点净化脚本 - iOS Surge 修复版
 * 修复：每日导读在 iOS Surge 中无法正确屏蔽的问题
 * 目标：书架顶栏、猜你喜欢、我的页面全面屏蔽
 */

(function () {
  'use strict';
  
  const url = $request.url;
  
  // 安全获取响应体
  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    console.log("[Qidian] JSON parse error: " + e.message);
    return $done({});
  }

  if (!body || !body.Data) {
    console.log("[Qidian] No Data field in response");
    return $done({});
  }

  // 屏蔽关键词定义 - 扩展匹配范围
  const BLACKLIST_KEYWORDS = [
    "每日导读", "签到", "福利", "猜你喜欢", "推荐", "发现你喜欢",
    "导读", "每日推荐", "为你推荐", "精选推荐", "热门推荐"
  ];
  
  const BLACKLIST_RE = new RegExp(BLACKLIST_KEYWORDS.join('|'));

  // 辅助函数：检查对象是否包含黑名单关键词
  const containsBlacklisted = (obj) => {
    if (!obj) return false;
    const str = JSON.stringify(obj);
    return BLACKLIST_RE.test(str);
  };

  // 辅助函数：深度清理对象
  const deepClean = (obj, parentKey = '') => {
    if (Array.isArray(obj)) {
      for (let i = obj.length - 1; i >= 0; i--) {
        if (containsBlacklisted(obj[i])) {
          console.log("[Qidian] Removed array item at index " + i);
          obj.splice(i, 1);
        } else {
          deepClean(obj[i], parentKey);
        }
      }
    } else if (obj && typeof obj === 'object') {
      for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
          // 检查键名是否包含黑名单词
          if (BLACKLIST_RE.test(key)) {
            console.log("[Qidian] Removed blacklisted key: " + key);
            delete obj[key];
          } else if (containsBlacklisted(obj[key])) {
            console.log("[Qidian] Removed blacklisted value at key: " + key);
            delete obj[key];
          } else {
            deepClean(obj[key], key);
          }
        }
      }
    }
  };

  try {
    // ========== 1. 每日导读修复（iOS 关键修复）==========
    if (url.includes("dailyrecommend/getdailyrecommend") || 
        url.includes("dailyrecommend") ||
        url.includes("recommend")) {
      console.log("[Qidian] Processing dailyrecommend");
      
      // 完全清空 Items
      if (body.Data.Items) {
        console.log("[Qidian] Clearing Items (" + body.Data.Items.length + " items)");
        body.Data.Items = [];
      }
      
      // 移除背景文案
      if (body.Data.BgInfo) {
        console.log("[Qidian] Removing BgInfo");
        body.Data.BgInfo = null;
      }
      
      // 移除其他可能的数据字段
      if (body.Data.List) body.Data.List = [];
      if (body.Data.Books) body.Data.Books = [];
      if (body.Data.RecommendList) body.Data.RecommendList = [];
      
      // 添加隐藏标记
      body.Data.IsHidden = 1;
      body.Data.Visible = false;
    }

    // ========== 2. 书架布局清理 ==========
    if (url.includes("bookshelf/refresh") || 
        url.includes("bookshelf/getBookshelf") ||
        url.includes("bookshelf")) {
      console.log("[Qidian] Processing bookshelf");
      
      // 清理 TopModules
      if (Array.isArray(body.Data.TopModules)) {
        const originalLength = body.Data.TopModules.length;
        body.Data.TopModules = body.Data.TopModules.filter(m => {
          const shouldKeep = !containsBlacklisted(m);
          if (!shouldKeep) {
            console.log("[Qidian] Removed TopModule: " + (m.Name || m.Title || "unnamed"));
          }
          return shouldKeep;
        });
        console.log("[Qidian] TopModules: " + originalLength + " -> " + body.Data.TopModules.length);
      }
      
      // 清理 SafetyArea
      if (body.Data.SafetyArea) {
        console.log("[Qidian] Removing SafetyArea");
        body.Data.SafetyArea = null;
      }
      
      // 深度递归清理
      deepClean(body.Data);
    }

    // ========== 3. 我的页面清理 ==========
    if (url.includes("user/getaccountpage") || 
        url.includes("getaccountpage")) {
      console.log("[Qidian] Processing account page");
      
      if (body.Data.BenefitButtonList) {
        console.log("[Qidian] Clearing BenefitButtonList");
        body.Data.BenefitButtonList = [];
      }
      if (body.Data.FunctionButtonList) {
        console.log("[Qidian] Clearing FunctionButtonList");
        body.Data.FunctionButtonList = [];
      }
      if (body.Data.BottomButtonList) {
        console.log("[Qidian] Clearing BottomButtonList");
        body.Data.BottomButtonList = [];
      }
      if (body.Data.Member) {
        console.log("[Qidian] Removing Member");
        body.Data.Member = null;
      }
      if (body.Data.AccountBalance && body.Data.AccountBalance.Hints) {
        body.Data.AccountBalance.Hints = [];
      }
    }

    // ========== 4. 配置下发清理 ==========
    if (url.includes("client/getconf") || 
        url.includes("getconf")) {
      console.log("[Qidian] Processing getconf");
      
      // 灰度导读开关 - 关键修复
      body.Data.DailyRecommendGray = 0;
      body.Data.EnableDailyRecommend = 0;
      body.Data.ShowDailyRecommend = 0;
      
      // 活动弹窗
      if (body.Data.ActivityPopup) {
        body.Data.ActivityPopup = null;
      }
      
      // 书架悬浮图标
      if (body.Data.ActivityIcon) {
        body.Data.ActivityIcon = null;
      }
      
      // 底部找书入口
      if (body.Data.BookShelfBottomIcons) {
        body.Data.BookShelfBottomIcons = [];
      }
      
      // 其他推荐相关配置
      if (body.Data.RecommendConfig) {
        body.Data.RecommendConfig = null;
      }
    }

    // ========== 5. 开屏清理 ==========
    if (url.includes("client/getsplashscreen") || 
        url.includes("splashscreen")) {
      console.log("[Qidian] Processing splashscreen");
      
      if (body.Data) {
        if (body.Data.List) body.Data.List = null;
        if (body.Data.Items) body.Data.Items = [];
        body.Data.EnableGDT = 0;
        body.Data.EnableSplash = 0;
      }
    }

    // ========== 6. 悬浮广告清理 ==========
    if (url.includes("bookshelf/getHoverAdv") || 
        url.includes("getHoverAdv")) {
      console.log("[Qidian] Processing hover adv");
      body.Data = null;
    }

    // ========== 7. Tab 广告清理 ==========
    if (url.includes("adv/getadvlistbatch") || 
        url.includes("getadvlistbatch")) {
      console.log("[Qidian] Processing adv list");
      if (body.Data) {
        for (let key in body.Data) {
          if (Array.isArray(body.Data[key])) {
            body.Data[key] = [];
          }
        }
      }
    }

    // ========== 8. Toolbar 清理 ==========
    if (url.includes("assembly/toolbar") || 
        url.includes("toolbar")) {
      console.log("[Qidian] Processing toolbar");
      if (body.Data && Array.isArray(body.Data.Items)) {
        body.Data.Items = body.Data.Items.filter(item => !containsBlacklisted(item));
      }
    }

    console.log("[Qidian] Processing completed");
    $done({ body: JSON.stringify(body) });
  } catch (e) {
    console.log("[Qidian] Error: " + e.message);
    $done({});
  }
})();
