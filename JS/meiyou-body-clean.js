// Shared script: trim specific fields for MeiYou responses
function cleanVIP(body){
  const json = JSON.parse(body);
  if(json && json.data){
    json.data = {};
  }
  return JSON.stringify(json);
}

function cleanUserCircle(body){
  const json = JSON.parse(body);
  if(json?.data?.circle){
    delete json.data.circle;
  }
  return JSON.stringify(json);
}

function cleanFeedsRecommend(body){
  const json = JSON.parse(body);
  if(json?.data?.activity_card){
    delete json.data.activity_card;
  }
  return JSON.stringify(json);
}

try {
  const url = $request.url;
  let body = $response.body || '';
  if(/sub\.seeyouyima\.com\/v\d\/sub\/my_vip/.test(url)){
    body = cleanVIP(body);
  }else if(/users\.seeyouyima\.com\/v\d\/wo/.test(url)){
    body = cleanUserCircle(body);
  }else if(/circle\.xmseeyouyima\.com\/v\d\/feeds_recommend/.test(url)){
    body = cleanFeedsRecommend(body);
  }
  $done({body});
}catch(e){
  $done({});
}
