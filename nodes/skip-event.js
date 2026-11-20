// Skip Event：這個 webhook 事件已經處理過了（LINE 重送），不再處理，也不再回覆
const m = $('Current Message').first().json;
return [{ json: { ...m, action: 'skip_duplicate_event', intent: null, reply: null, push: null, missing: [], errors: [], booking: null } }];
