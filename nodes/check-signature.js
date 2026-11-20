// Check Signature：確認這個請求真的是 LINE 送來的，不是的話直接丟掉（回傳 0 筆，後面都不會執行）
// LINE 的做法：用 channel secret 對「原始 request body」算 HMAC-SHA256，轉成 base64，放在 X-Line-Signature 標頭
// 前一個節點 Sign Body（n8n 內建的 Crypto 節點）已經對原始 body 算好，放在 expected_signature。
// channel secret 存在 n8n 的 Crypto 憑證裡（加密保存），不會出現在 workflow 檔案中。
// 一定要用原始的 body：先轉成物件再轉回字串，空白或跳脫字元可能不一樣，算出來就會對不上。
const item = $input.first().json;
const signature = String(item.headers?.['x-line-signature'] ?? '');
const expected = String(item.expected_signature ?? '');

// 逐字比對完才回答，比對花的時間不會因為前面幾個字對不對而不同
let diff = expected.length ^ signature.length;
for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i % (signature.length || 1));
if (!expected || diff !== 0) return [];

const out = [];
for (const ev of item.body?.events ?? []) {
  if (ev.mode && ev.mode !== 'active') continue;              // standby：這個帳號目前不負責回覆
  if (ev.source?.type !== 'user') continue;                   // 只處理一對一聊天，不處理群組
  const common = {
    source: 'line', user_id: ev.source.userId, reply_token: ev.replyToken ?? null,
    now_iso: new Date(ev.timestamp).toISOString(), is_test: false,
    // LINE 用 webhookEventId 識別每個事件；重送時同一個事件會再送一次，後面的 Check Event 用它跳過
    event_id: ev.webhookEventId ?? `noid-${ev.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    is_redelivery: ev.deliveryContext?.isRedelivery === true,
  };
  if (ev.type === 'message' && ev.message?.type === 'text') out.push({ json: { ...common, kind: 'text', text: ev.message.text } });
  else if (ev.type === 'message') out.push({ json: { ...common, kind: 'non_text', text: null } });
  else if (ev.type === 'follow') out.push({ json: { ...common, kind: 'follow', text: null } });
}
return out;
