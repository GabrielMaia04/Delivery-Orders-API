// api/push-subscribe.js — Vercel Serverless Function
// Salva a subscription do dispositivo no Supabase

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subscription, user_id } = req.body;

  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'Subscription inválida' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Salvar ou atualizar subscription
  const { error } = await sb.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_id: user_id || null,
    ativo: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
