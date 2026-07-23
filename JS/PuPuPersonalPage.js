/**
 * 朴朴超市个人页请求阶段清理
 *
 * 在请求发出前返回有效成功响应，避免 App 先读取原始响应或沿用旧数据。
 */

const url = $request.url;

function getRequestHeader(name) {
  const headers = $request.headers || {};
  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase()
  );
  return key ? headers[key] : '';
}

function respond(data) {
  $done({
    response: {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        errcode: 0,
        errmsg: '',
        data,
      }),
    },
  });
}

if (
  url.includes('/member_card/index/my') ||
  url.includes('/member_card/premium/user_center')
) {
  respond({});
} else if (url.includes('/order_status_preview/person_page/')) {
  respond([]);
} else if (url.includes('/comments/v3/user/unfinished/count')) {
  respond(0);
} else if (url.includes('/notification/message_center/unread_number')) {
  respond([]);
} else if (url.includes('/marketing/advertisement/v1')) {
  const currentPage =
    getRequestHeader('pp_current_page_name') ||
    getRequestHeader('pp-page-name');

  if (currentPage === 'personal_page') {
    respond([]);
  } else {
    $done({});
  }
} else {
  $done({});
}
