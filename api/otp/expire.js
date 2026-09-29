/* POST /api/otp/expire?rid=ID — admin note when the 120 s window passes */
module.exports = async (req, res) => {
  const BOT_TOKEN = process.env.BOT_TOKEN || '';
  const ADMIN_IDS = (process.env.ADMIN_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const tg = (m, b) => fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
  }).then(r => r.json()).catch(() => ({ ok: false }));

  const rid = String((req.query && req.query.rid) || '');
  if (rid) await Promise.all(ADMIN_IDS.map(id =>
    tg('sendMessage', { chat_id: id, text: '⌛ OTP request *' + rid + '* expired — no action within 120 s.', parse_mode: 'Markdown' })));
  return res.status(200).json({ ok: true });
};
