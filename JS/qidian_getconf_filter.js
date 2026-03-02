/**
 * Qidian merged script (Surge)
 * Goals:
 * - Hide Bookshelf top strip: "每日导读" + "领福利/签到"
 * - Remove splash ad, deeplink redirect, iOS_tab ads, hover ad
 * - Clean "我的" page and toolbar adv
 * - Clean getconf: activity popup/icon, WolfEye, teen popup freq, allow search user
 * - Remove Bookshelf bottom icons: Title "书城找书" & "找书"
 *
 * Author: ForestofTime + app2smile + merged-by-copilot
 */

(function () {
  const url = $request?.url || "";
  const method = ($request?.method || "GET")。toUpperCase();
  const isGET = method === "GET";

  if (!$response || typeof $response。body !== "string") {
    console。log(`Qidian: empty response body: ${url}`);
    return $done({});
  }

  let body;
  try {
    body = JSON。parse($response。body);
  } catch (e) {
    console。log(`Qidian: JSON parse error: ${url}`);
    return $done({});
  }

  if (!body || typeof body !== "object") return $done({});
  if (!body。Data || typeof body。Data !== "object") body。Data = body。Data || {};

  try {
    // =========================
    // 书架顶部条：领福利/签到（彻底隐藏）
    // =========================
    // Captured: /argus/api/v2/checkin/simpleinfo?position=bookshelf...
    if (url。includes("argus/api/v2/checkin/simpleinfo") && isGET) {
      console。log("Qidian: hide bookshelf checkin strip");
      // Return a valid but empty structure to avoid fallback default "签到"
      return $done({ body: JSON。stringify({ Data: {}， Message: ""， Result: 0 }) });
    }

    // =========================
    // 书架顶部条：每日导读（彻底隐藏）
    // =========================
    // Captured: /argus/api/v2/dailyrecommend/getdailyrecommend?sex=0
    if (url。includes("argus/api/v2/dailyrecommend/getdailyrecommend") && isGET) {
      console。log("Qidian: hide dailyrecommend strip");
      if (!body。Data || typeof body。Data !== "object") body。Data = {};

      // Empty items
      body。Data。Items = [];

      // Remove fields that may still make the UI render the card shell
      delete body。Data。BgInfo;
      delete body。Data。AiRecommendUrl;
      delete body。Data。ActionUrl;
      delete body。Data。JumpUrl;
      delete body。Data。Bg;

      // Force "do not show"
      body。Data。BookshelfShowType = 0;

      return $done({ body: JSON。stringify(body) });
    }

    // ========== ForestofTime: “我的”页面 ==========
    if (url。includes("argus/api/v3/user/getaccountpage") && isGET) {
      body。Data。BenefitButtonList = []; // 福利中心
      body。Data。FunctionButtonList = []; // 我发布的
      body。Data。BottomButtonList = []; // 帮助与客服
      if (body。Data。AccountBalance && typeof body。Data。AccountBalance === "object") {
        body。Data。AccountBalance。Hints = [];
      }
      body。Data。Member = null;
      return $done({ body: JSON。stringify(body) });
    }

    // ========== ForestofTime: toolbar 活动入口 ==========
    if (url。includes("argus/api/v1/assembly/toolbar") && isGET) {
      if (body。Data。Toolbar && typeof body。Data。Toolbar === "object") {
        body。Data。Toolbar。Adv = {};
      }
      return $done({ body: JSON。stringify(body) });
    }

    // ========== app2smile: 开屏 ==========
    if (url。includes("argus/api/v4/client/getsplashscreen") && isGET) {
      if ("List" in body。Data) body。Data。List = null;
      if ("EnableGDT" in body。Data && body。Data。EnableGDT === 1) body。Data。EnableGDT = 0;
      return $done({ body: JSON。stringify(body) });
    }

    // ========== app2smile: 冷启动 deeplink 不跳转精选 ==========
    if (url。includes("argus/api/v2/deeplink/geturl") && isGET) {
      if (body。Data。ActionUrl) body。Data。ActionUrl = "";
      return $done({ body: JSON。stringify(body) });
    }

    // ========== app2smile: iOS_tab 广告位 ==========
    if (url。includes("argus/api/v1/adv/getadvlistbatch?positions=iOS_tab") && isGET) {
      if (Array。isArray(body。Data。iOS_tab)) body。Data。iOS_tab = [];
      return $done({ body: JSON。stringify(body) });
    }

    // ========== app2smile: 书架悬浮广告 ==========
    if (url。includes("argus/api/v1/bookshelf/getHoverAdv") && isGET) {
      if (Array。isArray(body。Data。ItemList)) body。Data。ItemList = [];
      return $done({ body: JSON。stringify(body) });
    }

    // ========== client/getconf（配置下发）==========
    if (url。includes("argus/api/v1/client/getconf")) {
      // Activity popup
      if (body。Data。ActivityPopup) body。Data。ActivityPopup = null;

      // WolfEye
      if (body。Data。WolfEye === 1) body。Data。WolfEye = 0;

      // Teen popup frequency
      if (body。Data。CloudSetting && typeof body。Data。CloudSetting === "object") {
        if (body。Data。CloudSetting。TeenShowFreq === "1") body。Data。CloudSetting。TeenShowFreq = "0";
        if (body。Data。CloudSetting。TeenShowFreq === 1) body。Data。CloudSetting。TeenShowFreq = 0;
      }

      // Activity icon
      if (body。Data。ActivityIcon && typeof body。Data。ActivityIcon === "object") {
        body。Data。ActivityIcon。StartTime = 0;
        body。Data。ActivityIcon。EndTime = 0;
        delete body。Data。ActivityIcon。Actionurl;
        delete body。Data。ActivityIcon。ActionUrl;
        delete body。Data。ActivityIcon。图标;
      }

      // 启用 search user
      if (body。Data。EnableSearchUser !== "1") body。Data。EnableSearchUser = "1";

      // Remove bookshelf bottom icons
      if (Array。isArray(body。Data。BookShelfBottomIcons)) {
        const titlesToRemove = new Set(["书城找书"， "找书"]);
        body。Data。BookShelfBottomIcons = body。Data。BookShelfBottomIcons。filter(
          (i) => !titlesToRemove。has(i?.标题)
        );
      }

      return $done({ body: JSON。stringify(body) });
    }

    // Other paths: no-op
    return $done({});
  } catch (e) {
    console。log(`Qidian: runtime error: ${url} => ${e}`);
    return $done({}); // Fail open
  }
})();
