// Decide：AI 只負責把訊息讀成 JSON，這裡由程式逐欄檢查、換算日期、合併之前給過的資料、問包廂大小、查空包廂，
// 再決定要做什麼（建立、取消、改期、存草稿，或只回固定說明）和要回什麼字。回覆全部是固定模板。
const ctx = $('Prepare').first().json;
const raw = String($input.first().json.text ?? '');

// ===== 店家規則（示範用） =====
const OPEN = '11:00';        // 最早可訂時間
const LAST = '21:00';        // 最晚可訂時間
const MAX_PEOPLE = 20;       // 最大的包廂坐得下的人數
const MAX_DAYS = 60;         // 只收今天起 60 天內的訂位
const SLOT_MINUTES = 120;    // 每筆訂位佔用包廂 2 小時
const ROOMS = [              // 要小包廂還是大包廂由客人選，程式只在那個大小裡找有空的一間
  { id: 'A', name: '小包廂 A', type: 'small', max: 8 },
  { id: 'B', name: '小包廂 B', type: 'small', max: 8 },
  { id: 'C', name: '大包廂', type: 'large', max: 20 },
];
const TYPES = ['small', 'large'];
const TYPE_NAME = { small: '小包廂', large: '大包廂', any: '大小都可以' };
const typeMax = t => Math.max(...ROOMS.filter(r => r.type === t).map(r => r.max));
const SMALL_MAX = typeMax('small');

const FIELDS = ['date', 'time', 'people', 'name', 'phone'];
const LABEL = { date: '日期', time: '時間', people: '人數', name: '姓名', phone: '電話' };
const ASK = {
  date: '日期（例如 11/8 或 這週六）',
  time: '時間（可訂 11:00 到 21:00）',
  people: '人數（最多 20 位）',
  name: '訂位人姓名',
  phone: '聯絡電話',
};
const EXAMPLE = '這週六晚上 7 點，6 位，王小明 0912345678';
const GREETING = `您好，我是訂位小幫手。請告訴我日期、時間、人數、姓名和電話，例如：${EXAMPLE}\n\n已經訂好的位子，也可以跟我說「取消訂位」或「改期」。`;
const CONFIRM_HINT = '確定的話請回「確定」，不要的話請回「不要」。';

// ===== 台北時間（UTC+8，沒有日光節約時間） =====
const TZ = 8 * 3600e3;
const DAY = 86400e3;
const nowMs = ctx.now_iso ? Date.parse(ctx.now_iso) : Date.now();
const local = new Date(nowMs + TZ);
const today = Math.floor((nowMs + TZ) / DAY);                     // 今天（從 1970-01-01 算起的第幾天）
const nowMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
const dayToStr = d => new Date(d * DAY).toISOString().slice(0, 10);
const strToDay = s => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY);
const weekdayOf = d => ((new Date(d * DAY).getUTCDay() + 6) % 7) + 1;   // 週一 1 … 週日 7
const WD = ['', '一', '二', '三', '四', '五', '六', '日'];
const toMinutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function showDate(s) {
  const d = strToDay(s), dt = new Date(d * DAY);
  const md = `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  const y = dt.getUTCFullYear() === local.getUTCFullYear() ? '' : `${dt.getUTCFullYear()}/`;
  return `${y}${md}（${WD[weekdayOf(d)]}）`;
}
function showPhone(p) {
  return /^09\d{8}$/.test(p) ? `${p.slice(0, 4)}-${p.slice(4, 7)}-${p.slice(7)}` : p;
}
function show(f, v) {
  if (f === 'date') return showDate(v);
  if (f === 'people') return `${v} 位`;
  if (f === 'phone') return showPhone(v);
  return v;
}
const roomName = id => ROOMS.find(r => r.id === id)?.name ?? '';
const typeOfRoom = id => ROOMS.find(r => r.id === id)?.type ?? null;
const summary = b => `${showDate(b.date)}${b.time}，${b.people} 位`;
const summaryRoom = b => summary(b) + (b.room ? `，${roomName(b.room)}` : '');
const contact = b => `${b.name} ${showPhone(b.phone)}`;
const bookingLines = b => [...FIELDS.map(f => `${LABEL[f]}：${show(f, b[f])}`), ...(b.room ? [`包廂：${roomName(b.room)}`] : [])].join('\n');

// ===== 讀 AI 回傳的 JSON =====
function parseAi(s) {
  const m = s.match(/\{[\s\S]*\}/);          // 去掉 ```json 之類的包裝
  if (!m) return null;
  try { const o = JSON.parse(m[0]); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; }
  catch { return null; }
}
// 整數檢查：AI 有時會把數字寫成字串，只接受純數字的字串
function int(v) {
  if (Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}
const isBlank = v => v === null || v === undefined || v === '';

// ===== 逐欄檢查。回傳 null（這則訊息沒提到）、{ value } 或 { error } =====
function resolveDate(a) {
  const kind = a.date_kind;
  if (isBlank(kind) || kind === 'none') return null;
  let d = null;
  if (kind === 'offset') {
    const n = int(a.date_offset);
    if (n === null || n < 0 || n > 3) return { error: 'date_unclear' };
    d = today + n;
  } else if (kind === 'weekday') {
    const w = int(a.weekday);
    if (w === null || w < 1 || w > 7) return { error: 'date_unclear' };
    const monday = today - (weekdayOf(today) - 1);
    if (a.week === 'this') d = monday + (w - 1);
    else if (a.week === 'next') d = monday + 7 + (w - 1);
    else d = today + ((w - weekdayOf(today) + 7) % 7);           // 只說「週六」：從今天起最近的週六
  } else if (kind === 'absolute') {
    const day = int(a.day);
    let month = int(a.month), year = int(a.year);
    if (day === null || day < 1 || day > 31) return { error: 'date_unclear' };
    if (month !== null && (month < 1 || month > 12)) return { error: 'date_invalid' };
    if (year !== null && year < 100) year += 2000;                // 26/11/8
    if (year !== null && year >= 100 && year < 200) year += 1911; // 民國年
    const ty = local.getUTCFullYear(), tm = local.getUTCMonth() + 1;
    const make = (y, m) => {                                      // 2/30 這種不存在的日期回傳 null
      const t = Date.UTC(y, m - 1, day);
      return new Date(t).getUTCMonth() === m - 1 ? Math.floor(t / DAY) : null;
    };
    if (month === null) {                                         // 只說「8 號」：這個月還沒過就用這個月，否則下個月
      d = make(ty, tm);
      if (d === null || d < today) d = tm === 12 ? make(ty + 1, 1) : make(ty, tm + 1);
      if (d === null) return { error: 'date_invalid' };
    } else if (year !== null) {
      d = make(year, month);
      if (d === null) return { error: 'date_invalid' };
    } else {                                                      // 沒寫年份：今年已經過了，而且明年那天在 60 天內，才當成明年
      d = make(ty, month);
      if (d === null) return { error: 'date_invalid' };
      if (d < today) {
        const next = make(ty + 1, month);
        if (next !== null && next - today <= MAX_DAYS) d = next;
      }
    }
  } else {
    return { error: 'date_unclear' };                             // unclear 或看不懂的值
  }
  if (d < today) return { error: 'date_past', shown: showDate(dayToStr(d)) };
  if (d - today > MAX_DAYS) return { error: 'date_too_far', shown: showDate(dayToStr(d)) };
  return { value: dayToStr(d) };
}

function resolveTime(a) {
  let h = int(a.hour), m = int(a.minute);
  let p = isBlank(a.period) ? null : a.period;
  if (p === 'night') p = 'evening';
  if (h === null) return p ? { error: 'time_need_hour', period: p } : null;   // 只說「晚上」
  if (m === null) m = 0;
  if (h < 0 || h > 24 || m < 0 || m > 59) return { error: 'time_invalid' };
  if (p === 'afternoon' || p === 'evening') {
    if (h >= 1 && h <= 11) h += 12;
    else if (h === 12 && p === 'evening') h = 0;                  // 晚上 12 點
  } else if (p === 'noon') {
    if (h >= 1 && h <= 2) h += 12;                                // 中午 1 點＝13:00
  } else if (p !== 'morning' && h >= 1 && h <= 10) {
    h += 12;                                                      // 沒說早晚：店 11 點才開，1 到 10 點當成下午或晚上
  }
  if (h === 24) h = 0;
  const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (t < OPEN || t > LAST) return { error: 'time_out_of_hours', shown: t };
  return { value: t };
}

function resolvePeople(a) {
  if (isBlank(a.people)) return null;
  const n = int(a.people);
  if (n === null || n < 1) return { error: 'people_invalid' };
  if (n > MAX_PEOPLE) return { error: 'people_too_many', shown: n };
  return { value: n };
}

function resolveName(a) {
  if (isBlank(a.name)) return null;
  const s = String(a.name).replace(/\s+/g, ' ').trim();
  if (!s || s.length > 20) return { error: 'name_invalid' };
  return { value: s };
}

function resolvePhone(a) {
  if (isBlank(a.phone)) return null;
  const shown = String(a.phone);
  let s = shown
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))   // 全形數字
    .replace(/[\s\-‐－–—().（）]/g, '');
  if (s.startsWith('+886')) s = '0' + s.slice(4);
  else if (s.startsWith('886') && s.length >= 11) s = '0' + s.slice(3);
  if (/^09\d{8}$/.test(s) || /^0[2-8]\d{7,8}$/.test(s)) return { value: s };
  return { error: 'phone_invalid', shown };
}

// 客人選的包廂大小：small、large，或 any（大小都可以）。沒說或看不懂的值當成沒說
function resolveRoomType(a) {
  return ['small', 'large', 'any'].includes(a.room_type) ? { value: a.room_type } : null;
}
const sizeOf = v => (v === 'small' || v === 'large' ? v : null);

function errorText(code, r = {}) {
  const periodWord = { morning: '早上', noon: '中午', afternoon: '下午', evening: '晚上' }[r.period] ?? '';
  return {
    date_past: `${r.shown ?? '這個日期'}已經過了，請給我今天以後的日期。`,
    date_too_far: `目前只接受 ${MAX_DAYS} 天內的訂位，${r.shown ?? '這個日期'}太遠了。`,
    date_invalid: '這個日期好像不存在，請再確認一次。',
    date_unclear: '日期我不太確定是哪一天，請告訴我日期（例如 11/8 或 這週六）。',
    time_need_hour: `請問${periodWord}幾點呢？`,
    time_out_of_hours: `可訂位的時間是 ${OPEN} 到 ${LAST}，${r.shown ?? '這個時間'} 不在範圍內。`,
    time_invalid: '時間好像不對，請再說一次（例如 晚上 7 點）。',
    time_passed: `今天 ${r.shown ?? ''} 已經過了，請給我其他時間。`,
    people_too_many: `包廂最多 ${MAX_PEOPLE} 位，${r.shown} 位請直接聯絡店家，或告訴我新的人數。`,
    people_invalid: '人數好像不對，請告訴我幾位。',
    name_invalid: '請告訴我訂位人的姓名。',
    phone_invalid: `電話「${r.shown ?? ''}」格式好像不對，請給我手機（09 開頭共 10 碼）或市話。`,
    room_full: `${r.shown ?? '這個時段'}的${r.typeName ?? '包廂'}已經訂滿了。`
      + (r.free?.length ? `同一天${r.typeName ?? ''}還可以訂：${r.free.join('、')}。` : '這一天都訂滿了，請換一天。'),
    room_type_full: `${r.shown ?? '這個時段'}的${r.typeName ?? '包廂'}已經訂走了。`
      + (r.free?.length ? `同一天${r.typeName ?? ''}還可以訂：${r.free.join('、')}。` : ''),
  }[code];
}

// ===== 包廂：同一間包廂，兩筆訂位的開始時間相差不到 2 小時就算重疊 =====
const bookings = ctx.bookings ?? [];                              // 之後的有效訂位（所有客人）
const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
const mine = bookings.filter(b => b.user_id === ctx.user_id).sort(byTime);
const overlaps = (t1, t2) => Math.abs(toMinutes(t1) - toMinutes(t2)) < SLOT_MINUTES;
// 指定大小（small / large）就只找那個大小；沒指定就找坐得下的任何一間，由小到大
function freeRoom(date, time, people, type = null, excludeId = null) {
  for (const room of ROOMS) {
    if (room.max < people || (type && room.type !== type)) continue;
    const busy = bookings.some(b => b.id !== excludeId && b.room === room.id && b.date === date && overlaps(b.time, time));
    if (!busy) return room;
  }
  return null;
}
// 客滿時，找同一天離客人要的時間最近、還有包廂的時段（最多 3 個）
function freeTimes(date, time, people, type = null, excludeId = null) {
  const found = [];
  for (let m = toMinutes(OPEN); m <= toMinutes(LAST); m += 30) {
    const t = fromMinutes(m);
    if (t === time) continue;
    if (strToDay(date) === today && m <= nowMinutes) continue;
    if (freeRoom(date, t, people, type, excludeId)) found.push(t);
  }
  const ref = toMinutes(time);
  return found
    .sort((a, b) => Math.abs(toMinutes(a) - ref) - Math.abs(toMinutes(b) - ref) || toMinutes(a) - toMinutes(b))
    .slice(0, 3)
    .sort((a, b) => toMinutes(a) - toMinutes(b));
}

// ===== 輸出 =====
const draft = ctx.draft;                       // Prepare 查到、還沒過期的草稿；沒有就是 null
const pending = draft?.pending_action ?? null;
const base = {
  source: ctx.source, kind: ctx.kind, user_id: ctx.user_id, reply_token: ctx.reply_token,
  text: ctx.text, now_iso: ctx.now_iso ?? null, is_test: ctx.is_test === true, event_id: ctx.event_id ?? null,
  test_id: ctx.test_id ?? null, title: ctx.title ?? null, step: ctx.step ?? null, expect: ctx.expect ?? null,
};
let ai = null;
const finish = o => [{ json: { ...base, intent: null, has_question: false, missing: [], errors: [],
  booking_op: null, booking: null, draft_op: 'none', draft_next: null, push: null, answer_mode: null, ...o, ai, ai_raw: raw } }];

// 草稿的一列：訂位中的欄位和包廂大小，加上等客人回答的事（確定與否、選第幾筆、改成什麼）
function draftRow(fields, asked, p = {}) {
  const r = { user_id: ctx.user_id, is_test: base.is_test, asked: asked || '' };
  for (const f of FIELDS) r[f] = isBlank(fields?.[f]) ? null : fields[f];
  r.room_type = isBlank(fields?.room_type) ? null : fields.room_type;
  r.pending_action = p.action ?? null;
  r.pending_booking_id = p.booking_id ?? null;
  r.pending_date = p.date ?? null;
  r.pending_time = p.time ?? null;
  r.pending_people = p.people ?? null;
  r.pending_room = p.room ?? null;             // 改期時要換成的包廂大小（small / large）
  r.pending_choices = p.choices ?? null;
  return r;
}
const draftFields = () => ({ ...Object.fromEntries(FIELDS.map(f => [f, draft?.[f] ?? null])), room_type: draft?.room_type ?? null });
const hasFields = o => FIELDS.some(f => !isBlank(o?.[f]));
const hasData = o => hasFields(o) || !isBlank(o?.room_type);
const missingOf = o => FIELDS.filter(f => isBlank(o?.[f]));
const nextAsk = o => (missingOf(o).length ? missingOf(o).join(',') : 'room_type');   // 五項都齊了，接下來問包廂大小
// 保留訂位中的欄位，等客人回答的事換成 p（沒有就清掉）
function keepDraft(asked, p = null) {
  const fields = draftFields();
  if (!hasData(fields) && !p) return { draft_op: draft ? 'delete' : 'none', draft_next: null };
  return { draft_op: 'upsert', draft_next: draftRow(fields, asked ?? (hasData(fields) ? nextAsk(fields) : ''), p ?? {}) };
}
const clearPending = () => (pending ? keepDraft(null, null) : {});
const reminder = () => {
  const fields = draftFields(), miss = missingOf(fields);
  if (!hasData(fields)) return '';
  if (miss.length) return `\n\n您的訂位還需要：${miss.map(f => ASK[f]).join('、')}`;
  return draft?.asked === 'room_type' ? '\n\n您的訂位還差一步：請問要小包廂還是大包廂？' : '';
};

function askCancel(b, intent) {
  return finish({ action: 'ask_confirm', intent, ...keepDraft('confirm', { action: 'confirm_cancel', booking_id: b.id }),
    reply: `要取消這筆訂位嗎？\n${summaryRoom(b)}\n${contact(b)}\n\n${CONFIRM_HINT}` });
}
function askPick(kind, list, question, intent, prior = null) {
  return finish({ action: 'ask_pick', intent,
    ...keepDraft('pick', { action: kind, choices: list.map(b => b.id).join(','),
      date: prior?.date ?? null, time: prior?.time ?? null, people: prior?.people ?? null, room: prior?.room_type ?? null }),
    reply: `您有 ${list.length} 筆訂位：\n${list.map((b, i) => `${i + 1}. ${summary(b)}`).join('\n')}\n\n${question}` });
}
function askChangeTarget(b, intent, lead = '', errors = []) {
  return finish({ action: 'ask_change', intent, errors,
    ...keepDraft('change_target', { action: 'ask_change_target', booking_id: b.id }),
    reply: `${lead ? lead + '\n\n' : ''}要把這筆訂位改成哪一天、幾點呢？\n${summaryRoom(b)}` });
}
const pendingType = v => sizeOf(v) ?? typeOfRoom(v);   // 舊版草稿存的是包廂代號（A、B、C）
// 改期或換包廂：新的日期、時間、人數、包廂大小，沒給的沿用原本的；檢查完、確定有空包廂，才請客人確認
function proposeChange(b, prior, intent) {
  const next = { date: prior?.date ?? null, time: prior?.time ?? null, people: prior?.people ?? null, room_type: prior?.room_type ?? null };
  const errs = [];
  for (const f of ['date', 'time', 'people']) {
    const r = res[f];
    if (!r) continue;
    if (r.error) errs.push({ code: r.error, msg: errorText(r.error, r) });
    else next[f] = r.value;
  }
  if (sizeOf(res.room_type?.value)) next.room_type = res.room_type.value;
  if (errs.length) return askChangeTarget(b, intent, errs.map(e => e.msg).join('\n'), errs.map(e => e.code));
  if (!next.date && !next.time && !next.people && !next.room_type) return askChangeTarget(b, intent);
  const t = { date: next.date ?? b.date, time: next.time ?? b.time, people: next.people ?? b.people };
  if (strToDay(t.date) === today && toMinutes(t.time) <= nowMinutes) {
    return askChangeTarget(b, intent, errorText('time_passed', { shown: t.time }), ['time_passed']);
  }
  // 包廂大小：客人這次有說就照說的，沒說就沿用原本的；人數超過小包廂，才換成大包廂
  const cur = typeOfRoom(b.room);
  let type = next.room_type ?? cur ?? 'small', note = '';
  if (type === 'small' && t.people > SMALL_MAX) {
    type = 'large';
    note = `小包廂最多 ${SMALL_MAX} 位，${t.people} 位要換成大包廂。`;
  }
  if (t.date === b.date && t.time === b.time && t.people === b.people && type === cur) {
    return finish({ action: 'none', intent, ...keepDraft(null, null), reply: '這和原本的訂位一樣，不用改。' });
  }
  const other = mine.find(x => x.id !== b.id && x.date === t.date && overlaps(x.time, t.time));
  if (other) {
    return askChangeTarget(b, intent, `您在 ${summary(other)} 已經有另一筆訂位了。`, ['duplicate_booking']);
  }
  const room = freeRoom(t.date, t.time, t.people, type, b.id);
  if (!room) {
    const free = freeTimes(t.date, t.time, t.people, type, b.id);
    return askChangeTarget(b, intent, errorText('room_full', { shown: `${showDate(t.date)}${t.time}`, typeName: TYPE_NAME[type], free }), ['room_full']);
  }
  return finish({ action: 'ask_confirm', intent,
    ...keepDraft('confirm', { action: 'confirm_change', booking_id: b.id, date: t.date, time: t.time, people: t.people, room: type }),
    reply: `要把訂位改成這樣嗎？\n原本：${summaryRoom(b)}\n改成：${summary(t)}，${TYPE_NAME[type]}${note ? `\n${note}` : ''}\n\n${CONFIRM_HINT}` });
}

// ===== 回答店家相關的問題 =====
// 營業時間、包廂、表演有固定格式，由程式照資料套模板；料理和其他問題才交給 AI 照資料回答（下一步再由程式檢查）
const TOPICS = ['hours', 'room', 'performance', 'menu', 'other'];
const INFO_LABEL = { hours: '營業時間', booking: '訂位', rooms: '包廂', performance: '表演', parking: '停車', payment: '付款' };
const info = ctx.store_info ?? {};
const perfs = ctx.performances ?? [];
const menuRows = ctx.menu ?? [];
const topicsOf = a => [...new Set((Array.isArray(a.topics) ? a.topics : []).filter(t => TOPICS.includes(t)))];
function perfDate() {                       // 問的是哪一天的表演：有說就照說的，沒說就是今天
  const r = res.date;
  if (r?.value) return { date: r.value };
  if (r?.error) return { error: r };
  return { date: dayToStr(today) };
}
function templateAnswer(topic) {
  if (topic === 'hours' && info.hours) return `營業時間：${info.hours}${info.booking ? `\n${info.booking}` : ''}`;
  if (topic === 'room' && info.rooms) return `包廂：${info.rooms}${info.booking ? `\n${info.booking}` : ''}`;
  if (topic === 'performance') {
    const pd = perfDate();
    if (pd.error) return errorText(pd.error.error, pd.error);
    const list = perfs.filter(x => x.date === pd.date);
    if (!list.length) return `${showDate(pd.date)}沒有安排表演。${info.performance ? `（${info.performance}）` : ''}`;
    return `${showDate(pd.date)}的表演：\n` + list.map(x => `${x.start} 到 ${x.end} ${x.performer}${x.style ? `（${x.style}）` : ''}`).join('\n');
  }
  return null;
}
// 給 AI 的店家資料，和檢查 AI 回答時要用的清單（菜名、表演者、資料裡出現過的金額）
function qaPack(topics) {
  const lines = ['店家資訊：', ...Object.entries(info).map(([k, v]) => `- ${INFO_LABEL[k] ?? k}：${v}`)];
  lines.push('', '菜單：', ...menuRows.map(m => `- ${m.name}（${m.category}）NT$${m.price}${m.description ? `：${m.description}` : ''}${m.tags ? `【${m.tags}】` : ''}`));
  let performers = [];
  if (topics.includes('performance')) {
    const pd = perfDate();
    const list = pd.date ? perfs.filter(x => x.date === pd.date) : [];
    performers = list.map(x => x.performer);
    lines.push('', `${pd.date ? showDate(pd.date) : '那天'}的表演：`, ...(list.length ? list.map(x => `- ${x.start} 到 ${x.end} ${x.performer}（${x.style}）`) : ['- 沒有安排表演']));
  }
  const prices = [...menuRows.map(m => Number(m.price)),
    ...Object.values(info).flatMap(v => [...String(v).matchAll(/NT\$\s?([\d,]+)/g)].map(m => Number(m[1].replace(/,/g, ''))))];
  return { qa_data: lines.join('\n'), qa_menu: menuRows.map(m => m.name), qa_performers: performers, qa_prices: prices };
}
function answerQuestion(topics) {
  const needAi = topics.length === 0 || topics.some(t => t === 'menu' || t === 'other');
  if (!needAi) {
    const parts = topics.map(templateAnswer);
    if (parts.every(Boolean)) return { mode: 'template', text: parts.join('\n\n') };
  }
  return { mode: 'ai', ...qaPack(topics) };
}
// 訂位訊息裡順便問了問題：模板直接接在回覆後面；要 AI 回答的，交給下一步接
let qaExtra = null;
function withAnswer(o) {
  if (!qaExtra) return o;
  if (qaExtra.mode === 'template') return { ...o, reply: `${o.reply}\n\n${qaExtra.text}` };
  const { mode, ...pack } = qaExtra;
  return { ...o, answer_mode: 'ai', ...pack, reply_prefix: o.reply, reply_suffix: '' };
}

// ===== 問包廂大小 =====
// 五項資料都齊了才問；只列出這個時段還有空、坐得下的大小。errs 有值時，是客人要的大小已經訂走了
function askRoom(merged, free, errs) {
  const parts = [];
  if (errs.length) parts.push(errs.map(e => e.msg).join('\n'));
  parts.push('訂位資料都收到了：\n' + FIELDS.map(f => `${LABEL[f]}：${show(f, merged[f])}`).join('\n'));
  const name = TYPE_NAME[free[0]];
  let q;
  if (free.length > 1) q = '最後請問要小包廂還是大包廂？';
  else if (errs.length) q = `這個時間${name}還有空，要改訂${name}嗎？要的話請回「好」，或告訴我其他時間。`;
  else q = `這個時段${TYPE_NAME[free[0] === 'small' ? 'large' : 'small']}已經訂滿了，只剩${name}，要訂${name}嗎？要的話請回「好」，或告訴我其他時間。`;
  parts.push(q + (info.rooms ? `\n（${info.rooms}）` : ''));
  // 問包廂大小時已經附上包廂說明；客人問的如果是包廂，就不再重複回答
  if (qaExtra && info.rooms && topicsOf(ai).includes('room')) {
    const rest = topicsOf(ai).filter(t => t !== 'room');
    qaExtra = rest.length ? answerQuestion(rest) : null;
  }
  return finish(withAnswer({ action: 'ask_room', intent: 'booking', has_question: hasQuestion,
    errors: errs.map(e => e.code), draft_op: 'upsert', draft_next: draftRow(merged, 'room_type'), reply: parts.join('\n\n') }));
}

// ===== 主流程 =====
ai = parseAi(raw);
if (!ai) {
  return finish({ action: 'none', reply: '抱歉，我剛剛沒有看懂，可以再傳一次嗎？' });
}
const INTENTS = ['booking', 'question', 'cancel', 'change', 'confirm', 'deny', 'other'];
let intent = ai.intent === 'cancel_or_change' ? 'cancel' : (INTENTS.includes(ai.intent) ? ai.intent : 'other');
const hasQuestion = ai.has_question === true;
const res = {
  date: resolveDate(ai), time: resolveTime(ai), people: resolvePeople(ai),
  name: resolveName(ai), phone: resolvePhone(ai), room_type: resolveRoomType(ai),
};
const gaveSomething = [...FIELDS, 'room_type'].some(f => res[f] !== null);
const pick = int(ai.pick);
const valuesOf = r => ({ date: r.date?.value ?? null, time: r.time?.value ?? null, people: r.people?.value ?? null, room_type: sizeOf(r.room_type?.value) });
// 很短的「好 / 不要」由程式直接判斷，不靠 AI 分類
const shortText = String(ctx.text ?? '').trim().replace(/[。！!～~.,，\s]+$/u, '');
const isYes = /^(確定|確認|好|好的|好啊|好喔|對|是|是的|沒問題|可以|可以的|ok|OK|Ok|okay)$/.test(shortText);
const isNo = /^(不要|不用|不用了|算了|先不要|不要了|不好)$/.test(shortText);
if (pending === 'confirm_cancel' || pending === 'confirm_change') {
  if (isYes) intent = 'confirm';
  else if (isNo) intent = 'deny';
}

// 1. 上一則請客人確認取消或改期
if (pending === 'confirm_cancel' || pending === 'confirm_change') {
  const b = mine.find(x => x.id === draft.pending_booking_id);
  if (intent === 'confirm') {
    if (!b) return finish({ action: 'none', intent, ...keepDraft(null, null), reply: '這筆訂位已經不在了，可能已經取消。需要的話可以重新訂位。' });
    if (pending === 'confirm_cancel') {
      return finish({ action: 'cancel_booking', intent, ...keepDraft(null, null),
        booking_op: 'update', booking: { ...b, status: '已取消' },
        reply: `已取消這筆訂位：\n${summaryRoom(b)}\n${contact(b)}`,
        push: `訂位取消\n${summaryRoom(b)}\n${contact(b)}` });
    }
    // 問客人到他回答之間，位子可能被別人訂走，所以送出前再查一次
    const t = { date: draft.pending_date, time: draft.pending_time, people: draft.pending_people };
    const type = pendingType(draft.pending_room) ?? typeOfRoom(b.room);
    const room = freeRoom(t.date, t.time, t.people, type, b.id);
    if (!room) {
      const free = freeTimes(t.date, t.time, t.people, type, b.id);
      return askChangeTarget(b, intent, errorText('room_full', { shown: `${showDate(t.date)}${t.time}`, typeName: TYPE_NAME[type], free }), ['room_full']);
    }
    const updated = { ...b, ...t, room: room.id, status: '待確認' };
    return finish({ action: 'change_booking', intent, ...keepDraft(null, null),
      booking_op: 'update', booking: updated,
      reply: `已收到變更，店家確認後會再通知您。\n\n${bookingLines(updated)}`,
      push: `訂位變更待確認\n原本：${summaryRoom(b)}\n改成：${summaryRoom(updated)}\n${contact(b)}` });
  }
  if (intent === 'deny') return finish({ action: 'none', intent, ...keepDraft(null, null), reply: '好的，訂位不變。' + reminder() });
  // 其他回答：不等了，照一般訊息處理（後面寫草稿時會清掉這個等待）
}

// 2. 上一則列出好幾筆訂位，請客人選編號
if (pending === 'pick_cancel' || pending === 'pick_change') {
  const ids = String(draft.pending_choices ?? '').split(',').map(Number).filter(Number.isFinite);
  let chosen = null;
  if (pick !== null && pick >= 1 && pick <= ids.length) chosen = mine.find(x => x.id === ids[pick - 1]) ?? null;
  else if (res.date?.value) {
    const same = mine.filter(x => ids.includes(x.id) && x.date === res.date.value);
    if (same.length === 1) chosen = same[0];
  }
  if (chosen) {
    if (pending === 'pick_cancel') return askCancel(chosen, intent);
    return proposeChange(chosen, { date: draft.pending_date, time: draft.pending_time, people: draft.pending_people,
      room_type: sizeOf(draft.pending_room) }, intent);
  }
  if (intent === 'deny') return finish({ action: 'none', intent, ...keepDraft(null, null), reply: '好的，訂位不變。' + reminder() });
}

// 3. 上一則問「要改成哪一天、幾點」
if (pending === 'ask_change_target') {
  const b = mine.find(x => x.id === draft.pending_booking_id);
  if (b && gaveSomething) return proposeChange(b, null, intent);
  if (intent === 'deny') return finish({ action: 'none', intent, ...keepDraft(null, null), reply: '好的，訂位不變。' + reminder() });
}

// 4. 要取消
if (intent === 'cancel') {
  if (!mine.length) {
    return finish({ action: 'none', intent, ...clearPending(),
      reply: '查不到您之後的訂位。如果是用別的 LINE 帳號訂的，請直接聯絡店家。' + reminder() });
  }
  let candidates = mine;
  if (res.date?.value) {
    const same = mine.filter(x => x.date === res.date.value);
    if (same.length) candidates = same;
  }
  if (candidates.length === 1) return askCancel(candidates[0], intent);
  return askPick('pick_cancel', candidates, '要取消哪一筆？請回編號。', intent);
}

// 5. 要改期或換包廂
if (intent === 'change') {
  if (mine.length === 1) return proposeChange(mine[0], null, intent);
  if (mine.length > 1) return askPick('pick_change', mine, '要改哪一筆？請回編號。', intent, valuesOf(res));
  // 沒有訂好的位子：還在訂位中改資料，就當成一般訂位；什麼都沒有才說查不到
  if (!hasData(draftFields())) {
    return finish({ action: 'none', intent, ...clearPending(),
      reply: `查不到您之後的訂位，所以沒有可以改的。要訂新的位子，請告訴我日期、時間、人數、姓名和電話，例如：${EXAMPLE}` });
  }
  intent = 'booking';
}

// 上一則問「要小包廂還是大包廂」，這則沒說大小：只回「好」就是要那個還有空的；說「不要」就請客人換時間或改選
const roomAnswer = !pending && draft?.asked === 'room_type' && !res.room_type;
const saidYes = roomAnswer && (isYes || (intent === 'confirm' && !gaveSomething));
if (saidYes) intent = 'booking';
if (roomAnswer && !gaveSomething && (isNo || intent === 'deny')) {
  return finish({ action: 'none', intent: 'deny', reply: '好的。要換時間的話，請告訴我新的時間；也可以回「小包廂」或「大包廂」。' });
}

// 6. 問店家的問題（問表演時的日期不算訂位資料），或打招呼
if (intent === 'question') {
  const qa = answerQuestion(topicsOf(ai));
  if (qa.mode === 'template') {
    return finish({ action: 'answer', intent, answer_mode: 'template', ...clearPending(), reply: qa.text + reminder() });
  }
  const { mode, ...pack } = qa;
  return finish({ action: 'answer', intent, answer_mode: 'ai', ...pack, reply_prefix: '', reply_suffix: reminder(),
    ...clearPending(), reply: '這個問題小幫手答不出來，已經轉給店家，店家會再回覆您。' });
}
if (intent !== 'booking' && !gaveSomething) {
  return finish({ action: 'none', intent, has_question: hasQuestion, ...clearPending(), reply: GREETING + reminder() });
}

// 7. 訂位：從草稿開始，這則訊息有給、而且檢查通過的欄位才覆蓋；給了但不合格的欄位清空，請客人重給
const merged = draftFields();
const errors = [];
for (const f of FIELDS) {
  const r = res[f];
  if (!r) continue;
  if (r.error) { errors.push({ code: r.error, msg: errorText(r.error, r) }); merged[f] = null; }
  else merged[f] = r.value;
}
if (res.room_type) merged.room_type = res.room_type.value;
// 草稿裡的舊資料也要再檢查一次：日期可能已經過了，今天的時間也可能已經過了
if (merged.date && strToDay(merged.date) < today) {
  errors.push({ code: 'date_past', msg: errorText('date_past', { shown: showDate(merged.date) }) });
  merged.date = null;
}
if (merged.date && merged.time && strToDay(merged.date) === today && toMinutes(merged.time) <= nowMinutes) {
  errors.push({ code: 'time_passed', msg: errorText('time_passed', { shown: merged.time }) });
  merged.time = null;
}
if (hasQuestion) qaExtra = answerQuestion(topicsOf(ai).length ? topicsOf(ai) : ['other']);

if (missingOf(merged).length === 0 && errors.length === 0) {
  // 同一位客人同一天、時間重疊的訂位已經有了：不重複建立
  const dup = mine.find(b => b.date === merged.date && overlaps(b.time, merged.time));
  if (dup) {
    return finish(withAnswer({ action: 'duplicate', intent: 'booking', has_question: hasQuestion,
      errors: ['duplicate_booking'], ...(draft ? { draft_op: 'delete', draft_next: null } : {}),
      reply: `您已經訂了 ${summary(dup)}，不用重複訂。要改時間的話，請跟我說「改期」。` }));
  }
  const { date, time, people } = merged;
  const when = `${showDate(date)}${time}`;
  const fits = TYPES.filter(t => typeMax(t) >= people);              // 坐得下的大小
  const free = fits.filter(t => freeRoom(date, time, people, t));    // 這個時段還有空的大小
  // 包廂大小由客人選。程式只在兩種情況替客人決定：小包廂坐不下（9 位以上），或客人說大小都可以
  let type = sizeOf(merged.room_type), note = '';
  if (!fits.includes('small')) {
    if (type !== 'large') note = `小包廂最多 ${SMALL_MAX} 位，${people} 位幫您排大包廂。`;
    type = 'large';
  } else if (saidYes && free.length === 1) {
    type = free[0];                                                  // 只剩一種大小有空，客人回「好」
  } else if (merged.room_type === 'any') {
    type = free[0] ?? null;                                          // 大小都可以：有空的裡面挑小的
  }
  if (type) {
    const room = freeRoom(date, time, people, type);
    if (room) {
      // 資料齊了、也有空包廂：寫進訂位表，狀態一律是「待確認」，由店家確認，程式不會自動確認
      const booking = { date, time, people, name: merged.name, phone: merged.phone, room: room.id, status: '待確認' };
      return finish(withAnswer({
        action: 'create_booking', intent: 'booking', has_question: hasQuestion,
        booking_op: 'insert', booking, ...(draft ? { draft_op: 'delete', draft_next: null } : {}),
        reply: `已收到，店家確認後會再通知您。${note ? `\n${note}` : ''}\n\n${bookingLines(booking)}`,
        push: `新訂位待確認\n${summary(booking)}，${roomName(room.id)}\n${contact(booking)}`,
      }));
    }
    // 客人要的大小這個時段滿了：另一種還有空就問要不要改，否則請客人換時間
    const times = freeTimes(date, time, people, type);
    const others = free.filter(t => t !== type);
    if (others.length) {
      return askRoom(merged, others, [{ code: 'room_type_full', msg: errorText('room_type_full', { shown: when, typeName: TYPE_NAME[type], free: times }) }]);
    }
    errors.push({ code: 'room_full', msg: errorText('room_full', { shown: when, typeName: TYPE_NAME[type], free: times }) });
    merged.time = null;
    if (!times.length) merged.date = null;
  } else if (free.length) {
    return askRoom(merged, free, []);
  } else {
    // 客滿：時間清掉請客人重選；整天都滿就連日期一起重選
    const times = freeTimes(date, time, people);
    errors.push({ code: 'room_full', msg: errorText('room_full', { shown: when, free: times }) });
    merged.time = null;
    if (!times.length) merged.date = null;
  }
}

// 還缺資料：存草稿，問缺的欄位
const missing = missingOf(merged);
const parts = [];
if (errors.length) parts.push(errors.map(e => e.msg).join('\n'));
const have = FIELDS.filter(f => !isBlank(merged[f]));
const noted = [...have.map(f => `${LABEL[f]}：${show(f, merged[f])}`), ...(merged.room_type ? [`包廂：${TYPE_NAME[merged.room_type]}`] : [])];
if (noted.length) parts.push('目前記下：\n' + noted.join('\n'));
const askHead = noted.length === 0 && errors.length === 0 ? '好的，請告訴我：' : '還需要：';
parts.push(askHead + '\n' + missing.map(f => `・${ASK[f]}`).join('\n'));
return finish(withAnswer({
  action: 'save_draft', intent: 'booking', has_question: hasQuestion,
  missing, errors: errors.map(e => e.code),
  draft_op: 'upsert', draft_next: draftRow(merged, missing.join(',')),
  reply: parts.join('\n\n'),
}));
