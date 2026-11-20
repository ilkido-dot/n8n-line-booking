// Restore Message：前面的資料表節點會把資料換成資料表的列，這裡換回目前這則訊息
return [{ json: $('Current Message').first().json }];
