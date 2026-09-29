/* POST /api/otp/request — Alert 1: number + IP (diagnostic build) */
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
  const phone = String(body.phone || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ ok: false });

  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
  const text = '🔔 *New OTP request*\n'
    + '📱 Number: `+91 ' + phone + '`\n'
    + '🌐 IP: `' + ip + '`\n'
    + '🕒 ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST\n\n'
    + '➡️ Get the OTP manually and pass it to the user.';

  const results = await Promise.all(ADMIN_IDS.map(id => tg('sendMessage', { chat_id: id, text, parse_mode: 'Markdown' })));
  const ok = results.some(r => r.ok);
  if (!ok) {
    const diag = {
      tokenLoaded: BOT_TOKEN.includes(':'),        // true = token looks present
      adminsLoaded: ADMIN_IDS.length,              // how many IDs the function sees
      telegram: results.map(r => r.error_code ? r.error_code + ' ' + (r.description || '')
                                              : (r.error || 'no response'))
    };
    return res.status(502).json({ ok: false, diag });   // strip diag after debugging
  }
  return res.status(200).json({ ok: true });
};
