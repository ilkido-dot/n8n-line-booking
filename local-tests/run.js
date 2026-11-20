// 在 n8n 外面測 Code 節點的程式：node local-tests/run.js
// 模擬 n8n 的 $input 和 $('節點')，AI 的輸出用「讀對了」的假資料代替，所以這裡測的是程式本身，不是 AI。
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const load = f => fs.readFileSync(path.join(ROOT, 'nodes', f), 'utf8');

async function runNode(file, inputJsons, nodes = {}) {
  const items = inputJsons.map(j => ({ json: j }));
  const $input = { all: () => items, first: () => items[0] ?? { json: {} } };
  const $ = name => {
    const v = nodes[name];
    const list = Array.isArray(v) ? (v.length ? v : [{}]) : [v];
    return { first: () => ({ json: list[0] }), all: () => list.map(json => ({ json })) };
  };
  return (await new AsyncFunction('$input', '$', load(file)).call({ helpers: {} }, $input, $)).map(i => i.json);
}
let pass = 0, fail = 0;
const check = (ok, name, detail = '') => { ok ? pass++ : fail++; if (!ok) console.log('FAIL', name, detail); };

// 示範店的資料，和 n8n 的資料表一樣每列有 id
const STORE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-data', 'store-data.json'), 'utf8'));
const withIds = rows => rows.map((r, i) => ({ id: i + 1, ...r }));
const STORE_NODES = { 'Get Store Info': withIds(STORE.store_info), 'Get Menu': withIds(STORE.menu), 'Get Performances': withIds(STORE.performances) };

// AI 讀對時應該回傳的 JSON（沒列的欄位是 null）
const N = o => JSON.stringify(Object.assign({ intent: 'booking', has_question: false, date_kind: 'none', date_offset: null, week: null,
  weekday: null, year: null, month: null, day: null, hour: null, minute: null, period: null, people: null, name: null, phone: null,
  room_type: null }, o));
const SMALL = N({ room_type: 'small' });   // 客人回「小包廂」
const MOCK = {
  'T01-1': N({ date_kind: 'absolute', month: 11, day: 8, hour: 7, minute: 0, period: 'evening', people: 6, name: '王小明', phone: '0912345678' }),
  'T01-2': SMALL,
  'T02-1': N({ date_kind: 'absolute', month: 11, day: 8, hour: 7, minute: 0, period: 'evening', name: '王小明', phone: '0912345678' }),
  'T02-2': N({ people: 6 }),
  'T02-3': SMALL,
  'T03-1': N({ hour: 7, minute: 0, period: 'evening', people: 6, name: '王小明', phone: '0912345678' }),
  'T04-1': N({ date_kind: 'offset', date_offset: 1, hour: 12, minute: 0, period: 'noon', people: 4, name: '陳小姐', phone: '0922333444' }),
  'T04-2': N({ room_type: 'large' }),
  'T05-1': N({ date_kind: 'weekday', week: 'this', weekday: 6, hour: 6, minute: 30, period: 'evening', people: 8, name: '林先生', phone: '0933444555' }),
  'T05-2': SMALL,
  'T06-1': N({ date_kind: 'absolute', month: 11, day: 10, hour: 7, minute: 0, period: 'evening', people: 12, name: '張大華', phone: '0955666777' }),
  'T07-1': N({ date_kind: 'weekday', week: 'this', weekday: 5, hour: 7, minute: 0, period: 'evening', people: 5 }),
  'T07-2': N({ name: '王小明', phone: '0912345678' }),
  'T07-3': SMALL,
  'T08-1': N({ intent: 'question', has_question: true, topics: ['room'] }),
  'T09-1': '```json\n' + N({ date_kind: 'absolute', month: 11, day: 9, hour: 7, minute: 0, period: 'evening', people: 6, name: '王小明', phone: '0912345678' }) + '\n```',
  'T09-2': SMALL,
  'T10-1': N({ date_kind: 'absolute', month: 11, day: 1, hour: 7, minute: 0, period: 'evening', people: 6, name: '王小明', phone: '0912345678' }),
  'T11-1': N({ date_kind: 'absolute', month: 11, day: 8, hour: 7, minute: 0, period: 'evening', people: 30, name: '王小明', phone: '0912345678' }),
  'T12-1': N({ date_kind: 'absolute', month: 11, day: 8, hour: 7, minute: 0, period: 'evening', people: 6, name: '王小明', phone: '12345' }),
  'T13-1': N({ date_kind: 'absolute', month: 11, day: 8, hour: 8, minute: 0, period: 'morning', people: 6, name: '王小明', phone: '0912345678' }),
  'T14-1': N({ date_kind: 'offset', date_offset: 1, period: 'evening' }),
  'T14-2': N({ hour: 7, minute: 0, people: 4 }),
  'T14-3': N({ name: '陳小姐', phone: '0922-333-444' }),
  'T14-4': SMALL,
  'T15-1': N({ date_kind: 'offset', date_offset: 0, hour: 12, minute: 0, period: 'noon', people: 4, name: '王小明', phone: '0912345678' }),
  'T16-1': N({ has_question: true, topics: ['room'], date_kind: 'weekday', week: 'next', weekday: 6, hour: 7, minute: 0, period: 'evening', people: 6, name: '王小明', phone: '0912345678' }),
  'T16-2': SMALL,
  'T17-1': N({ intent: 'cancel', date_kind: 'offset', date_offset: 1 }),
  'T18-1': N({ date_kind: 'absolute', month: 11, day: 20, hour: 6, minute: 0, period: 'evening', people: 3, name: '陳先生', phone: '0922000111' }),
  'T18-2': SMALL,
  'T18-3': N({ date_kind: 'absolute', month: 11, day: 20, hour: 6, minute: 0, period: 'evening', people: 3, name: '陳先生', phone: '0922000111' }),
  'T19-1': N({ date_kind: 'absolute', month: 11, day: 12, hour: 7, minute: 0, period: 'evening', people: 4, name: '林小姐', phone: '0911222333' }),
  'T19-2': N({ hour: 9, minute: 0, period: 'evening' }),
  'T19-3': SMALL,
  'T20-1': N({ date_kind: 'absolute', month: 11, day: 21, hour: 12, minute: 0, period: 'noon', people: 2, name: '李小姐', phone: '0933000222' }),
  'T20-2': SMALL,
  'T20-3': N({ intent: 'cancel' }),
  'T20-4': N({ intent: 'confirm' }),
  'T21-1': N({ date_kind: 'absolute', month: 11, day: 22, hour: 6, minute: 0, period: 'evening', people: 4, name: '吳先生', phone: '0944000333' }),
  'T21-2': SMALL,
  'T21-3': N({ intent: 'change', date_kind: 'absolute', month: 11, day: 23, hour: 7, minute: 0, period: 'evening' }),
  'T21-4': N({ intent: 'confirm' }),
  'T22-1': N({ date_kind: 'absolute', month: 11, day: 24, hour: 7, minute: 0, period: 'evening', people: 2, name: '鄭小姐', phone: '0955000444' }),
  'T22-2': SMALL,
  'T22-3': N({ intent: 'cancel' }),
  'T22-4': N({ intent: 'deny' }),
  'T23-1': N({ date_kind: 'absolute', month: 11, day: 25, hour: 12, minute: 0, period: 'noon', people: 2, name: '何先生', phone: '0966000555' }),
  'T23-2': SMALL,
  'T23-3': N({ date_kind: 'absolute', month: 11, day: 26, hour: 12, minute: 0, period: 'noon', people: 2, name: '何先生', phone: '0966000555' }),
  'T23-4': SMALL,
  'T23-5': N({ intent: 'cancel' }),
  'T23-6': N({ intent: 'other', pick: 2 }),
  'T23-7': N({ intent: 'confirm' }),
  'T24-1': N({ date_kind: 'absolute', month: 11, day: 27, hour: 6, minute: 0, period: 'evening', people: 2, name: '許小姐', phone: '0977000666' }),
  'T24-3': SMALL,
  'T25-1': N({ intent: 'question', has_question: true, topics: ['hours'] }),
  'T26-1': N({ intent: 'question', has_question: true, topics: ['performance'], date_kind: 'offset', date_offset: 0 }),
  'T27-1': N({ intent: 'question', has_question: true, topics: ['performance'], date_kind: 'weekday', week: 'this', weekday: 6 }),
  'T28-1': N({ intent: 'question', has_question: true, topics: ['performance'], date_kind: 'weekday', week: 'next', weekday: 1 }),
  'T29-1': N({ intent: 'question', has_question: true, topics: ['menu'] }),
  'T30-1': N({ intent: 'question', has_question: true, topics: ['menu'] }),
  'T31-1': N({ intent: 'question', has_question: true, topics: ['other'] }),
  'T32-1': N({ intent: 'question', has_question: true, topics: ['menu'] }),
  'T33-1': N({ intent: 'question', has_question: true, topics: ['menu'] }),
  'T34-1': N({ intent: 'question', has_question: true, topics: ['room'] }),
  'T35-1': N({ intent: 'question', has_question: true, topics: ['menu'] }),
  'T36-1': N({ date_kind: 'absolute', month: 11, day: 28, hour: 6, minute: 0, period: 'evening', people: 3, name: '沈小姐', phone: '0911000777', room_type: 'large' }),
  'T37-1': N({ date_kind: 'absolute', month: 11, day: 13, hour: 7, minute: 0, period: 'evening', people: 4, name: '周先生', phone: '0922000888', room_type: 'large' }),
  'T37-2': N({ intent: 'confirm' }),   // 「好」：AI 可能分成 confirm，程式照樣當成選還有空的小包廂
  'T38-1': N({ date_kind: 'absolute', month: 11, day: 29, hour: 12, minute: 0, period: 'noon', people: 2, name: '蔡小姐', phone: '0933000999' }),
  'T38-2': N({ room_type: 'any' }),
  'T39-1': N({ date_kind: 'absolute', month: 11, day: 30, hour: 6, minute: 0, period: 'evening', people: 4, name: '黃先生', phone: '0944000999', room_type: 'small' }),
  'T39-2': N({ intent: 'change', room_type: 'large' }),
  'T39-3': N({ intent: 'confirm' }),
};
// 第二次呼叫 AI（照店家資料回答）讀對時應該回傳的 JSON
const A = (found, answer = '', dishes = []) => JSON.stringify({ found, answer, dishes, performers: [] });
const ANSWER = {
  'T29-1': A(true, '素食的有塔香茄子 NT$260、蒜炒時蔬 NT$220、酥炸杏鮑菇 NT$240，甜點芒果冰 NT$160 也是素食。', ['塔香茄子', '蒜炒時蔬', '酥炸杏鮑菇', '芒果冰']),
  'T30-1': A(true, '三杯雞一份 NT$380。', ['三杯雞']),
  'T31-1': A(false), 'T32-1': A(false), 'T33-1': A(false),
  'T35-1': A(true, '我們的招牌菜是招牌烤雞，一隻 NT$680，約 3 到 4 人份。', ['招牌烤雞']),
};

async function testFlow() {
  // 1. 測試流程，和 n8n 裡的順序一樣：
  //    佔位訂位 → Test Messages →（重送就跳過）→ Prepare → Decide → 寫訂位表、草稿表 → Grade
  const msgs = await runNode('test-messages.js', [{}]);
  const drafts = new Map(), events = new Set(), bookings = [], results = [];
  let nextId = 1;
  for (const seed of await runNode('seed-bookings.js', [{}])) bookings.push({ id: nextId++, ...seed });
  for (const m of msgs) {
    if (events.has(m.event_id)) { results.push((await runNode('skip-event.js', [{}], { 'Current Message': m }))[0]); continue; }
    events.add(m.event_id);
    const active = bookings.filter(b => b.status !== '已取消');
    const [prep] = await runNode('prepare.js', [{}],
      { 'Current Message': m, 'Get Draft': drafts.get(m.user_id) ?? {}, 'Get Bookings': active, ...STORE_NODES });
    let [d] = await runNode('decide.js', [{ text: MOCK[`${m.test_id}-${m.step}`] }], { Prepare: prep });
    if (d.answer_mode === 'ai') [d] = await runNode('check-answer.js', [{ text: ANSWER[`${m.test_id}-${m.step}`] }], { Decide: d });
    if (d.booking_op === 'insert') bookings.push({ id: nextId++, user_id: d.user_id, ...d.booking, is_test: d.is_test });
    if (d.booking_op === 'update') {
      const b = bookings.find(x => x.id === d.booking.id);
      for (const k of ['date', 'time', 'people', 'room', 'status']) b[k] = d.booking[k];
    }
    if (d.draft_op === 'upsert') drafts.set(d.user_id, { id: 1, ...d.draft_next, updatedAt: new Date().toISOString() });
    if (d.draft_op === 'delete') drafts.delete(d.user_id);
    results.push(d);
  }
  const [summary, ...rows] = await runNode('grade.js', results);
  check(rows.every(r => r.結果 === 'PASS'), `${rows.length} 個測試`, JSON.stringify(rows.filter(r => r.結果 !== 'PASS')));
  console.log('Grade：', summary.總結, summary.訊息);
}

async function decideOnce(now, ai, draft = null, bookings = [], text = '') {
  const ctx = { source: 'test', user_id: 'X', now_iso: now, draft, bookings, text, is_test: true,
    store_info: Object.fromEntries(STORE.store_info.map(r => [r.key, r.value])), menu: STORE.menu, performances: STORE.performances };
  return (await runNode('decide.js', [{ text: typeof ai === 'string' ? ai : N({ people: 4, name: '王', phone: '0912345678', room_type: 'small', ...ai }) }], { Prepare: ctx }))[0];
}
// 只給這則訊息裡的欄位（其他都是 null），用在取消、改期、回答包廂這類不帶完整訂位資料的訊息
const X = o => ({ people: null, name: null, phone: null, room_type: null, ...o });

async function testEdges() {
  // 2. 日期、時間、電話的邊界情況
  const cases = [
    ['12/28 說 1/5（沒寫年份）是明年', '2026-12-28T12:00:00+08:00', { date_kind: 'absolute', month: 1, day: 5, hour: 7, period: 'evening' }, j => j.booking?.date === '2027-01-05'],
    ['11/3 說 8號 是 11/8', '2026-11-03T15:00:00+08:00', { date_kind: 'absolute', day: 8, hour: 7, period: 'evening' }, j => j.booking?.date === '2026-11-08'],
    ['11/3 說 2號 是 12/2', '2026-11-03T15:00:00+08:00', { date_kind: 'absolute', day: 2, hour: 7, period: 'evening' }, j => j.booking?.date === '2026-12-02'],
    ['週日說 這週六 已經過了', '2026-11-08T12:00:00+08:00', { date_kind: 'weekday', week: 'this', weekday: 6, hour: 7, period: 'evening' }, j => j.errors.includes('date_past')],
    ['週二只說 週二 是今天', '2026-11-03T12:00:00+08:00', { date_kind: 'weekday', week: 'unspecified', weekday: 2, hour: 7, period: 'evening' }, j => j.booking?.date === '2026-11-03'],
    ['週日說 下週日 是 11/15', '2026-11-08T12:00:00+08:00', { date_kind: 'weekday', week: 'next', weekday: 7, hour: 7, period: 'evening' }, j => j.booking?.date === '2026-11-15'],
    ['下週 但沒填星期幾 要追問', '2026-11-03T12:00:00+08:00', { date_kind: 'weekday', week: 'next', weekday: null, hour: 7, period: 'evening' }, j => j.errors.includes('date_unclear') && !j.booking],
    ['2/30 不存在', '2026-11-03T15:00:00+08:00', { date_kind: 'absolute', month: 2, day: 30, hour: 7, period: 'evening' }, j => j.errors.includes('date_invalid')],
    ['2027/1/20 超過 60 天', '2026-11-03T15:00:00+08:00', { date_kind: 'absolute', year: 2027, month: 1, day: 20, hour: 7, period: 'evening' }, j => j.errors.includes('date_too_far')],
    ['中午1點 是 13:00', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 1, period: 'noon' }, j => j.booking?.time === '13:00'],
    ['21:00 可以訂', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 21, minute: 0 }, j => j.booking?.time === '21:00'],
    ['晚上9點半 超過時段', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 9, minute: 30, period: 'evening' }, j => j.errors.includes('time_out_of_hours')],
    ['晚上12點 超過時段', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 12, period: 'evening' }, j => j.errors.includes('time_out_of_hours')],
    ['11點（沒說早晚）是 11:00', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 11 }, j => j.booking?.time === '11:00'],
    ['人數寫成字串 "6"', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 7, people: '6' }, j => j.booking?.people === 6],
    ['人數 0 不合格', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 7, people: 0 }, j => j.errors.includes('people_invalid')],
    ['+886 912 345 678', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 7, phone: '+886 912 345 678' }, j => j.booking?.phone === '0912345678'],
    ['全形數字電話', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 7, phone: '０９１２３４５６７８' }, j => j.booking?.phone === '0912345678'],
    ['市話 (02)2345-6789', '2026-11-03T10:00:00+08:00', { date_kind: 'offset', date_offset: 1, hour: 7, phone: '(02)2345-6789' }, j => j.booking?.phone === '0223456789'],
  ];
  for (const [name, now, ai, ok] of cases) { const j = await decideOnce(now, ai); check(ok(j), name, JSON.stringify({ booking: j.booking, errors: j.errors })); }
  // 草稿裡的日期隔天變成過去：要清掉重問
  const j1 = await decideOnce('2026-11-05T10:00:00+08:00', { people: null, name: null, phone: null },
    { date: '2026-11-04', time: '19:00', people: 4, name: '王', phone: null, asked: 'phone' });
  check(j1.errors.includes('date_past') && j1.missing.includes('date'), '草稿的日期隔天變過去');
  // AI 回傳的不是 JSON：回固定道歉，不存任何東西
  const j2 = await decideOnce('2026-11-05T10:00:00+08:00', '好的，我來幫您處理訂位！');
  check(j2.action === 'none' && j2.reply.startsWith('抱歉'), 'AI 回傳不是 JSON');
  console.log('邊界情況：', cases.length + 2, '個');
}

async function testChangeCancel() {
  // 5. 取消、改期的邊界情況
  const now = '2026-11-03T15:00:00+08:00';
  const mineA = { id: 11, user_id: 'X', date: '2026-11-20', time: '18:00', people: 4, name: '王', phone: '0912345678', room: 'A', status: '待確認' };
  const mineB = { id: 12, user_id: 'X', date: '2026-11-21', time: '12:00', people: 2, name: '王', phone: '0912345678', room: 'A', status: '待確認' };
  const fullAt19 = ['A', 'B', 'C'].map((room, i) => ({ id: 20 + i, user_id: 'Y', date: '2026-11-22', time: '19:00', people: 2, name: '佔', phone: '0900000000', room, status: '待確認' }));
  const pend = (action, extra = {}) => ({ date: null, time: null, people: null, name: null, phone: null, asked: 'confirm', pending_action: action, pending_booking_id: 11, ...extra });
  // AI 把「好的」分成 booking，程式仍依等待中的確認執行取消
  let j = await decideOnce(now, X({ intent: 'booking' }), pend('confirm_cancel'), [mineA], '好的');
  check(j.action === 'cancel_booking' && j.booking.status === '已取消', '等確認時回「好的」就取消', j.action);
  // 有兩筆、訊息說了日期：直接確認那一筆，不用選編號
  j = await decideOnce(now, X({ intent: 'cancel', date_kind: 'absolute', month: 11, day: 21 }), null, [mineA, mineB]);
  check(j.action === 'ask_confirm' && j.draft_next.pending_booking_id === 12, '取消時說了日期就直接確認那一筆', JSON.stringify(j.draft_next));
  // 改到客滿的時段：不送確認，改問其他時間，並建議空的時段
  j = await decideOnce(now, X({ intent: 'change', date_kind: 'absolute', month: 11, day: 22, hour: 7, period: 'evening' }), null, [mineA, ...fullAt19]);
  check(j.action === 'ask_change' && j.errors.includes('room_full') && j.reply.includes('17:00'), '改到客滿的時段要換時間', j.reply);
  // 改成和原本一樣：不用改
  j = await decideOnce(now, X({ intent: 'change', date_kind: 'absolute', month: 11, day: 20, hour: 6, period: 'evening' }), null, [mineA]);
  check(j.action === 'none' && j.reply.includes('一樣'), '改成和原本一樣就不用改', j.reply);
  // 確認改期前，位子被別人訂走：不更新，改問其他時間
  j = await decideOnce(now, X({ intent: 'confirm' }),
    pend('confirm_change', { pending_date: '2026-11-22', pending_time: '19:00', pending_people: 4 }), [mineA, ...fullAt19], '確定');
  check(j.action === 'ask_change' && j.errors.includes('room_full') && j.booking_op === null, '確認前位子被訂走就不改', j.action);
  // 沒有訂位卻說要改：還在訂位中就當成一般訂位
  j = await decideOnce(now, X({ intent: 'change', hour: 9, period: 'evening' }),
    { date: '2026-11-20', time: null, people: 4, name: '王', phone: '0912345678', room_type: 'small', asked: 'time' }, []);
  check(j.action === 'create_booking' && j.booking.time === '21:00', '訂位中說「改晚上9點」就是補時間', j.action);
  console.log('取消、改期：6 個');
}

async function testRooms() {
  // 7. 包廂大小：客人選；只有小包廂坐不下（9 位以上）或客人說都可以時，程式才替客人決定
  const now = '2026-11-03T15:00:00+08:00';
  const DAY = '2026-11-20';
  const bk = (id, room, time = '19:00') => ({ id, user_id: 'Y', date: DAY, time, people: 2, name: '佔', phone: '0900000000', room, status: '待確認' });
  const at19 = { date_kind: 'absolute', month: 11, day: 20, hour: 7, minute: 0, period: 'evening' };
  const asked = (extra = {}) => ({ date: DAY, time: '19:00', people: 4, name: '王', phone: '0912345678', room_type: null, asked: 'room_type', ...extra });
  const t = [];
  let j = await decideOnce(now, { ...at19, room_type: null });
  t.push([j.action === 'ask_room' && j.reply.includes('小包廂還是大包廂') && !j.booking && j.draft_next.asked === 'room_type'
    && j.draft_next.time === '19:00', '4 位沒說大小：先問，不建立訂位', j.reply]);
  t.push([(j.reply.match(/NT\$3,000/g) || []).length === 1, '問大小時附上包廂說明', j.reply]);
  j = await decideOnce(now, { ...at19, room_type: null, has_question: true, topics: ['room'] });
  t.push([j.action === 'ask_room' && (j.reply.match(/NT\$3,000/g) || []).length === 1, '同一則問了包廂：說明不重複', j.reply]);
  j = await decideOnce(now, { ...at19, room_type: 'large' });
  t.push([j.action === 'create_booking' && j.booking.room === 'C', '4 位說要大包廂：排大包廂', j.booking?.room]);
  j = await decideOnce(now, { ...at19, people: 12, room_type: null });
  t.push([j.action === 'create_booking' && j.booking.room === 'C' && j.reply.includes('小包廂最多 8 位'), '12 位：直接排大包廂並說明', j.reply]);
  j = await decideOnce(now, { ...at19, people: 12, room_type: 'small' });
  t.push([j.action === 'create_booking' && j.booking.room === 'C' && j.reply.includes('小包廂最多 8 位'), '12 位說要小包廂：也排大包廂並說明', j.reply]);
  j = await decideOnce(now, { ...at19, people: 8, room_type: null });
  t.push([j.action === 'ask_room', '8 位小包廂坐得下：照樣問', j.action]);
  // 小包廂都滿了，客人沒說大小：只問大包廂，回「好」就訂大包廂
  j = await decideOnce(now, { ...at19, room_type: null }, null, [bk(1, 'A'), bk(2, 'B')]);
  t.push([j.action === 'ask_room' && j.reply.includes('只剩大包廂') && !j.reply.includes('還是'), '小包廂都滿：只問大包廂', j.reply]);
  j = await decideOnce(now, X({ intent: 'confirm' }), asked(), [bk(1, 'A'), bk(2, 'B')], '好');
  t.push([j.action === 'create_booking' && j.booking.room === 'C', '只剩大包廂時回「好」：訂大包廂', j.action]);
  // 兩種都有空時只回「好」：不知道要哪一種，再問一次
  j = await decideOnce(now, X({ intent: 'confirm' }), asked(), [], '好');
  t.push([j.action === 'ask_room' && !j.booking, '兩種都有空時回「好」：再問一次', j.action]);
  // 要大包廂但訂走了、小包廂有空：問要不要改，草稿記住客人要大包廂
  j = await decideOnce(now, { ...at19, room_type: 'large' }, null, [bk(3, 'C')]);
  t.push([j.action === 'ask_room' && j.errors.join() === 'room_type_full' && j.reply.includes('小包廂還有空')
    && j.draft_next.room_type === 'large', '大包廂訂走了：問要不要改小包廂', j.reply]);
  j = await decideOnce(now, X({ intent: 'booking' }), asked({ room_type: 'large' }), [bk(3, 'C')], '好');
  t.push([j.action === 'create_booking' && j.booking.room === 'A', '回「好」：改訂小包廂', j.booking?.room]);
  j = await decideOnce(now, X({ intent: 'booking', hour: 9, minute: 0, period: 'evening' }), asked({ room_type: 'large' }), [bk(3, 'C')], '那改9點');
  t.push([j.action === 'create_booking' && j.booking.room === 'C' && j.booking.time === '21:00', '改時間：照原本要的大包廂', j.booking?.time]);
  // 兩種都滿：請客人換時間，建議的是客人要的那種大小有空的時段
  j = await decideOnce(now, { ...at19, room_type: 'large' }, null, [bk(1, 'A'), bk(2, 'B'), bk(3, 'C'), bk(4, 'C', '16:30')]);
  t.push([j.action === 'save_draft' && j.errors.join() === 'room_full' && j.reply.includes('大包廂已經訂滿了')
    && !j.reply.includes('17:00') && j.reply.includes('21:00') && j.draft_next.room_type === 'large', '兩種都滿：建議大包廂有空的時段', j.reply]);
  // 大小都可以：有空的裡面挑小的
  j = await decideOnce(now, { ...at19, room_type: 'any' }, null, [bk(1, 'A')]);
  t.push([j.action === 'create_booking' && j.booking.room === 'B', '都可以：排還有空的小包廂', j.booking?.room]);
  j = await decideOnce(now, { ...at19, room_type: 'any' }, null, [bk(1, 'A'), bk(2, 'B')]);
  t.push([j.action === 'create_booking' && j.booking.room === 'C', '都可以、小包廂都滿：排大包廂', j.booking?.room]);
  // 問大小時說「不要」：草稿不動，請客人換時間或改選
  j = await decideOnce(now, X({ intent: 'deny' }), asked(), [], '不要');
  t.push([j.action === 'none' && j.draft_op === 'none' && j.reply.includes('新的時間'), '問大小時說「不要」', j.reply]);
  // 問大小時客人改問問題：回答後提醒還差包廂
  j = await decideOnce(now, X({ intent: 'question', has_question: true, topics: ['hours'] }), asked(), []);
  t.push([j.action === 'answer' && j.reply.includes('還差一步'), '問大小時改問營業時間：回答後提醒', j.reply]);
  // 改期：換成大包廂、人數變多換大包廂、舊版草稿存的包廂代號
  const mine = { id: 11, user_id: 'X', date: DAY, time: '18:00', people: 4, name: '王', phone: '0912345678', room: 'A', status: '待確認' };
  const pend = extra => ({ date: null, time: null, people: null, name: null, phone: null, asked: 'confirm', pending_action: 'confirm_change',
    pending_booking_id: 11, pending_date: DAY, pending_time: '18:00', pending_people: 4, ...extra });
  j = await decideOnce(now, X({ intent: 'change', room_type: 'large' }), null, [mine]);
  t.push([j.action === 'ask_confirm' && j.draft_next.pending_room === 'large' && j.reply.includes('改成：11/20（五）18:00，4 位，大包廂'), '改成大包廂：先請客人確認', j.reply]);
  j = await decideOnce(now, X({ intent: 'confirm' }), pend({ pending_room: 'large' }), [mine], '確定');
  t.push([j.action === 'change_booking' && j.booking.room === 'C' && j.push.includes('大包廂'), '確認後換到大包廂', j.booking?.room]);
  j = await decideOnce(now, X({ intent: 'change', people: 10 }), null, [mine]);
  t.push([j.action === 'ask_confirm' && j.draft_next.pending_room === 'large' && j.reply.includes('小包廂最多 8 位'), '改成 10 位：換大包廂並說明', j.reply]);
  j = await decideOnce(now, X({ intent: 'change', date_kind: 'absolute', month: 11, day: 21 }), null, [mine]);
  t.push([j.action === 'ask_confirm' && j.draft_next.pending_room === 'small', '只改日期：沿用小包廂', JSON.stringify(j.draft_next)]);
  j = await decideOnce(now, X({ intent: 'confirm' }), pend({ pending_room: 'A', pending_date: '2026-11-21' }), [mine], '確定');
  t.push([j.action === 'change_booking' && j.booking.room === 'A', '舊版草稿存包廂代號也能確認', j.booking?.room]);
  for (const [ok, name, detail] of t) check(ok, name, detail);
  // Prepare：草稿裡選好的包廂大小要帶給 AI
  const msg = { user_id: 'U1', text: '好', now_iso: now };
  const row = { id: 3, user_id: 'U1', date: DAY, time: '19:00', people: 4, name: '王', phone: '0912345678', room_type: 'large', asked: 'room_type', updatedAt: '2026-11-03T06:00:00.000Z' };
  const [p] = await runNode('prepare.js', [{}], { 'Current Message': msg, 'Get Draft': row, 'Get Bookings': [], ...STORE_NODES });
  check(p.draft.room_type === 'large' && p.known.includes('包廂：大包廂') && p.asked_label.includes('小包廂還是大包廂'), 'Prepare 帶上包廂大小', p.known);
  console.log('包廂大小：', t.length + 1, '個');
}

async function testCheckAnswer() {
  // 6. Check Answer：AI 的回答不合格時，改回固定的話並通知店家
  const d = { text: '有什麼推薦的？', reply_prefix: '', reply_suffix: '', push: null,
    qa_data: '菜單：\n- 三杯雞（熱炒）NT$380', qa_menu: ['三杯雞'], qa_performers: [], qa_prices: [380] };
  const run = async ans => (await runNode('check-answer.js', [{ text: ans }], { Decide: d }))[0];
  let r = await run(A(true, '推薦三杯雞，NT$380。', ['三杯雞']));
  check(r.answer_ok && r.reply === '推薦三杯雞，NT$380。' && !r.push, '正常的回答照用');
  r = await run(A(true, '推薦紅燒牛肉麵。', ['紅燒牛肉麵']));
  check(!r.answer_ok && r.reply.includes('店家會再回覆') && r.push, '菜名不在菜單上就不用');
  r = await run(A(true, '三杯雞 NT$350。', ['三杯雞']));
  check(!r.answer_ok && r.answer_problems.some(x => x.includes('350')), '金額和資料不同就不用');
  r = await run(A(true, '今天三杯雞免費招待！', ['三杯雞']));
  check(!r.answer_ok, '資料沒寫的承諾就不用');
  r = await run('好的，三杯雞很好吃');
  check(!r.answer_ok && r.push, 'AI 回傳不是 JSON 就不用');
  r = await run(A(true, '我們的招牌是雞喔，NT$380。', ['三杯雞']));
  check(!r.answer_ok && r.answer_problems.some(x => x.includes('照原樣')), '列了菜名但回答裡沒照原樣寫就不用');
  console.log('Check Answer：6 個');
}

async function testPrepare() {
  // 3. 草稿超過 24 小時作廢
  const msg = { user_id: 'U1', text: '6', now_iso: '2026-11-03T15:00:00+08:00' };
  const row = u => ({ id: 3, user_id: 'U1', date: '2026-11-08', time: '19:00', people: null, name: '王', phone: null, asked: 'people,phone', updatedAt: u });
  const [fresh] = await runNode('prepare.js', [{}], { 'Current Message': msg, 'Get Draft': row('2026-11-02T16:00:00.000Z'), 'Get Bookings': [], ...STORE_NODES });   // 15 小時前
  const [old] = await runNode('prepare.js', [{}], { 'Current Message': msg, 'Get Draft': row('2026-11-02T06:00:00.000Z'), 'Get Bookings': [], ...STORE_NODES });     // 25 小時前
  check(fresh.draft !== null && fresh.asked_label === '人數、電話', '15 小時前的草稿保留');
  check(old.draft === null, '25 小時前的草稿作廢');
  const rows = [
    { id: 1, user_id: 'U1', date: '2026-11-05', time: '19:00', people: 4, status: '待確認', is_test: false },
    { id: 2, user_id: 'U1', date: '2026-11-02', time: '19:00', status: '待確認', is_test: false },   // 已經過了
    { id: 3, user_id: 'U1', date: '2026-11-06', time: '19:00', status: '已取消', is_test: false },   // 已取消
    { id: 4, user_id: 'U1', date: '2026-11-07', time: '19:00', status: '待確認', is_test: true },    // 測試資料
  ];
  const [p] = await runNode('prepare.js', [{}], { 'Current Message': msg, 'Get Draft': {}, 'Get Bookings': rows, ...STORE_NODES });
  check(p.menu.length === 12 && p.performances[0].date === '2026-11-03' && p.store_info.hours, 'Prepare 帶上店家資料', JSON.stringify(p.store_info));
  check(p.bookings.map(b => b.id).join(',') === '1', 'Prepare 只留之後、沒取消、正式的訂位', p.bookings.map(b => b.id).join(','));
  check(p.booked_label === '2026-11-05 19:00，4 位', 'Prepare 告訴 AI 這位客人已經訂好的位子', p.booked_label);
  const [p2] = await runNode('prepare.js', [{}], { 'Current Message': { ...msg, user_id: 'U2' }, 'Get Draft': {}, 'Get Bookings': rows, ...STORE_NODES });
  check(p2.booked_label === '（沒有）', '別人的訂位不算', p2.booked_label);
  console.log('Prepare：6 個');
}

async function testSignature() {
  // 4. 簽章比對：Sign Body（Crypto 節點）算出的值放在 expected_signature，這裡用 Node 的 crypto 模擬它
  const secret = 'local-test-secret';
  const body = { destination: 'Ux', events: [
    { type: 'message', mode: 'active', timestamp: 1762153200000, source: { type: 'user', userId: 'Ua' }, replyToken: 'r1', message: { type: 'text', text: '明天晚上7點 4位' } },
    { type: 'message', mode: 'active', timestamp: 1762153200001, source: { type: 'user', userId: 'Ua' }, replyToken: 'r2', message: { type: 'sticker' } },
    { type: 'follow', mode: 'active', timestamp: 1762153200002, source: { type: 'user', userId: 'Ub' }, replyToken: 'r3' },
    { type: 'message', mode: 'standby', timestamp: 1762153200003, source: { type: 'user', userId: 'Ua' }, message: { type: 'text', text: 'x' } },
    { type: 'message', mode: 'active', timestamp: 1762153200004, source: { type: 'group', groupId: 'G', userId: 'Ua' }, replyToken: 'r5', message: { type: 'text', text: 'y' } },
  ] };
  const raw = JSON.stringify(body);
  const good = nodeCrypto.createHmac('sha256', secret).update(raw).digest('base64');
  const run = sig => runNode('check-signature.js', [{ headers: sig ? { 'x-line-signature': sig } : {}, body, expected_signature: good }]);
  const ok = await run(good);
  check(ok.map(i => i.kind).join(',') === 'text,non_text,follow', '簽章正確：留下 3 個事件（standby、群組不處理）', ok.map(i => i.kind).join(','));
  check((await run('AAAA' + good.slice(4))).length === 0, '簽章錯誤：全部丟掉');
  check((await run(null)).length === 0, '沒有簽章：全部丟掉');
  console.log('簽章：3 個');
}

(async () => {
  await testFlow();
  await testEdges();
  await testPrepare();
  await testChangeCancel();
  await testRooms();
  await testCheckAnswer();
  await testSignature();
  console.log(fail === 0 ? `全部通過（${pass} 項）` : `${fail} 項失敗，${pass} 項通過`);
  process.exit(fail ? 1 : 0);
})();
