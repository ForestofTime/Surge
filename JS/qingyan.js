
/**
 * QX
 * rewrite:
 * ^https:\/\/commerce-.*api\.faceu\.mobi\/commerce\/v1\/subscription\/user_info url script-response-body ulike.js
 * hostname:commerce-i18n-api.faceu.mobi,commerce-api.faceu.mobi
 *surge
 *[MITM]
 *hostname:commerce-i18n-api.faceu.mobi,commerce-api.faceu.mobi
 *[Script]
 *轻颜相机VIP= type=http-response,requires-body=1,max-size=0,pattern=^https:\/\/commerce-.*api\.faceu\.mobi\/commerce\/v1\/subscription\/user_info,script-path=https://raw.githubusercontent.com/SuperLingyun/surge/main/JS/qingyan.js

[MITM]
hostname =commerce-i18n-api.faceu.mobi,commerce-api.faceu.mobi

 */
const path1 = "/commerce/v1/subscription/user_info";
const path2 = "/apple/iosAppVerifyReceipt.php";

let obj = JSON.parse($response.body);

if ($request.url.indexOf(path1) != -1){
obj.data.start_time = 1584674770;
obj.data.end_time = 4077660370;
obj.data.is_cancel_subscribe = true;
obj.data.flag = true;
}
if ($request.url.indexOf(path2) != -1){
 obj.data = {
    "isValid": 1,
    "expiresTs": 4077660370
}
}
$done({body: JSON.stringify(obj)});
//轻颜相机
