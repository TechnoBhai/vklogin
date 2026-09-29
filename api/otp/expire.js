/* POST /api/otp/expire — stamps Alert 2 as EXPIRED (buttons removed).
   If the admin tapped in the final seconds, stamps that decision instead. */
module.exports = async (req, res) => {
  const BOT_TOKEN = process.env.BOT_TOKEN || '';
  const ADMIN_IDS = (process.env.ADMIN_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const tg = (m, b) => fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
  }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
  const readBody = () => new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });

  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await readBody();
  const rid = String(body.rid || '');
  const text = String(body.text || '');
  const msgs = Array.isArray(body.msgs) ? body.msgs.filter(m => m && m.chat && m.mid) : [];
  if (!rid) return res.status(400).json({ ok: false });

  /* final-seconds race: a tap queued between the last poll and now counts */
  const upd = await tg('getUpdates', { timeout: 0, allowed_updates: ['callback_query'] });
  let late = null;
  if (upd.ok) for (const u of (upd.result || [])) {
    const cb = u.callback_query;
    if (cb && (cb.data === 'otp:approve:' + rid || cb.data === 'otp:reject:' + rid)) { late = cb; break; }
  }
  if (late) {
    const yes = late.data.indexOf('approve') > -1;
    const who = [late.from.first_name, late.from.username ? '@' + late.from.username : ''].filter(Boolean).join(' ');
    if (late.message) await tg('editMessageText', {
      chat_id: late.message.chat.id, message_id: late.message.message_id,
      text: (late.message.text || '') + '\n\n' + (yes ? '✅ APPROVED' : '❌ REJECTED') + ' — ' + who,
      parse_mode: 'Markdown'
    });
    await tg('answerCallbackQuery', { callback_query_id: late.id, text: yes ? 'Approved ✓' : 'Rejected ✗' });
    return res.status(200).json({ ok: true, stamped: yes ? 'approved' : 'rejected' });
  }

  /* normal expiry: rebuild every copy with the stamp, keyboard removed */
  const results = await Promise.all(msgs.map(m => tg('editMessageText', {
    chat_id: m.chat, message_id: m.mid,
    text: (text ? text + '\n\n' : '') + '⌛ EXPIRED — no action within 120 s',
    parse_mode: 'Markdown'
  })));
  const edited = results.filter(r => r.ok).length;
  /* fallback: stale cached frontend (no msgs) → plain note so admins still hear it */
  if (!edited) await Promise.all(ADMIN_IDS.map(id =>
    tg('sendMessage', { chat_id: id, text: '⌛ OTP request *' + rid + '* expired — no action within 120 s.', parse_mode: 'Markdown' })));
  return res.status(200).json({ ok: true, stamped: 'expired', edited });
};
