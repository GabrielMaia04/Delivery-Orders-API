function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = req.headers['x-webhook-secret'] || req.query?.secret;
  if (!process.env.SUPABASE_WEBHOOK_SECRET || token !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_EMAIL'
  ];
  if (required.some(key => !process.env[key])) {
    return res.status(500).json({ error: 'Push environment is not configured' });
  }

  try {
    const webpush = require('web-push');
    const { createClient } = require('@supabase/supabase-js');
    const payload = getBody(req);

    if (payload.type && payload.type !== 'INSERT') {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const pedido = payload.record || payload.new || payload;
    if (!pedido) {
      return res.status(400).json({ error: 'Payload invalido' });
    }

    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const nome = pedido.cliente_nome || 'Cliente';
    const total = pedido.total ? `R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}` : '';
    const codigo = pedido.codigo || (pedido.id ? `#${pedido.id}` : '');
    const mensagem = {
      title: `Novo pedido ${codigo}`.trim(),
      body: `${nome}${total ? ' - ' + total : ''}`,
      url: '/adm'
    };

    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: subs, error } = await sb
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('ativo', true);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!subs || subs.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }

    const results = await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        JSON.stringify(mensagem)
      ).catch(async err => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await sb.from('push_subscriptions').update({ ativo: false }).eq('id', sub.id);
        }
        throw err;
      })
    ));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return res.status(200).json({ ok: true, sent });
  } catch (err) {
    console.error('push-handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
