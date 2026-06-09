function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body;
}

const FORBIDDEN_KEYS = new Set([
  'subtotal',
  'total',
  'taxa_entrega',
  'desconto',
  'preco_unitario',
  'estoque',
  'usos_restantes'
]);

function hasForbiddenFinancialField(value, path = []) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = hasForbiddenFinancialField(item, path);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    const normalized = key.toLowerCase();
    if (normalized === 'codigo') {
      const isAllowedCouponCode = path.length === 1 && path[0] === 'cupom';
      if (!isAllowedCouponCode) return key;
    }
    if (FORBIDDEN_KEYS.has(normalized)) return key;
    if (normalized === 'item_subtotal' || (normalized === 'subtotal' && key !== 'subtotal')) return key;
    const found = hasForbiddenFinancialField(value[key], [...path, normalized]);
    if (found) return found;
  }
  return null;
}

function normalizeTipo(tipo) {
  const value = String(tipo || '').trim().toLowerCase();
  if (value === 'entrega') return 'Entrega';
  if (value === 'retirada') return 'Retirada';
  return '';
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => allowed.has(key));
}

function perfilCompleto(profile) {
  const nome = String(profile?.nome || '').trim().split(/\s+/).filter(Boolean);
  const telefone = String(profile?.telefone || '').replace(/\D/g, '');
  return nome.length >= 2 && nome.join(' ').length >= 5 && telefone.length >= 10 && telefone.length <= 13;
}

function friendlyRpcError(message) {
  const text = String(message || '');
  const estoqueData = text.match(/Estoque disponivel para esta data:\s*(\d+)/i);
  if (estoqueData) return `Estoque dispon\u00edvel para esta data: ${estoqueData[1]} unidade(s).`;
  const known = new Map([
    ['Cupom invalido ou nao encontrado', 'Cupom inv\u00e1lido ou n\u00e3o encontrado.'],
    ['Cupom esgotado', 'Este cupom est\u00e1 esgotado.'],
    ['Este cupom e valido para pedidos acima de R$', 'Este cupom \u00e9 v\u00e1lido para pedidos acima do valor m\u00ednimo.'],
    ['Cupom de frete gratis valido apenas para entrega', 'Este cupom \u00e9 v\u00e1lido apenas para entrega.'],
    ['Voce ja utilizou este cupom', 'Voce ja utilizou este cupom.'],
    ['Produto nao encontrado', 'Um produto do carrinho n\u00e3o foi encontrado.'],
    ['Produto inativo', 'Um produto do carrinho n\u00e3o est\u00e1 mais dispon\u00edvel.'],
    ['Estoque insuficiente', 'Estoque insuficiente para um produto do carrinho.'],
    ['Essa data nao esta disponivel', 'Essa data n\u00e3o est\u00e1 dispon\u00edvel. Escolha outra data.'],
    ['Pedido minimo para entrega', 'O pedido n\u00e3o atingiu o valor m\u00ednimo para entrega.'],
    ['Endereco fora da area de entrega', 'Endere\u00e7o fora da \u00e1rea de entrega.'],
    ['Endereco fora das zonas de entrega', 'Endere\u00e7o fora das zonas de entrega.'],
    ['Carrinho vazio', 'Carrinho vazio.'],
    ['Dados do cliente incompletos', 'Preencha os dados do cliente.']
  ]);
  for (const [internal, friendly] of known) {
    if (text.includes(internal)) return friendly;
  }
  return 'N\u00e3o foi poss\u00edvel finalizar o pedido. Tente novamente.';
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodificarCEP(cep) {
  const cepLimpo = String(cep || '').replace(/\D/g, '');
  if (cepLimpo.length !== 8) return null;

  let via = null;
  try {
    const rv = await fetch('https://viacep.com.br/ws/' + cepLimpo + '/json/');
    via = await rv.json();
    if (via?.erro) via = null;
  } catch (_) {}

  try {
    const rb = await fetch('https://brasilapi.com.br/api/cep/v2/' + cepLimpo);
    if (rb.ok) {
      const db = await rb.json();
      const lat = db?.location?.coordinates?.latitude;
      const lng = db?.location?.coordinates?.longitude;
      if (lat && lng) return { lat: Number(lat), lng: Number(lng), via, estimated: false };
    }
  } catch (_) {}

  try {
    const nomUrl = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&postalcode=' + cepLimpo + '&country=Brazil';
    const rn = await fetch(nomUrl, { headers: { 'User-Agent': 'Cortadinhos/1.0' } });
    const dn = await rn.json();
    if (dn?.[0]?.lat && dn?.[0]?.lon) {
      return { lat: Number(dn[0].lat), lng: Number(dn[0].lon), via, estimated: false };
    }
  } catch (_) {}

  if (via?.bairro && via?.localidade) {
    try {
      const q = [via.bairro, via.localidade, via.uf, 'Brasil'].filter(Boolean).join(', ');
      const nomUrl2 = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(q);
      const rn2 = await fetch(nomUrl2, { headers: { 'User-Agent': 'Cortadinhos/1.0' } });
      const dn2 = await rn2.json();
      if (dn2?.[0]?.lat && dn2?.[0]?.lon) {
        return { lat: Number(dn2[0].lat), lng: Number(dn2[0].lon), via, estimated: true };
      }
    } catch (_) {}
  }

  return null;
}

function parseConfig(rows) {
  const out = {};
  for (const row of rows || []) out[row.chave] = row.valor;
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'Order environment is not configured' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Login obrigatorio para criar pedido' });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user?.id) return res.status(401).json({ error: 'Sessao invalida' });
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('nome,telefone')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('[CRIAR PEDIDO] Profile validation error:', profileError);
    return res.status(500).json({ error: 'Nao foi possivel validar o cadastro' });
  }
  if (!perfilCompleto(profile)) {
    return res.status(400).json({ error: 'Complete seu cadastro com nome e WhatsApp antes de finalizar.' });
  }

  const body = getBody(req);
  const forbidden = hasForbiddenFinancialField(body);
  if (forbidden) return res.status(400).json({ error: 'Campo financeiro nao permitido: ' + forbidden });
  if (!hasOnlyKeys(body, new Set(['cliente', 'entrega', 'itens', 'cupom', 'pagamento']))) {
    return res.status(400).json({ error: 'Payload contem campos nao permitidos' });
  }

  const cliente = body.cliente || {};
  const entrega = body.entrega || {};
  const itens = Array.isArray(body.itens) ? body.itens : [];
  const pagamento = body.pagamento || {};
  const tipo = normalizeTipo(entrega.tipo || entrega.entrega);
  if (!hasOnlyKeys(cliente, new Set(['nome', 'contato', 'observacoes', 'recebedor'])) ||
      !hasOnlyKeys(entrega, new Set(['tipo', 'entrega', 'data_pedido', 'cep', 'endereco', 'endereco_completo', 'rua', 'bairro', 'cidade', 'numero', 'complemento', 'local_retirada'])) ||
      !hasOnlyKeys(pagamento, new Set(['momento', 'metodo', 'label', 'troco'])) ||
      itens.some(item => !hasOnlyKeys(item, new Set(['produto_id', 'quantidade']))) ||
      (body.cupom && typeof body.cupom === 'object' && !hasOnlyKeys(body.cupom, new Set(['codigo'])))) {
    return res.status(400).json({ error: 'Payload contem campos nao permitidos' });
  }

  if (!tipo) return res.status(400).json({ error: 'Tipo de entrega invalido' });
  if (!entrega.data_pedido || !/^\d{4}-\d{2}-\d{2}$/.test(String(entrega.data_pedido))) {
    return res.status(400).json({ error: 'Data do pedido invalida' });
  }
  if (!cliente.nome || !cliente.contato) return res.status(400).json({ error: 'Dados do cliente incompletos' });
  if (!itens.length) return res.status(400).json({ error: 'Carrinho vazio' });

  const safeItens = itens.map(item => ({
    produto_id: item.produto_id,
    quantidade: Number(item.quantidade)
  }));
  if (safeItens.some(item => !item.produto_id || !Number.isInteger(item.quantidade) || item.quantidade <= 0)) {
    return res.status(400).json({ error: 'Itens invalidos' });
  }

  let deliveryCalc = {
    taxa_entrega: 0,
    distancia_km: null,
    zona_id: null,
    zona_nome: null,
    frete_estimado: false
  };

  if (tipo === 'Entrega') {
    const cep = String(entrega.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ error: 'CEP invalido' });

    const [{ data: cfgRows, error: cfgError }, { data: zonasRows, error: zonasError }] = await Promise.all([
      supabase.from('configuracoes').select('chave,valor'),
      supabase.from('zonas_entrega').select('*').eq('ativo', true).order('km_max')
    ]);
    if (cfgError) return res.status(500).json({ error: cfgError.message });
    if (zonasError) return res.status(500).json({ error: zonasError.message });

    const cfg = parseConfig(cfgRows);
    const lojaLat = Number(cfg.loja_lat);
    const lojaLng = Number(cfg.loja_lng);
    const raioMax = Number(cfg.raio_max || 5);

    if (!lojaLat || !lojaLng) {
      const primeiraZona = (zonasRows || [])[0];
      if (!primeiraZona) return res.status(400).json({ error: 'Frete nao configurado' });
      deliveryCalc = {
        taxa_entrega: Number(primeiraZona.taxa || 0),
        distancia_km: null,
        zona_id: primeiraZona.id || null,
        zona_nome: primeiraZona.nome || null,
        frete_estimado: true
      };
    } else {
      const geo = await geocodificarCEP(cep);
      if (!geo) return res.status(400).json({ error: 'Nao foi possivel validar o CEP' });
      const dist = haversine(lojaLat, lojaLng, geo.lat, geo.lng) * 1.35;
      if (dist > raioMax) return res.status(400).json({ error: 'Endereco fora da area de entrega' });
      const zona = (zonasRows || []).find(z => dist >= Number(z.km_min || 0) && dist <= Number(z.km_max || 0));
      if (!zona) return res.status(400).json({ error: 'Endereco fora das zonas de entrega' });
      deliveryCalc = {
        taxa_entrega: Number(zona.taxa || 0),
        distancia_km: Number(dist.toFixed(3)),
        zona_id: zona.id || null,
        zona_nome: zona.nome || null,
        frete_estimado: !!geo.estimated
      };
    }
  }

  const cupomCodigo = typeof body.cupom === 'string'
    ? body.cupom.trim()
    : String(body.cupom?.codigo || '').trim();

  const rpcArgs = {
    p_user_id: authData.user.id,
    p_cliente: cliente,
    p_entrega: { ...entrega, tipo },
    p_itens: safeItens,
    p_cupom: cupomCodigo || null,
    p_pagamento: pagamento,
    p_delivery_calc: deliveryCalc
  };

  const { data, error } = await supabase.rpc('criar_pedido_seguro', rpcArgs);
  if (error) {
    console.error('[CRIAR PEDIDO] RPC error:', error);
    return res.status(400).json({ error: friendlyRpcError(error.message) });
  }

  return res.status(200).json(data);
};
