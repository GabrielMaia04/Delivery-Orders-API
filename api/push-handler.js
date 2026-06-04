// api/push-handler.js — Vercel Serverless Function
// Recebe webhook do Supabase e envia push para o admin

import webpush from 'web-push';

// Chaves VAPID — coloque nas Environment Variables do Vercel
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL   = process.env.VAPID_EMAIL;
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET;

webpush.setVapidDetails(
  `mailto:${VAPID_EMAIL}`,
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validar token secreto
  const token = req.headers['x-webhook-secret'] || req.query.secret;
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body;

    // Só dispara em INSERT (novo pedido)
    if (payload.type !== 'INSERT') {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const pedido = payload.record;
    const nome   = pedido.cliente_nome || 'Cliente';
    const total  = pedido.total ? `R$ ${Number(pedido.total).toFixed(2).replace('.', ',')}` : '';
    const codigo = pedido.codigo || `#${pedido.id}`;

    const mensagem = {
      title: `🛎️ Novo pedido! ${codigo}`,
      body: `${nome} — ${total}`
    };

    // Buscar subscriptions salvas no Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY // service_role key — só no servidor!
    );

    const { data: subs } = await sb
      .from('push_subscriptions')
      .select('*')
      .eq('ativo', true);

    if (!subs || subs.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }

    // Enviar push para cada subscription registrada
    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          JSON.stringify(mensagem)
        ).catch(async err => {
          // Subscription expirada — desativar
          if (err.statusCode === 410) {
            await sb.from('push_subscriptions').update({ ativo: false }).eq('id', sub.id);
          }
          throw err;
        })
      )
    );

    const enviados = results.filter(r => r.status === 'fulfilled').length;
    return res.status(200).json({ ok: true, sent: enviados });

  } catch (err) {
    console.error('push-handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
