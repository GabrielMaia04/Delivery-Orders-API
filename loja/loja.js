const CONFIG = window.CONFIG;
const IMG_BASE = CONFIG.IMG_BASE;
const WHATSAPP_NUM = CONFIG.WHATSAPP_NUMBER;
const sb = window.sb;
const PIX_CHAVE = CONFIG.PIX_CHAVE || '';
const PIX_NOME = CONFIG.PIX_NOME || '';
const PIX_CIDADE = CONFIG.PIX_CIDADE || '';

let TAXA=2.50;
let PEDIDO_MIN=0;
let LOJA_LAT=null;
let _freteCalculado=false; // true somente após calcular CEP no carrinho // Latitude da loja (configurado no painel)
let LOJA_LNG=null; // Longitude da loja
let LOJA_ENDERECO=''; // Endereço da loja para geocoding
let RAIO_MAX=5; // Raio máximo de entrega em km
let zonas=[];
let datasBloqueadas=[];
let INSTAGRAM_URL='https://instagram.com';
let WPP_MSG_TEMPLATE=''; // vazio = usa padrão do código
const PER=15;


let perfil=null,cats=[],prods=[];
let cart={itens:[],entrega:'Entrega'};
let ap={itens:[],entrega:'Entrega'};
let apSel=null;
let fCatShop=null,fCatAdm=null,fCatP=null;
let rPage=1,rTotal=0,rCache=[];

const fp=v=>typeof v==='number'?v.toFixed(2).replace('.',','):'0,00';
const fd=d=>d?d.split('-').reverse().join('/'):'';
// Exibe "Terça, 20/mai" para datas de entrega
function fdLabel(iso){
  if(!iso)return'';
  const [y,m,d]=iso.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  return DIAS_NOME_LONG[dt.getDay()]+', '+String(d).padStart(2,'0')+'/'+MESES[m-1];
}
/* ── DATAS DE ENTREGA ──
   Produção: Segunda(1), Quinta(4), Sexta(5)
   Entrega:  Terça(2) → Segunda | Sábado(6) → Quinta+Sexta
   Regras: sem entrega no mesmo dia, sem datas passadas           */
const DIAS_NOME_LONG=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function toISO(dt){return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')}
const hoje=()=>new Date().toISOString().split('T')[0];
const ini=n=>n?n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase():'?';
const emoji=p=>p.emoji||'\u{1F966}';
const lucideIcon=(name,cls='')=>`<i data-lucide="${name}"${cls?` class="${cls}"`:''}></i>`;
function refreshIcons(){if(window.lucide)window.lucide.createIcons()}

function mascaraCep(el){
  let v=el.value.replace(/\D/g,'');
  if(v.length>5)v=v.slice(0,5)+'-'+v.slice(5,8);
  el.value=v;
}
function mascaraTel(el){
  let v=el.value.replace(/\D/g,'');
  if(v.length>11)v=v.slice(0,11);
  if(v.length>6)v='('+v.slice(0,2)+') '+v.slice(2,7)+'-'+v.slice(7);
  else if(v.length>2)v='('+v.slice(0,2)+') '+v.slice(2);
  else if(v.length>0)v='('+v;
  el.value=v;
}
async function buscarCep(){
  const cep=document.getElementById('co-cep').value.replace(/\D/g,'');
  if(cep.length!==8)return;
  const spin=document.getElementById('co-cep-spin');
  spin.classList.remove('hidden');
  try{
    const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');
    const d=await r.json();
    if(d.erro){toast('CEP não encontrado.','err');spin.classList.add('hidden');return}
    document.getElementById('co-rua').value=d.logradouro||'';
    document.getElementById('co-bairro').value=d.bairro||'';
    document.getElementById('co-cidade').value=(d.localidade||'')+' / '+(d.uf||'');
    document.getElementById('co-end').value=(d.logradouro||'')+', '+(d.bairro||'')+' - '+(d.localidade||'')+'/'+d.uf;
    document.getElementById('co-end-fields').classList.remove('hidden');
    document.getElementById('co-num').focus();
    // Verificar zona de entrega automaticamente após preencher CEP
    setTimeout(verificarZonaEntrega, 500);
  }catch(e){toast('Erro ao buscar CEP.','err')}
  spin.classList.add('hidden');
}

async function buscarCepPerfil(){
  const cep=document.getElementById('p-cep-edit').value.replace(/\D/g,'');
  if(cep.length!==8)return;
  const spin=document.getElementById('p-cep-spin');
  spin.classList.remove('hidden');
  try{
    const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');
    const d=await r.json();
    if(d.erro){toast('CEP não encontrado.','err');spin.classList.add('hidden');return}
    document.getElementById('p-rua-edit').value=d.logradouro||'';
    document.getElementById('p-bairro-edit').value=d.bairro||'';
    document.getElementById('p-cidade-edit').value=(d.localidade||'')+' / '+(d.uf||'');
  }catch(e){toast('Erro ao buscar CEP.','err')}
  spin.classList.add('hidden');
}


function abrirPerfil(){
  if(!perfil)return;
  document.getElementById('p-nome-edit').value=perfil.nome||'';
  document.getElementById('p-tel-edit').value=perfil.telefone||'';
  document.getElementById('p-tel-edit').readOnly=true;
  document.getElementById('p-tel-edit').style.background='var(--bg4)';
  document.getElementById('p-tel-save').classList.add('hidden');
  document.getElementById('p-cep-edit').value=perfil.cep||'';
  document.getElementById('p-rua-edit').value=perfil.endereco||'';
  document.getElementById('p-bairro-edit').value=perfil.bairro||'';
  document.getElementById('p-cidade-edit').value=perfil.cidade||'';
  document.getElementById('p-num-edit').value=perfil.endereco_num||'';
  if(perfil.endereco)document.getElementById('p-end-fields').classList.remove('hidden');
  document.getElementById('perfil-title').textContent=perfil.nome.split(' ')[0];
  switchPerfilTab('dados');
  setOverlayState('perfil-ov', true);
}
function alterarTelefone(){
  const el=document.getElementById('p-tel-edit');
  el.readOnly=false;el.style.background='';el.focus();el.select();
  document.getElementById('p-tel-save').classList.remove('hidden');
  document.getElementById('p-tel-save').style.display='flex';
}
function cancelarAlterarTel(){
  const el=document.getElementById('p-tel-edit');
  el.value=perfil.telefone||'';
  el.readOnly=true;el.style.background='var(--bg4)';
  document.getElementById('p-tel-save').classList.add('hidden');
}
async function salvarTelefone(){
  const tel=document.getElementById('p-tel-edit').value.trim();
  if(tel.length<14){toast('Informe um telefone válido.','err');return}
  const {error}=await sb.from('profiles').update({telefone:tel}).eq('id',perfil.id);
  if(error){toast('Erro: '+error.message,'err');return}
  perfil.telefone=tel;
  cancelarAlterarTel();
  showMsg(document.getElementById('perfil-msg'),'Telefone atualizado!','success');
}
function fecharPerfil(){setOverlayState('perfil-ov',false)}
function fecharPerfilOv(e){if(e.target===document.getElementById('perfil-ov'))fecharPerfil()}
function switchPerfilTab(t){
  document.querySelectorAll('#perfil-ov .auth-tab').forEach((b,i)=>b.classList.toggle('active',(t==='dados'&&i===0)||(t==='historico'&&i===1)));
  document.getElementById('ptab-dados').classList.toggle('hidden',t!=='dados');
  document.getElementById('ptab-historico').classList.toggle('hidden',t!=='historico');
  if(t==='historico')carregarHistoricoCliente();
}

async function salvarPerfil(){
  const msg=document.getElementById('perfil-msg');
  const dados={
    cep:document.getElementById('p-cep-edit').value,
    endereco:document.getElementById('p-rua-edit').value,
    bairro:document.getElementById('p-bairro-edit').value,
    cidade:document.getElementById('p-cidade-edit').value,
    endereco_num:document.getElementById('p-num-edit').value,
  };
  const {error}=await sb.from('profiles').update(dados).eq('id',perfil.id);
  if(error){showMsg(msg,'Erro ao salvar: '+error.message,'error');return}
  Object.assign(perfil,dados);
  showMsg(msg,'Endereco salvo com sucesso!','success');
}

async function carregarHistoricoCliente(){
  const el=document.getElementById('p-hist-list');
  const loading=document.getElementById('p-hist-loading');
  loading.classList.remove('hidden');el.innerHTML='';
  const {data:peds}=await sb.from('pedidos').select('*,itens_pedido(*)').eq('user_id',perfil.id).order('created_at',{ascending:false});  loading.classList.add('hidden');
  const lista=peds||[];
  if(!lista.length){el.innerHTML='<div class="empty">Nenhum pedido ainda.</div>';return}
  el.innerHTML=lista.map(p=>{
    const its=(p.itens_pedido||[]).map(it=>it.quantidade+'x '+it.nome_produto).join(', ');
    const statusColor={'Pendente':'var(--orange)','Em preparo':'#3b82f6','Saiu para entrega':'#8b5cf6','Entregue':'var(--green-bright)','Cancelado':'var(--red)'}[p.status]||'var(--text2)';
    return`<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.04em">Entrega</div>
          <div style="font-size:13px;font-weight:700">${fdLabel(p.data_pedido)}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${its}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div style="font-size:14px;font-weight:800;color:var(--green-bright)">R$ ${fp(p.total)}</div>
          <div style="font-size:11px;font-weight:700;color:${statusColor}">${p.status||'Pendente'}</div>
          <button class="btn btn-o btn-sm" onclick="verPedCliente(${p.id})">Ver</button>
        </div>
      </div>
    </div>`;
  }).join('');
  // Cache dos pedidos do cliente para o modal
  window._histCache=lista;
}

// ── TIMELINE DE STATUS ──
// Versão correta da timeline com linhas de progresso
function buildTimelineHtml(status){
  const STEPS=[
    {key:'Pendente',         label:'Confirmado',        icon:'clock'},
    {key:'Em preparo',       label:'Em preparo',         icon:'package'},
    {key:'Saiu para entrega',label:'Saiu para entrega',  icon:'truck'},
    {key:'Entregue',         label:'Entregue',           icon:'circle-check-big'}
  ];
  const ORDER=STEPS.map(s=>s.key);
  const curIdx=ORDER.indexOf(status);
  const cancelado=status==='Cancelado';

  if(cancelado){
    return'<div style="display:flex;align-items:center;justify-content:center;padding:14px 0;gap:8px;background:var(--red-soft);border-radius:10px;border:1px solid var(--red)">'
      +'<i data-lucide="x-circle" style="width:18px;height:18px;color:var(--red)"></i>'
      +'<span style="font-size:13px;font-weight:700;color:var(--red)">Pedido Cancelado</span>'
      +'</div>';
  }

  let html='<div style="display:flex;align-items:flex-start;padding:16px 0;position:relative">'
    +'<div style="position:absolute;top:18px;left:calc(12.5% + 18px);right:calc(12.5% + 18px);height:2px;background:var(--border);z-index:0"></div>';

  // Linha de progresso verde
  const pct=curIdx/(STEPS.length-1)*100;
  html+='<div style="position:absolute;top:18px;left:calc(12.5% + 18px);right:calc(12.5% + 18px);height:2px;z-index:1;overflow:hidden;border-radius:2px">'
    +'<div style="height:100%;width:'+pct+'%;background:var(--green);transition:width .4s"></div>'
    +'</div>';

  STEPS.forEach((s,i)=>{
    const done=i<curIdx;
    const cur=i===curIdx;
    const dotBg=done?'var(--green)':cur?'var(--green-light)':'var(--bg2)';
    const dotBorder=done||cur?'var(--green-bright)':'var(--border)';
    const iconColor=done?'#fff':cur?'var(--green-bright)':'var(--text3)';
    const lblColor=done||cur?'var(--green-bright)':'var(--text3)';
    const lblWeight=cur?'800':'500';
    const shadow=cur?';box-shadow:0 0 0 4px rgba(45,140,78,.15)':'';
    html+='<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;position:relative;z-index:2">'
      +'<div style="width:36px;height:36px;border-radius:50%;border:2px solid '+dotBorder+';background:'+dotBg+';display:flex;align-items:center;justify-content:center'+shadow+'">'
      +'<i data-lucide="'+s.icon+'" style="width:16px;height:16px;color:'+iconColor+'"></i>'
      +'</div>'
      +'<div style="font-size:10px;font-weight:'+lblWeight+';color:'+lblColor+';text-align:center;line-height:1.3;max-width:64px">'+s.label+'</div>'
      +'</div>';
  });
  html+='</div>';
  return html;
}

function verPedCliente(id){
  const lista=window._histCache||[];
  const p=lista.find(x=>x.id===id);if(!p)return;
  const status=p.status||'Pendente';
  const statusColor={'Pendente':'var(--orange)','Em preparo':'#3b82f6','Saiu para entrega':'#8b5cf6','Entregue':'var(--green-bright)','Cancelado':'var(--red)'}[status]||'var(--text2)';
  const end=[p.cliente_endereco,p.cliente_numero].filter(Boolean).join(', no ');
  // Monta corpo
  const its=(p.itens_pedido||[]).map(it=>`
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span>${it.quantidade}x ${it.nome_produto}${it.peso_produto?' ('+it.peso_produto+')':''}</span>
      <span style="font-weight:700;color:var(--green-bright)">R$ ${fp(it.subtotal)}</span>
    </div>`).join('');
  const taxa=p.taxa_entrega>0?`<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:12px;color:var(--orange)"><span>Taxa de entrega</span><span style="font-weight:700">R$ ${fp(p.taxa_entrega)}</span></div>`:'';
  const total=`<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;font-weight:800;border-top:2px solid var(--border);margin-top:2px"><span>Total</span><span style="color:var(--green-bright)">R$ ${fp(p.total)}</span></div>`;
  document.getElementById('ped-det-codigo').textContent='Pedido '+(p.codigo||'#'+p.id);
  document.getElementById('ped-det-status').innerHTML=
    buildTimelineHtml(status)
    +`<div style="text-align:center;font-size:11px;color:var(--text3);margin-top:4px">Entrega: ${fdLabel(p.data_pedido)}</div>`;
  document.getElementById('ped-det-body').innerHTML=`
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">
      ${end?`<div class="ico-gap">${lucideIcon('map-pin')} ${end}</div>`:''}
      <div class="ico-gap">${lucideIcon('credit-card')} ${p.pagamento} · ${p.entrega==='Entrega'?'Entrega':'Retirada'}</div>
      ${p.observacoes?`<div class="ico-gap">${lucideIcon('notebook-pen')} ${p.observacoes}</div>`:''}
    </div>
    <div>${its}${taxa}${total}</div>`;
  // Botões conforme status
  const btns=document.getElementById('ped-det-btns');
  if(status==='Pendente'){
    btns.innerHTML=`<button class="btn btn-r" style="width:100%;padding:11px" onclick="cancelarPedidoCliente(${id})">Cancelar pedido</button>`;
  }else if(status==='Em preparo'){
    btns.innerHTML=`<button class="btn btn-r" style="width:100%;padding:11px" onclick="solicitarCancelamento(${id},'${p.codigo||''}')">Solicitar cancelamento via WhatsApp</button>`;
  }else{
    btns.innerHTML='';
  }
  const _pdm=document.getElementById('ped-det-modal');
  document.body.appendChild(_pdm);
  _pdm.removeAttribute('inert');
  _pdm.style.display='flex';
  _pdm.classList.add('open');
  refreshIcons();
}

async function cancelarPedidoCliente(id){
  popConfirm('❌','Cancelar pedido?','Tem certeza que deseja cancelar este pedido?','Sim, cancelar','pbtn-danger',async()=>{
    const {error}=await sb.from('pedidos').update({status:'Cancelado'}).eq('id',id);
    if(error){toast('Erro ao cancelar.','err');return}
    document.getElementById('ped-det-modal').classList.remove('open');
    toast('Pedido cancelado.','ok');
    carregarHistoricoCliente();
  });
}

function solicitarCancelamento(id,codigo){
  const num=codigo||('#'+id);
  const msg=`Olá! Tudo bem?\n\nGostaria de solicitar o cancelamento do meu pedido, por favor.\nNúmero do pedido: ${num}.`;
  window.open('https://wa.me/'+WHATSAPP_NUM+'?text='+encodeURIComponent(msg),'_blank');
}


// ── NOTIFICACOES REALTIME ──

function haversine(lat1,lng1,lat2,lng2){
  const R=6371;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)
    +Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)
    *Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// Geocodificar endereço via Nominatim (OpenStreetMap) — gratuito, sem API key
async function geocodificar(endereco){
  try{
    // Tenta busca direta
    const url='https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=br&q='+encodeURIComponent(endereco);
    const r=await fetch(url,{headers:{'Accept-Language':'pt-BR','User-Agent':'HortifrutiApp/1.0'}});
    const d=await r.json();
    if(!d.length)return null;
    // Prefere resultado com maior importância
    d.sort((a,b)=>(b.importance||0)-(a.importance||0));
    return{lat:parseFloat(d[0].lat),lng:parseFloat(d[0].lon),display:d[0].display_name};
  }catch(e){return null}
}

async function geocodificarCEP(cep){
  const cepLimpo = cep.replace(/\D/g,'');
  try{
    // 1. ViaCEP para dados do endereço (nome da rua, bairro, cidade)
    const rv = await fetch('https://viacep.com.br/ws/'+cepLimpo+'/json/');
    const dv = await rv.json();
    if(dv.erro) return null;

    // 2. BrasilAPI v2 — retorna centroide do polígono do CEP (mais preciso)
    try{
      const rb = await fetch('https://brasilapi.com.br/api/cep/v2/'+cepLimpo);
      if(rb.ok){
        const db = await rb.json();
        if(db.location?.coordinates?.latitude){
          return {lat:db.location.coordinates.latitude, lng:db.location.coordinates.longitude, viacep:dv};
        }
      }
    }catch(e2){}

    // 3. Nominatim buscando por POSTALCODE (mais preciso que busca por rua)
    try{
      const nomUrl = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&postalcode='+cepLimpo+'&country=Brazil';
      const rn = await fetch(nomUrl, {headers:{'User-Agent':'Cortadinhos/1.0'}});
      if(rn.ok){
        const dn = await rn.json();
        if(dn[0]){
          return {lat:parseFloat(dn[0].lat), lng:parseFloat(dn[0].lon), viacep:dv};
        }
      }
    }catch(e3){}

    // 4. Nominatim fallback por bairro + cidade (NÃO por rua — evita resultados errados)
    try{
      const q = (dv.bairro?dv.bairro+', ':'')+dv.localidade+', '+dv.uf+', Brasil';
      const nomUrl2 = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q='+encodeURIComponent(q);
      const rn2 = await fetch(nomUrl2, {headers:{'User-Agent':'Cortadinhos/1.0'}});
      if(rn2.ok){
        const dn2 = await rn2.json();
        if(dn2[0]){
          return {lat:parseFloat(dn2[0].lat), lng:parseFloat(dn2[0].lon), viacep:dv};
        }
      }
    }catch(e4){}

    return null;
  }catch(e){return null}
}


// Calcular zona do cliente baseado na distância
function calcularZona(distKm){
  if(!zonas.length)return null;
  const ativos=zonas.filter(z=>z.ativo);
  return ativos.find(z=>distKm>=z.km_min&&distKm<=z.km_max)||null;
}

// Carregar zonas do banco
async function carregarZonas(){
  const {data}=await sb.from('zonas_entrega').select('*').eq('ativo',true).order('km_max');
  zonas=data||[];
}

async function carregarDatasBloqueadas(){
  try{
    const {data,error}=await sb.from('datas_bloqueadas')
      .select('data,tipo,motivo')
      .eq('ativo',true);
    if(error)throw error;
    datasBloqueadas=(data||[]).map(d=>({
      data:String(d.data||'').slice(0,10),
      tipo:(d.tipo||'ambos').toLowerCase(),
      motivo:d.motivo||''
    })).filter(d=>d.data);
  }catch(e){
    console.warn('Datas bloqueadas indisponiveis:',e?.message||e);
    datasBloqueadas=[];
  }
}

function dataBloqueada(iso,modalidade){
  if(!iso)return null;
  const tipo=(modalidade==='Retirada'||modalidade==='retirada')?'retirada':'entrega';
  return datasBloqueadas.find(d=>d.data===iso&&(d.tipo==='ambos'||d.tipo===tipo))||null;
}

// Verificar distância e aplicar taxa no checkout
let _clienteLat=null,_clienteLng=null,_zonaAtiva=null;

async function verificarZonaEntrega(){
  const el=document.getElementById('co-zona-info');
  if(!el)return;

  if(!LOJA_LAT||!LOJA_LNG){
    el.style.display='none';
    return;
  }
  const endCliente=document.getElementById('co-end').value.trim();
  const numCliente=document.getElementById('co-num').value.trim();
  if(!endCliente){el.style.display='none';return}

  el.innerHTML='<div style="color:var(--text2);font-size:12px">📍 Calculando distância...</div>';
  el.style.display='block';

  const endFull=endCliente+(numCliente?', '+numCliente:'')+', Rio de Janeiro';
  const coords=await geocodificar(endFull);
  if(!coords){
    el.innerHTML='<div style="color:var(--orange);font-size:12px">⚠️ Não foi possível calcular a distância. Prossiga normalmente.</div>';
    _zonaAtiva=null;
    return;
  }
  _clienteLat=coords.lat;_clienteLng=coords.lng;
  const dist=await distanciaRota(LOJA_LAT,LOJA_LNG,coords.lat,coords.lng);
  const zona=calcularZona(dist);

  if(dist>RAIO_MAX){
    el.innerHTML='<div style="padding:10px;border-radius:10px;background:var(--red-soft);border:1px solid var(--red);color:var(--red);font-size:12px;font-weight:700">'
      +'🚫 Fora do raio de entrega ('+dist.toFixed(1)+'km). Máximo: '+RAIO_MAX+'km.<br>'
      +'<span style="font-weight:400">Escolha Retirada ou adicione um endereço mais próximo.</span></div>';
    _zonaAtiva=null;
    updCoResumo();
    return;
  }

  if(zona){
    TAXA=zona.taxa;
    _zonaAtiva=zona;
    el.innerHTML='<div style="padding:10px;border-radius:10px;background:var(--green-light);border:1px solid var(--green-mid);font-size:12px">'
      +'<div style="font-weight:700;color:var(--green-bright)">✅ '+zona.nome+'</div>'
      +'<div style="color:var(--text2);margin-top:2px">Distância: '+dist.toFixed(1)+'km · Taxa de entrega: R$ '+fp(zona.taxa)+'</div></div>';
  }else{
    el.innerHTML='<div style="padding:10px;border-radius:10px;background:var(--orange-soft);border:1px solid var(--orange);font-size:12px;color:var(--orange);font-weight:700">'
      +'⚠️ '+dist.toFixed(1)+'km — fora das zonas configuradas. Verifique com o admin.</div>';
    _zonaAtiva=null;
  }
  updCoResumo();
}

// Salvar endereço da loja

async function carregarConfigLoja(configs){
  configs.forEach(r=>{
    if(r.chave==='loja_lat')LOJA_LAT=parseFloat(r.valor)||null;
    if(r.chave==='loja_lng')LOJA_LNG=parseFloat(r.valor)||null;
    if(r.chave==='loja_endereco')LOJA_ENDERECO=r.valor||'';
    if(r.chave==='raio_max')RAIO_MAX=parseFloat(r.valor)||5;
  });
}

async function carregarTaxaRemota(){
  try{
    const {data}=await sb.from('configuracoes').select('chave,valor');
    if(!data)return;
    await carregarConfigLoja(data);
    data.forEach(r=>{
      if(r.chave==='taxa_entrega')TAXA=parseFloat(r.valor)||TAXA;
      if(r.chave==='pedido_minimo')PEDIDO_MIN=parseFloat(r.valor)||0;
      if(r.chave==='whatsapp_num')window._WHATSAPP_NUM_DB=r.valor;
      if(r.chave==='instagram_url')INSTAGRAM_URL=r.valor;
      if(r.chave==='wpp_msg_template')WPP_MSG_TEMPLATE=r.valor;
    });
    const wppBtn=document.querySelector('.dd-icon-btn.wpp');
    if(wppBtn&&window._WHATSAPP_NUM_DB)wppBtn.setAttribute('onclick',`fecharDropdown();window.open('https://wa.me/${window._WHATSAPP_NUM_DB}','_blank')`);
    const igBtn=document.querySelector('.dd-icon-btn.ig');
    if(igBtn&&INSTAGRAM_URL)igBtn.setAttribute('onclick',`fecharDropdown();window.open('${INSTAGRAM_URL}','_blank')`);
  }catch(e){}
}

async function init(){
  carregarTaxaRemota();
  carregarZonas();
  await carregarDatasBloqueadas();
  // r-data intencionalmente em branco — relatório começa sem filtro de data

  // Verifica sessao primeiro, depois carrega catalogo
  const {data:{session}}=await sb.auth.getSession();
  if(session?.user) await loadProfile(session.user.id,session.user);

  await loadCatalog();
  renderShopCats();renderShop();
}

async function loadCatalog(){
  try{
    const [c,p]=await Promise.all([
      sb.from('categorias').select('*').order('nome'),
      sb.from('produtos').select('*').order('nome')
    ]);
    cats=c.data||[];prods=p.data||[];
    // Se nao carregou, tenta novamente em 2s
    if(!cats.length && !prods.length){
      setTimeout(async()=>{
        const [c2,p2]=await Promise.all([
          sb.from('categorias').select('*').order('nome'),
          sb.from('produtos').select('*').order('nome')
        ]);
        if(c2.data?.length||p2.data?.length){
          cats=c2.data||[];prods=p2.data||[];
          renderShopCats();renderShop();
        }
      },2000);
    }
  }catch(e){
    console.error('Erro ao carregar catalogo:',e);
    // Tenta novamente em 3s
    setTimeout(()=>loadCatalog().then(()=>{renderShopCats();renderShop()}),3000);
  }
}

async function loadProfile(uid,user){
  try{
    let {data}=await sb.from('profiles').select('*').eq('id',uid).single();
    if(!data){
      const nome=user?.user_metadata?.nome||user?.email?.split('@')[0]||'Usuario';
      const {data:n,error}=await sb.from('profiles').insert({id:uid,nome,role:'cliente'}).select().single();
      if(error)throw error;
      data=n;
    }
    perfil=data;
    const pn=perfil.nome.split(' ')[0];
    document.getElementById('topbar-login').classList.add('logged');
    const ddL=document.getElementById('dd-logado');if(ddL)ddL.style.display='block';
    const ddD=document.getElementById('dd-deslogado');if(ddD)ddD.style.display='none';
    document.getElementById('hero-msg').textContent='Ola, '+pn+'!';
    const ddAdmin=document.getElementById('dd-admin');
    if(ddAdmin) ddAdmin.style.display=perfil.role==='admin'?'flex':'none';

  }catch(e){console.error('loadProfile:',e)}
}


// ── DROPDOWN MENU ──
function toggleDropdown(){
  if(!perfil){abrirAuth();return}
  const dd=document.getElementById('user-dropdown');
  dd.classList.toggle('hidden');
}
function fecharDropdown(){
  document.getElementById('user-dropdown').classList.add('hidden');
}
function abrirPerfilTab(tab){
  abrirPerfil();
  switchPerfilTab(tab);
}
// Fechar dropdown ao clicar fora
document.addEventListener('click',function(e){
  const wrap=document.querySelector('.dropdown-wrap');
  if(wrap&&!wrap.contains(e.target)){fecharDropdown();}
});
function setOverlayState(id,open){
  const el=document.getElementById(id);
  if(!el)return;
  if(open){
    document.body.appendChild(el);
    el.removeAttribute('aria-hidden');
    el.removeAttribute('inert');
    el.style.display='flex';
    el.classList.add('open');
  }else{
    const f=el.querySelector(':focus');if(f)f.blur();
    el.classList.remove('open');
    el.style.display='none';
    el.setAttribute('inert',''); // inert impede foco sem aviso de aria-hidden
    el.removeAttribute('aria-hidden');
  }
}
function abrirAuth(){setOverlayState('auth-ov',true)}
function fecharAuth(){setOverlayState('auth-ov',false)}
function fecharAuthOv(e){if(e.target===document.getElementById('auth-ov'))fecharAuth()}
function switchTab(t){
  document.querySelectorAll('.auth-tab').forEach((b,i)=>b.classList.toggle('active',(t==='login'&&i===0)||(t==='register'&&i===1)));
  document.getElementById('t-login').classList.toggle('hidden',t!=='login');
  document.getElementById('t-reg').classList.toggle('hidden',t!=='register');
}

async function fazerLogin(){
  const btn=document.getElementById('login-btn');
  const msg=document.getElementById('login-msg');
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  if(!email||!pass){showMsg(msg,'Preencha email e senha.','error');return}
  btn.disabled=true;btn.textContent='Entrando...';
  const to=setTimeout(()=>{btn.disabled=false;btn.textContent='Entrar';showMsg(msg,'Conexao demorou. Tente novamente.','error')},10000);
  const salvar=document.getElementById('salvar-login')?.checked!==false;
  const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
  clearTimeout(to);
  if(error){btn.disabled=false;btn.textContent='Entrar';showMsg(msg,tErr(error.message),'error');return}
  if(data?.user){
    await loadProfile(data.user.id,data.user);
    btn.disabled=false;btn.textContent='Entrar';
    fecharAuth();
    if(window._coPend){window._coPend=false;abrirCo3()}
    else if(perfil?.role==='admin') window.location.href='/adm';
  }
}

async function fazerCadastro(){
  const btn=document.getElementById('reg-btn');
  const msg=document.getElementById('reg-msg');
  const nome=document.getElementById('reg-nome').value.trim();
  const tel=document.getElementById('reg-tel').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-pass').value;
  const pass2=document.getElementById('reg-pass2').value;
  const aceitou=document.getElementById('aceito-termos')?.checked;
  if(!aceitou){showMsg(msg,'Você precisa aceitar os Termos de Uso para criar uma conta.','error');return}
  if(!nome||!tel||!email||!pass){showMsg(msg,'Preencha todos os campos obrigatorios.','error');return}
  if(tel.length<14){showMsg(msg,'Informe um telefone valido.','error');return}
  if(pass!==pass2){showMsg(msg,'Senhas nao coincidem.','error');return}
  if(pass.length<6){showMsg(msg,'Senha minima 6 caracteres.','error');return}
  btn.disabled=true;btn.textContent='Criando...';
  const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{nome}}});
  btn.disabled=false;btn.textContent='Criar conta';
  if(error){showMsg(msg,tErr(error.message),'error');return}
  if(data?.user){
    await loadProfile(data.user.id,data.user);
    // Salvar telefone imediatamente
    if(perfil){
      await sb.from('profiles').update({telefone:tel}).eq('id',perfil.id);
      perfil.telefone=tel;
    }
    fecharAuth();
    if(window._coPend){window._coPend=false;abrirCo3()}
  }else{showMsg(msg,'Verifique seu email para confirmar.','success')}
}

async function fazerLogout(){
  await sb.auth.signOut();perfil=null;
  document.getElementById('screen-shop')?.classList.add('active');
  document.getElementById('topbar-login').classList.remove('logged');
  const ddL=document.getElementById('dd-logado');if(ddL)ddL.style.display='none';
  const ddD=document.getElementById('dd-deslogado');if(ddD)ddD.style.display='block';
  document.getElementById('hero-msg').textContent='Bem-vindo!';
  const ddAdmin=document.getElementById('dd-admin');
  if(ddAdmin)ddAdmin.style.display='none';
  fecharDropdown();
  pararRealtime();
}

/* LOJA */
function renderShopCats(){
  const imgMap={
    'Alhos':'alhos.png','Bandejas':'bandejas.png','Bolos':'bolos.png',
    'Massas':'massas.png','Verduras':'verduras.png','Macarroes':'massas.png',
    'Macarrões':'massas.png'
  };
  const iconMap={
    'Alhos':'badge-plus','Bandejas':'package','Bolos':'cake-slice',
    'Cogumelo':'sprout','Doces':'cake-slice','Kits':'boxes',
    'Legumes Misturados':'salad','Legumes Puros':'carrot','Macarrões':'wheat',
    'Massas':'wheat','Molhos':'cup-soda','Outros':'package','Ralados':'chef-hat',
    'Sopões':'soup','Temperos':'leaf','Verduras':'leafy-green','Yakisoba':'utensils'
  };
  const todosChip='<div class="cat-chip'+(fCatShop===null?' active':'')+'" onclick="setCatShop(null)"><div class="cat-icon">'+lucideIcon('shopping-cart')+'</div><div class="cat-label">Todos</div></div>';
  document.getElementById('shop-cats').innerHTML=todosChip+cats.map(c=>{
    const iconName=iconMap[c.nome]||'leaf';
    const icone=c.imagem_url
      ?`<img src="${c.imagem_url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.replaceWith(document.createRange().createContextualFragment('${lucideIcon(iconName)}'))">`
      :lucideIcon(iconName);
    const iconStyle=c.imagem_url?'padding:0;overflow:hidden;':'';
    return '<div class="cat-chip'+(fCatShop===c.id?' active':'')+'" onclick="setCatShop('+c.id+')">'
      +'<div class="cat-icon" style="'+iconStyle+'">'+icone+'</div>'
      +'<div class="cat-label">'+c.nome+'</div>'
      +'</div>';
  }).join('');
  refreshIcons();
}
function setCatShop(id){
  fCatShop=fCatShop===id?null:id;
  renderShopCats();renderShop();
}
function renderShop(){
  document.getElementById('shop-loading').style.display='none';
  document.getElementById('shop-grid').classList.remove('hidden');
  const q=(document.getElementById('shop-search').value||'').toLowerCase();
  let ps=prods.filter(p=>p.ativo);
  if(fCatShop&&!q)ps=ps.filter(p=>p.cat_id===fCatShop);
  if(q)ps=ps.filter(p=>p.nome.toLowerCase().includes(q)||p.descricao?.toLowerCase().includes(q)||p.tags?.toLowerCase().includes(q));
  const cat=cats.find(c=>c.id===fCatShop);
  document.getElementById('shop-sec').textContent=q?'Resultados para "'+q+'"':(cat?cat.nome:'Todos os produtos');
  const el=document.getElementById('shop-grid');
  if(!ps.length){el.innerHTML='<div class="empty" style="grid-column:1/-1">Nenhum produto encontrado</div>';return}
  el.innerHTML=ps.map(p=>{
    const it=cart.itens.find(i=>i.prodId===p.id);
    const qty=it?it.qty:0;
    const semEstoque=p.estoque!=null&&p.estoque<=0;
    const ctrl=semEstoque
      ?`<span style="font-size:11px;font-weight:700;color:var(--red);background:var(--red-soft);padding:4px 10px;border-radius:20px;white-space:nowrap">Esgotado</span>`
      :qty>0
        ?`<div class="prod-qty-ctrl">
            <button class="cqb-lg" onclick="event.stopPropagation();cQtyCard(${p.id},-1)">−</button>
            <span class="cqn" style="min-width:20px;text-align:center;font-size:14px;font-weight:800">${qty}</span>
            <button class="cqb-lg" onclick="event.stopPropagation();cQtyCard(${p.id},1)">+</button>
          </div>`
        :`<button class="add-btn-lg" onclick="event.stopPropagation();addCart(${p.id})">+</button>`;
    const imgEl=p.imagem_url
      ?`<img src="${p.imagem_url}" alt="${p.nome}" loading="lazy">`
      :`<span class="ico-inline" style="font-size:44px;color:var(--green-bright)">${lucideIcon('sprout')}</span>`;
    return `<div class="prod-card" onclick="abrirProdModal(${p.id})" style="${semEstoque?'opacity:.55;pointer-events:none':''}">
      <div class="prod-card-img">${imgEl}</div>
      <div class="prod-card-body">
        <div class="prod-card-name">${p.nome}</div>
        <div class="prod-card-peso">${p.peso||''}</div>
        <div class="prod-card-footer">
          <div class="prod-price">R$ ${fp(p.preco)}</div>
          ${ctrl}
        </div>
      </div>
    </div>`;
  }).join('');
  refreshIcons();
  updMobileCartBar();
}

function addCart(id){
  const p=prods.find(x=>x.id===id);if(!p)return;
  const ex=cart.itens.find(i=>i.prodId===id);
  const qAtual=ex?ex.qty:0;
  if(p.estoque!=null&&qAtual>=p.estoque){
    toast(p.estoque===0?'Produto esgotado.':'Quantidade máxima disponível: '+p.estoque+'.','err');
    return;
  }
  if(ex)ex.qty++;else cart.itens.push({prodId:id,qty:1});
  updCartBadge();
  renderShop();
  if(document.getElementById('cart-drawer').classList.contains('open'))renderCart();
}
function cQtyCard(id,d){
  const p=prods.find(x=>x.id===id);
  const ex=cart.itens.find(i=>i.prodId===id);
  if(d>0&&p&&p.estoque!=null){
    const qAtual=ex?ex.qty:0;
    if(qAtual>=p.estoque){toast(p.estoque===0?'Produto esgotado.':'Máximo disponível: '+p.estoque+'.','err');return;}
  }
  if(ex){ex.qty=Math.max(0,ex.qty+d);if(ex.qty===0)cart.itens.splice(cart.itens.indexOf(ex),1)}
  else if(d>0){cart.itens.push({prodId:id,qty:1})}
  updCartBadge();renderShop();if(document.getElementById('cart-drawer').classList.contains('open'))renderCart();
}
function updCartBadge(){
  const tot=cart.itens.reduce((s,i)=>s+i.qty,0);
  const b=document.getElementById('cart-badge');
  if(tot>0){b.textContent=tot;b.classList.remove('hidden')}else b.classList.add('hidden');
  updMobileCartBar();
}
function abrirCart(){
  renderCart();
  // Sincronizar toggles com cart.entrega atual
  const de=document.getElementById('cart-de');
  const dr=document.getElementById('cart-dr');
  if(de)de.classList.toggle('active',cart.entrega==='Entrega');
  if(dr)dr.classList.toggle('active',cart.entrega==='Retirada');
  const cepBloco=document.getElementById('cart-cep-bloco');
  if(cepBloco)cepBloco.style.display=cart.entrega==='Entrega'?'block':'none';
  atualizarBtnContinuar();
  setOverlayState('cart-ov',true);
  setTimeout(()=>document.getElementById('cart-drawer').classList.add('open'),10);
  // Esconde barra mobile para não atrapalhar
  const bar=document.getElementById('mobile-cart-bar');
  if(bar)bar.classList.remove('show');
}
function fecharCart(){
  document.getElementById('cart-drawer').classList.remove('open');
  setTimeout(()=>setOverlayState('cart-ov',false),300);
  // Mostra barra novamente se tiver itens
  updMobileCartBar();
}
function fecharCartOv(e){if(e.target===document.getElementById('cart-ov'))fecharCart()}

function renderCart(){
  const el=document.getElementById('cart-list');
  if(!cart.itens.length){el.innerHTML='<div class="empty">Carrinho vazio</div>';updSums();return}
  let sub=0,qtd=0;
  el.innerHTML=cart.itens.map((it,i)=>{
    const p=prods.find(x=>x.id===it.prodId);if(!p)return'';
    const s=p.preco*it.qty;sub+=s;qtd+=it.qty;
    const thumb=p.imagem_url?`<img src="${p.imagem_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9px">`:lucideIcon('sprout');
    return`<div class="cart-item"><div class="cart-item-ico">${thumb}</div><div class="cart-item-info"><div class="cart-item-name">${p.nome}</div><div class="cart-item-price">${p.peso||''} · R$ ${fp(p.preco)}</div></div><div class="cart-item-qty"><button class="cqb" onclick="cQty(${i},-1)">-</button><span class="cqn">${it.qty}</span><button class="cqb" onclick="cQty(${i},1)">+</button></div><div class="cart-item-sub">R$ ${fp(s)}</div></div>`;
  }).join('');
  refreshIcons();
  updSums();
}
function cQty(i,d){cart.itens[i].qty=Math.max(0,cart.itens[i].qty+d);if(cart.itens[i].qty===0)cart.itens.splice(i,1);updCartBadge();renderCart()}

// ── PROMOCAO AUTOMATICA ──
function calcPromoAuto(sub){
  if(sub>=200){
    return{
      freteGratis:true,
      desconto:Math.round(sub*0.10*100)/100,
      label:'Promo acima de R$200: 10% off + frete grátis'
    };
  }
  return null;
}

function updSums(){try{
  const sub=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
  // Promo automatica acima de R$200
  const promo=calcPromoAuto(sub);
  const freteGratis=promo?.freteGratis||false;
  // Só aplica taxa se frete foi calculado pelo CEP
  const taxa=cart.entrega==='Entrega'&&!freteGratis&&_freteCalculado?TAXA:0;
  const descCupom=cupomAtivo?Math.round(sub*cupomAtivo.desconto/100*100)/100:0;
  const descPromo=promo?.desconto||0;
  const descTotal=descCupom+descPromo;
  const qtd=cart.itens.reduce((s,i)=>s+i.qty,0);
  const _ci=document.getElementById('c-itens');if(_ci)_ci.textContent=qtd;
  const _cs=document.getElementById('c-sub');if(_cs)_cs.textContent='R$ '+fp(sub);
  const taxaEl=document.getElementById('c-taxa');
  const taxaVal=document.getElementById('c-taxa-val');
  if(cart.entrega==='Entrega'&&!freteGratis){
    taxaEl.classList.remove('hidden');
    if(_freteCalculado){
      taxaVal.textContent='+ R$ '+fp(taxa);
      taxaEl.style.color='';
    }else{
      taxaVal.textContent='calcule o CEP acima';
      taxaEl.style.color='var(--text3)';
    }
  }else{
    taxaEl.classList.add('hidden');
    if(taxaVal)taxaVal.textContent='+ R$ '+fp(TAXA);
  }

  // Aviso mínimo integrado no botão (via atualizarBtnContinuar)

  // Promo row
  let promoRow=document.getElementById('c-promo-row');
  if(!promoRow&&promo){
    const total=document.querySelector('.total-row');
    if(total){
      promoRow=document.createElement('div');
      promoRow.id='c-promo-row';
      promoRow.className='sum-row';
      promoRow.style.color='var(--green-bright)';
      promoRow.innerHTML='<span id="c-promo-label"></span><span id="c-promo-val" style="color:var(--green-bright)"></span>';
      total.parentNode.insertBefore(promoRow,total);
    }
  }
  if(promoRow){
    if(promo){
      promoRow.style.display='';
      document.getElementById('c-promo-label').textContent=promo.label;
      document.getElementById('c-promo-val').textContent='- R$ '+fp(promo.desconto)+(freteGratis?' + Frete grátis':'');
    }else{
      promoRow.style.display='none';
    }
  }

  // Cupom row
  const descRow=document.getElementById('c-desc-row');
  if(descRow){
    descRow.classList.toggle('hidden',!cupomAtivo);
    if(cupomAtivo){
      document.getElementById('c-desc-label').textContent='Cupom '+cupomAtivo.nome+' ('+cupomAtivo.desconto+'%)';
      document.getElementById('c-desc-val').textContent='- R$ '+fp(descCupom);
    }
  }
  document.getElementById('c-total').textContent='R$ '+fp(Math.max(0,sub+taxa-descTotal));
  // Atualiza botao Continuar
  atualizarBtnContinuar();
}catch(e){console.warn('updSums:',e);}}
function limparCarrinho(){
  if(!cart.itens.length)return;
  popConfirm('🗑️','Esvaziar carrinho?','Todos os itens serão removidos.','Esvaziar','pbtn-danger',()=>{
    cart.itens=[];
    updCartBadge();renderCart();
  });
}


// ── CEP E FRETE NO CARRINHO ──
let _cartZona = null; // zona calculada no carrinho

async function calcularFreteCarrinho(){
  const cepInput = document.getElementById('cart-cep').value.replace(/\D/g,'');
  const info = document.getElementById('cart-frete-info');
  if(cepInput.length!==8){
    info.style.display='block';
    info.style.color='var(--orange)';
    info.textContent='Digite um CEP válido (8 dígitos).';
    return;
  }
  info.style.display='block';
  info.style.color='var(--text2)';
  info.innerHTML='<span class="ico-gap">'+lucideIcon('search')+' Calculando frete...</span>';
  refreshIcons();

  try{
    const result = await geocodificarCEP(cepInput);
    if(!result||!result.viacep){
      info.style.color='var(--red)';
      info.textContent='CEP não encontrado. Verifique e tente novamente.';
      return;
    }

    const dv = result.viacep;
    window._cartCepData = dv;
    window._cartCoords = {lat:result.lat, lng:result.lng};

    if(!LOJA_LAT||!LOJA_LNG||LOJA_LAT===0){
      // Loja não configurada — usa primeira zona disponível
      _cartZona = zonas[0]||null;
      if(_cartZona)TAXA=_cartZona.taxa;
      info.style.color='var(--text2)';
      info.innerHTML='<span class="ico-gap">'+lucideIcon('map-pin')+' '+(dv.bairro||dv.localidade)+' — Frete padrão: R$ '+fp(TAXA)+'</span>';
      refreshIcons();
      updSums();
      return;
    }

    const dist = await distanciaRota(LOJA_LAT, LOJA_LNG, result.lat, result.lng);
    const distTxt = dist.toFixed(1)+'km';

    if(dist > RAIO_MAX){
      _cartZona = null;
      window._cartCoords = undefined; // sinaliza fora do raio
      info.style.color='var(--red)';
      info.innerHTML=lucideIcon('ban')+' <strong>Fora do raio de entrega</strong> ('+distTxt+' · máx '+RAIO_MAX+'km)<br>'
        +'<span style="font-weight:400">Escolha Retirada para continuar.</span>';
      atualizarBtnContinuar();
      return;
    }

    const zona = calcularZona(dist);
    _cartZona = zona;

    if(zona){
      TAXA = zona.taxa;
      _freteCalculado=true;
      info.style.color='var(--green-bright)';
      info.innerHTML=lucideIcon('check-circle')+' <strong>'+(dv.bairro||dv.localidade)+'</strong> · '+distTxt+' · '+zona.nome+'<br>'
        +'<span style="color:var(--text2)">Frete: <strong style="color:var(--green-bright)">R$ '+fp(zona.taxa)+'</strong></span>';
    }else{
      _cartZona=null;
      info.style.color='var(--orange)';
      info.innerHTML=lucideIcon('triangle-alert')+' '+(dv.bairro||dv.localidade)+' · '+distTxt+'<br>'
        +'<span style="font-weight:400">Endereço fora das zonas configuradas.</span>';
    }
    updSums();
    atualizarBtnContinuar();
  }catch(e){
    info.style.color='var(--red)';
    info.textContent='Erro ao calcular frete. Tente novamente.';
  }
}

function setCartModalidade(v){
  cart.entrega=v;
  document.getElementById('cart-de').classList.toggle('active',v==='Entrega');
  document.getElementById('cart-dr').classList.toggle('active',v==='Retirada');
  // Mostrar/ocultar bloco CEP
  const cepBloco=document.getElementById('cart-cep-bloco');
  if(cepBloco)cepBloco.style.display=v==='Entrega'?'block':'none';
  // Resetar zona se trocou para retirada
  if(v==='Retirada'){
    _cartZona=null;
    _freteCalculado=false;
    // Limpar campo CEP
    const ci=document.getElementById('cart-cep');
    const fi=document.getElementById('cart-frete-info');
    if(ci)ci.value='';
    if(fi){fi.style.display='none';fi.innerHTML='';}
  }
  updSums();
  atualizarBtnContinuar();
}

function atualizarBtnContinuar(){
  const btn=document.getElementById('cart-continuar-btn');
  if(!btn)return;
  const sub=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
  // Sem bloqueio — aviso via balloon ao clicar
  btn.disabled=false;btn.style.opacity='1';
  const aviso=document.getElementById('cart-min-aviso');
  if(aviso)aviso.style.display='none';
}

function irCheckout(){
  if(!cart.itens.length){toast('Carrinho vazio!','err');return}
  if(PEDIDO_MIN>0){
    const sub=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
    if(sub<PEDIDO_MIN){
      mostrarBalloon('Pedido minimo: R$ '+fp(PEDIDO_MIN)+'\nFaltam R$ '+fp(PEDIDO_MIN-sub)+' para continuar');
      return;
    }
  }
  fecharCart();
  abrirCo3();
  return;
  // legado abaixo (nao usado)
  if(!cart.itens.length){toast('Carrinho vazio!','err');return}
  if(cart.entrega==='Entrega'){
    const sub=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
    // Bloquear se nao atingiu pedido minimo
    if(PEDIDO_MIN>0&&sub<PEDIDO_MIN){
      toast('Pedido mínimo para entrega: R$ '+fp(PEDIDO_MIN)+'. Faltam R$ '+fp(PEDIDO_MIN-sub),'err',5000);
      return;
    }
    // Forçar CEP antes de prosseguir
    if(!_freteCalculado){
      const cepEl=document.getElementById('cart-cep');
      if(cepEl)cepEl.focus();
      toast('Calcule o frete pelo CEP antes de continuar.','err',4000);
      return;
    }
    // Bloquear se CEP foi calculado mas está fora do raio
    if(window._cartCoords===undefined&&LOJA_LAT){
      toast('Endereço fora do raio de entrega. Escolha Retirada.','err',4000);
      return;
    }
  }
  fecharCart();
  if(!perfil){window._coPend=true;abrirAuth();return}
  abrirCo();
}
function abrirCo(){
  abrirCo3();
  return;
  // Esconde barra mobile
  const bar=document.getElementById('mobile-cart-bar');
  if(bar)bar.classList.remove('show');
  document.getElementById('co-nome').value=perfil?.nome||'';
  document.getElementById('co-data').value='';
  const cob=document.getElementById('co-data-btn');
  if(cob){cob.textContent='Selecionar data';cob.classList.remove('selected');}
  // Reset modalidade para Entrega
  // Manter a modalidade que o cliente escolheu no carrinho
  document.getElementById('co-de').classList.toggle('active',cart.entrega==='Entrega');
  document.getElementById('co-dr').classList.toggle('active',cart.entrega==='Retirada');
  const eb=document.getElementById('co-endereco-bloco');
  const rb=document.getElementById('co-retirada-bloco');
  if(eb)eb.classList.toggle('hidden',cart.entrega==='Retirada');
  if(rb)rb.classList.toggle('hidden',cart.entrega==='Entrega');
  if(cart.entrega==='Retirada')renderRetOpts();
  // Atualiza taxa dinamicamente
  const tv=document.getElementById('co-taxa-val');
  if(tv)tv.textContent=fp(TAXA);
  // Reset pagamento
  setPagMomento('agora');
  document.getElementById('co-pag').value='Pix';
  // Pre-preenche CEP do carrinho se foi calculado
  if(window._cartCepData){
    const d=window._cartCepData;
    document.getElementById('co-cep').value=document.getElementById('cart-cep').value;
    document.getElementById('co-rua').value=d.logradouro||'';
    document.getElementById('co-bairro').value=d.bairro||'';
    document.getElementById('co-cidade').value=(d.localidade||'')+' / '+(d.uf||'');
    document.getElementById('co-end').value=(d.logradouro||'')+', '+(d.bairro||'')+' - '+(d.localidade||'')+'/'+d.uf;
    document.getElementById('co-end-fields').classList.remove('hidden');
    if(window._cartCoords){_clienteLat=window._cartCoords.lat;_clienteLng=window._cartCoords.lng;}
    if(_cartZona){_zonaAtiva=_cartZona;TAXA=_cartZona.taxa;}
    // Mostra info da zona no checkout
    setTimeout(()=>{
      const zi=document.getElementById('co-zona-info');
      const infoCart=document.getElementById('cart-frete-info');
      if(zi&&infoCart&&infoCart.textContent)zi.innerHTML='<div style="padding:8px 10px;border-radius:8px;background:var(--green-light);border:1px solid var(--green-mid);font-size:12px;color:var(--green-bright)">'+infoCart.textContent+'</div>';
      if(zi)zi.style.display='block';
    },100);
  } else if(perfil?.cep){
    document.getElementById('co-cep').value=perfil.cep;
    document.getElementById('co-rua').value=perfil.endereco||'';
    document.getElementById('co-bairro').value=perfil.bairro||'';
    document.getElementById('co-cidade').value=perfil.cidade||'';
    document.getElementById('co-num').value=perfil.endereco_num||'';
    document.getElementById('co-end').value=(perfil.endereco||'')+', '+(perfil.bairro||'')+' - '+(perfil.cidade||'');
    document.getElementById('co-end-fields').classList.remove('hidden');
  }
  updCoResumo();
  setOverlayState('co-ov',true);
}
function fecharCo(){
  setOverlayState('co-ov',false);
  _clienteLat=null;_clienteLng=null;_zonaAtiva=null;
  const zi=document.getElementById('co-zona-info');
  if(zi)zi.style.display='none';
  updMobileCartBar();
}
function fecharCoOv(e){if(e.target===document.getElementById('co-ov'))fecharCo()}
function setCoE(v){
  cart.entrega=v;
  document.getElementById('co-de').classList.toggle('active',v==='Entrega');
  document.getElementById('co-dr').classList.toggle('active',v==='Retirada');
  document.getElementById('co-endereco-bloco').classList.toggle('hidden',v==='Retirada');
  document.getElementById('co-retirada-bloco').classList.toggle('hidden',v!=='Retirada');
  if(v==='Retirada'){
    // Retirada: zera taxa e zona
    _zonaAtiva=null;_clienteLat=null;_clienteLng=null;
    TAXA=0;
    renderRetOpts();
  }else{
    // Voltou para Entrega: resetar zona e coords para forçar novo cálculo
    _zonaAtiva=null;_clienteLat=null;_clienteLng=null;TAXA=0;
    // Limpar info de zona e mostrar aviso
    const zi=document.getElementById('co-zona-info');
    if(zi){zi.style.display='block';zi.innerHTML='<div style="padding:8px 10px;border-radius:8px;background:var(--orange-soft);border:1px solid var(--orange);font-size:12px;color:var(--orange);font-weight:600">⚠️ Preencha o CEP abaixo para calcular o frete de entrega.</div>';}
    // Recalcular se já tem CEP
    const cepEl=document.getElementById('co-cep');
    if(cepEl&&cepEl.value.replace(/\D/g,'').length===8){
      setTimeout(verificarZonaEntrega,400);
    }
  }
  updSums();updCoResumo();
}
function renderRetOpts(){
  const dataVal=document.getElementById('co-data').value;
  const info=document.getElementById('co-ret-info');
  if(!dataVal){
    info.innerHTML='<div style="font-size:12px;color:var(--text3)">Selecione a data acima para ver o local de retirada.</div>';
    document.getElementById('co-ret-local').value='';
    return;
  }
  const [y,m,d]=dataVal.split('-').map(Number);
  const dow=new Date(y,m-1,d).getDay();
  const local=LOCAIS_RETIRADA[dow];
  if(!local){
    info.innerHTML='<div style="font-size:12px;color:var(--red)">Sem retirada disponível nesta data.</div>';
    document.getElementById('co-ret-local').value='';
    return;
  }
  document.getElementById('co-ret-local').value=local.end;
  info.innerHTML=`
    <div class="ico-gap" style="font-size:12px;font-weight:800;color:var(--green-bright);margin-bottom:4px">${lucideIcon('map-pin')} ${local.nome}</div>
    <div style="font-size:12px;color:var(--text)">${local.end}</div>
    <div style="font-size:11px;color:var(--text2);margin-top:3px">${local.ref}</div>`;
  refreshIcons();
}
let cupomAtivo=null;

async function aplicarCupom(){
  const nome=document.getElementById('cart-cupom-input').value.trim().toUpperCase();
  const msg=document.getElementById('cart-cupom-msg');
  if(!nome){msg.style.display='block';msg.style.color='var(--red)';msg.textContent='Digite o código do cupom.';return}
  if(!perfil){msg.style.display='block';msg.style.color='var(--red)';msg.textContent='Faça login para usar cupons.';return}

  // Busca o cupom
  const {data:c,error}=await sb.from('cupons').select('*').eq('nome',nome).eq('ativo',true).single();
  if(error||!c){
    msg.style.display='block';msg.style.color='var(--red)';msg.textContent='Cupom inválido ou não encontrado.';return;
  }
  if(c.usos_restantes<=0){
    msg.style.display='block';msg.style.color='var(--orange)';
    msg.textContent='Esse cupom fez sucesso e já esgotou!';return;
  }

  // Verifica se o cliente já usou este cupom antes
  const {data:jaUsou}=await sb.from('pedidos')
    .select('id').eq('user_id',perfil.id).eq('cupom',nome).limit(1);
  if(jaUsou&&jaUsou.length>0){
    msg.style.display='block';msg.style.color='var(--red)';
    msg.textContent='Você já utilizou o cupom '+nome+' anteriormente.';return;
  }

  cupomAtivo=c;
  msg.style.display='block';msg.style.color='var(--green-bright)';
  msg.textContent='✓ Cupom '+c.nome+' aplicado! '+c.desconto+'% de desconto.';
  document.getElementById('cart-cupom-input').disabled=true;
  updSums();
}
function updCoResumo(){
  const sub=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
  const taxaBase=_zonaAtiva?_zonaAtiva.taxa:(!LOJA_LAT?TAXA:0);
  const taxa=cart.entrega==='Entrega'?taxaBase:0;
  const desc=cupomAtivo?Math.round(sub*cupomAtivo.desconto/100*100)/100:0;
  document.getElementById('co-resumo').textContent=cart.itens.map(it=>{const p=prods.find(x=>x.id===it.prodId);return p?it.qty+'x '+p.nome:''}).filter(Boolean).join(', ');
  document.getElementById('co-total').textContent='R$ '+fp(sub+taxa-desc);
  const tv=document.getElementById('co-taxa-val');
  if(tv)tv.textContent=fp(taxa);
}

function buildTextoWhatsApp(pedido,itens){
  const isEntrega = pedido.entrega === 'Entrega';
  const end = [pedido.endereco, pedido.numero].filter(Boolean).join(' - N.');
  const endFull = end + (pedido.complemento ?' - ' + pedido.complemento : '');

  const sub = itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
  const promo = calcPromoAuto(sub);
  const freteGratis = promo?.freteGratis||false;
  const taxa = isEntrega && !freteGratis ?TAXA : 0;
  const descCupom = cupomAtivo ?Math.round(sub*cupomAtivo.desconto/100*100)/100 : 0;
  const descPromo = promo?.desconto||0;
  const desc = descCupom + descPromo;
  const totalFinal = Math.max(0, sub + taxa - desc);

  // Itens
  const itensTxt = itens.map(it=>{
    const p = prods.find(x=>x.id===it.prodId); if(!p) return '';
    return it.qty + 'x ' + p.nome;
  }).filter(Boolean).join('\n');

  // Pagamento
  const pagBruto = pedido.pagamento||'';
  let pagLabel = '';
  let pagExtra = '';
  if(pagBruto.toLowerCase().includes('pix')){
    pagLabel = 'Pix';
    pagExtra = 'Chave Pix: ' + PIX_CHAVE;
  } else if(pagBruto.toLowerCase().includes('dinheiro')){
    pagLabel = 'Dinheiro';
    // Troco
    const trocoVal = pedido.troco||'';
    if(trocoVal && trocoVal !== 'sem troco'){
      pagExtra = 'Troco: R$ ' + fp(parseFloat(trocoVal));
    } else {
      pagExtra = 'Troco: Não';
    }
  } else {
    pagLabel = 'Cartão';
  }

  // Template personalizado (se existir)
  if(WPP_MSG_TEMPLATE){
    const trocoVal = pedido.troco||'';
    const trocoTxt = trocoVal && trocoVal!=='sem troco' ?'R$ '+fp(parseFloat(trocoVal)) : 'Nao';
    return WPP_MSG_TEMPLATE
      .replace(/{nome}/g, pedido.nome||'')
      .replace(/{contato}/g, pedido.contato||'')
      .replace(/{itens}/g, itensTxt)
      .replace(/{total}/g, 'R$ '+fp(totalFinal))
      .replace(/{subtotal}/g, 'R$ '+fp(sub))
      .replace(/{taxa}/g, 'R$ '+fp(taxa))
      .replace(/{entrega}/g, pedido.entrega||'')
      .replace(/{pagamento}/g, pagLabel)
      .replace(/{data}/g, pedido.data||'')
      .replace(/{endereco}/g, endFull||'')
      .replace(/{obs}/g, pedido.obs||'')
      .replace(/{troco}/g, trocoTxt)
      .replace(/{chave_pix}/g, pagLabel==='Pix' ?PIX_CHAVE : '');
  }

  // Template padrao formatado
  const partes = [];
  partes.push('Tipo de serviço: ' + (isEntrega ?'Entrega' : 'Retirada'));
  partes.push('');
  partes.push('Nome: ' + (pedido.nome||''));
  partes.push('Telefone: ' + (pedido.contato||''));
  partes.push((isEntrega ?'Endereço: ' : 'Local de retirada: ') + (endFull||''));
  partes.push('Data de ' + (isEntrega ?'entrega' : 'retirada') + ': ' + (pedido.data||''));
  partes.push('');
  partes.push('-- Produtos --');
  partes.push(itensTxt);
  partes.push('');
  partes.push('Subtotal: R$ ' + fp(sub));
  if(isEntrega) partes.push('Delivery: R$ ' + fp(taxa));
  if(descCupom > 0) partes.push('Desconto (' + (cupomAtivo?.nome||'cupom') + '): - R$ ' + fp(descCupom));
  partes.push('Total: R$ ' + fp(totalFinal));
  partes.push('');
  partes.push('-- Pagamento --');
  partes.push('Total a pagar: R$ ' + fp(totalFinal));
  partes.push('Forma de pagamento: ' + pagLabel);
  if(pagExtra) partes.push(pagExtra);
  if(pedido.obs){ partes.push(''); partes.push('-- Observações --'); partes.push(pedido.obs); }
  partes.push('');
  partes.push('Por favor, envie-nos esta mensagem agora.');
  return partes.join('\n');
}

async function gerarCodigo(dataPedido){
  try{
    const {count}=await sb.from('pedidos').select('id',{count:'exact',head:true}).eq('data_pedido',dataPedido);
    const seq=String((count||0)+1).padStart(3,'0');
    const [ano,mes,dia]=dataPedido.split('-');
    return ano.slice(2)+seq+dia+mes; // ex: 260011205
  }catch(e){return null}
}

function abrirWhatsApp(texto){
  const num=window._WHATSAPP_NUM_DB||WHATSAPP_NUM;
  const url='https://wa.me/'+num+'?text='+encodeURIComponent(texto);
  window.open(url,'_blank');
}
/* ── PAGAMENTO CHECKOUT ── */
let _metodoEntrega='Cartao';
function setPagMomento(m){
  document.getElementById('co-pag-momento').value=m;
  document.getElementById('co-pag-agora').classList.toggle('active',m==='agora');
  document.getElementById('co-pag-entrega').classList.toggle('active',m==='entrega');
  document.getElementById('co-pag-pix-box').classList.toggle('hidden',m!=='agora');
  document.getElementById('co-pag-entr-box').classList.toggle('hidden',m!=='entrega');
  if(m==='agora'){
    document.getElementById('co-pag').value='Pix';
    document.getElementById('co-troco-box').classList.add('hidden');
  }else{
    _metodoEntrega='Cartao';
    document.getElementById('met-cartao').classList.add('active');
    document.getElementById('met-dinheiro').classList.remove('active');
    document.getElementById('co-pag').value='Cartao';
    document.getElementById('co-troco-box').classList.add('hidden');
  }
}
function setMetodo(m){
  _metodoEntrega=m;
  document.getElementById('met-cartao').classList.toggle('active',m==='Cartao');
  document.getElementById('met-dinheiro').classList.toggle('active',m==='Dinheiro');
  document.getElementById('co-pag').value=m;
  document.getElementById('co-troco-box').classList.toggle('hidden',m!=='Dinheiro');
  document.getElementById('co-troco').value='';
  document.getElementById('co-troco-val').value='';
  document.getElementById('co-troco-erro').style.display='none';
}
function validarTroco(){
  const val=parseFloat(document.getElementById('co-troco-val').value)||0;
  const total=parseFloat((document.getElementById('co-total').textContent||'0').replace(/[^0-9,]/g,'').replace(',','.'))||0;
  const err=document.getElementById('co-troco-erro');
  if(val>0&&val<=total){err.textContent='O troco deve ser maior que R$ '+fp(total);err.style.display='block';}
  else{err.style.display='none';}
}
function confirmarTroco(){
  const val=parseFloat(document.getElementById('co-troco-val').value)||0;
  const total=parseFloat((document.getElementById('co-total').textContent||'0').replace(/[^0-9,]/g,'').replace(',','.'))||0;
  if(val<=total){validarTroco();return}
  document.getElementById('co-troco').value=val.toFixed(2);
  document.getElementById('co-troco-box').classList.add('hidden');
  toast('Troco para R$ '+fp(val)+' confirmado!','ok');
}
function semTroco(){
  document.getElementById('co-troco').value='sem troco';
  document.getElementById('co-troco-box').classList.add('hidden');
  toast('Sem troco!','ok');
}

async function enviarPedido(){
  const nome=document.getElementById('co-nome').value.trim();
  const tel=document.getElementById('co-tel').value.trim();
  const isRetirada=cart.entrega==='Retirada';
  const endEntrega=document.getElementById('co-end').value.trim();
  const endRetirada=document.getElementById('co-ret-local')?.value.trim()||'';
  const end=isRetirada?endRetirada:endEntrega;
  const pag=document.getElementById('co-pag').value;
  const momento=document.getElementById('co-pag-momento').value;
  const troco=document.getElementById('co-troco').value;
  const comp=isRetirada?'':document.getElementById('co-comp').value.trim();
  const erros=[];
  if(!nome) erros.push('Nome');
  if(!tel) erros.push('Contato');
  if(!isRetirada&&!endEntrega) erros.push('Endereco');
  if(isRetirada&&!endRetirada) erros.push('Local de retirada (selecione a data)');
  if(!pag) erros.push('Forma de pagamento');
  if(pag==='Dinheiro'&&!troco){popAlert('💵','Troco obrigatório','Informe o valor para troco ou clique em "Não preciso de troco!"');return}
  if(erros.length){popAlert('⚠️','Campos obrigatórios','Preencha: '+erros.join(', '));return}
  // Bloquear se fora do raio de entrega ou sem zona calculada
  if(!isRetirada&&LOJA_LAT){
    // Se tem endereço mas não calculou zona ainda, calcular agora
    if(_zonaAtiva===null&&_clienteLat===null&&endEntrega){
      await verificarZonaEntrega();
    }
    // Se calculou coords, verificar distância
    if(_clienteLat!==null){
      const dist=await distanciaRota(LOJA_LAT,LOJA_LNG,_clienteLat,_clienteLng);
      if(dist>RAIO_MAX){
        popAlert('🚫','Fora do raio de entrega','Seu endereço está a '+dist.toFixed(1)+'km da loja. O máximo é '+RAIO_MAX+'km.\n\nEscolha Retirada para continuar.');
        return;
      }
    }
    // Bloquear se ainda sem zona válida
    if(!_zonaAtiva){
      popAlert('⚠️','Frete não calculado','Preencha o CEP e verifique se seu endereço está dentro da área de entrega antes de finalizar.\n\nOu escolha Retirada.');
      return;
    }
  }
  // Validar pedido minimo (so para Entrega)
  if(!isRetirada&&PEDIDO_MIN>0){
    const subCheck=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
    if(subCheck<PEDIDO_MIN){
      popAlert('🚚','Pedido mínimo para entrega','O valor mínimo para entrega é R$ '+fp(PEDIDO_MIN)+'.\nSeu pedido está em R$ '+fp(subCheck)+'.\n\nAdicione mais itens ou escolha Retirada.');
      return;
    }
  }
  if(!document.getElementById('co-data').value){popAlert('📅','Data obrigatória','Selecione uma data.');return}
  const dataPedCheckout=document.getElementById('co-data').value;
  await carregarDatasBloqueadas();
  if(dataBloqueada(dataPedCheckout,cart.entrega)){
    toast('Essa data não está disponível. Escolha outra data.','err',3000);
    return;
  }
  if(!cart.itens.length){toast('Carrinho vazio.','err');return}
  const btn=document.getElementById('co-btn');
  btn.disabled=true;btn.textContent='Enviando...';
  const statusAuto=momento==='agora'?'Pendente':'Em preparo';
  const itensCopy=[...cart.itens];
  const pagLabel=pag+(troco&&troco!=='sem troco'?' (troco p/ R$ '+fp(parseFloat(troco))+')':(troco==='sem troco'?' (sem troco)':''));
  const txtWpp=buildTextoWhatsApp({
    nome,contato:tel,endereco:end,
    numero:isRetirada?'':document.getElementById('co-num').value,
    complemento:comp,
    data:fd(document.getElementById('co-data').value),
    entrega:cart.entrega,pagamento:pag,
    troco:document.getElementById('co-troco').value,
    obs:document.getElementById('co-obs').value
  },itensCopy);
  // Se for Pix: abre modal Pix primeiro, WhatsApp depois da confirmação
  if(pag === 'Pix' || pag === 'pix' || (momento === 'agora' && pag.toLowerCase().includes('pix'))){
    const sub2=itensCopy.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
    const _pr2=calcPromoAuto(sub2);
    const _fg2=_pr2?.freteGratis||false;
    const taxa2=cart.entrega==='Entrega'&&!_fg2?(_zonaAtiva?_zonaAtiva.taxa:(!LOJA_LAT?TAXA:0)):0;
    const dc2=cupomAtivo?Math.round(sub2*cupomAtivo.desconto/100*100)/100:0;
    const dp2=_pr2?.desconto||0;
    const totalPix=Math.max(0,sub2+taxa2-dc2-dp2);
    btn.disabled=false;btn.textContent='FINALIZAR PEDIDO';
    abrirPixModal(totalPix, {txtWpp, itensCopy, nome, tel, end, isRetirada, comp, dataPed:document.getElementById('co-data').value, pagLabel, pag});
    return;
  }
  // Outros métodos: WhatsApp direto
  abrirWhatsApp(txtWpp);
  try{
    const dataPed=document.getElementById('co-data').value;
    const codigo=await gerarCodigo(dataPed);
    const sub=itensCopy.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
    const _promo=calcPromoAuto(sub);
    const _freteGratis=_promo?.freteGratis||false;
    // Taxa só aplica se zona foi calculada ou se loja não está configurada
    const taxaBase=(_zonaAtiva?_zonaAtiva.taxa:(!LOJA_LAT?TAXA:0));
    const taxa=cart.entrega==='Entrega'&&!_freteGratis?taxaBase:0;
    const descCupomEnv=cupomAtivo?Math.round(sub*cupomAtivo.desconto/100*100)/100:0;
    const descPromoEnv=_promo?.desconto||0;
    const desc=descCupomEnv+descPromoEnv;
    const insertData={
      user_id:perfil.id,cliente_nome:nome,
      cliente_contato:tel,
      cliente_endereco:end,
      cliente_numero:isRetirada?'':document.getElementById('co-num').value,
      cliente_complemento:comp||null,
      entrega:cart.entrega,taxa_entrega:taxa,
      pagamento:pagLabel,
      status:statusAuto,
      observacoes:document.getElementById('co-obs').value,
      subtotal:sub,total:sub+taxa-desc,
      data_pedido:dataPed
    };
    if(codigo)insertData.codigo=codigo;
    if(cupomAtivo)insertData.cupom=cupomAtivo.nome;
    const {data:ped,error}=await sb.from('pedidos').insert(insertData).select().single();
    if(error)throw error;
    await sb.from('itens_pedido').insert(itensCopy.map(it=>{
      const p=prods.find(x=>x.id===it.prodId);
      return{pedido_id:ped.id,produto_id:p.id,nome_produto:p.nome,peso_produto:p.peso||'',preco_unitario:p.preco,quantidade:it.qty,subtotal:p.preco*it.qty};
    }));
    // Decrementa uso do cupom com verificacao atomica
    if(cupomAtivo){
      // Re-le o valor atual do banco antes de decrementar (evita race condition)
      const {data:cupNow}=await sb.from('cupons').select('usos_restantes').eq('id',cupomAtivo.id).single();
      if(cupNow&&cupNow.usos_restantes!==null&&cupNow.usos_restantes>0){
        await sb.from('cupons').update({usos_restantes:cupNow.usos_restantes-1}).eq('id',cupomAtivo.id);
      }else if(cupNow&&cupNow.usos_restantes===0){
        // Cupom esgotou entre o momento da verificacao e o salvamento — avisa mas mantem o pedido
        toast('Cupom esgotado, pedido salvo sem desconto.','err');
        // Nao aplica desconto retroativamente — apenas registra
      }
    }
    // Decrementar estoque
    await Promise.all(itensCopy.map(it=>{
      const p=prods.find(x=>x.id===it.prodId);
      if(!p||p.estoque==null)return Promise.resolve();
      const novo=Math.max(0,p.estoque-it.qty);
      p.estoque=novo;
      const upd8={estoque:novo};
      if(novo<=0){upd8.ativo=false;p.ativo=false;}
      return sb.from('produtos').update(upd8).eq('id',p.id);
    }));
    cupomAtivo=null;
    cart={itens:[],entrega:'Entrega'};updCartBadge();fecharCo();
    mostrarSucesso();
  }catch(e){toast('Erro: '+e.message,'err')}
  btn.disabled=false;btn.textContent='Enviar pedido';
}


/* ── CALENDAR PICKER ── */
let calCtx=null; // 'co' | 'adm'
let calAno,calMes;

function abrirCal(ctx){
  calCtx=ctx;
  const hoje=new Date();hoje.setHours(0,0,0,0);
  calAno=hoje.getFullYear();calMes=hoje.getMonth();
  renderCal();
  const hint=document.getElementById('cal-hint');
  if(hint)hint.innerHTML=calCtx==='entr'
    ?'<span class="cal-dot"></span> Todas as datas de entrega'
    :calCtx==='adm'
    ?'<span class="cal-dot"></span> Selecione qualquer data'
    :'<span class="cal-dot"></span> Próximas 3 datas disponíveis';
  const _calEl=document.getElementById('cal-ov');
  document.body.appendChild(_calEl);
  _calEl.removeAttribute('aria-hidden');
  _calEl.removeAttribute('inert');
  _calEl.style.display='flex';
  _calEl.classList.add('open');
}function fecharCal(){
  const _c=document.getElementById('cal-ov');
  const f=_c.querySelector(':focus');if(f)f.blur();
  _c.classList.remove('open');
  _c.style.display='none';
  _c.setAttribute('inert','');
  _c.removeAttribute('aria-hidden');
}
function navCal(d){
  calMes+=d;
  if(calMes>11){calMes=0;calAno++}
  if(calMes<0){calMes=11;calAno--}
  renderCal();
}

function renderCal(){
  const MESES_LONG=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const DOWS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  document.getElementById('cal-month-label').textContent=MESES_LONG[calMes]+' '+calAno;

  const hoje=new Date();hoje.setHours(0,0,0,0);
  const selVal=document.getElementById(calCtx==='co'?'co-data':calCtx==='adm'?'a-data':calCtx==='co3'?'co3-data':'e-data').value;

  // Datas disponíveis: lógica diferente por contexto
  const proximas=new Set();
  if(calCtx==='co'||calCtx==='co3'){
    // Usa corte de 20h (mesma regra de datasComCorte)
    datasComCorte().forEach(dt=>proximas.add(toISO(dt)));
  }

  const primeiroDia=new Date(calAno,calMes,1).getDay();
  const totalDias=new Date(calAno,calMes+1,0).getDate();

  let html=DOWS.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<primeiroDia;i++) html+='<div class="cal-day empty"></div>';

  for(let dia=1;dia<=totalDias;dia++){
    const dt=new Date(calAno,calMes,dia);
    const iso=toISO(dt);
    const isHoje=dt.getTime()===hoje.getTime();
    const dow=dt.getDay();
    // Admin novo pedido: qualquer data. Entregas: todos Ter/Sáb. Cliente: 3 próximas
    let isDisponivel;
    if(calCtx==='adm') isDisponivel=true;
    else if(calCtx==='entr') isDisponivel=(dow===2||dow===5);
    else isDisponivel=proximas.has(iso);
    if((calCtx==='co'||calCtx==='co3')&&dataBloqueada(iso,calCtx==='co3'?co3Modalidade:cart.entrega)){
      isDisponivel=false;
    }
    const isSelected=iso===selVal;

    let cls='cal-day';
    if(isSelected) cls+=' selected-day';
    else if(isDisponivel) cls+=' available';
    else cls+=' disabled';
    if(isHoje) cls+=' today';

    if(isDisponivel){
      html+=`<button class="${cls}" onclick="selecionarData('${iso}')">${dia}</button>`;
    }else{
      // Não disponível: clique só fecha o cal (não congela)
      const msg=calCtx==='co'?'Somente terças e sextas':'';
      html+=`<button class="${cls}" onclick="fecharCal();${msg?`toast('${msg}','err',2000)`:''};">${dia}</button>`;
    }
  }
  document.getElementById('cal-grid').innerHTML=html;
}

function selecionarData(iso){
  if((calCtx==='co'||calCtx==='co3')&&dataBloqueada(iso,calCtx==='co3'?co3Modalidade:cart.entrega)){
    fecharCal();
    toast('Essa data não está disponível. Escolha outra data.','err',3000);
    return;
  }
  const idInput=calCtx==='co'?'co-data':calCtx==='adm'?'a-data':calCtx==='co3'?'co3-data':'e-data';
  const idBtn=calCtx==='co'?'co-data-btn':calCtx==='adm'?'a-data-btn':calCtx==='co3'?'co3-data-btn':'e-data-btn';
  document.getElementById(idInput).value=iso;
  const [y,m,d]=iso.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  const label=DIAS_NOME_LONG[dt.getDay()]+', '+String(d).padStart(2,'0')+'/'+MESES[m-1];
  const btn=document.getElementById(idBtn);
  btn.textContent=label;
  btn.classList.add('selected');
  fecharCal();
  if(calCtx==='co'&&cart.entrega==='Retirada') renderRetOpts();
  if(calCtx==='co3'&&co3Modalidade==='Retirada') co3RenderRetOpts();
  if(calCtx==='entr')renderEntregas();
}

function mostrarSucesso(){
  const _s=document.getElementById('success-ov');
  document.body.appendChild(_s);
  _s.removeAttribute('aria-hidden');
  _s.removeAttribute('inert');
  _s.style.display='flex';
}
function fecharSucesso(){
  const _s=document.getElementById('success-ov');
  const f=_s.querySelector(':focus');if(f)f.blur();
  _s.style.display='none';
  _s.removeAttribute('aria-hidden');
  _s.setAttribute('inert','');
}

/* ── POPUP & TOAST ── */
function toast(msg,type='info',dur=3200){
  const wrap=document.getElementById('toast-wrap');
  const el=document.createElement('div');
  const icons={ok:lucideIcon('check-circle'),err:lucideIcon('circle-x'),info:lucideIcon('info')};
  el.className='toast '+(type==='ok'?'t-ok':type==='err'?'t-err':'');
  el.innerHTML='<span>'+icons[type]+'</span><span>'+msg+'</span>';
  wrap.appendChild(el);
  refreshIcons();
  setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),320)},dur);
}
function popup(icon,title,msg,btns){
  // btns: [{label, cls:'pbtn-ok'|'pbtn-cancel'|'pbtn-danger', cb}]
  const iconMap={'❌':'circle-x','⚠️':'triangle-alert','🚫':'ban','🚚':'truck','📅':'calendar','💵':'banknote','🗑️':'trash-2','👤':'user','📋':'clipboard-list'};
  document.getElementById('g-popup-icon').innerHTML=lucideIcon(iconMap[icon]||icon||'info');
  document.getElementById('g-popup-title').textContent=title;
  document.getElementById('g-popup-msg').textContent=msg;
  const bd=document.getElementById('g-popup-btns');
  bd.innerHTML='';
  (btns||[]).forEach(b=>{
    const btn=document.createElement('button');
    btn.className=b.cls||'pbtn-ok';
    btn.textContent=b.label;
    btn.onclick=()=>{closePopup();if(b.cb)b.cb()};
    bd.appendChild(btn);
  });
  refreshIcons();
  const _gp=document.getElementById('g-popup');
  _gp.removeAttribute('inert');
  _gp.removeAttribute('aria-hidden');
  document.body.appendChild(_gp);
  _gp.style.display='flex';
  _gp.classList.add('open');
}
function closePopup(){
  const _gp=document.getElementById('g-popup');
  const f=_gp.querySelector(':focus');if(f)f.blur();
  _gp.classList.remove('open');
  _gp.style.display='none';
  _gp.setAttribute('inert','');
  _gp.setAttribute('aria-hidden','true');
}
function popAlert(icon,title,msg,cb){popup(icon,title,msg,[{label:'OK',cls:'pbtn-ok',cb}])}
function popConfirm(icon,title,msg,labelOk,clsOk,cbOk){
  popup(icon,title,msg,[
    {label:'Cancelar',cls:'pbtn-cancel'},
    {label:labelOk,cls:clsOk||'pbtn-ok',cb:cbOk}
  ]);
}

function showMsg(el,msg,type){el.className='auth-msg '+type;el.textContent=msg}
function tErr(msg){
  if(msg.includes('Invalid login'))return'Email ou senha incorretos.';
  if(msg.includes('Email not confirmed'))return'Confirme seu email antes de entrar.';
  if(msg.includes('already registered'))return'Este email ja esta cadastrado.';
  return msg;
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'){fecharAuth();fecharCart();fecharCo();}});
['login-email','login-pass'].forEach(id=>document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')fazerLogin()}));
['reg-nome','reg-tel','reg-email','reg-pass','reg-pass2'].forEach(id=>document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')fazerCadastro()}));

/* ── PRODUCT MODAL ── */
function abrirProdModal(id){
  const p=prods.find(x=>x.id===id);if(!p)return;
  let modal=document.getElementById('prod-modal-ov');
  if(!modal){
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-ov" id="prod-modal-ov" onclick="if(event.target===this){this.classList.remove('open');this.style.display='none';}">
      <div class="modal-box" style="width:360px;padding:0;overflow:hidden">
        <div id="prod-modal-img" style="width:100%;height:200px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:64px;position:relative">
          <button onclick="document.getElementById('prod-modal-ov').classList.remove('open')" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.4);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>
        </div>
        <div style="padding:16px">
          <div id="prod-modal-nome" style="font-size:18px;font-weight:800;margin-bottom:4px"></div>
          <div id="prod-modal-peso" style="font-size:12px;color:var(--text2);margin-bottom:8px"></div>
          <div id="prod-modal-desc" style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:14px"></div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div id="prod-modal-preco" style="font-size:20px;font-weight:800;color:var(--green-bright)"></div>
            <div id="prod-modal-ctrl"></div>
          </div>
        </div>
      </div>
    </div>`);
    modal=document.getElementById('prod-modal-ov');
  }
  const imgEl=document.getElementById('prod-modal-img');
  imgEl.innerHTML=p.imagem_url
    ?`<img src="${p.imagem_url}" style="width:100%;height:100%;object-fit:cover"><button onclick="document.getElementById('prod-modal-ov').classList.remove('open')" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.4);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>`
    :`<span style="font-size:64px">${emoji(p)}</span><button onclick="document.getElementById('prod-modal-ov').classList.remove('open')" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.4);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">✕</button>`;
  document.getElementById('prod-modal-nome').textContent=p.nome;
  document.getElementById('prod-modal-peso').textContent=p.peso||'';
  document.getElementById('prod-modal-desc').textContent=p.descricao||'';
  document.getElementById('prod-modal-preco').textContent='R$ '+fp(p.preco);
  renderProdModalCtrl(id);
  modal.style.display='';
  modal.classList.add('open');
}
function renderProdModalCtrl(id){
  const it=cart.itens.find(i=>i.prodId===id);
  const qty=it?it.qty:0;
  const ctrl=document.getElementById('prod-modal-ctrl');
  if(!ctrl)return;
  if(qty>0){
    ctrl.innerHTML=`<div style="display:flex;align-items:center;gap:12px">
      <button class="cqb-lg" onclick="cQtyModal(${id},-1)">−</button>
      <span style="font-size:20px;font-weight:800;min-width:24px;text-align:center">${qty}</span>
      <button class="cqb-lg" onclick="cQtyModal(${id},1)">+</button>
    </div>`;
  }else{
    ctrl.innerHTML=`<button class="add-btn-lg" style="width:auto;padding:0 20px;font-size:16px" onclick="cQtyModal(${id},1)">+ Adicionar</button>`;
  }
}
function cQtyModal(id,d){
  const p=prods.find(x=>x.id===id);
  const ex=cart.itens.find(i=>i.prodId===id);
  if(d>0&&p&&p.estoque!=null){
    const qAtual=ex?ex.qty:0;
    if(qAtual>=p.estoque){toast(p.estoque===0?'Produto esgotado.':'Máximo disponível: '+p.estoque+'.','err');return;}
  }
  if(ex){ex.qty=Math.max(0,ex.qty+d);if(ex.qty===0)cart.itens.splice(cart.itens.indexOf(ex),1)}
  else if(d>0){cart.itens.push({prodId:id,qty:1})}
  updCartBadge();renderShop();renderProdModalCtrl(id);
  if(document.getElementById('cart-drawer').classList.contains('open'))renderCart();
}

/* ── LOCAIS DE RETIRADA ── */
const LOCAIS_RETIRADA={
  2:{nome:'Feira Terça-feira',end:'Rua Borda do Mato - Grajaú, Rio de Janeiro',ref:'Em frente à Academia Borda 90'},
  5:{nome:'Feira Sexta-feira',end:'Av. Júlio Furtado - Grajaú, Rio de Janeiro',ref:'Em frente ao StudioGama115'}
};

/* ── MOBILE CART BAR ── */
function updMobileCartBar(){
  const bar=document.getElementById('mobile-cart-bar');
  if(!bar)return;
  const sub=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
  const tot=cart.itens.reduce((s,i)=>s+i.qty,0);
  if(tot>0&&document.getElementById('screen-shop').classList.contains('active')){
    bar.classList.add('show');
    document.getElementById('mbar-total').textContent='R$ '+fp(sub);
    document.getElementById('mbar-count').textContent=tot+' item'+(tot>1?'s':'');
  }else{
    bar.classList.remove('show');
  }
}

/* ── DASHBOARD ── */
let cupons=[];

function abrirRastrearPedido(){
  popInput('📦','Acompanhar Pedido','Digite o número do seu pedido:','Ex: 260012205','Consultar',async(val)=>{
    const codigo=val.trim().toUpperCase();
    if(!codigo){toast('Digite o código do pedido.','err');return}
    const {data,error}=await sb.from('pedidos')
      .select('codigo,id,status,total,created_at,cliente_nome,tipo_entrega,data_pedido')
      .or('codigo.eq.'+codigo+',id.eq.'+(parseInt(codigo)||0))
      .single();
    if(error||!data){toast('Pedido não encontrado. Verifique o código.','err');return}
    const statusEmoji={
      'Pendente':'⏳','Em preparo':'👨‍🍳','Saiu para entrega':'🛵','Entregue':'✅','Cancelado':'❌'
    };
    const st=data.status||'Pendente';
    const dt=data.data_pedido?data.data_pedido.split('-').reverse().join('/'):'—';
    popAlert(
      (statusEmoji[st]||'📦')+' Pedido '+data.codigo,
      'Cliente: '+data.cliente_nome+'\n'+'Data: '+dt+'\nModalidade: '+(data.tipo_entrega||'—')+'\nTotal: R$ '+fp(data.total)+'\n\nStatus atual:\n'+st
    );
  });
}
function popInput(icon,title,msg,placeholder,btnLabel,onConfirm){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:24px 22px 18px;max-width:330px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.35)">
    <div style="font-size:28px;text-align:center;margin-bottom:10px">${icon}</div>
    <div style="font-size:16px;font-weight:800;text-align:center;margin-bottom:6px;color:var(--text)">${title}</div>
    <div style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:14px">${msg}</div>
    <input id="_popinput" type="text" placeholder="${placeholder}" style="width:100%;font-size:15px;font-family:var(--font);background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px 12px;outline:none;margin-bottom:12px;text-transform:uppercase">
    <div style="display:flex;gap:8px">
      <button onclick="this.closest('[style*=fixed]').remove()" style="flex:1;padding:11px;border-radius:10px;font-size:13px;font-weight:700;font-family:var(--font);cursor:pointer;border:none;background:var(--bg4);color:var(--text2)">Cancelar</button>
      <button id="_popbtn" style="flex:1;padding:11px;border-radius:10px;font-size:13px;font-weight:700;font-family:var(--font);cursor:pointer;border:none;background:var(--green);color:#fff">${btnLabel}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const inp=ov.querySelector('#_popinput');
  inp.focus();
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')ov.querySelector('#_popbtn').click()});
  ov.querySelector('#_popbtn').addEventListener('click',()=>{ov.remove();onConfirm(inp.value)});
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove()});
}
function popAlert(title,msg){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:24px 22px 18px;max-width:330px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.35)">
    <div style="font-size:16px;font-weight:800;text-align:center;margin-bottom:12px;color:var(--text)">${title}</div>
    <div style="font-size:13px;color:var(--text2);text-align:center;line-height:1.7;margin-bottom:18px;white-space:pre-line">${msg}</div>
    <button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;padding:12px;border-radius:10px;font-size:14px;font-weight:700;font-family:var(--font);cursor:pointer;border:none;background:var(--green);color:#fff">OK</button>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove()});
}

async function loginGoogle(){
  const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});
  if(error)toast('Erro ao conectar com Google.','err');
}
function abrirEsqueceuSenha(){
  popInput('🔑','Esqueceu sua senha?','Digite seu e-mail para receber o link de redefinição:','seu@email.com','Enviar link',async(val)=>{
    const email=val.trim().toLowerCase();
    if(!email||!email.includes('@')){toast('Digite um e-mail válido.','err');return}
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/loja?reset=1'});
    if(error){toast('Erro ao enviar.','err');return}
    toast('Link enviado! Verifique sua caixa de entrada','ok');
  });
}
async function verificarResetSenha(){
  const params=new URLSearchParams(window.location.search);
  if(params.get('reset')!=='1')return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return;
  window.history.replaceState({},'',window.location.pathname);
  abrirNovaSenha();
}
function abrirNovaSenha(){
  const ov=document.createElement('div');
  ov.id='reset-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:28px 22px 20px;max-width:340px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.35)">
    <div style="font-size:16px;font-weight:800;text-align:center;margin-bottom:6px;color:var(--text)">Nova senha</div>
    <div id="reset-msg" style="margin-bottom:8px"></div>
    <input id="reset-pass1" type="password" placeholder="Nova senha (mín. 6 caracteres)" style="width:100%;font-size:14px;font-family:var(--font);background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px 12px;outline:none;margin-bottom:8px;box-sizing:border-box">
    <input id="reset-pass2" type="password" placeholder="Confirmar nova senha" style="width:100%;font-size:14px;font-family:var(--font);background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px 12px;outline:none;margin-bottom:14px;box-sizing:border-box">
    <button onclick="salvarNovaSenha()" style="width:100%;padding:12px;border-radius:10px;font-size:14px;font-weight:700;font-family:var(--font);cursor:pointer;border:none;background:var(--green);color:#fff">Salvar nova senha</button>
  </div>`;
  document.body.appendChild(ov);
}
async function salvarNovaSenha(){
  const p1=document.getElementById('reset-pass1').value;
  const p2=document.getElementById('reset-pass2').value;
  const msg=document.getElementById('reset-msg');
  if(!p1||p1.length<6){msg.innerHTML='<div style="color:var(--red);font-size:12px">Mínimo 6 caracteres.</div>';return}
  if(p1!==p2){msg.innerHTML='<div style="color:var(--red);font-size:12px">Senhas não coincidem.</div>';return}
  const {error}=await sb.auth.updateUser({password:p1});
  if(error){msg.innerHTML='<div style="color:var(--red);font-size:12px">Erro: '+error.message+'</div>';return}
  document.getElementById('reset-ov').remove();
  toast('Senha atualizada!','ok');
}

// ══════════════════════════════════════
// LANDING PAGE EDITOR
// ══════════════════════════════════════

let _pixPedidoData = null; // guarda dados do pedido para confirmar depois

function _pixCampo(id, val){
  return id + String(val.length).padStart(2,'0') + val;
}

function gerarPixPayload(valor, txid){
  const chave = PIX_CHAVE;
  const merchantAccount = _pixCampo('00','BR.GOV.BCB.PIX') + _pixCampo('01', chave);
  const nome = PIX_NOME.slice(0,25);
  const cidade = PIX_CIDADE.slice(0,15);
  const valStr = valor.toFixed(2);
  const tx = (txid||'***').slice(0,25);

  let payload =
    _pixCampo('00','01') +
    _pixCampo('26', merchantAccount) +
    _pixCampo('52','0000') +
    _pixCampo('53','986') +
    _pixCampo('54', valStr) +
    _pixCampo('58','BR') +
    _pixCampo('59', nome) +
    _pixCampo('60', cidade) +
    _pixCampo('62', _pixCampo('05', tx)) +
    '6304';

  // CRC16-CCITT
  let crc = 0xFFFF;
  for(let i=0;i<payload.length;i++){
    crc ^= payload.charCodeAt(i) << 8;
    for(let j=0;j<8;j++) crc = (crc & 0x8000) ?(crc<<1)^0x1021 : crc<<1;
    crc &= 0xFFFF;
  }
  return payload + crc.toString(16).toUpperCase().padStart(4,'0');
}

function _pixQR(canvas, texto){
  // QR Code simples via Google Charts API
  const size = canvas.width;
  const url = 'https://api.qrserver.com/v1/create-qr-code/?size='+size+'x'+size+'&data='+encodeURIComponent(texto)+'&format=png&ecc=M';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,size,size);
    ctx.drawImage(img,0,0,size,size);
  };
  img.src = url;
}

function abrirPixModal(total, pedidoData){
  _pixPedidoData = pedidoData;
  const payload = gerarPixPayload(total, 'CORT'+Date.now().toString().slice(-8));
  document.getElementById('pix-valor-txt').textContent = 'R$ ' + fp(total);
  document.getElementById('pix-codigo-txt').textContent = payload;
  _pixQR(document.getElementById('pix-qr-canvas'), payload);
  const ov = document.getElementById('pix-modal-ov');
  document.body.appendChild(ov); // garantir que está no topo do DOM
  ov.style.display = 'flex';
  ov.classList.add('open');
}

function fecharPixModal(){
  const ov = document.getElementById('pix-modal-ov');
  ov.classList.remove('open');
  ov.style.display = 'none';
}

function copiarPixCodigo(){
  const txt = document.getElementById('pix-codigo-txt').textContent;
  navigator.clipboard.writeText(txt).then(()=>toast('Codigo Pix copiado!','ok')).catch(()=>{
    // fallback
    const el = document.createElement('textarea');
    el.value = txt; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
    toast('Codigo Pix copiado!','ok');
  });
}

async function confirmarPagamentoPix(){
  if(!_pixPedidoData){ fecharPixModal(); return; }
  fecharPixModal();
  await _finalizarPedido(_pixPedidoData);
}

// ── FINALIZAR PEDIDO APÓS PIX ──
async function _finalizarPedido(dados){
  const {txtWpp, itensCopy, nome, tel, end, isRetirada, comp, dataPed, pagLabel, pag} = dados;
  await carregarDatasBloqueadas();
  if(dataBloqueada(dataPed,isRetirada?'Retirada':'Entrega')){
    toast('Essa data não está disponível. Escolha outra data.','err',3000);
    return;
  }
  fecharCo();
  abrirWhatsApp(txtWpp);
  try{
    const codigo = await gerarCodigo(dataPed);
    const sub = itensCopy.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
    const _promo = calcPromoAuto(sub);
    const _freteGratis = _promo?.freteGratis||false;
    const taxaBase = (_zonaAtiva?_zonaAtiva.taxa:(!LOJA_LAT?TAXA:0));
    const taxa = !isRetirada&&!_freteGratis ?taxaBase : 0;
    const descCupomEnv = cupomAtivo ?Math.round(sub*cupomAtivo.desconto/100*100)/100 : 0;
    const descPromoEnv = _promo?.desconto||0;
    const desc = descCupomEnv + descPromoEnv;
    const insertData = {
      user_id: perfil.id,
      cliente_nome: nome,
      cliente_contato: tel,
      cliente_endereco: end,
      cliente_numero: isRetirada ?'' : (document.getElementById('co-num')?.value||''),
      cliente_complemento: comp||null,
      entrega: isRetirada ?'Retirada' : 'Entrega',
      taxa_entrega: taxa,
      pagamento: pagLabel,
      status: 'Pendente',
      observacoes: document.getElementById('co-obs')?.value||'',
      subtotal: sub,
      total: Math.max(0, sub + taxa - desc),
      data_pedido: dataPed
    };
    if(codigo) insertData.codigo = codigo;
    if(cupomAtivo) insertData.cupom = cupomAtivo.nome;
    const {data:ped, error} = await sb.from('pedidos').insert(insertData).select().single();
    if(error) throw error;
    await sb.from('itens_pedido').insert(itensCopy.map(it=>{
      const p = prods.find(x=>x.id===it.prodId);
      return {pedido_id:ped.id, produto_id:p.id, nome_produto:p.nome, peso_produto:p.peso||'', preco_unitario:p.preco, quantidade:it.qty, subtotal:p.preco*it.qty};
    }));
    if(cupomAtivo){
      const {data:cupNow} = await sb.from('cupons').select('usos_restantes').eq('id',cupomAtivo.id).single();
      if(cupNow && cupNow.usos_restantes > 0)
        await sb.from('cupons').update({usos_restantes: cupNow.usos_restantes-1}).eq('id', cupomAtivo.id);
    }
    await Promise.all(itensCopy.map(it=>{
      const p = prods.find(x=>x.id===it.prodId);
      if(!p || p.estoque==null) return Promise.resolve();
      const novo = Math.max(0, p.estoque - it.qty);
      p.estoque = novo;
      const updSp={estoque:novo};if(novo<=0){updSp.ativo=false;p.ativo=false;}
      return sb.from('produtos').update(updSp).eq('id',p.id);
    }));
    cupomAtivo = null;
    cart = {itens:[], entrega:'Entrega'};
    updCartBadge();
    mostrarSucesso();
  }catch(e){
    toast('Erro ao salvar pedido: ' + e.message, 'err');
  }
}

// ══════════════════════════════════════
// CHECKOUT 3 PASSOS
// ══════════════════════════════════════
let co3Step=1,co3Modalidade='Entrega',co3CupomAtivo=null,co3FreteCalculado=false,co3PagMetodo='Pix',co3Troco='',co3EnderecoForaRaio=false;

function fecharCo3(){
  const ov=document.getElementById('co3-ov');
  ov.classList.remove('open');ov.style.display='none';updMobileCartBar();
}

function co3GoStep(n){
  co3Step=n;
  [1,2,3].forEach(i=>{
    const s=document.getElementById('co3-s'+i),d=document.getElementById('co3-d'+i);
    if(!s||!d)return;
    s.classList.remove('active','done');
    if(i<n){s.classList.add('done');d.innerHTML='<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:#fff;fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round"><polyline points="20 6 9 17 4 12"/></svg>';}
    else if(i===n){s.classList.add('active');d.textContent=i;}
    else{d.textContent=i;}
  });
  ['co3-p1','co3-p2','co3-p3'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.style.display=(i+1===n)?'block':'none';});
  // Resumo só no passo 1
  const _resumo=document.getElementById('co3-resumo-sidebar');
  if(_resumo) _resumo.style.display = n===1 ?'block' : 'none';
  co3RenderResumoItens();
  // Resumo: só no passo 1
  const resumoEl=document.querySelector('.co3-resumo');
  const bodyEl=document.querySelector('.co3-body');
  if(resumoEl)resumoEl.style.display=n===1?'':'none';
  if(bodyEl)bodyEl.classList.toggle('sem-resumo',n!==1);
  // Mostrar resumo endereço no passo 2
  if(n>=2){
    const resumoEl=document.getElementById('co3-end-resumo');
    const endFull=document.getElementById('co3-end-full')?.value;
    const data=document.getElementById('co3-data')?.value;
    const DIAS=['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
    const MESES2=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    let dataLabel='';
    if(data){const[y,m,d]=data.split('-').map(Number);const dt=new Date(y,m-1,d);dataLabel=DIAS[dt.getDay()]+', '+String(d).padStart(2,'0')+'/'+MESES2[m-1];}
    if(resumoEl){
      resumoEl.style.display=endFull?'block':'none';
      if(endFull)resumoEl.innerHTML='<strong>'+co3Modalidade+'</strong> · '+dataLabel+(endFull?' · '+endFull.split(' - ')[0]:'');
    }
  }
  const ov=document.getElementById('co3-ov');if(ov)ov.scrollTop=0;
  const lbl=document.getElementById('co3-data-lbl');if(lbl)lbl.textContent=co3Modalidade==='Entrega'?'entrega':'retirada';
  if(n===3&&co3PagMetodo==='Pix')co3GerarQR();
}

function co3RenderResumoItens(){
  const el2=document.getElementById('co3-resumo-items');
  if(!el2) return;
  el2.innerHTML=cart.itens.map(it=>{
    const p=prods.find(x=>x.id===it.prodId);if(!p)return'';
    return`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span style="color:var(--text2)">${it.qty}x <strong style="color:var(--text)">${p.nome}</strong></span>
      <span style="font-weight:700;color:var(--text);white-space:nowrap;margin-left:8px">R$ ${fp(p.preco*it.qty)}</span>
    </div>`;
  }).join('');
}

function co3RenderItems(){
  co3RenderResumoItens();
}

function co3ChgQty(i,d){cart.itens[i].qty=Math.max(0,cart.itens[i].qty+d);if(cart.itens[i].qty===0)cart.itens.splice(i,1);updCartBadge();co3RenderItems();co3UpdateResumo();}

function co3UpdateResumo(){
  const sub=cart.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0);
  const promo=calcPromoAuto(sub);const freteGratis=promo?.freteGratis||false;
  const taxa=co3Modalidade==='Entrega'&&!freteGratis&&co3FreteCalculado?TAXA:0;
  const descCupom=co3CupomAtivo?Math.round(sub*co3CupomAtivo.desconto/100*100)/100:0;
  const total=Math.max(0,sub+taxa-descCupom);
  const rSub=document.getElementById('co3-r-sub'),rFrete=document.getElementById('co3-r-frete'),rFreteRow=document.getElementById('co3-r-frete-row');
  const rDesc=document.getElementById('co3-r-desc'),rDescRow=document.getElementById('co3-r-desc-row'),rDescLbl=document.getElementById('co3-r-desc-lbl'),rTotal=document.getElementById('co3-r-total');
  if(rSub)rSub.textContent='R$ '+fp(sub);
  if(rFreteRow)rFreteRow.style.display=taxa>0?'':'none';
  if(rFrete)rFrete.textContent='R$ '+fp(taxa);
  if(rDescRow)rDescRow.style.display=descCupom>0?'':'none';
  if(rDescLbl&&co3CupomAtivo)rDescLbl.textContent='Cupom '+co3CupomAtivo.nome;
  if(rDesc)rDesc.textContent='- R$ '+fp(descCupom);
  if(rTotal)rTotal.textContent='R$ '+fp(total);
  return{sub,taxa,descCupom,total};
}

function co3RenderRetOpts(){
  const dataVal=document.getElementById('co3-data')?.value;
  const info=document.getElementById('co3-ret-info'),localInput=document.getElementById('co3-ret-local');
  if(!info)return;
  if(!dataVal){info.innerHTML='<div style="font-size:12px;color:var(--text3)">Selecione a data acima para ver o local de retirada.</div>';if(localInput)localInput.value='';return;}
  const[y,m,d]=dataVal.split('-').map(Number);const dow=new Date(y,m-1,d).getDay();const local=LOCAIS_RETIRADA[dow];
  if(!local){info.innerHTML='<div style="font-size:12px;color:var(--red)">Sem retirada disponivel nesta data.</div>';if(localInput)localInput.value='';return;}
  if(localInput)localInput.value=local.end;
  info.innerHTML=`<div style="font-size:12px;font-weight:800;color:var(--green-bright);margin-bottom:4px">${local.nome}</div><div style="font-size:12px;color:var(--text)">${local.end}</div><div style="font-size:11px;color:var(--text2);margin-top:3px">${local.ref}</div>`;
}

async function co3CalcFrete(){
  const cepEl=document.getElementById('co3-cep'),info=document.getElementById('co3-frete-info');
  if(!cepEl||!info)return;
  const cep=cepEl.value.replace(/\D/g,'');
  if(cep.length!==8){info.style.display='block';info.style.color='var(--orange)';info.textContent='Digite um CEP valido.';return;}
  co3EnderecoForaRaio=false;
  info.style.display='block';info.textContent='Calculando...';info.style.color='var(--text2)';
  const result=await geocodificarCEP(cep);
  if(!result||!result.viacep){info.style.color='var(--red)';info.textContent='CEP nao encontrado.';return;}
  window._cartCepData=result.viacep;window._cartCoords={lat:result.lat,lng:result.lng};
  const c2=document.getElementById('co3-cep2');if(c2)c2.value=cepEl.value;
  if(!LOJA_LAT||!LOJA_LNG){TAXA=zonas[0]?.taxa||TAXA;co3FreteCalculado=true;_freteCalculado=true;info.style.color='var(--green-bright)';info.textContent='Frete: R$ '+fp(TAXA);co3UpdateResumo();return;}
  const dist=await distanciaRota(LOJA_LAT,LOJA_LNG,result.lat,result.lng);
  if(dist>RAIO_MAX){co3EnderecoForaRaio=true;co3FreteCalculado=false;_freteCalculado=false;info.style.color='var(--red)';info.textContent='Fora do raio de entrega ('+dist.toFixed(1)+'km).';return;}
  const zona=calcularZona(dist);
  if(zona){co3EnderecoForaRaio=false;TAXA=zona.taxa;_zonaAtiva=zona;co3FreteCalculado=true;_freteCalculado=true;info.style.color='var(--green-bright)';info.textContent=result.viacep.bairro+' · '+dist.toFixed(1)+'km · Frete: R$ '+fp(TAXA);co3UpdateResumo();}
  else{info.style.color='var(--orange)';info.textContent='Endereco fora das zonas configuradas.';}
}


async function co3BuscarCep(){
  const cepEl=document.getElementById('co3-cep2')||document.getElementById('co3-cep');
  if(!cepEl)return;
  const cep=cepEl.value.replace(/\D/g,'');
  if(cep.length!==8)return;
  try{
    const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');
    const d=await r.json();
    if(d.erro)return;
    const rua=document.getElementById('co3-rua-p1');
    const bairro=document.getElementById('co3-bairro-p1');
    const cidade=document.getElementById('co3-cidade-p1');
    const endFull=document.getElementById('co3-end-full');
    if(rua)rua.value=d.logradouro||'';
    if(bairro)bairro.value=d.bairro||'';
    if(cidade)cidade.value=(d.localidade||'')+' / '+(d.uf||'');
    if(endFull)endFull.value=(d.logradouro||'')+', '+(d.bairro||'')+' - '+(d.localidade||'')+'/'+d.uf;
    const num=document.getElementById('co3-num-p1');
    if(num)num.focus();
  }catch(e){}
}

function co3Passo3(){
  const nome=document.getElementById('co3-nome')?.value.trim(),tel=document.getElementById('co3-tel')?.value.trim();
  const erros=[];if(!nome)erros.push('Nome');if(!tel)erros.push('Telefone');
  if(erros.length){popAlert('⚠️','Campos obrigatorios','Preencha: '+erros.join(', '));return;}
  co3GoStep(3);co3SetPag('Pix');
}

function co3GerarQR(){
  const{total}=co3UpdateResumo();
  const payload=gerarPixPayload(total,'CORT'+Date.now().toString().slice(-8));
  const valEl=document.getElementById('co3-pix-valor'),codEl=document.getElementById('co3-pix-codigo');
  if(valEl)valEl.textContent='R$ '+fp(total);if(codEl)codEl.textContent=payload;
  const canvas=document.getElementById('co3-pix-canvas');if(canvas)_pixQR(canvas,payload);
}

function co3CopiarPix(){
  const txt=document.getElementById('co3-pix-codigo')?.textContent;if(!txt)return;
  navigator.clipboard.writeText(txt).then(()=>toast('Codigo Pix copiado!','ok')).catch(()=>{const el=document.createElement('textarea');el.value=txt;document.body.appendChild(el);el.select();document.execCommand('copy');document.body.removeChild(el);toast('Codigo Pix copiado!','ok');});
}

function co3ValidarTroco(){
  const val=parseFloat(document.getElementById('co3-troco-val')?.value)||0;const{total}=co3UpdateResumo();
  const err=document.getElementById('co3-troco-err');if(err){if(val>0&&val<=total){err.textContent='O valor deve ser maior que R$ '+fp(total);err.style.display='block';}else{err.style.display='none';}}
}
function co3ConfirmarTroco(){const val=parseFloat(document.getElementById('co3-troco-val')?.value)||0;const{total}=co3UpdateResumo();if(val<=total){co3ValidarTroco();return;}co3Troco=val.toFixed(2);toast('Troco para R$ '+fp(val)+' confirmado!','ok');document.getElementById('co3-dinheiro-box').style.display='none';}
function co3SemTroco(){co3Troco='sem troco';toast('Sem troco!','ok');document.getElementById('co3-dinheiro-box').style.display='none';}

// ── CO3: DATAS DISPONÍVEIS (próximas 3 terças e sextas) ──
// Corte: Terça fecha na Segunda às 20h | Sexta fecha na Quinta às 20h
function datasComCorte(){
  const agora = new Date();
  const hoje = new Date(agora); hoje.setHours(0,0,0,0);
  const horaAgora = agora.getHours();
  const diaSemana = agora.getDay();
  const proximas = [];
  const d = new Date(hoje); d.setDate(d.getDate()+1);
  while(proximas.length < 3){
    const dia = d.getDay();
    if(dia===2 || dia===5){
      const diaCorte = dia===2 ?1 : 4;
      const isAmanha = (d.getTime()-hoje.getTime())===86400000;
      const passou = isAmanha && diaSemana===diaCorte && horaAgora>=20;
      if(!passou) proximas.push(new Date(d));
    }
    d.setDate(d.getDate()+1);
  }
  return proximas;
}


// ── CO3: AUTO BUSCAR CEP (no blur) ──
// ── CO3: Atualizar co3SetModalidade para p1 ──

function co3SetModalidade(v){
  co3Modalidade=v;cart.entrega=v;
  const be=document.getElementById('co3-btn-entrega'),br=document.getElementById('co3-btn-retirada');
  if(be)be.classList.toggle('active',v==='Entrega');
  if(br)br.classList.toggle('active',v==='Retirada');
  // Resumo só aparece na modalidade Entrega
  const resumoEl=document.querySelector('.co3-resumo');
  const bodyEl=document.querySelector('.co3-body');
  const showResumo = v==='Entrega' && co3Step===1;
  if(resumoEl)resumoEl.style.display=showResumo?'':'none';
  if(bodyEl)bodyEl.classList.toggle('sem-resumo',!showResumo);
  // Passo 1
  const cepBloco=document.getElementById('co3-cep-bloco'),retBloco=document.getElementById('co3-ret-bloco');
  if(cepBloco)cepBloco.classList.toggle('hidden',v==='Retirada');
  if(retBloco)retBloco.classList.toggle('hidden',v==='Entrega');
  // Passo 2
  const endBloco=document.getElementById('co3-end-bloco'),retBloco2=document.getElementById('co3-ret-bloco');
  // label data
  const lbl=document.getElementById('co3-data-lbl-wrap');if(lbl)lbl.textContent='Data de '+(v==='Entrega'?'entrega':'retirada');
  if(v==='Retirada'){co3EnderecoForaRaio=false;co3FreteCalculado=false;TAXA=0;_zonaAtiva=null;}
  co3UpdateResumo();co3RenderRetOpts();
};

// ── CO3: Atualizar co3Passo2 para validar passo 1 ──

// ── CO3: Abrir co3 chama RenderDatas ──

function abrirCo3(){
  if(!perfil){window._coPend=true;abrirAuth();return}
  co3Step=1;co3Modalidade=cart.entrega||'Entrega';co3FreteCalculado=_freteCalculado;co3EnderecoForaRaio=false;co3CupomAtivo=cupomAtivo;co3PagMetodo='Pix';co3Troco='';
  const n=document.getElementById('co3-nome'),t=document.getElementById('co3-tel');
  if(n&&!n.value)n.value=perfil.nome||'';
  if(t&&!t.value)t.value=perfil.telefone||'';
  co3SetModalidade(co3Modalidade);
  co3GoStep(1);co3RenderItems();co3UpdateResumo();
  co3CalInit();
  const ov=document.getElementById('co3-ov');
  document.body.appendChild(ov);ov.style.display='flex';ov.classList.add('open');ov.scrollTop=0;
}

function mostrarBalloon(msg){
  const b = document.getElementById('min-balloon');
  if(!b) return;
  b.textContent = msg;
  b.classList.add('show');
  clearTimeout(window._balloonTimer);
  window._balloonTimer = setTimeout(()=>b.classList.remove('show'), 3000);
}

// ── CO3: MOMENTO DO PAGAMENTO ──
function co3SetMomento(v){
  document.getElementById('co3-pag-momento').value = v;
  document.getElementById('co3-momento-agora').classList.toggle('active', v==='agora');
  document.getElementById('co3-momento-entrega').classList.toggle('active', v==='entrega');
  document.getElementById('co3-agora-box').style.display = v==='agora' ?'block' : 'none';
  document.getElementById('co3-entrega-box').style.display = v==='entrega' ?'block' : 'none';
  const btn = document.getElementById('co3-btn-finalizar');
  if(btn){
    if(v==='agora') btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Ja paguei — Confirmar';
    else btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Finalizar pedido';
  }
  document.getElementById('co3-pag').value = v==='agora' ?'Pix' : document.getElementById('co3-pag-entrega-met').value;
  if(v==='agora'){
    // Pagar agora (Pix): iniciar countdown, esconder botão direto
    const wrap=document.getElementById('co3-countdown-wrap');
    const btn=document.getElementById('co3-btn-finalizar');
    if(wrap)wrap.style.display='block';
    if(btn)btn.style.display='none';
    setTimeout(co3GerarQR,50);
    co3IniciarCountdown();
  }else{
    // Pagar na entrega: esconder countdown, mostrar botão direto
    const wrap=document.getElementById('co3-countdown-wrap');
    const btn=document.getElementById('co3-btn-finalizar');
    if(wrap)wrap.style.display='none';
    if(btn){
      btn.style.display='flex';
      btn.innerHTML='<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Finalizar pedido';
    }
    clearInterval(_co3CountdownTimer);
  }
}

// ── CO3: MÉTODO NA ENTREGA ──
function co3SetPagEntrega(v){
  document.getElementById('co3-pag-entrega-met').value = v;
  document.getElementById('co3-pag').value = v;
  document.getElementById('co3-opt-cartao').classList.toggle('active', v==='Cartao');
  document.getElementById('co3-opt-dinheiro').classList.toggle('active', v==='Dinheiro');
  document.getElementById('co3-cartao-info').style.display = v==='Cartao' ?'block' : 'none';
  document.getElementById('co3-dinheiro-box').style.display = v==='Dinheiro' ?'block' : 'none';
}

// ── CO3: AUTO BUSCAR CEP ──
async function co3AutoBuscarCep(){
  const cepEl = document.getElementById('co3-cep');
  if(!cepEl) return;
  const cep = cepEl.value.replace(/\D/g,'');
  if(cep.length === 8){
    co3EnderecoForaRaio=false;
    const info = document.getElementById('co3-frete-info');
    if(info){ info.style.display='block'; info.textContent='Buscando...'; info.style.color='var(--text2)'; }
    try{
      const r = await fetch('https://viacep.com.br/ws/'+cep+'/json/');
      const d = await r.json();
      if(!d.erro){
        document.getElementById('co3-rua-p1').value = d.logradouro||'';
        document.getElementById('co3-bairro-p1').value = d.bairro||'';
        document.getElementById('co3-cidade-p1').value = (d.localidade||'')+' / '+(d.uf||'');
        const endBase = (d.logradouro||'')+', '+(d.bairro||'')+' - '+(d.localidade||'')+'/'+d.uf;
        document.getElementById('co3-end-full').value = endBase;
        window._cartCepData = d;
        if(info){ info.textContent='CEP encontrado! Informe o numero.'; info.style.color='var(--green-bright)'; }
        document.getElementById('co3-num-p1').focus();
        // Calcular frete em background
        if(LOJA_LAT && LOJA_LNG){
          const result = await geocodificarCEP(cep);
          if(result){
            window._cartCoords = {lat:result.lat, lng:result.lng};
            const dist = await distanciaRota(LOJA_LAT, LOJA_LNG, result.lat, result.lng);
            if(dist > RAIO_MAX){ co3EnderecoForaRaio=true; co3FreteCalculado=false; _freteCalculado=false; if(info){ info.textContent='Fora do raio de entrega ('+dist.toFixed(1)+'km).'; info.style.color='var(--red)'; } return; }
            const zona = calcularZona(dist);
            if(zona){ co3EnderecoForaRaio=false; TAXA=zona.taxa; _zonaAtiva=zona; co3FreteCalculado=true; _freteCalculado=true;
              if(info){ info.textContent=d.bairro+' · '+dist.toFixed(1)+'km · Frete: R$ '+fp(TAXA); }
              co3UpdateResumo();
            }
          }
        } else { co3EnderecoForaRaio=false; co3FreteCalculado=true; _freteCalculado=true; co3UpdateResumo(); }
      } else {
        if(info){ info.textContent='CEP nao encontrado.'; info.style.color='var(--red)'; }
      }
    }catch(e){ if(info){ info.textContent='Erro ao buscar CEP.'; info.style.color='var(--red)'; } }
  }
}

// ── CO3: VALIDAR PASSO 2 ATUALIZADO ──
function co3Passo2(){
  if(!cart.itens.length){ toast('Carrinho vazio.','err'); return; }
  const data = document.getElementById('co3-data')?.value;
  if(co3Modalidade==='Entrega'){
    if(co3EnderecoForaRaio){ mostrarBalloon('Endereço fora da área de entrega.'); return; }
    if(!co3FreteCalculado){ mostrarBalloon('Informe o CEP para calcular o frete'); return; }
    if(!data){ mostrarBalloon('Selecione uma data de '+co3Modalidade.toLowerCase()); return; }
    if(dataBloqueada(data,'Entrega')){ mostrarBalloon('Essa data não está disponível. Escolha outra data.'); return; }
    const num = document.getElementById('co3-num-p1')?.value.trim();
    if(!num){ mostrarBalloon('Informe o numero do endereco'); return; }
    const rua = document.getElementById('co3-rua-p1')?.value.trim()||'';
    const bairro = document.getElementById('co3-bairro-p1')?.value.trim()||'';
    const cidade = document.getElementById('co3-cidade-p1')?.value.trim()||'';
    const endBase = [rua,bairro].filter(Boolean).join(', ') + (cidade?' - '+cidade:'');
    const comp = document.getElementById('co3-comp-p1')?.value.trim()||'';
    const numStr = num ?' - N.'+num : '';
    const compStr = comp ?' - '+comp : '';
    document.getElementById('co3-end-full').value = endBase + numStr + compStr;
  }
  if(co3Modalidade==='Retirada'){
    if(!data){ mostrarBalloon('Selecione uma data de '+co3Modalidade.toLowerCase()); return; }
    if(dataBloqueada(data,'Retirada')){ mostrarBalloon('Essa data não está disponível. Escolha outra data.'); return; }
    const local = document.getElementById('co3-ret-local')?.value;
    if(!local){ mostrarBalloon('Selecione uma data para ver o local de retirada'); return; }
  }
  co3GoStep(2);
};

// ── CO3: co3SetPag para pagar agora (só Pix) ──
function co3SetPag(v){
  co3PagMetodo=v;
  document.getElementById('co3-pag').value=v;
  if(v==='Pix'){
    setTimeout(co3GerarQR,100);
    co3IniciarCountdown();
  }
}

// ── CO3: co3Finalizar atualizado ──
async function co3Finalizar(){
  const momento = document.getElementById('co3-pag-momento')?.value||'agora';
  const pag = document.getElementById('co3-pag')?.value||'Pix';
  const btn = document.getElementById('co3-btn-finalizar');
  if(btn){btn.disabled=true;btn.textContent='Aguarde...';}

  if(!perfil||!perfil.id){
    mostrarBalloon('Entre ou crie uma conta para finalizar o pedido');
    if(btn){btn.disabled=false;btn.textContent='Finalizar pedido';}
    if(typeof abrirAuth==='function')abrirAuth();
    return;
  }
  
  if(momento==='entrega'){
    const met = document.getElementById('co3-pag-entrega-met')?.value||'Cartao';
    if(met==='Dinheiro' && !co3Troco){ mostrarBalloon('Informe o valor para troco'); if(btn){btn.disabled=false;btn.textContent='Finalizar pedido';} return; }
  }

  const nome = document.getElementById('co3-nome')?.value.trim();
  const tel = document.getElementById('co3-tel')?.value.trim();
  const data = document.getElementById('co3-data')?.value;
  const obs = document.getElementById('co3-obs')?.value||'';
  const isRetirada = co3Modalidade==='Retirada';
  const recebedor = document.getElementById('co3-recebedor')?.value.trim()||'';
  const endFull = isRetirada
    ?(document.getElementById('co3-ret-local')?.value||'')
    : (document.getElementById('co3-end-full')?.value||'');

  const erros=[];
  if(!nome) erros.push('Nome');if(!tel) erros.push('Telefone');
  if(erros.length){ popAlert('⚠️','Campos obrigatorios','Preencha: '+erros.join(', ')); if(btn){btn.disabled=false;btn.textContent='Finalizar pedido';} return; }

  if(!data){ mostrarBalloon('Selecione uma data de '+co3Modalidade.toLowerCase()); if(btn){btn.disabled=false;btn.textContent='Finalizar pedido';} return; }
  await carregarDatasBloqueadas();
  if(dataBloqueada(data,co3Modalidade)){
    mostrarBalloon('Essa data não está disponível. Escolha outra data.');
    if(btn){btn.disabled=false;btn.textContent='Finalizar pedido';}
    return;
  }

  const {sub,taxa,descCupom,total} = co3UpdateResumo();
  const pagLabel = momento==='agora' ?'Pix' :
    (document.getElementById('co3-pag-entrega-met')?.value||'Cartao') +
    (co3Troco&&co3Troco!=='sem troco'?' (troco p/ R$ '+fp(parseFloat(co3Troco))+')':(co3Troco==='sem troco'?' (sem troco)':''));
  const itensTxt = cart.itens.map(it=>{const p=prods.find(x=>x.id===it.prodId);return p?it.qty+'x '+p.nome:'';}).filter(Boolean).join('\n');

  const partes=[];
  partes.push('Tipo de servico: '+co3Modalidade);partes.push('');
  partes.push('Nome: '+nome);partes.push('Telefone: '+tel);
  if(recebedor && !isRetirada) partes.push('Recebedor: '+recebedor);
  partes.push((isRetirada?'Local de retirada: ':'Endereco: ')+endFull);
  partes.push('Data de '+(isRetirada?'retirada':'entrega')+': '+fd(data));partes.push('');
  partes.push('-- Produtos --');partes.push(itensTxt);partes.push('');
  partes.push('Subtotal: R$ '+fp(sub));
  if(!isRetirada&&taxa>0)partes.push('Delivery: R$ '+fp(taxa));
  if(descCupom>0)partes.push('Desconto ('+co3CupomAtivo?.nome+'): - R$ '+fp(descCupom));
  partes.push('Total: R$ '+fp(total));partes.push('');
  partes.push('-- Pagamento --');
  partes.push('Momento: '+(momento==='agora'?'Pagamento antecipado (Pix)':'Pagamento na entrega'));
  partes.push('Total a pagar: R$ '+fp(total));partes.push('Forma de pagamento: '+pagLabel);
  if(momento==='agora')partes.push('Chave Pix: '+PIX_CHAVE);
  if(obs){partes.push('');partes.push('-- Observacoes --');partes.push(obs);}
  partes.push('');partes.push('Por favor, envie-nos esta mensagem agora.');
  const txtWpp = partes.join('\n');

  abrirWhatsApp(txtWpp);
  try{
    const codigo = await gerarCodigo(data);
    const insertData = {
      user_id:perfil.id, cliente_nome:nome, cliente_contato:tel,
      cliente_endereco:endFull, cliente_numero:'', cliente_complemento:null,
      entrega:co3Modalidade, taxa_entrega:taxa, pagamento:pagLabel,
      status:'Pendente', observacoes:obs, subtotal:sub,
      total:Math.max(0,sub+taxa-descCupom), data_pedido:data
    };
    if(codigo)insertData.codigo=codigo;
    if(co3CupomAtivo)insertData.cupom=co3CupomAtivo.nome;
    const {data:ped,error}=await sb.from('pedidos').insert(insertData).select().single();
    if(error)throw error;
    const itensCopy=[...cart.itens];
    await sb.from('itens_pedido').insert(itensCopy.map(it=>{
      const p=prods.find(x=>x.id===it.prodId);
      return{pedido_id:ped.id,produto_id:p.id,nome_produto:p.nome,peso_produto:p.peso||'',preco_unitario:p.preco,quantidade:it.qty,subtotal:p.preco*it.qty};
    }));
    if(co3CupomAtivo){
      const {data:cupNow}=await sb.from('cupons').select('usos_restantes').eq('id',co3CupomAtivo.id).single();
      if(cupNow&&cupNow.usos_restantes>0)await sb.from('cupons').update({usos_restantes:cupNow.usos_restantes-1}).eq('id',co3CupomAtivo.id);
    }
    await Promise.all(itensCopy.map(it=>{
      const p=prods.find(x=>x.id===it.prodId);if(!p||p.estoque==null)return Promise.resolve();
      const novo=Math.max(0,p.estoque-it.qty);p.estoque=novo;return sb.from('produtos').update({estoque:novo}).eq('id',p.id);
    }));
    cupomAtivo=null;co3CupomAtivo=null;co3Troco='';
    cart={itens:[],entrega:'Entrega'};updCartBadge();fecharCo3();mostrarSucesso();
  }catch(e){
    toast('Erro ao salvar pedido: '+e.message,'err');
    if(btn){btn.disabled=false;btn.textContent='Finalizar pedido';}
  }
};

// ── CO3: CALENDÁRIO INLINE ──
let _co3CalAno = 0, _co3CalMes = 0;

function co3CalInit(){
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  _co3CalAno = hoje.getFullYear();
  _co3CalMes = hoje.getMonth();
  co3CalRender();
}

function co3CalNav(d){
  _co3CalMes += d;
  if(_co3CalMes > 11){ _co3CalMes = 0; _co3CalAno++; }
  if(_co3CalMes < 0){ _co3CalMes = 11; _co3CalAno--; }
  co3CalRender();
}

function co3CalRender(){
  const MESES_LONG = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const DOWS = ['D','S','T','Q','Q','S','S'];
  const monthEl = document.getElementById('co3-cal-month');
  const gridEl = document.getElementById('co3-cal-grid');
  if(!monthEl||!gridEl) return;

  monthEl.textContent = MESES_LONG[_co3CalMes] + ' ' + _co3CalAno;

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate()+1);

  // Datas com corte de 20h (reutiliza datasComCorte)
  const proximas = new Set(
    datasComCorte().map(dt=>
      dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')
    )
  );

  const selVal = document.getElementById('co3-data')?.value || '';
  const primeiroDia = new Date(_co3CalAno, _co3CalMes, 1).getDay();
  const totalDias = new Date(_co3CalAno, _co3CalMes+1, 0).getDate();

  let html = DOWS.map(d=>`<div class="co3-cal-dow">${d}</div>`).join('');
  for(let i=0; i<primeiroDia; i++) html += '<div class="co3-cal-day empty"></div>';

  for(let dia=1; dia<=totalDias; dia++){
    const dt = new Date(_co3CalAno, _co3CalMes, dia);
    const iso = _co3CalAno+'-'+String(_co3CalMes+1).padStart(2,'0')+'-'+String(dia).padStart(2,'0');
    const isHoje = dt.getTime() === hoje.getTime();
    const bloqueada = dataBloqueada(iso,co3Modalidade);
    const isDisp = proximas.has(iso) && !bloqueada;
    const isSel = iso === selVal;
    let cls = 'co3-cal-day';
    if(isDisp) cls += ' available';
    else cls += ' disabled';
    if(isSel) cls += ' selected';
    if(isHoje) cls += ' today';
    if(isDisp){
      html += `<button class="${cls}" onclick="co3CalSel('${iso}')">${dia}</button>`;
    } else {
      html += `<div class="${cls}">${dia}</div>`;
    }
  }
  gridEl.innerHTML = html;
}

function co3CalSel(iso){
  if(dataBloqueada(iso,co3Modalidade)){
    mostrarBalloon('Essa data não está disponível. Escolha outra data.');
    return;
  }
  document.getElementById('co3-data').value = iso;
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y,m-1,d);
  const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];
  const MESES2 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const label = DIAS[dt.getDay()]+', '+String(d).padStart(2,'0')+'/'+MESES2[m-1];
  const lblEl = document.getElementById('co3-cal-selected-label');
  if(lblEl){ lblEl.textContent = label + ' selecionado'; lblEl.classList.add('show'); }
  co3CalRender();
  if(co3Modalidade==='Retirada') co3RenderRetOpts();
}

// ══════════════════════════════════════
// DISTÂNCIA DE ENTREGA
// ══════════════════════════════════════
// Usa linha reta com fator de correção urbana calibrado para RJ.

async function distanciaRota(lat1,lng1,lat2,lng2){
  // Haversine * 1.35 (fator urbano RJ calibrado)
  return haversine(lat1,lng1,lat2,lng2) * 1.35;
}

// Busca CEP sem calcular frete (só preenche os campos de endereço)
async function co3BuscarCepSemFrete(){
  const cepEl = document.getElementById('co3-cep');
  const info = document.getElementById('co3-frete-info');
  if(!cepEl) return;
  const cep = cepEl.value.replace(/\D/g,'');
  if(cep.length !== 8) return;
  if(info){ info.style.display='block'; info.textContent='Buscando endereço...'; info.style.color='var(--text2)'; }
  try{
    const r = await fetch('https://viacep.com.br/ws/'+cep+'/json/');
    const d = await r.json();
    if(!d.erro){
      document.getElementById('co3-rua-p1').value = d.logradouro||'';
      document.getElementById('co3-bairro-p1').value = d.bairro||'';
      document.getElementById('co3-cidade-p1').value = (d.localidade||'')+' / '+(d.uf||'');
      document.getElementById('co3-end-full').value = (d.logradouro||'')+', '+(d.bairro||'')+' - '+(d.localidade||'')+'/'+d.uf;
      window._cartCepData = d;
      if(info){ info.textContent='CEP encontrado. Informe o numero para calcular o frete.'; info.style.color='var(--text2)'; }
      document.getElementById('co3-num-p1').focus();
    } else {
      if(info){ info.textContent='CEP não encontrado.'; info.style.color='var(--red)'; }
    }
  }catch(e){
    if(info){ info.textContent='Erro ao buscar CEP.'; info.style.color='var(--red)'; }
  }
}

// Calcula frete após o número ser preenchido
async function co3CalcFreteComNum(){
  const num = document.getElementById('co3-num-p1')?.value.trim();
  const cepEl = document.getElementById('co3-cep');
  const info = document.getElementById('co3-frete-info');
  if(!num || !cepEl) return;
  const cep = cepEl.value.replace(/\D/g,'');
  if(cep.length !== 8 || !window._cartCepData) return;

  co3EnderecoForaRaio=false;
  if(info){ info.style.display='block'; info.textContent='Calculando frete...'; info.style.color='var(--text2)'; }

  // Atualizar end-full com número
  const d = window._cartCepData;
  const endBase = (d.logradouro||'')+', '+(d.bairro||'')+' - '+(d.localidade||'')+'/'+d.uf;
  document.getElementById('co3-end-full').value = endBase;

  if(!LOJA_LAT || !LOJA_LNG){
    TAXA = zonas[0]?.taxa || TAXA;
    co3EnderecoForaRaio = false;
    co3FreteCalculado = true; _freteCalculado = true;
    if(info){ info.textContent='Frete: R$ '+fp(TAXA); info.style.color='var(--green-bright)'; }
    co3UpdateResumo(); return;
  }

  try{
    const result = await geocodificarCEP(cep);
    if(!result){ if(info){ info.textContent='Não foi possível calcular o frete.'; info.style.color='var(--orange)'; } return; }
    window._cartCoords = {lat:result.lat, lng:result.lng};
    const dist = await distanciaRota(LOJA_LAT, LOJA_LNG, result.lat, result.lng);
    if(dist > RAIO_MAX){
      co3EnderecoForaRaio = true;
      co3FreteCalculado = false; _freteCalculado = false;
      if(info){ info.textContent='Fora do raio de entrega ('+dist.toFixed(1)+'km).'; info.style.color='var(--red)'; }
      return;
    }
    const zona = calcularZona(dist);
    if(zona){
      co3EnderecoForaRaio = false;
      TAXA = zona.taxa; _zonaAtiva = zona; co3FreteCalculado = true; _freteCalculado = true;
      if(info){ info.textContent=d.bairro+' · '+dist.toFixed(1)+'km · Frete: R$ '+fp(TAXA); info.style.color='var(--green-bright)'; }
      co3UpdateResumo();
    } else {
      if(info){ info.textContent='Endereço fora das zonas configuradas.'; info.style.color='var(--orange)'; }
    }
  }catch(e){
    if(info){ info.textContent='Erro ao calcular frete.'; info.style.color='var(--red)'; }
  }
}

let _co3CountdownTimer = null;

function co3IniciarCountdown(){
  const wrap=document.getElementById('co3-countdown-wrap');
  const btn=document.getElementById('co3-btn-finalizar');
  const cbtn=document.getElementById('co3-countdown-btn');
  if(!wrap)return;
  wrap.style.display='block';
  if(btn)btn.style.display='none';
  if(cbtn)cbtn.classList.remove('ready');
  clearInterval(_co3CountdownTimer);
  let seg=15;
  _co3CountdownTimer=setInterval(()=>{
    seg--;
    if(seg<=0){
      clearInterval(_co3CountdownTimer);
      if(cbtn)cbtn.classList.add('ready');
    }
  },1000);
}

function co3FinalizarReady(){
  const cbtn = document.getElementById('co3-countdown-btn');
  if(!cbtn || !cbtn.classList.contains('ready')) return;
  co3Finalizar();
}

function registrarPWA() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/loja/sw.js', { scope: '/loja/' }).catch(err => console.warn('Service worker:', err));
}
document.addEventListener('DOMContentLoaded', () => {
  init();
  verificarResetSenha();
  registrarPWA();
});
