// Grade：把每則測試訊息的結果和預期答案比對。一個測試有好幾則訊息時，每一則都要對才算 PASS
const rows = $input.all().map(i => i.json).filter(j => j.source === 'test');
const sameSet = (a = [], b = []) => a.length === b.length && a.every(x => b.includes(x));

const checked = rows.map(r => {
  const e = r.expect ?? {}, fails = [];
  if (r.action !== e.action) fails.push(`動作：預期 ${e.action}，實際 ${r.action}`);
  if (e.intent && r.intent !== e.intent) fails.push(`意圖：預期 ${e.intent}，實際 ${r.intent}`);
  if (e.missing && !sameSet(e.missing, r.missing)) fails.push(`缺的欄位：預期 [${e.missing}]，實際 [${r.missing}]`);
  if (!sameSet(e.errors ?? [], r.errors ?? [])) fails.push(`錯誤：預期 [${e.errors ?? []}]，實際 [${r.errors}]`);
  for (const [k, v] of Object.entries(e.booking ?? {})) {
    if (r.booking?.[k] !== v) fails.push(`${k}：預期 ${v}，實際 ${r.booking?.[k]}`);
  }
  // 不管訊息怎麼寫，新訂位和改期後的狀態一律要是「待確認」，取消後是「已取消」
  if (['create_booking', 'change_booking'].includes(r.action) && r.booking?.status !== '待確認') fails.push(`狀態不是待確認：${r.booking?.status}`);
  if (r.action === 'cancel_booking' && r.booking?.status !== '已取消') fails.push(`狀態不是已取消：${r.booking?.status}`);
  for (const s of e.reply_has ?? []) if (!String(r.reply).includes(s)) fails.push(`回覆少了「${s}」`);
  for (const s of e.reply_not ?? []) if (String(r.reply).includes(s)) fails.push(`回覆不該出現「${s}」`);
  if (e.reply_any && !e.reply_any.some(s => String(r.reply).includes(s))) fails.push(`回覆裡沒有 ${e.reply_any.join('、')} 其中任何一個`);
  // 答不出來的問題要通知店家；答得出來的不該通知
  if (e.push === true && !r.push) fails.push('應該要通知店家');
  if (e.push === false && r.push) fails.push('不該通知店家');
  return { ...r, fails };
});

const tests = [];
for (const r of checked) {
  let t = tests.find(x => x.id === r.test_id);
  if (!t) tests.push(t = { id: r.test_id, title: r.title, steps: [] });
  t.steps.push(r);
}
const results = tests.map(t => {
  const fails = t.steps.flatMap(s => s.fails.map(f => `第 ${s.step} 則 ${f}`));
  return { json: {
    id: t.id, 測試: t.title, 結果: fails.length ? 'FAIL' : 'PASS',
    失敗原因: fails.join('；') || null,
    訊息: t.steps.map(s => s.text),
    回覆: t.steps.map(s => s.reply),
  } };
});
const pass = results.filter(r => r.json.結果 === 'PASS').length;
const msgPass = checked.filter(r => r.fails.length === 0).length;
return [{ json: { 總結: `${pass} / ${results.length} PASS`, 訊息: `${msgPass} / ${checked.length} 則正確` } }, ...results];
