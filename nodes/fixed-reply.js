// Fixed Reply：不是文字的訊息（貼圖、圖片）和剛加好友的事件，不用問 AI，直接回固定的話
const m = $('Current Message').first().json;
const GREETING = '您好，我是訂位小幫手。請告訴我日期、時間、人數、姓名和電話，例如：這週六晚上 7 點，6 位，王小明 0912345678\n\n已經訂好的位子，也可以跟我說「取消訂位」或「改期」。';
const reply = m.kind === 'follow' ? GREETING : '目前只看得懂文字訊息，請用文字告訴我訂位資料。';
return [{ json: { ...m, action: 'none', reply, push: null } }];
