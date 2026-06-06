function tokenValido(value) {
  return /^CTD-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(String(value || '').trim().toUpperCase());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = String(req.query?.token || '').trim().toUpperCase();
  if (!tokenValido(token)) return res.status(400).json({ error: 'Link de acompanhamento inválido.' });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Serviço de acompanhamento indisponível.' });

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('pedidos')
      .select('codigo,status,entrega,data_pedido,created_at')
      .eq('tracking_token', token)
      .maybeSingle();

    if (error) {
      console.error('[ACOMPANHAR PEDIDO] Supabase error:', error);
      return res.status(500).json({ error: 'Não foi possível consultar o pedido.' });
    }
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado.' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ pedido: data });
  } catch (error) {
    console.error('[ACOMPANHAR PEDIDO] Error:', error);
    return res.status(500).json({ error: 'Não foi possível consultar o pedido.' });
  }
};
