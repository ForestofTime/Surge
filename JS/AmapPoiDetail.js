/* 高德地点详情：按原 JQ 白名单保留资料、导航、评价及预订模块。 */
(function () {
  "use strict";
  try {
    if (!/^https:\/\/info\.amap\.com\/ws\/shield\/search\/poi\/detail(?:\?|$)/i.test($request.url)) return $done({});
    const body = JSON.parse($response.body);
    const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
    if (!object(body) || !object(body.data)) return $done({});
    const keep = new Set([
      "baseInfo", "poiDetailCommonConfig", "navbarMore", "backToTop", "poiDetailBottomBar", "poiMapModule", "anchor", "reSortContentAndSimilar", "comprehensiveEditEntrance", "functionZone", "poiTipBar", "floatTelButton", "footer_tel_button", "footer_retain_button",
      "attractGalleryInfo", "combineReviews", "evaluateVO", "reviews", "inviteReview", "seriousPublicExperience", "societyPublicExperience", "poiDetailRankUpCard", "travelGuideAndQa", "poiDetailAQModule", "AIStreetTips", "expertNote", "recommend_food", "shopNews", "mallNews", "shopBaseCase",
      "wikiInfo", "wikiInfoBelow", "poiDetailNote", "poiDetailWikiAndLOI",
      "human_traffic", "floorGuideGbf", "houseEvaluationInfo", "residentialOwnersVO", "realtorRealStep", "houseOfficeInfo", "houseOfficeService", "houseOfficeBrandIntroduction", "houseOfficeNotice", "newHouseDetailInfo", "house_apart_info", "scenic_mustplay", "hotelGraphicDetail", "homestayGraphicDetail", "hotelFacilities", "hotelMustRead", "shoppingMallEvent",
      "enhanceIMQuestions", "enhanceCustomerServicePoiModule", "aiAgentFooterBar", "imBottomGuide", "enhanceCustomerServiceFixedBottom", "shopBasePerson", "shopServiceBffvo", "service_process", "shopCourseList", "poiDetailJobList", "jobRec", "shop_vip_card", "shopStdActivity", "privateSphereChannel", "kaShopService", "ka_not_enter", "company1688Info", "thirdparty_info", "expressEntryCard", "poi_intercept", "aiAgentEntry", "commonAiAgent", "poiCardAiAgentEntryV2",
      "storeDirections", "shopFindWayGuide",
      "shopQualifications", "businessQualifications", "legal_document", "home_legal_document", "rec_legal_document", "business_scope", "governmentInformation", "official_account", "merchantSettlement", "shop_settlement",
      "scenic_ticket", "movieBookingShelf", "hotelRooms", "ktvBookingShelf", "venueBookingShelfModule", "reserveShelf", "DinnerBottomBar", "poiDetailAppointmentRegister"
    ]);
    const at = keys => keys.reduce((value, key) => object(value) ? value[key] : undefined, body);
    const refs = values => values.filter(value => typeof value !== "string" || keep.has(value));
    const data = body.data;
    const comment = at(["data", "modules", "combineReviews", "data", "write_comment"]);
    if (object(comment)) {
      delete comment.btnRightTag;
      delete comment.title;
    }
    if (object(data.regions)) {
      for (const key of Object.keys(data.regions)) {
        if (Array.isArray(data.regions[key])) data.regions[key] = refs(data.regions[key]);
      }
    }
    if (object(data.modules)) {
      for (const key of Object.keys(data.modules)) if (!keep.has(key)) delete data.modules[key];
    }
    if (object(data.meta) && Array.isArray(data.meta.half_hidden_modules)) data.meta.half_hidden_modules = refs(data.meta.half_hidden_modules);
    const user = at(["data", "modules", "baseInfo", "data", "user"]);
    if (object(user)) {
      delete user.userLocRgeo;
      delete user.homeInfo;
      delete user.companyInfo;
    }
    const anchor = at(["data", "modules", "anchor", "data"]);
    if (object(anchor) && Array.isArray(anchor.items)) {
      anchor.items = anchor.items.filter(item => object(item) && Array.isArray(item.anchor) && item.anchor.some(value => typeof value === "string" && keep.has(value)));
    }
    const panel = at(["data", "modules", "poiDetailCommonConfig", "data", "swipeUpPanelConfig"]);
    if (object(panel) && Array.isArray(panel.swipeUpPanelTextList)) {
      panel.swipeUpPanelTextList = panel.swipeUpPanelTextList.filter(item => !object(item) || !Array.isArray(item.modulesMap) || item.modulesMap.some(value => typeof value === "string" && keep.has(value)));
    }
    const changed = JSON.stringify(body);
    return $done(changed === JSON.stringify(JSON.parse($response.body)) ? {} : { body: changed });
  } catch (_) {
    return $done({});
  }
})();
