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

  const { createClient } = require('@supabase/supabase-js');
  const { subscription, user_id } = getBody(req);

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: 'Subscription invalida' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Push environment is not configured' });
  }

  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

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
};
