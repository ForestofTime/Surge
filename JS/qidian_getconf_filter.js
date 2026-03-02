/**
 * Qidian merged script (Surge)
 * Merge:
 * - ForestofTime qidian.js: toolbar / getaccountpage cleanup
 * - app2smile a2qidian.js: splashscreen / deeplink / iOS_tab / dailyrecommend / hover adv / getconf
 * - extra: getconf remove BookShelfBottomIcons Title "书城找书" & "找书"
 *
 * Author: ForestofTime + app2smile + merged-by-copilot
 */

(function () {
  const url = $request?.url || "";
  const method = ($request?.method || "GET").toUpperCase();

  if (!$response || typeof $response.body !== "string") {
    console.log(`Qidian: empty response body: ${url}`);
    return $done({});
  }

  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    console.log(`Qidian: JSON parse error: ${url}`);
    return $done({});
  }

  // 有些接口可能没有 Data，避免脚本直接崩
  if (!body || typeof body !== "object") return $done({});
  if (!body.Data || typeof body.Data !== "object") body.Data = body.Data || {};

  const isGET = method === "GET";
  const isPOST = method === "POST";

  try {
    // ========== ForestofTime: “我的”页面 ==========
    if (url.includes("argus/api/v3/user/getaccountpage") && isGET) {
      // 精简“我的”页面
      body.Data.BenefitButtonList = [];     // 福利中心
      body.Data.FunctionButtonList = [];    // 我发布的
      body.Data.BottomButtonList = [];      // 帮助与客服
      if (body.Data.AccountBalance && typeof body.Data.AccountBalance === "object") {
        body.Data.AccountBalance.Hints = [];
      }
      body.Data.Member = null;
      return $done({ body: JSON.stringify(body) });
    }

    // ========== ForestofTime: toolbar 活动入口 ==========
    if (url.includes("argus/api/v1/assembly/toolbar") && isGET) {
      if (body.Data.Toolbar && typeof body.Data.Toolbar === "object") {
        body.Data.Toolbar.Adv = {};
      }
      return $done({ body: JSON.stringify(body) });
    }

    // ========== app2smile: 开屏 ==========
    if (url.includes("argus/api/v4/client/getsplashscreen") && isGET) {
      if (body.Data && "List" in body.Data) body.Data.List = null;
      if ("EnableGDT" in body.Data && body.Data.EnableGDT === 1) body.Data.EnableGDT = 0;
      return $done({ body: JSON.stringify(body) });
    }

    // ========== app2smile: 冷启动 deeplink 不跳转精选 ==========
    if (url.includes("argus/api/v2/deeplink/geturl") && isGET) {
      if (body.Data && body.Data.ActionUrl) body.Data.ActionUrl = "";
      return $done({ body: JSON.stringify(body) });
    }

    // ========== app2smile: iOS_tab 广告位 ==========
    if (url.includes("argus/api/v1/adv/getadvlistbatch?positions=iOS_tab") && isGET) {
      if (body.Data && Array.isArray(body.Data.iOS_tab)) body.Data.iOS_tab = [];
      return $done({ body: JSON.stringify(body) });
    }

    // ========== app2smile: 每日导读 ==========
    if (url.includes("argus/api/v2/dailyrecommend/getdailyrecommend") && isGET) {
      if (body.Data && Array.isArray(body.Data.Items)) body.Data.Items = [];
      return $done({ body: JSON.stringify(body) });
    }

    // ========== app2smile: 书架悬浮广告 ==========
    if (url.includes("argus/api/v1/bookshelf/getHoverAdv") && isGET) {
      if (body.Data && Array.isArray(body.Data.ItemList)) body.Data.ItemList = [];
      return $done({ body: JSON.stringify(body) });
    }

    // ========== client/getconf（配置下发）==========
    // 你给的 response.dump 是该接口响应体；这里集中处理：
    // - 去活动弹窗 ActivityPopup
    // - WolfEye=0, TeenShowFreq=0
    // - ActivityIcon 清空
    // - EnableSearchUser=1（保留 app2smile 的增强）
    // - 移除书架底部入口 BookShelfBottomIcons 中 Title 为 "书城找书"/"找书"
    if (url.includes("argus/api/v1/client/getconf")) {
      // app2smile 脚本里限定 POST；但 GET/POST 可能随版本变化
      // 所以这里不强制 method，避免漏处理。
      if (body.Data) {
        // 活动弹窗
        if (body.Data.ActivityPopup) body.Data.ActivityPopup = null;

        // WolfEye
        if (body.Data.WolfEye === 1) body.Data.WolfEye = 0;

        // 青少年弹框频率
        if (body.Data.CloudSetting && typeof body.Data.CloudSetting === "object") {
          if (body.Data.CloudSetting.TeenShowFreq === "1") body.Data.CloudSetting.TeenShowFreq = "0";
          if (body.Data.CloudSetting.TeenShowFreq === 1) body.Data.CloudSetting.TeenShowFreq = 0;
        }

        // 书架右下角悬浮活动 icon：尽量清空为无活动
        if (body.Data.ActivityIcon && typeof body.Data.ActivityIcon === "object") {
          body.Data.ActivityIcon.StartTime = 0;
          body.Data.ActivityIcon.EndTime = 0;
          // 兼容不同字段名
          delete body.Data.ActivityIcon.Actionurl;
          delete body.Data.ActivityIcon.ActionUrl;
          delete body.Data.ActivityIcon.Icon;
        }

        // 搜索可搜用户（功能增强）
        if (body.Data.EnableSearchUser !== "1") body.Data.EnableSearchUser = "1";

        // 书架底部两个入口：书城找书/找书
        if (Array.isArray(body.Data.BookShelfBottomIcons)) {
          const titlesToRemove = new Set(["书城找书", "找书"]);
          body.Data.BookShelfBottomIcons = body.Data.BookShelfBottomIcons.filter(
            (i) => !titlesToRemove.has(i?.Title)
          );
        }
      }

      return $done({ body: JSON.stringify(body) });
    }

    // 其它不处理
    return $done({});
  } catch (e) {
    console.log(`Qidian: script runtime error: ${url} => ${e}`);
    return $done({});
  }
})();
