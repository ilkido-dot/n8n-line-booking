// Check Answer：AI 照店家資料寫的回答，程式檢查過才用；檢查不過就改回固定的話，並通知店家
const d = $('Decide').first().json;
const raw = String($input.first().json.text ?? '');
const FALLBACK = '這個問題小幫手答不出來，已經轉給店家，店家會再回覆您。';
const PROMISE = /免費|招待|打折|折扣|優惠|贈送|送您|送你|保證|保留/;

function parse(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { const o = JSON.parse(m[0]); return o && typeof o === 'object' ? o : null; } catch { return null; }
}
const a = parse(raw);
const data = String(d.qa_data ?? '');
const prices = new Set((d.qa_prices ?? []).map(Number));
const problems = [];
let answer = '';
if (!a) problems.push('AI 回傳的不是 JSON');
else {
  answer = String(a.answer ?? '').trim();
  if (a.found !== true) problems.push('資料裡沒有答案');
  else if (!answer) problems.push('沒有回答內容');
  if (answer.length > 200) problems.push('回答太長');
  // AI 說它提到的菜名、表演者，都要在資料裡
  for (const x of a.dishes ?? []) if (!(d.qa_menu ?? []).includes(x)) problems.push(`菜名不在菜單上：${x}`);
  for (const x of a.performers ?? []) if (!(d.qa_performers ?? []).includes(x)) problems.push(`表演者不在節目表上：${x}`);
  // 列出來的菜名、表演者，回答裡要照原樣寫出來（例如菜單是「招牌烤雞」，回答只寫「烤雞」就不算）
  for (const x of [...(a.dishes ?? []), ...(a.performers ?? [])]) if (!answer.includes(x)) problems.push(`回答裡沒有照原樣寫出：${x}`);
  // 回答裡的金額（NT$ 後面或「元」前面的數字），都要在資料裡出現過
  for (const m of answer.matchAll(/NT\$\s?([\d,]+)|([\d,]+)\s?元/g)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ''));
    if (!prices.has(n)) problems.push(`金額不在資料裡：${n}`);
  }
  // 優惠、招待這類承諾，資料裡沒寫就不能出現
  const p = answer.match(PROMISE);
  if (p && !data.includes(p[0])) problems.push(`資料沒寫的承諾：${p[0]}`);
}
const ok = problems.length === 0;
const reply = [d.reply_prefix, ok ? answer : FALLBACK].filter(Boolean).join('\n\n') + (d.reply_suffix ?? '');
const toStore = ok ? null : `客人的問題小幫手答不出來：\n「${d.text}」`;
const push = [d.push, toStore].filter(Boolean).join('\n\n') || null;
return [{ json: { ...d, reply, push, answer_ok: ok, answer_problems: problems, answer_raw: raw } }];
