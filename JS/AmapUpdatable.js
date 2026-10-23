/*
 * Amap updatable response adapter.
 * Source: ifflagged/Romeo@5c03e81d7d06c3c5877a4b3d4d4e0fad316765c4,
 * Modules/JavaScript/Kelee/Amap_remove_ads/kelee_updatable.jq.
 * Ported field-for-field; malformed/missing embedded configs fail open.
 */
(function () {
  "use strict";
  const target = /^https:\/\/m5\.amap\.com\/ws\/shield\/frogserver\/aocs\/updatable\/1(?:\?|$)/i;
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const removals = [
  [
    "adStatementConfig"
  ],
  [
    "adCustomerRetainArchitecture"
  ],
  [
    "adImEntryConfig"
  ],
  [
    "adVenueConfig"
  ],
  [
    "adPerfSwitch"
  ],
  [
    "EndNaviC3AdCard"
  ],
  [
    "infoCpcReport"
  ],
  [
    "hotsaleConfig"
  ],
  [
    "marketing_resource_config"
  ],
  [
    "coupon_risk_asac"
  ],
  [
    "commonCouponSceneLog"
  ],
  [
    "sug_coupon_opt"
  ],
  [
    "giftEntryConfig"
  ],
  [
    "splashscreen"
  ],
  [
    "SplashScreenControl"
  ],
  [
    "splashview_config"
  ],
  [
    "feedback_banner"
  ],
  [
    "TrainOrderBanner"
  ],
  [
    "nearby_business_popup"
  ],
  [
    "shortcut_popup_frequency"
  ],
  [
    "tel_retention_popup"
  ],
  [
    "hotel_activity"
  ],
  [
    "taxi_activity"
  ],
  [
    "hotel_privilege"
  ],
  [
    "sportsActivityConfig"
  ],
  [
    "activity_qingke_contry_control"
  ],
  [
    "920bestwishes"
  ],
  [
    "custom_consultdata",
    "widget_guide"
  ],
  [
    "free_ride"
  ],
  [
    "homepage_resource_config"
  ],
  [
    "home_message_guide"
  ],
  [
    "hotel_tipsicon"
  ],
  [
    "sur_bar"
  ],
  [
    "nearby_map_entry_guide"
  ],
  [
    "comment_info"
  ],
  [
    "small_biz_index"
  ],
  [
    "small_biz_fun"
  ],
  [
    "setpagesearch"
  ],
  [
    "wallet"
  ]
];
  const embeddedRemovals = {
  "amap_basemap_config": [
    "splash",
    "ai_splash",
    "ipSquare_window_video_config",
    "usercenter_lottery_switch",
    "coins_lottery",
    "coins_wish",
    "newYearLotteryTips",
    "mileage_coin_scene",
    "licheng_coin_mine_entry",
    "member_grabbing",
    "vip_checkout_welfare_dialog_config",
    "task_poi_card_coupon_switch",
    "jay_act",
    "pointExchangeCenter",
    "pointExchangeGoCommentUrl",
    "batchCheckIn",
    "batchCheckIn_new",
    "fireworks",
    "fireworkFeatureCodes",
    "setFireworksNightMode",
    "fireworks_click_change_night",
    "2024greetingTofireworks",
    "greeting_widget_switch",
    "newYearSystemScreenRecordListenSwitch",
    "ugcActivityH5",
    "study_create_url",
    "asset_space_pilot",
    "ipSquare_goods_tab_desc",
    "vip_member_config",
    "recently_activity",
    "business_position",
    "carLogos",
    "voiceLogos",
    "increase_product_name_account",
    "invite_poi_share_pic",
    "block_increase_product_detail_share_button",
    "mainIcon",
    "mainBubble",
    "blueBar",
    "presetWord",
    "homepage_tabguide",
    "suit_set_popup",
    "pop_selection",
    "ipsqure_free_pop_hours",
    "desk_card_footprint_check_in",
    "desk_card_searchtool",
    "arLayerDialogConfig",
    "geochoBackConfirmDialogConfig",
    "followGuidePopupConfig",
    "growth_bubble_guide_config",
    "bottom_login_guide_config",
    "frequent_location_login_guide_config",
    "login_guide_show_rules",
    "show_landmark_exploration_card",
    "reachFrequency",
    "reachTaskFrequency",
    "msgbox_show_popwindow",
    "aiqs_pull_up_guide",
    "new_aiqs_pull_up_guide",
    "full_screen_guide_video_config",
    "ai_guideo_video_map",
    "feature_guide_switch",
    "geoechoGuideLottieConfig",
    "level_page_slide",
    "level_page_tips",
    "garage_top_button",
    "ThemeSquareSwiperCanJumpUrlList"
  ],
  "navi_cloud": [
    "long_trip_service_coupon",
    "long_trip_service_coupon_enter",
    "long_trip_service_coupon_links",
    "QQMusicVipText",
    "QQMusicMembershipVoice",
    "ETCGuide",
    "etc_banner",
    "music_config",
    "music_sdk_recommend_title",
    "music_ai_guide_fatigue",
    "music_ai_next_login_rate",
    "music_source",
    "DownloadQQplayerSDK",
    "voicePlayground",
    "route_search_Starbucks",
    "Starbucksfinish",
    "H5guidelottie",
    "route_search_guide_lottie",
    "via_result_bottomtext",
    "planHomeGuideConfig",
    "energy_add_plate_list",
    "operation_consumer_bubble",
    "bubble_priority",
    "desk_card_commute",
    "consumeAfterPopup_days",
    "Rescue_popup_service",
    "smart_drive_tips",
    "city_drive_tips",
    "BackCar",
    "customized_navigation",
    "TabRecommend",
    "newTabRecommendSwitch",
    "ExtremelyRecommendCount",
    "tab_recommend_filter",
    "tab_recommend_switch_third_schema",
    "dropby_scroll",
    "gas_path_bubble",
    "carowner",
    "operation_chat_add_group",
    "noInternetCardSwitch"
  ],
  "taxi": [
    "denghuo_ad",
    "banner_picture_url",
    "carpool_city",
    "carpool_intercity",
    "intercity_index_page_header",
    "skin_show",
    "hq_112background",
    "chauffeurBannerSort",
    "hitch_other_tab",
    "hitch_other_tab_v2",
    "dache_toolbox_promo",
    "dache_toolbox_marketing",
    "dache_toolbox_remote",
    "dache_toolbox_carpool",
    "dache_toolbox_chauffeur",
    "PaymentOneClickLayerInfo",
    "s_reward_center_config",
    "taxi_personal_virtual_gold_url",
    "student_url",
    "student_icon",
    "student_title",
    "student_describe",
    "chauffeurTabKingToolConfig_left",
    "chauffeurTabBubbleText",
    "discount_bubble",
    "coupon_traction_bubble_v3",
    "intercity_entrance_tag",
    "long-dis_preferential",
    "taxi_shortcut_manager",
    "vip_88_guide_fatigue",
    "vip-h5",
    "taxi_commercialization",
    "isUseChauffeurNewMarketingSlot",
    "operation_module_render_new",
    "retainPopupDiscount",
    "taxi_coupon_entry_new",
    "thailandCouponRedirectAimap",
    "isChauffeurUseNewCouponCenter",
    "chauffeurComboCouponSwitch",
    "couponNewStyleV730",
    "is_favorable_show",
    "taxi_personal_virtual_gold",
    "taxi_personal_virtual_gold_title",
    "student_entry",
    "unionvip_white_list",
    "premium_customer_card_config",
    "chauffeurTabKingToolConfig_alternative",
    "chauffeurTabKingToolConfig_right",
    "chauffeur_fatigue_config",
    "hitch_101_popup_polling",
    "ChauffeurViaPoisConfig",
    "driveDiversionCardHitchTab",
    "pinzhi_daoliu",
    "CancelRetentionTec",
    "intercity_atmosphere_config",
    "carpool_waiting_config"
  ]
};
  let output = {};
  try {
    if (!target.test($request.url) || typeof $response.body !== "string") {
      $done(output);
      return;
    }
    const root = JSON.parse($response.body);
    if (!object(root) || !object(root.data)) {
      $done(output);
      return;
    }
    const data = root.data;
    const before = JSON.stringify(root);
    const strip = (value, keys) => { for (const key of keys) delete value[key]; };
    for (const path of removals) {
      let parent = data;
      for (const key of path.slice(0, -1)) parent = object(parent) ? parent[key] : null;
      if (object(parent)) delete parent[path[path.length - 1]];
    }
    // Do not create a config absent from the server response, and preserve its string encoding.
    function edit(name, transform) {
      const entry = data[name];
      if (!own(data, name) || !object(entry) || typeof entry.value !== "string") return;
      try {
        const inner = JSON.parse(entry.value);
        if (!object(inner)) return;
        const previous = JSON.stringify(inner);
        transform(inner);
        if (JSON.stringify(inner) !== previous) entry.value = JSON.stringify(inner);
      } catch (_) { /* Preserve this config verbatim; continue independent configs. */ }
    }
    for (const name of ["sportsGroupConfig", "sportsRouteConfig"]) edit(name, v => strip(v, ["group_banner"]));
    // 17.02 完整配置启用了重构页面，旧社区布局接口不再请求。
    // 保留配置版本及其它实验字段，仅关闭已观测的两项布局开关。
    edit("redesign_user", v => { if (v.redesign_user === 1) v.redesign_user = 0; });
    edit("redesign_ab", v => { if (v.redesign_new === 1) v.redesign_new = 0; });
    edit("his_input_tip", v => {
      strip(v, ["channel_zhitiao"]);
      v.his_recommend_bangdan = 0;
      if (!own(v, "nearby_hotword") || v.nearby_hotword === null) v.nearby_hotword = {};
      if (object(v.nearby_hotword)) v.nearby_hotword.search_detail = 0;
    });
    edit("navi_end", v => strip(v, ["operator_btns"]));
    edit("engine_render", v => strip(v, ["can_show_advert", "advert_note_num"]));
    edit("detail_config", v => {
      strip(v, ["shelf_coupon_refresh"]);
      v.isGoodsShelfPerfV2 = 0;
      v.NearbySearchOptimization = 0;
      for (const key of ["poiDetailScreenCacheConfig", "poiDetailScreenCacheOtherConfig"]) {
        if (!own(v, key) || v[key] === null) v[key] = {};
        if (object(v[key])) v[key].secondScreenAnchorModule = "";
      }
    });
    for (const name of Object.keys(embeddedRemovals)) edit(name, v => {
      strip(v, embeddedRemovals[name]);
      if (name === "navi_cloud") {
        v.end_auto_foot_explore = 0;
        v.ExtremelyRecommendCount = 0;
      }
      if (name === "taxi") {
        v.recommend_point_optimization = 0;
        v.recommend_point_service_overview = 0;
        v.end_point_optimization = 0;
        v.hitch_way_point_nav_default = 0;
      }
    });
    edit("poi_folder_modules", v => {
      const allowed = ["enhanceIMQuestions", "platformCustomerCommonModule", "platformCustomerComplianceInfo", "evaluateVO"];
      for (const key of ["folder_modules", "newFolderModules"])
        if (Array.isArray(v[key])) v[key] = v[key].filter(item => allowed.includes(item));
    });
    edit("favorites_info", v => { v.nearby_picture_on = 0; v.nearby_picture_distance = 0; });
    edit("container_isolation", v => { v.nearby_feed_poi_card_v2_multi_img = 0; });
    edit("nore_rec", v => { v.recommend = 0; });
    edit("engine_eyrie", v => strip(v, ["poi_area_bubble"]));
    edit("WIA", v => strip(v, ["orgGuideVideoConfig"]));
    const after = JSON.stringify(root);
    if (after !== before) output = {body: after};
  } catch (_) { /* Invalid body or unexpected shape: fail open. */ }
  $done(output);
})();

