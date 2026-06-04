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