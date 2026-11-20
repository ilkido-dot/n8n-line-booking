// Seed Bookings：測試客滿用的佔位訂位（user_id＝TEST_SEED）
// 11/12 19:00 三間包廂都訂走（T19 用）；11/13 19:00 只訂走大包廂（T37 用）
const SEEDS = [
  ...['A', 'B', 'C'].map(room => ({ date: '2026-11-12', time: '19:00', room })),
  { date: '2026-11-13', time: '19:00', room: 'C' },
];
return SEEDS.map(s => ({ json: {
  user_id: 'TEST_SEED', ...s, people: 2, name: '測試佔位', phone: '0900000000', status: '待確認', is_test: true,
} }));
