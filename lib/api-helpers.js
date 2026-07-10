// API 錯誤訊息淨化：server 永遠保留 trace；正式環境不外露絕對路徑 / raw SQLite 訊息。
// 用法（route catch）：NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 })
function safeErrorMessage(err, fallback = '處理時發生錯誤，請稍後再試。') {
  console.error(err);
  if (process.env.NODE_ENV === 'development') {
    return String((err && err.message) || err);
  }
  return fallback;
}

module.exports = { safeErrorMessage };
