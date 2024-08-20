/**
 * Ad Removal for Specific URLs (2024-08-20)
 */

const url = $request.url;
if (!$response.body) $done({});

let obj = JSON.parse($response.body);

if (url.includes("/gw/mtop.taobao.idlehome.home.nextfresh")) {
    // Remove the coverImage if it contains specific ad URLs
    if (obj.data?.coverImage?.url?.includes("gw.alicdn.com/imgextra")) {
        delete obj.data.coverImage;
    }
}

$done({body: JSON.stringify(obj)});
