/***********************************

> 应用名称：高德地图APP净化
> 软件版本：12.2.10
> 脚本作者：ddgksf2013
> 微信账号：墨鱼手记
> 更新时间：2023-01-04
> 脚本版本：V1.0.6
> 脚本功能：处理开屏、首页下方推广、我的页面推广、搜索框热词、搜索框下方热榜、首页顶部推广、首页左上角gif
> 通知频道：https://t.me/ddgksf2021
> 贡献投稿：https://t.me/ddgksf2013_bot
> 问题反馈：ddgksf2013@163.com
> 特别提醒：如需转载请注明出处，谢谢合作！
> 特别说明：⚠️⚠️⚠️
          本脚本仅供学习交流使用，禁止转载、售卖
          ⚠️⚠️⚠️

使用步骤：

1、QuantumultX本地添加分流
host, amdc.m.taobao.com, reject

2、卸载高德地图APP并重新安装（如果已安装）

3、在QuantumultX处于运行环境下打开高德地图并登陆

4、如果QuantumultX未运行就打开高德地图会致使脚本不生效需卸载重新安装（后续解决）

[rewrite_local]

# ～ 高德地图☆净化（2023-01-04）@ddgksf2013
^https?:\/\/m5\.amap\.com\/ws\/faas\/amap-navigation\/main-page url script-response-body https://github.com/ddgksf2013/Scripts/raw/master/amap.js
^https?:\/\/m5\.amap\.com\/ws\/asa\/ads_attribution url reject
^https?:\/\/m5\.amap\.com\/ws\/valueadded\/alimama\/splash_screen url script-response-body https://github.com/ddgksf2013/Scripts/raw/master/amap.js
^https?:\/\/sns\.amap\.com\/ws\/msgbox\/pull url script-response-body https://github.com/ddgksf2013/Scripts/raw/master/amap.js
^https?:\/\/m5\.amap\.com\/ws\/shield\/dsp\/profile\/index\/nodefaas url script-response-body https://github.com/ddgksf2013/Scripts/raw/master/amap.js
^https?:\/\/m5\.amap\.com\/ws\/shield\/search\/new_hotword url script-response-body https://github.com/ddgksf2013/Scripts/raw/master/amap.js
^https?:\/\/m5\.amap\.com\/ws\/shield\/scene\/recommend url reject-dict
^https?:\/\/optimus-ads\.amap\.com\/uploadimg\/\w+\.gif url reject-img

[mitm] 

hostname=optimus-ads.amap.com, m5.amap.com, sns.amap.com

***********************************/






const version = 'V1.0.24';


var obj=JSON.parse($response.body);if(-1!=$request.url.indexOf("valueadded/alimama/splash_screen")){if(obj.data&&obj.data.ad)for(let a of obj.data.ad)a.set.setting.display_time=0,a.creative[0].start_time=2240150400,a.creative[0].end_time=2240150400;$done({body:JSON.stringify(obj)})}else if(-1!=$request.url.indexOf("faas/amap-navigation/main-page"))obj.data?.cardList&&(obj.data.cardList=Object.values(obj.data.cardList).filter(a=>"LoginCard"==a.dataType)),obj.data?.pull3?.msgs&&(obj.data.pull3.msgs=[]),obj.data?.mapBizList&&(obj.data.mapBizList=[]),$done({body:JSON.stringify(obj)});else if(-1!=$request.url.indexOf("profile/index/node"))delete obj.data.tipData,obj.data?.cardList&&(obj.data.cardList=Object.values(obj.data.cardList).filter(a=>"MyOrderCard"==a.dataType||"GdRecommendCard"==a.dataType)),$done({body:JSON.stringify(obj)});else if(-1!=$request.url.indexOf("new_hotword"))obj.data?.header_hotword&&(obj.data.header_hotword=[]),$done({body:JSON.stringify(obj)});else if(-1!=$request.url.indexOf("ws/promotion-web/resource")){let o=["icon","banner","tips","popup","bubble"];for(let e of o)obj.data?.[e]&&(obj.data[e]=[]);$done({body:JSON.stringify(obj)})}else if(-1!=$request.url.indexOf("ws/msgbox/pull"))obj.msgs&&(obj.msgs=[]),obj.pull3?.msgs&&(obj.pull3.msgs=[]),$done({body:JSON.stringify(obj)});else if(-1!=$request.url.indexOf("ws/shield/frogserver/aocs"))obj.data?.operation_layer&&(obj.data.operation_layer={status:1,version:"",value:""}),obj.data?.home_business_position_config&&(obj.data.home_business_position_config={status:1,version:"",value:""}),$done({body:JSON.stringify(obj)});else if(-1!=$request.url.indexOf("search/nearbyrec_smart")){let t=["coupon","scene","activity","commodity_rec"];obj.data&&(t.forEach(a=>{delete obj.data[a]}),obj.data.modules&&(obj.data.modules=obj.data.modules.filter(a=>!t.includes(a)))),$done({body:JSON.stringify(obj)})}else $done({});
