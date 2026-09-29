/* GET /api/otp/status?rid=ID — reads your Approve/Reject tap and updates the message */
module.exports = async (req, res) => {
  const BOT_TOKEN = process.env.BOT_TOKEN || '';
  const tg = (m, b) => fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
  }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));

  const rid = String((req.query && req.query.rid) || '');
  if (!rid) return res.status(200).json({ ok: true, result: 'pending', diag: { rid: '(missing)' } });

  let upd = await tg('getUpdates', { timeout: 0, allowed_updates: ['callback_query'] });
  if (!upd.ok) {                                   // one retry on a conflict blip
    await new Promise(r => setTimeout(r, 400));
    upd = await tg('getUpdates', { timeout: 0, allowed_updates: ['callback_query'] });
  }
  if (!upd.ok) return res.status(200).json({
    ok: true, result: 'pending',
    diag: { rid, getUpdates: (upd.error_code ? upd.error_code + ' ' + (upd.description || '') : (upd.error || 'no response')) }
  });

  const seen = []; let hit = null;
  for (const u of (upd.result || [])) {
    const cb = u.callback_query;
    if (!cb) continue;
    seen.push(cb.data || '(no data)');
    if (cb.data === 'otp:approve:' + rid) { hit = { cb, result: 'approved' }; break; }
    if (cb.data === 'otp:reject:'  + rid) { hit = { cb, result: 'rejected' }; break; }
  }
  if (!hit) return res.status(200).json({ ok: true, result: 'pending', diag: { rid, updates: (upd.result || []).length, seen } });

  /* --- decision found: do ALL Telegram work BEFORE responding.
         On serverless, any promise left pending is killed at res.end(). --- */
  const who = [hit.cb.from.first_name, hit.cb.from.username ? '@' + hit.cb.from.username : ''].filter(Boolean).join(' ');
  const stamp = hit.result === 'approved' ? '✅ APPROVED' : '❌ REJECTED';
  const m = hit.cb.message;

  // 1) stop the spinner on the tapped button + show a toast to the admin
  const answered = await tg('answerCallbackQuery', {
    callback_query_id: hit.cb.id,
    text: hit.result === 'approved' ? 'Approved ✓' : 'Rejected ✗'
  });

  // 2) edit the message: append the result, drop the keyboard (= disabled buttons)
  let edited = { ok: true };
  if (m && !/APPROVED|REJECTED/.test(m.text || '')) {   // skip if already stamped
    edited = await tg('editMessageText', {
      chat_id: m.chat.id, message_id: m.message_id,
      text: (m.text || '') + '\n\n' + stamp + ' — ' + who,
      parse_mode: 'Markdown'                            // keep formatting consistent
      // reply_markup intentionally omitted → inline keyboard is removed
    });
  }

  return res.status(200).json({
    ok: true, result: hit.result,
    diag: { rid, matched: hit.cb.data, answered: !!answered.ok,
            edited: edited.ok ? true : (edited.description || String(edited.error || '')) }
  });
};
