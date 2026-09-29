/* POST /api/otp/status — finds your tap and stamps ALL Alert-2 copies */
module.exports = async (req, res) => {
  const BOT_TOKEN = process.env.BOT_TOKEN || '';
  const tg = (m, b) => fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
  }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) }));
  const readBody = () => new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });

  const body = req.method === 'POST' ? await readBody() : {};
  const rid = String(body.rid || (req.query && req.query.rid) || '');
  const text = String(body.text || '');
  const msgs = Array.isArray(body.msgs) ? body.msgs.filter(m => m && m.chat && m.mid) : [];
  if (!rid) return res.status(200).json({ ok: true, result: 'pending' });

  let upd = await tg('getUpdates', { timeout: 0, allowed_updates: ['callback_query'] });
  if (!upd.ok) { await new Promise(r => setTimeout(r, 400));
    upd = await tg('getUpdates', { timeout: 0, allowed_updates: ['callback_query'] }); }
  if (!upd.ok) return res.status(200).json({ ok: true, result: 'pending',
    diag: { getUpdates: (upd.error_code ? upd.error_code + ' ' + (upd.description || '') : (upd.error || 'no response')) } });

  let hit = null;
  for (const u of (upd.result || [])) {
    const cb = u.callback_query;
    if (!cb) continue;
    if (cb.data === 'otp:approve:' + rid) { hit = { cb, result: 'approved' }; break; }
    if (cb.data === 'otp:reject:'  + rid) { hit = { cb, result: 'rejected' }; break; }
  }
  if (!hit) return res.status(200).json({ ok: true, result: 'pending' });

  /* everything awaited BEFORE responding — serverless kills pending promises */
  const who = [hit.cb.from.first_name, hit.cb.from.username ? '@' + hit.cb.from.username : ''].filter(Boolean).join(' ');
  const stamp = '\n\n' + (hit.result === 'approved' ? '✅ APPROVED' : '❌ REJECTED') + ' — ' + who;

  const answered = await tg('answerCallbackQuery', { callback_query_id: hit.cb.id,
    text: hit.result === 'approved' ? 'Approved ✓' : 'Rejected ✗' });

  /* stamp every copy; strip any previous stamp so re-processing is idempotent */
  const base = ((hit.cb.message && hit.cb.message.text) || text)
    .replace(/\n\n(✅ APPROVED|❌ REJECTED|⌛ EXPIRED)[\s\S]*$/, '');
  const targets = msgs.length ? msgs
    : (hit.cb.message ? [{ chat: hit.cb.message.chat.id, mid: hit.cb.message.message_id }] : []);
  const edits = await Promise.all(targets.map(m => tg('editMessageText', {
    chat_id: m.chat, message_id: m.mid, text: base + stamp, parse_mode: 'Markdown'
  }).then(r => (r.ok || /not modified/.test(r.description || '')) ? { ok: true } : r)));

  return res.status(200).json({ ok: true, result: hit.result,
    diag: { rid, answered: !!answered.ok,
            edited: edits.map(e => e.ok ? true : (e.description || String(e.error || ''))) } });
};
