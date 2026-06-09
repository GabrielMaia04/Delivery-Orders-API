module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || '';
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : String(req.headers['x-cron-secret'] || req.query?.secret || '');

  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Cron environment is not configured' });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error } = await supabase.rpc('resetar_estoque_datas');
    if (error) {
      console.error('[CRON ESTOQUE] RPC error:', error);
      return res.status(500).json({ error: 'Stock reset failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[CRON ESTOQUE] Unexpected error:', error);
    return res.status(500).json({ error: 'Stock reset failed' });
  }
};
