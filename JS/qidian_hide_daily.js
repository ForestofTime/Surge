// Surge script: hide Qidian daily guide/check-in cards even when cached
// Last modified: 2026-03-24 09:45 CST
// Targets responses from getconf/bookshelf/ checkin/dailyrecommend

function wipe(obj) {
  const keys = ['Checkin', 'CheckIn', 'Daily', 'DailyRecommend', 'checkin', 'daily'];
  let touched = false;

  function recurse(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      for (let i = o.length - 1; i >= 0; i--) {
        const v = o[i];
        if (v && typeof v === 'object') {
          // if item has name/title indicating daily/checkin, drop it
          const text = JSON.stringify(v);
          if (/每日|导读|签到|checkin|daily|welfare|福利/i.test(text)) {
            o.splice(i, 1);
            touched = true;
            continue;
          }
          recurse(v);
        }
      }
      return;
    }
    // zero known fields
    for (const k of Object.keys(o)) {
      const val = o[k];
      if (/daily|checkin|welfare|签到|导读/i.test(k)) {
        delete o[k];
        touched = true;
        continue;
      }
      recurse(val);
    }
  }

  recurse(obj);
  // also set explicit flags
  if (obj.Data) {
    obj.Data.IsHidden = 1;
    obj.Data.HasCheckIn = 1;
    obj.Data.BtnType = 0;
    obj.Data.BtnTypeV2 = 0;
    touched = true;
  }
  return touched;
}

try {
  const body = $response.body || '';
  const json = JSON.parse(body);
  const changed = wipe(json);
  if (changed) {
    $done({ status: 200, body: JSON.stringify(json) });
  } else {
    $done({});
  }
} catch (e) {
  $done({});
}
