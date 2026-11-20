// Prepare：把「這則訊息」、「這位客人還沒完成的訂位草稿（含選好的包廂大小）」和「之後的訂位」放在一起，整理成給 AI 看的上下文
const msg = $('Current Message').first().json;
const row = $('Get Draft').first().json;      // 查不到草稿時是空物件
const DRAFT_TTL_HOURS = 24;                   // 草稿超過 24 小時沒更新就作廢，重新開始

const FIELDS = ['date', 'time', 'people', 'name', 'phone'];
const LABEL = { date: '日期', time: '時間', people: '人數', name: '姓名', phone: '電話' };
const ROOM_LABEL = { small: '小包廂', large: '大包廂', any: '大小都可以' };
// 等客人回答「確定 / 不要」、「選第幾筆」或「要哪種包廂」時，asked 存的是這些特別的值
const SPECIAL_ASK = {
  confirm: '是否確定（客人可能回答確定或不要）',
  pick: '要選第幾筆（客人可能只回一個數字，填在 pick）',
  change_target: '已經訂好的位子要改成哪一天、幾點、幾位或哪種包廂（intent 填 change）',
  room_type: '要小包廂還是大包廂（客人可能只回「小的」「大的」，填在 room_type）',
};
const isBlank = v => v === null || v === undefined || v === '';

const nowMs = msg.now_iso ? Date.parse(msg.now_iso) : Date.now();
const today = new Date(nowMs + 8 * 3600e3).toISOString().slice(0, 10);   // 台北的今天

let draft = null;
if (row && row.user_id) {
  const updated = Date.parse(row.updatedAt ?? row.createdAt ?? '');
  const expired = Number.isFinite(updated) && nowMs - updated > DRAFT_TTL_HOURS * 3600e3;
  if (!expired) {
    draft = { row_id: row.id ?? null, asked: row.asked || '' };
    for (const f of [...FIELDS, 'room_type']) draft[f] = isBlank(row[f]) ? null : row[f];
    for (const f of ['pending_action', 'pending_booking_id', 'pending_date', 'pending_time', 'pending_people', 'pending_room', 'pending_choices']) {
      draft[f] = isBlank(row[f]) ? null : row[f];
    }
  }
}

// 之後的訂位（還沒取消、今天以後），測試和正式的資料分開看
const bookings = $('Get Bookings').all().map(i => i.json)
  .filter(b => b && b.id !== undefined && b.status !== '已取消' && b.date >= today && (b.is_test === true) === (msg.is_test === true))
  .map(b => ({ id: b.id, user_id: b.user_id, date: b.date, time: b.time, people: b.people, name: b.name, phone: b.phone, room: b.room || null, status: b.status }));

// 店家資料：店家資訊、菜單、今天起 60 天內的節目表（給 Decide 套模板，或給 AI 回答問題）
const rows = name => $(name).all().map(i => i.json).filter(r => r && r.id !== undefined);
const storeInfo = Object.fromEntries(rows('Get Store Info').map(r => [r.key, r.value]));
const menu = rows('Get Menu').map(r => ({ name: r.name, category: r.category, price: r.price, description: r.description || '', tags: r.tags || '' }));
const last = new Date(Date.parse(today + 'T00:00:00Z') + 60 * 86400e3).toISOString().slice(0, 10);
const performances = rows('Get Performances')
  .filter(r => r.date >= today && r.date <= last)
  .map(r => ({ date: r.date, start: r.start, end: r.end, performer: r.performer, style: r.style || '' }))
  .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

// 這位客人已經訂好的位子：AI 要知道有沒有，才分得出「改成大包廂」是改訂好的位子，還是訂位中補資料
const booked = bookings.filter(b => b.user_id === msg.user_id)
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 3);
const bookedLabel = booked.length ? booked.map(b => `${b.date} ${b.time}，${b.people} 位`).join('；') : '（沒有）';

const known = draft && (FIELDS.some(f => !isBlank(draft[f])) || draft.room_type)
  ? FIELDS.map(f => `${LABEL[f]}：${isBlank(draft[f]) ? '（還沒給）' : draft[f]}`).join('；')
    + (draft.room_type ? `；包廂：${ROOM_LABEL[draft.room_type] ?? draft.room_type}` : '')
  : '（還沒有任何資料）';
let askedLabel = '（沒有）';
if (draft && draft.asked) {
  askedLabel = SPECIAL_ASK[draft.asked]
    ?? draft.asked.split(',').filter(f => LABEL[f]).map(f => LABEL[f]).join('、') ?? '（沒有）';
}

return [{ json: { ...msg, draft, bookings, store_info: storeInfo, menu, performances, known, asked_label: askedLabel || '（沒有）', booked_label: bookedLabel } }];
