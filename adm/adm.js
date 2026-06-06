const CONFIG = window.CONFIG;
const IMG_BASE = CONFIG.IMG_BASE;
const WHATSAPP_NUM = CONFIG.WHATSAPP_NUMBER;
const sb = window.sb;

let TAXA=2.50;
let PEDIDO_MIN=0;
let LOJA_LAT=null;
let _freteCalculado=false; // true somente após calcular CEP no carrinho // Latitude da loja (configurado no painel)
let LOJA_LNG=null; // Longitude da loja
let LOJA_ENDERECO=''; // Endereço da loja para geocoding
let RAIO_MAX=5; // Raio máximo de entrega em km
let zonas=[];
let datasBloqueadasAdm=[];
let INSTAGRAM_URL='https://instagram.com';
let WPP_MSG_TEMPLATE=''; // vazio = usa padrão do código
const PER=15;


let perfil=null,cats=[],prods=[];
let ap={itens:[],entrega:'Entrega'};
let apSel=null;
let fCatShop=null,fCatAdm=null,fCatP=null;
let rPage=1,rTotal=0,rCache=[];

const fp=v=>typeof v==='number'?v.toFixed(2).replace('.',','):'0,00';
const fd=d=>d?d.split('-').reverse().join('/'):'';
// Exibe "Terça, 20/mai" para datas de entrega
const h=v=>window.escapeHTML?window.escapeHTML(v??''):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
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

function isRetiradaPedido(p){
  return String(p?.entrega||'').trim().toLowerCase()==='retirada';
}
function isPedidoCancelado(p){
  return String(p?.status||'').trim().toLowerCase()==='cancelado';
}
function modalidadePedidoAdmin(p){
  return isRetiradaPedido(p)?'Retirada':'Entrega';
}
function statusOptionsPedido(p){
  return isRetiradaPedido(p)
    ? ['Pendente','Em preparo','Pronto para retirar','Retirado','Cancelado']
    : ['Pendente','Em preparo','Saiu para entrega','Entregue','Cancelado'];
}
function statusLabelPedido(status){
  return status==='Pendente'?'Confirmado':status;
}
function renderStatusOptionsPedido(p){
  return statusOptionsPedido(p).map(s=>`<option value="${s}"${(p.status||'Pendente')===s?' selected':''}>${statusLabelPedido(s)}</option>`).join('');
}

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

async function registrarPushAdmin(){
  const log=(msg,data)=>data!==undefined?console.log('[PUSH ADMIN]',msg,data):console.log('[PUSH ADMIN]',msg);
  const msgEl=document.getElementById('push-admin-msg');
  const btn=document.getElementById('push-admin-btn');
  const STEP_TIMEOUT=15000;
  const withTimeout=(promise,step)=>Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(step+' demorou demais')),STEP_TIMEOUT))
  ]);
  const setMsg=(msg,type='info')=>{
    if(!msgEl)return;
    msgEl.textContent=msg;
    msgEl.style.color=type==='ok'?'var(--green-bright)':type==='err'?'var(--red)':'var(--text2)';
  };
  try{
    log('Inicio do registro manual');
    if(btn){btn.disabled=true;btn.textContent='Ativando...';}
    setMsg('Verificando suporte...');

    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
      log('Push nao suportado neste dispositivo/navegador');
      setMsg('Este dispositivo/navegador não suporta push.','err');
      return;
    }

    log('Registrando service worker...');
    setMsg('Registrando service worker...');
    const reg=await withTimeout(
      navigator.serviceWorker.register('/adm/sw.js',{scope:'/adm/'}),
      'Registro do service worker'
    );
    if(!reg.active){
      log('Service worker instalado, mas ainda nao ativo',reg);
      setMsg('Service worker instalado. Feche e abra o app novamente e clique em Ativar notificações.','err');
      return;
    }
    if(!reg.pushManager){
      log('PushManager indisponivel no service worker');
      setMsg('Este dispositivo/navegador não suporta push.','err');
      return;
    }

    log('Buscando chave pública...');
    setMsg('Buscando chave pública...');
    const keyRes=await withTimeout(fetch('/api/push-public-key'),'Busca da chave pública');
    if(!keyRes.ok)throw new Error('Falha ao buscar chave publica');
    const {publicKey}=await withTimeout(keyRes.json(),'Leitura da chave pública');
    if(!publicKey)throw new Error('Chave publica ausente');

    log('Solicitando permissão...');
    setMsg('Solicitando permissão...');
    let permission=Notification.permission;
    if(permission==='default')permission=await withTimeout(Notification.requestPermission(),'Permissão de notificação');
    if(permission!=='granted'){
      log('Permissao negada',permission);
      setMsg('Permissão de notificação negada.','err');
      return;
    }

    log('Criando inscrição push...');
    setMsg('Criando inscrição push...');
    let sub=await withTimeout(reg.pushManager.getSubscription(),'Busca da inscrição push');
    if(!sub){
      log('Criando nova subscription');
      sub=await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:urlBase64ToUint8Array(publicKey)
        }),
        'Criação da inscrição push'
      );
    }

    log('Salvando inscrição...');
    setMsg('Salvando inscrição...');
    const saveRes=await withTimeout(
      fetch('/api/push-subscribe',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({subscription:sub.toJSON(),user_id:perfil?.id||null})
      }),
      'Salvamento da inscrição push'
    );
    if(!saveRes.ok){
      log('Erro ao salvar subscription',saveRes.status);
      setMsg('Erro ao salvar inscrição push.','err');
      return;
    }
    log('Subscription salva com sucesso');
    setMsg('Notificações ativadas neste dispositivo.','ok');
  }catch(err){
    console.warn('[PUSH ADMIN] Erro ao registrar push:',err);
    setMsg('Erro ao salvar inscrição push: '+(err?.message||'falha desconhecida')+'.','err');
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="bell"></i> Ativar notificações';refreshIcons();}
  }
}

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
async function distanciaRota(lat1,lng1,lat2,lng2){
  return haversine(lat1,lng1,lat2,lng2) * 1.35;
}

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

// Geocodificação e zonas de entrega para configuração administrativa

async function salvarConfigLoja(){
  const end=document.getElementById('dash-loja-end').value.trim();
  const raio=parseFloat(document.getElementById('dash-raio').value)||5;
  const msg=document.getElementById('dash-loja-msg');
  if(!end){toast('Informe o endereço da loja.','err');return}
  msg.style.color='var(--text2)';msg.textContent='Geocodificando endereço...';
  const coords=await geocodificar(end);
  if(!coords){msg.style.color='var(--red)';msg.textContent='Endereço não encontrado. Tente ser mais específico.';return}
  LOJA_LAT=coords.lat;LOJA_LNG=coords.lng;RAIO_MAX=raio;
  // Salvar no banco
  await Promise.all([
    sb.from('configuracoes').upsert({chave:'loja_lat',valor:String(coords.lat)},{onConflict:'chave'}),
    sb.from('configuracoes').upsert({chave:'loja_lng',valor:String(coords.lng)},{onConflict:'chave'}),
    sb.from('configuracoes').upsert({chave:'loja_endereco',valor:end},{onConflict:'chave'}),
    sb.from('configuracoes').upsert({chave:'raio_max',valor:String(raio)},{onConflict:'chave'}),
  ]);
  msg.style.color='var(--green-bright)';
  msg.textContent='Loja localizada! Lat: '+coords.lat.toFixed(4)+', Lng: '+coords.lng.toFixed(4)+' · Raio: '+raio+'km';
  toast('Endereço da loja salvo!','ok');
}

// Carregar config da loja
async function carregarConfigLoja(configs){
  configs.forEach(r=>{
    if(r.chave==='loja_lat')LOJA_LAT=parseFloat(r.valor)||null;
    if(r.chave==='loja_lng')LOJA_LNG=parseFloat(r.valor)||null;
    if(r.chave==='loja_endereco')LOJA_ENDERECO=r.valor||'';
    if(r.chave==='raio_max')RAIO_MAX=parseFloat(r.valor)||5;
  });
}

// Gerenciar zonas no painel
async function renderZonas(){
  const el=document.getElementById('dash-zonas-list');if(!el)return;
  if(!zonas.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">Nenhuma zona cadastrada.</div>';return}
  el.innerHTML=zonas.map(z=>'<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">'
    +'<div style="flex:1">'
    +'<div style="font-size:12px;font-weight:700">'+z.nome+'</div>'
    +'<div style="font-size:11px;color:var(--text2)">'+z.km_min+' – '+z.km_max+' km · R$ '+fp(z.taxa)+'</div>'
    +'</div>'
    +'<span class="badge '+(z.ativo?'bg-green':'bg-gray')+'">'+(z.ativo?'Ativa':'Off')+'</span>'
    +'<input type="number" step="0.5" value="'+z.taxa+'" style="width:70px;font-size:12px;padding:5px 8px;border-radius:7px;border:1px solid var(--border);background:var(--bg3);color:var(--text);font-family:var(--font)" onchange="editarZonaTaxa('+z.id+',this.value)">'
    +'<button class="btn btn-r btn-sm" onclick="rmZona('+z.id+')">×</button>'
    +'</div>').join('');
}


async function testarCEP(){
  const cep=document.getElementById('test-cep').value.replace(/\D/g,'');
  const res=document.getElementById('test-cep-result');
  if(cep.length!==8){res.style.display='block';res.textContent='CEP inválido.';return}
  res.style.display='block';res.textContent='Calculando...';

  const result=await geocodificarCEP(cep);
  if(!result||!result.viacep){res.textContent='CEP não encontrado ou erro de geocoding.';return}

  const dv=result.viacep;
  const dist=LOJA_LAT?await distanciaRota(LOJA_LAT,LOJA_LNG,result.lat,result.lng):null;
  const zona=dist?calcularZona(dist):null;

  let html='<div style="line-height:1.8">';
  html+='<div>📍 <strong>'+(dv.logradouro||dv.bairro)+', '+dv.bairro+'</strong></div>';
  html+='<div>🏙️ '+dv.localidade+' / '+dv.uf+'</div>';
  html+='<div>🌐 Lat: '+result.lat.toFixed(5)+' · Lng: '+result.lng.toFixed(5)+'</div>';
  if(dist!==null){
    html+='<div>📏 Distância da loja: <strong>'+dist.toFixed(2)+'km</strong></div>';
    if(dist>RAIO_MAX){
      html+='<div style="color:var(--red)">🚫 FORA DO RAIO (máx '+RAIO_MAX+'km)</div>';
    }else if(zona){
      html+='<div style="color:var(--green-bright)">✅ '+zona.nome+' — Taxa: <strong>R$ '+fp(zona.taxa)+'</strong></div>';
    }else{
      html+='<div style="color:var(--orange)">⚠️ Dentro do raio mas sem zona configurada para '+dist.toFixed(2)+'km</div>';
    }
  }else{
    html+='<div style="color:var(--orange)">⚠️ Endereço da loja não configurado. Configure acima primeiro.</div>';
  }
  html+='</div>';
  res.innerHTML=html;
}

async function addZona(){
  const nome=document.getElementById('z-nome').value.trim();
  const min=parseFloat(document.getElementById('z-min').value)||0;
  const max=parseFloat(document.getElementById('z-max').value);
  const taxa=parseFloat(document.getElementById('z-taxa').value);
  if(!nome||isNaN(max)||isNaN(taxa)){toast('Preencha todos os campos.','err');return}
  if(max<=min){toast('KM máximo deve ser maior que o mínimo.','err');return}
  const {data,error}=await sb.from('zonas_entrega').insert({nome,km_min:min,km_max:max,taxa,ativo:true}).select().single();
  if(error){toast('Erro: '+error.message,'err');return}
  zonas.push(data);
  ['z-nome','z-max','z-taxa'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('z-min').value='0';
  renderZonas();toast('Zona adicionada!','ok');
}

async function editarZonaTaxa(id,val){
  const taxa=parseFloat(val);if(isNaN(taxa)||taxa<0)return;
  await sb.from('zonas_entrega').update({taxa}).eq('id',id);
  const z=zonas.find(x=>x.id===id);if(z)z.taxa=taxa;
  toast('Taxa atualizada!','ok');
}

async function rmZona(id){
  if(!confirm('Remover zona?'))return;
  await sb.from('zonas_entrega').delete().eq('id',id);
  zonas=zonas.filter(z=>z.id!==id);renderZonas();
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
        }
      },2000);
    }
  }catch(e){
    console.error('Erro ao carregar catalogo:',e);
    // Tenta novamente em 3s
    setTimeout(()=>loadCatalog(),3000);
  }
}

function toggleSidebar(){
  const sb=document.getElementById('admin-sidebar');
  const ov=document.getElementById('sidebar-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('open');
}
function fecharSidebar(){
  const sb=document.getElementById('admin-sidebar');
  const ov=document.getElementById('sidebar-overlay');
  if(sb)sb.classList.remove('open');
  if(ov)ov.classList.remove('open');
}

function voltarLoja(){ window.location.href='/loja'; }
function showAPage(p,tab){
  document.querySelectorAll('.aside-item').forEach(b=>b.classList.remove('active'));
  if(tab)tab.classList.add('active');
  fecharSidebar();
  showAEl('ap-'+p);
  // Carregar dados ao entrar na page
  if(p==='dashboard')initDashboard();
  if(p==='relatorio'){rPage=1;renderRel();}
  if(p==='financeiro')initFinanceiro();
  if(p==='pedidos'){rpPage=1;renderPedidos();}
  if(p==='entregas'){
    document.getElementById('e-data').value='';
    const eb=document.getElementById('e-data-btn');
    if(eb){eb.textContent='Selecionar data de entrega';eb.classList.remove('selected');}
    renderEntregas();
  }
  if(p==='datas-bloqueadas')carregarDatasBloqueadasAdm();
  if(p==='produtos'){renderCatList();renderProdList();renderCatSel();renderPPills();}
  if(p==='categorias'){renderCatList();renderCatSel();}
  if(p==='estoque')renderEstoque();
  if(p==='config')initConfig();
  if(p==='clientes')initClientes();
  if(p==='landing')initLanding();
}
function showAEl(id){document.querySelectorAll('.apage,.apage-3col').forEach(el=>el.classList.remove('active'));document.getElementById(id).classList.add('active')}

function labelTipoBloqueio(tipo){
  return tipo==='entrega'?'Entrega':tipo==='retirada'?'Retirada':'Entrega e retirada';
}

async function carregarDatasBloqueadasAdm(){
  const list=document.getElementById('db-list');
  const count=document.getElementById('db-count');
  if(list)list.innerHTML='<div class="loading"><div class="spin"></div> Carregando...</div>';
  try{
    const {data,error}=await sb.from('datas_bloqueadas')
      .select('id,data,tipo,motivo,ativo,criado_em')
      .eq('ativo',true)
      .order('data',{ascending:true});
    if(error)throw error;
    datasBloqueadasAdm=data||[];
    if(count)count.textContent=datasBloqueadasAdm.length+' data'+(datasBloqueadasAdm.length!==1?'s':'');
    renderDatasBloqueadasAdm();
  }catch(e){
    datasBloqueadasAdm=[];
    if(count)count.textContent='';
    if(list)list.innerHTML='<div class="empty">Não foi possível carregar as datas bloqueadas.</div>';
    toast('Erro ao carregar datas bloqueadas.','err');
  }
}

function renderDatasBloqueadasAdm(){
  const list=document.getElementById('db-list');
  if(!list)return;
  if(!datasBloqueadasAdm.length){
    list.innerHTML='<div class="empty">Nenhuma data bloqueada ativa.</div>';
    return;
  }
  list.innerHTML=datasBloqueadasAdm.map(d=>{
    const tipo=d.tipo||'ambos';
    const motivo=d.motivo?'<div style="font-size:11px;color:var(--text3);margin-top:4px">'+h(d.motivo)+'</div>':'';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:800;color:var(--text)">${fdLabel(d.data)}</div>
        <div style="font-size:11px;color:var(--green-bright);font-weight:700;margin-top:3px">${h(labelTipoBloqueio(tipo))}</div>
        ${motivo}
      </div>
      <button class="btn btn-r btn-sm ico-gap" onclick="desativarDataBloqueada('${h(d.id)}')"><i data-lucide="trash-2"></i> Remover</button>
    </div>`;
  }).join('');
  refreshIcons();
}

async function salvarDataBloqueada(){
  const data=document.getElementById('db-data')?.value;
  const tipo=document.getElementById('db-tipo')?.value||'ambos';
  const motivo=document.getElementById('db-motivo')?.value.trim()||null;
  const msg=document.getElementById('db-msg');
  if(!data){toast('Selecione uma data.','err');return}
  if(!['entrega','retirada','ambos'].includes(tipo)){toast('Tipo de bloqueio inválido.','err');return}
  if(msg){msg.style.color='var(--text2)';msg.textContent='Salvando...';}
  try{
    const payload={data,tipo,motivo,ativo:true,criado_por:perfil?.id||null};
    const {error}=await sb.from('datas_bloqueadas').insert(payload);
    if(error)throw error;
    if(document.getElementById('db-data'))document.getElementById('db-data').value='';
    if(document.getElementById('db-motivo'))document.getElementById('db-motivo').value='';
    if(msg){msg.style.color='var(--green-bright)';msg.textContent='Data bloqueada salva.';}
    toast('Data bloqueada salva.','ok');
    await carregarDatasBloqueadasAdm();
  }catch(e){
    if(msg){msg.style.color='var(--red)';msg.textContent='Erro ao salvar data.';}
    toast('Erro ao salvar data bloqueada.','err');
  }
}

async function desativarDataBloqueada(id){
  if(!id)return;
  popConfirm('📅','Remover data bloqueada?','A data voltará a ficar disponível se as regras normais permitirem.','Remover','pbtn-danger',async()=>{
    const {error}=await sb.from('datas_bloqueadas').update({ativo:false}).eq('id',id);
    if(error){toast('Erro ao remover data.','err');return}
    toast('Data liberada.','ok');
    await carregarDatasBloqueadasAdm();
  });
}

function setAE(v){
  ap.entrega=v;
  document.getElementById('a-de').classList.toggle('active',v==='Entrega');
  document.getElementById('a-dr').classList.toggle('active',v==='Retirada');
  document.getElementById('a-taxa').style.display=v==='Entrega'?'inline-flex':'none';
  document.getElementById('a-tr').classList.toggle('hidden',v!=='Entrega');
  const tv=document.getElementById('a-taxa-val');if(tv)tv.textContent=fp(TAXA);
  const trv=document.getElementById('a-tr-val');if(trv)trv.textContent='+ R$ '+fp(TAXA);
  renderAOrder();
}
function renderACpills(){
  document.getElementById('a-cpills').innerHTML=cats.map(c=>{
    return '<button class="cpill'+(fCatAdm===c.id?' active':'')+'" onclick="fCatAdm='+c.id+';renderACpills()">'+h(c.nome)+'</button>';
  }).join('');
  renderAGrid();
}
function renderAGrid(){
  const q=(document.getElementById('a-search').value||'').toLowerCase();
  let ps=prods.filter(p=>p.ativo);
  if(!q&&fCatAdm)ps=ps.filter(p=>p.cat_id===fCatAdm);
  if(q)ps=ps.filter(p=>p.nome.toLowerCase().includes(q));
  const el=document.getElementById('a-grid');
  if(!ps.length){el.innerHTML='<div class="empty">Nenhum produto</div>';return}
  el.innerHTML=ps.map(p=>{
    return '<div class="prod-row">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700">'+emoji(p)+' '+p.nome+'</div>'
      +'<div style="font-size:10px;color:var(--text2)">'+(p.peso||'')+' · R$ '+fp(p.preco)+'</div>'
      +'</div>'
      +'<button class="btn btn-o btn-sm" style="flex-shrink:0" onclick="abrirModal('+p.id+')">+ Add</button>'
      +'</div>';
  }).join('');
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
  const selVal=document.getElementById(calCtx==='adm'?'a-data':'e-data')?.value||'';

  const primeiroDia=new Date(calAno,calMes,1).getDay();
  const totalDias=new Date(calAno,calMes+1,0).getDate();

  let html=DOWS.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<primeiroDia;i++) html+='<div class="cal-day empty"></div>';

  for(let dia=1;dia<=totalDias;dia++){
    const dt=new Date(calAno,calMes,dia);
    const iso=toISO(dt);
    const isHoje=dt.getTime()===hoje.getTime();
    const dow=dt.getDay();
    // Admin novo pedido: qualquer data. Entregas: todas as terças e sextas.
    let isDisponivel;
    if(calCtx==='adm') isDisponivel=true;
    else if(calCtx==='entr') isDisponivel=(dow===2||dow===5);
    else isDisponivel=false;
    const isSelected=iso===selVal;

    let cls='cal-day';
    if(isSelected) cls+=' selected-day';
    else if(isDisponivel) cls+=' available';
    else cls+=' disabled';
    if(isHoje) cls+=' today';

    if(isDisponivel){
      html+=`<button class="${cls}" onclick="selecionarData('${iso}')">${dia}</button>`;
    }else{
      html+=`<button class="${cls}" onclick="fecharCal();">${dia}</button>`;
    }
  }
  document.getElementById('cal-grid').innerHTML=html;
}

function selecionarData(iso){
  const idInput=calCtx==='adm'?'a-data':'e-data';
  const idBtn=calCtx==='adm'?'a-data-btn':'e-data-btn';
  document.getElementById(idInput).value=iso;
  const [y,m,d]=iso.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  const label=DIAS_NOME_LONG[dt.getDay()]+', '+String(d).padStart(2,'0')+'/'+MESES[m-1];
  const btn=document.getElementById(idBtn);
  btn.textContent=label;
  btn.classList.add('selected');
  fecharCal();
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
document.addEventListener('DOMContentLoaded',()=>{
  const _gpe=document.getElementById('g-popup');
  if(_gpe)_gpe.addEventListener('click',e=>{if(e.target===_gpe)closePopup();});
});


function abrirModal(id){
  const p=prods.find(x=>x.id===id);if(!p)return;
  apSel=id;
  document.getElementById('a-modal-t').textContent=emoji(p)+' '+p.nome;
  document.getElementById('a-modal-s').textContent=(p.peso?p.peso+' · ':'')+' R$ '+fp(p.preco);
  document.getElementById('a-qty').value=1;
  document.getElementById('a-modal').classList.add('open');
  setTimeout(()=>document.getElementById('a-qty').select(),60);
}
function fecharAModal(e){if(e.target===document.getElementById('a-modal'))document.getElementById('a-modal').classList.remove('open')}
function ajQty(d){
  const el=document.getElementById('a-qty');
  el.value=Math.max(1,(parseInt(el.value)||1)+d);
}
function confQty(){
  if(!apSel)return;
  const qty=Math.max(1,parseInt(document.getElementById('a-qty').value)||1);
  const ex=ap.itens.find(i=>i.prodId===apSel);
  if(ex)ex.qty+=qty;
  else ap.itens.push({prodId:apSel,qty});
  apSel=null;
  document.getElementById('a-modal').classList.remove('open');
  renderAOrder();
}
function renderAOrder(){
  const el=document.getElementById('a-items');
  const empty=document.getElementById('a-empty');
  if(!ap.itens.length){
    el.classList.add('hidden');empty.classList.remove('hidden');
    document.getElementById('a-badge').textContent='';
    ['a-si','a-sp','a-ss','a-st'].forEach((id,i)=>document.getElementById(id).textContent=['0','0,00 kg','R$ 0,00','R$ 0,00'][i]);
    return;
  }
  empty.classList.add('hidden');el.classList.remove('hidden');
  let tQty=0,tPeso=0;
  el.innerHTML=ap.itens.map((it,i)=>{
    const p=prods.find(x=>x.id===it.prodId);if(!p)return'';
    const sub=p.preco*it.qty;
    tQty+=it.qty;
    const n=p.peso?parseFloat(p.peso.replace(/[^0-9.]/g,'')):null;
    const u=p.peso?p.peso.replace(/[0-9. ]/g,'').toLowerCase():'';
    if(n&&u==='g')tPeso+=n*it.qty/1000;
    else if(n&&u==='kg')tPeso+=n*it.qty;
    return`<div class="oitem">
      <div><div class="oi-n">${emoji(p)} ${h(p.nome)}</div><div class="oi-s">${h(p.peso||'')}</div></div>
      <div class="oi-q"><button class="qb" onclick="aChgQ(${i},-1)">-</button><span class="qn">${it.qty}</span><button class="qb" onclick="aChgQ(${i},1)">+</button></div>
      <div class="oi-p">R$ ${fp(p.preco)}</div>
      <div class="oi-v">R$ ${fp(sub)}</div>
      <button class="db" onclick="aRm(${i})">✕</button>
    </div>`;
  }).join('');
  const sub=aCalcSub(),tot=aCalcTot();
  document.getElementById('a-badge').textContent=tQty+' item(s)';
  document.getElementById('a-si').textContent=tQty;
  document.getElementById('a-sp').textContent=tPeso.toFixed(2)+' kg';
  document.getElementById('a-ss').textContent='R$ '+fp(sub);
  document.getElementById('a-st').textContent='R$ '+fp(tot);
}

async function buscarCepAdmin(){
  const cepEl=document.getElementById('a-cep');
  const spin=document.getElementById('a-cep-spin');
  if(!cepEl)return;
  const cep=(cepEl.value||'').replace(/\D/g,'');
  if(cep.length!==8)return;
  if(spin)spin.style.display='inline-block';
  try{
    let data=null;
    if(typeof geocodificarCEP==='function'){
      const result=await geocodificarCEP(cep);
      data=result?.viacep||null;
    }
    if(!data){
      const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');
      if(r.ok)data=await r.json();
    }
    if(!data||data.erro)return;
    const end=document.getElementById('a-end');
    const num=document.getElementById('a-num');
    const partes=[
      data.logradouro||'',
      data.bairro||'',
      [data.localidade,data.uf].filter(Boolean).join(' / ')
    ].filter(Boolean);
    if(end)end.value=partes.join(' - ');
    if(num&&!num.value)num.focus();
  }catch(e){
    console.warn('buscarCepAdmin falhou',e);
  }finally{
    if(spin)spin.style.display='none';
  }
}

function aChgQ(i,d){ap.itens[i].qty=Math.max(1,ap.itens[i].qty+d);renderAOrder()}
function aRm(i){ap.itens.splice(i,1);renderAOrder()}
function aCalcSub(){return ap.itens.reduce((s,it)=>{const p=prods.find(x=>x.id===it.prodId);return s+(p?p.preco*it.qty:0)},0)}
function aCalcTot(){return aCalcSub()+(ap.entrega==='Entrega'?TAXA:0)}
function aLimpar(){
  if(ap.itens.length){popConfirm('🗑️','Limpar pedido?','Todos os itens serão removidos.','Limpar','pbtn-danger',()=>_aLimparExec());return}
  _aLimparExec();
}
function _aLimparExec(){
  ap={itens:[],entrega:'Entrega'};
  ['a-nome','a-tel','a-cep','a-end','a-num','a-obs'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('a-data').value='';
  const adb=document.getElementById('a-data-btn');
  if(adb){adb.textContent='Selecionar data de entrega';adb.classList.remove('selected');}
  setAE('Entrega');renderAOrder();
}
async function aSalvar(){
  const nome=document.getElementById('a-nome').value.trim();
  if(!nome){toast('Informe o nome do cliente.','err');return}
  if(!ap.itens.length){toast('Adicione ao menos um produto.','err');return}
  const btn=document.getElementById('a-save-btn');
  btn.disabled=true;btn.textContent='Salvando...';
  try{
    const dataPed=document.getElementById('a-data').value;
    const codigo=await gerarCodigo(dataPed);
    const sub=aCalcSub(),total=aCalcTot(),taxa=ap.entrega==='Entrega'?TAXA:0;
    const insertData={
      user_id:perfil.id,cliente_nome:nome,
      cliente_contato:document.getElementById('a-tel').value,
      cliente_endereco:document.getElementById('a-end').value,
      cliente_numero:document.getElementById('a-num').value,
      entrega:ap.entrega,taxa_entrega:taxa,
      pagamento:document.getElementById('a-pag').value,
      observacoes:document.getElementById('a-obs').value,
      subtotal:sub,total,data_pedido:dataPed
    };
    if(codigo)insertData.codigo=codigo;
    const {data:ped,error}=await sb.from('pedidos').insert(insertData).select().single();
    if(error)throw error;
    await sb.from('itens_pedido').insert(ap.itens.map(it=>{
      const p=prods.find(x=>x.id===it.prodId);
      return{pedido_id:ped.id,produto_id:p.id,nome_produto:p.nome,peso_produto:p.peso||'',preco_unitario:p.preco,quantidade:it.qty,subtotal:p.preco*it.qty};
    }));
    // Decrementar estoque
    await Promise.all(ap.itens.map(it=>{
      const p=prods.find(x=>x.id===it.prodId);
      if(!p||p.estoque==null)return Promise.resolve();
      const novo=Math.max(0,p.estoque-it.qty);
      p.estoque=novo;
      const upd8={estoque:novo};
      if(novo<=0){upd8.ativo=false;p.ativo=false;}
      return sb.from('produtos').update(upd8).eq('id',p.id);
    }));
    toast('Pedido salvo!','ok');aLimpar();
  }catch(e){toast('Erro: '+e.message,'err')}
  btn.disabled=false;btn.textContent='Salvar pedido';
}
function bldTxt(ped){
  const end=[ped.cliente_endereco,ped.cliente_numero].filter(Boolean).join(', no ');
  const ls=['=== PEDIDO ===','Cliente: '+ped.cliente_nome,ped.cliente_contato?'Contato: '+ped.cliente_contato:'','Entrega prevista: '+fd(ped.data_pedido),end?'Endereco: '+end:'','Entrega: '+ped.entrega,'Pagamento: '+ped.pagamento,ped.observacoes?'Obs: '+ped.observacoes:'','---'];
  (ped._itens||[]).forEach(it=>ls.push(it.quantidade+'x '+it.nome_produto+(it.peso_produto?' ('+it.peso_produto+')':'')+'= R$ '+fp(it.subtotal)));
  ls.push('---');if(ped.taxa_entrega>0)ls.push('Taxa entrega = R$ '+fp(ped.taxa_entrega));ls.push('TOTAL: R$ '+fp(ped.total));
  return ls.filter(Boolean).join('\n');
}
function aObj(){
  const sub=aCalcSub(),taxa=ap.entrega==='Entrega'?TAXA:0;
  return{cliente_nome:document.getElementById('a-nome').value.trim(),cliente_contato:document.getElementById('a-tel').value,cliente_endereco:document.getElementById('a-end').value,cliente_numero:document.getElementById('a-num').value,data_pedido:document.getElementById('a-data').value,entrega:ap.entrega,taxa_entrega:taxa,pagamento:document.getElementById('a-pag').value,observacoes:document.getElementById('a-obs').value,subtotal:sub,total:sub+taxa,_itens:ap.itens.map(it=>{const p=prods.find(x=>x.id===it.prodId);return{quantidade:it.qty,nome_produto:p?.nome||'',peso_produto:p?.peso||'',subtotal:(p?.preco||0)*it.qty}})};
}
function aImprimir(){const o=aObj();if(!o.cliente_nome||!ap.itens.length){toast('Complete o pedido primeiro.','err');return}const w=window.open('','_blank','width=400,height=600');w.document.write('<html><body style="font-family:monospace;font-size:12px;width:72mm;margin:0 auto;padding:8px"><pre style="white-space:pre-wrap">'+bldTxt(o)+'<\/pre><script>window.onload=()=>window.print()<\/script><\/body><\/html>');w.document.close()}
function aCopiar(){const o=aObj();if(!o.cliente_nome||!ap.itens.length){toast('Complete o pedido primeiro.','err');return}navigator.clipboard.writeText(bldTxt(o)).then(()=>toast('Copiado!','ok')).catch(()=>toast('Erro ao copiar.','err'))}

/* ── ENTREGAS ── */
async function renderEntregas(){
  const data=document.getElementById('e-data').value;
  const pedEl=document.getElementById('e-pedidos');
  if(!data){pedEl.innerHTML='<div class="empty">Selecione uma data acima.</div>';document.getElementById('e-cons').innerHTML='';return}
  pedEl.innerHTML='<div class="loading"><div class="spin"></div> Carregando...</div>';
  const {data:peds}=await sb.from('pedidos').select('*,itens_pedido(*)').eq('data_pedido',data).order('created_at',{ascending:true});
  const lista=(peds||[]).filter(p=>!isPedidoCancelado(p)&&p.status!=='Entregue'&&p.status!=='Pendente');
  window._entCache=lista;
  document.getElementById('e-tot-ped').textContent=lista.length;
  document.getElementById('e-tot-entr').textContent=lista.filter(p=>!isRetiradaPedido(p)).length;
  document.getElementById('e-tot-ret').textContent=lista.filter(isRetiradaPedido).length;
  if(!lista.length){
    pedEl.innerHTML='<div class="empty">Nenhum pedido para esta data.</div>';
    return;
  }
  const entregas=lista.filter(p=>!isRetiradaPedido(p));
  const retiradas=lista.filter(isRetiradaPedido);
  function cardPed(p){
    const its=(p.itens_pedido||[]).map(it=>it.quantidade+'x '+it.nome_produto).join(', ');
    const end=[p.cliente_endereco,p.cliente_numero].filter(Boolean).join(', no ');
    return`<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12px">${h(p.cliente_nome)}</div>
          ${p.cliente_contato?`<div style="font-size:11px;color:var(--text2)">${h(p.cliente_contato)}</div>`:''}
          ${end?`<div style="font-size:11px;color:var(--text2)">${end}</div>`:''}
          <div style="font-size:11px;color:var(--text2);margin-top:3px">${its}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Pgto: ${h(p.pagamento)}${p.observacoes?' · '+h(p.observacoes):''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:800;font-size:13px;color:var(--green-bright)">R$ ${fp(p.total)}</div>
          <select onchange="alterarStatusE(${p.id},this.value)" style="font-size:10px;padding:3px 5px;border-radius:6px;margin-top:4px;width:100%">
            ${renderStatusOptionsPedido(p)}
          </select>
        </div>
      </div>
    </div>`;
  }
  let html='';
  if(entregas.length){html+=`<div class="ico-gap" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--orange);margin-bottom:4px">${lucideIcon('truck')} Entregas (${entregas.length})</div>`;html+=entregas.map(cardPed).join('');}
  if(retiradas.length){if(entregas.length)html+=`<div style="margin-top:10px"></div>`;html+=`<div class="ico-gap" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#3b82f6;margin-bottom:4px">${lucideIcon('store')} Retiradas (${retiradas.length})</div>`;html+=retiradas.map(cardPed).join('');}
  pedEl.innerHTML=html;
  // Consolidado
  const consEl=document.getElementById('e-cons');
  const mapa={};
  lista.forEach(p=>(p.itens_pedido||[]).forEach(it=>{
    const k=it.produto_id||it.nome_produto;
    if(!mapa[k])mapa[k]={nome:it.nome_produto,peso:it.peso_produto,qty:0};
    mapa[k].qty+=it.quantidade;
  }));
  const items=Object.values(mapa).sort((a,b)=>b.qty-a.qty);
  consEl.innerHTML=items.map(it=>{
    const n=it.peso?parseFloat(it.peso.replace(/[^0-9.]/g,'')):null;
    const u=it.peso?it.peso.replace(/[0-9. ]/g,'').toLowerCase():'';
    let kg='';
    if(n&&u==='g')kg=` · ${(n*it.qty/1000).toFixed(2)}kg`;
    else if(n&&u==='kg')kg=` · ${(n*it.qty).toFixed(2)}kg`;
    return`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;font-size:12px">${it.nome}</div>
      <div style="font-weight:700;color:var(--green-bright);font-size:12px">${it.qty} un${kg}</div>
    </div>`;
  }).join('') || '<div class="empty">Sem produtos.</div>';
}
async function alterarStatusE(id,status){
  const {error}=await sb.from('pedidos').update({status}).eq('id',id);
  if(error){toast('Erro: '+error.message,'err');return;}
  // WhatsApp automático
  const p=(window._entCache||[]).find(x=>x.id===id);
  if(p&&WPP_STATUS_MSGS[status]){
    p.status=status;
    dispararWppStatus(p,status);
  }
  toast('Status atualizado: '+status,'ok');
  renderEntregas();
}
function imprimirTodosPedidos(){
  const lista=window._entCache||[];
  if(!lista.length){toast('Nenhum pedido para imprimir.','err');return}
  toast('Imprimindo '+lista.length+' pedido(s)... aguarde.','ok',lista.length*4000);
  lista.forEach((p,idx)=>{
    setTimeout(()=>{
      const _sub=(p.itens_pedido||[]).reduce((s,it)=>s+it.subtotal,0);
    const _end=[p.cliente_endereco,p.cliente_numero].filter(Boolean).join(', n. ');
    const _comp=p.cliente_complemento||'';
    const _isPix=(p.pagamento||'').toLowerCase().includes('pix');const _pago=p.status==='Pendente'?'PIX — AGUARDANDO PGTO':_isPix?'PGTO: PAGO':'PGTO: NA ENTREGA';
    const _dt=p.created_at?new Date(p.created_at).toLocaleString('pt-BR'):'';
    const _taxa=p.taxa_entrega>0?'R$ '+fp(p.taxa_entrega):'R$ 0,00';
    const _its=(p.itens_pedido||[]).map(it=>`<div class="item-row"><span class="chk">[ ]</span><span class="in">${it.quantidade}x ${it.nome_produto}${it.peso_produto?' ('+it.peso_produto+')':''}</span><span class="iv">R$ ${fp(it.subtotal)}</span></div>`).join('');
    const _html=`<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>@page{size:80mm auto;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    html{width:80mm}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;width:76mm;margin:0 auto;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{html,body{height:auto!important;overflow:visible!important}*{-webkit-font-smoothing:none!important}}
    .dt{text-align:center;font-size:10px;padding:5px 0 2px}
    .header{background:#000;color:#fff;text-align:center;padding:8px 4px 6px}
    .num{font-size:32px;font-weight:900;line-height:1}
    .sep{border:none;border-top:1px dashed #000;margin:5px 0;width:100%}
    .info-block{padding:5px 3px 3px}
    .ir{font-size:11px;margin-bottom:3px;line-height:1.4}
    .lbl{font-weight:400}
    .val{font-weight:900}
    .item-row{display:flex;align-items:flex-start;gap:2px;padding:3px 0;border-bottom:1px dotted #aaa}
    .chk{font-size:11px;flex-shrink:0;font-weight:900;min-width:18px}
    .in{flex:1;font-weight:900;font-size:11px}
    .iv{font-weight:900;font-size:11px;white-space:nowrap;min-width:55px;text-align:right}
    .totals{padding:4px 3px}
    .tr{display:flex;justify-content:space-between;font-size:11px;padding:1px 0}
    .tl{font-weight:400}
    .tv{font-weight:900}
    .tr.main .tl,.tr.main .tv{font-weight:900;font-size:12px}
    .pgto{background:#000;color:#fff;text-align:center;padding:7px 4px;margin:5px 0;font-size:13px;font-weight:900;letter-spacing:.5px}
    .obs{padding:3px 3px 5px;font-size:11px}
    .footer{text-align:center;font-size:10.5px;font-weight:700;padding:6px 2px;border-top:1px dashed #000}</style></head><body>
    <div class="dt">${_dt}</div>
    <div class="header"><div class="num">${h(p.codigo||'#'+p.id)}</div></div>
    <hr class="sep">
    <div class="info-block">
      <div class="ir"><span class="lbl">NOME: </span><span class="val">${h(p.cliente_nome)}</span></div>
      <div class="ir"><span class="lbl">TELEFONE: </span><span class="val">${h(p.cliente_contato||'—')}</span></div>
      <div class="ir"><span class="lbl">PAGAMENTO: </span><span class="val">${p.pagamento}</span></div>
      <div class="ir"><span class="lbl">MODALIDADE: </span><span class="val">${fdLabel(p.data_pedido)} · ${modalidadePedidoAdmin(p)}</span></div>
      ${_end?`<div class="ir"><span class="lbl">ENDEREÇO: </span><span class="val">${_end}</span></div>`:''}
      ${_comp?`<div class="ir"><span class="lbl">COMPLEMENTO: </span><span class="val">${_comp}</span></div>`:''}
    </div>
    <hr class="sep">
    ${_its}
    <hr class="sep">
    <div class="totals">
      <div class="tr"><span class="tl">TOTAL DOS ITENS:</span><span class="tv">R$ ${fp(_sub)}</span></div>
      <div class="tr"><span class="tl">TOTAL DE ENTREGA:</span><span class="tv">${_taxa}</span></div>
      <div class="tr main"><span class="tl">TOTAL DO PEDIDO:</span><span class="tv">R$ ${fp(p.total)}</span></div>
    </div>
    <div class="pgto">${_pago}</div>
    <div class="obs"><span class="lbl">OBSERVAÇÃO: </span><span class="val">${h(p.observacoes||'')}</span></div>
    <hr class="sep">
    <div class="footer">Seu pedido foi preparado com cuidado!</div>
    ${'<script>'}window.onload=function(){window.print();setTimeout(()=>window.close(),1500)}<\/script>
    </body></html>`;
      const blob=new Blob([_html],{type:'text/html'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.target='_blank';a.rel='noopener';
      document.body.appendChild(a);a.click();
      setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},5000);
    }, idx*3500);
  });
}

function imprimirEntregas(){
  const data=document.getElementById('e-data').value;
  if(!data){toast('Selecione uma data primeiro.','err');return}
  const label=fdLabel(data)||fd(data);
  const pedidos=window._entCache||[];
  if(!pedidos.length){toast('Sem produtos no consolidado.','err');return}
  // Monta consolidado
  const mapa={};
  pedidos.forEach(p=>(p.itens_pedido||[]).forEach(it=>{
    const k=it.produto_id||it.nome_produto;
    if(!mapa[k])mapa[k]={nome:it.nome_produto,peso:it.peso_produto,qty:0};
    mapa[k].qty+=it.quantidade;
  }));
  const consLines=Object.values(mapa).sort((a,b)=>b.qty-a.qty).map(it=>{
    const n=it.peso?parseFloat(it.peso.replace(/[^0-9.]/g,'')):null;
    const u=it.peso?it.peso.replace(/[0-9. ]/g,'').toLowerCase():'';
    let kg='';if(n&&u==='g')kg=' / '+(n*it.qty/1000).toFixed(2)+'kg';else if(n&&u==='kg')kg=' / '+(n*it.qty).toFixed(2)+'kg';
    return`<div class="row"><span>${it.nome}</span><span class="qty">${it.qty}un${kg}</span></div>`;
  }).join('');
  const total=Object.values(mapa).reduce((s,it)=>s+it.qty,0);
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    @page{size:80mm auto;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    html{width:80mm}
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;width:76mm;margin:0 auto;padding:3mm 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{html,body{height:auto!important;overflow:visible!important}*{-webkit-font-smoothing:none!important}}
    .header{background:#000;color:#fff;text-align:center;padding:6px 4px;margin-bottom:4px}
    .header .title{font-size:14px;font-weight:900;letter-spacing:1px}
    .header .sub{font-size:10px;opacity:.7;margin-top:2px}
    .sep{border:none;border-top:1px dashed #000;margin:4px 0;width:100%}
    .sep2{border:none;border-top:2px solid #000;margin:4px 0;width:100%}
    .row{display:flex;justify-content:space-between;align-items:center;padding:4px 2px;border-bottom:1px dotted #ccc;font-size:12px}
    .row span:first-child{flex:1;font-weight:600}
    .qty{font-weight:900;color:#000;white-space:nowrap}
    .footer{display:flex;justify-content:space-between;padding:5px 2px;font-size:12px;font-weight:700;border-top:2px solid #000;margin-top:3px}
  </style></head><body>
  <div class="header">
    <div class="title">CONSOLIDADO</div>
    <div class="sub">${label} · ${pedidos.length} pedido(s)</div>
  </div>
  ${consLines}
  <div class="footer"><span>TOTAL GERAL</span><span>${total} un</span></div>
  ${'<script>'}window.onload=function(){window.print();}<\/script>
  </body></html>`;
  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.target='_blank';a.rel='noopener';
  document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},3000);
}

/* RELATORIO */
function toggleRFiltro(){
  const t=document.getElementById('r-tipo').value;
  document.getElementById('r-fdia').classList.toggle('hidden',t!=='dia');
  document.getElementById('r-fper').classList.toggle('hidden',t!=='periodo');
  renderRel();
}
async function renderRel(){
  const busca=(document.getElementById('r-busca').value||'').toLowerCase();
  const tipo=document.getElementById('r-tipo').value;
  const dataFiltro=tipo==='dia'?document.getElementById('r-data').value:null;
  const deFiltro=document.getElementById('r-de').value;
  const ateFiltro=document.getElementById('r-ate').value;
  const temFiltroData=(tipo==='dia'&&dataFiltro)||(tipo==='periodo'&&(deFiltro||ateFiltro));

  // Query para a listagem (filtrada)
  let q=sb.from('pedidos').select('*,itens_pedido(*)').order('created_at',{ascending:false});
  if(tipo==='dia'){if(dataFiltro)q=q.eq('data_pedido',dataFiltro);}
  else{if(deFiltro)q=q.gte('data_pedido',deFiltro);if(ateFiltro)q=q.lte('data_pedido',ateFiltro);}
  const {data:peds}=await q;
  const lista=(peds||[]).filter(p=>!busca||p.cliente_nome.toLowerCase().includes(busca)||(p.codigo&&p.codigo.includes(busca)));
  const listaVisivel=lista.filter(p=>!isPedidoCancelado(p));
  rCache=listaVisivel;rTotal=listaVisivel.length;rPage=1;

  // Stats: sem filtro = todos os pedidos; com filtro = só os filtrados
  let statsAtivos;
  if(temFiltroData||busca){
    statsAtivos=lista.filter(p=>!isPedidoCancelado(p));
  }else{
    // Busca total geral sem filtro
    const {data:todos}=await sb.from('pedidos').select('id,total,status');
    statsAtivos=(todos||[]).filter(p=>!isPedidoCancelado(p));
  }
  const totG=statsAtivos.reduce((s,p)=>s+p.total,0);
  const totT=lista.filter(p=>!isPedidoCancelado(p)).reduce((s,p)=>s+(Number(p.taxa_entrega)||0),0);
  document.getElementById('r-stats').innerHTML=
    '<div class="scard"><div class="scard-l">Pedidos</div><div class="scard-v">'+statsAtivos.length+'</div></div>'
    +'<div class="scard"><div class="scard-l">Faturamento</div><div class="scard-v green">R$ '+fp(totG)+'</div></div>'
    +'<div class="scard"><div class="scard-l">Ticket médio</div><div class="scard-v">R$ '+(statsAtivos.length?fp(totG/statsAtivos.length):'0,00')+'</div></div>';
  const pedEl=document.getElementById('r-peds');
  const listaHistorico=listaVisivel;
  if(!listaHistorico.length){pedEl.innerHTML='<div class="empty">Nenhum pedido no período.</div>'}
  else{
    pedEl.innerHTML=listaHistorico.map(p=>{
      const its=(p.itens_pedido||[]).map(it=>it.quantidade+'x '+it.nome_produto).join(' / ');
      const dataEntrega=fdLabel(p.data_pedido)||fd(p.data_pedido);
      const dtCompra=p.created_at?new Date(p.created_at):null;
      const dataPedido=dtCompra?dtCompra.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'';
      const horaPedido=dtCompra?dtCompra.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';
      return`<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border);gap:8px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:12px">${h(p.cliente_nome)}</span>
            ${p.codigo?`<span style="font-size:9px;font-weight:700;font-family:monospace;color:var(--text3)">${h(p.codigo)}</span>`:''}
            ${p.taxa_entrega>0?'<span class="badge bg-orange" style="font-size:9px">Taxa</span>':''}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
            ${dataPedido?`<span>📝 ${dataPedido}${horaPedido?' · '+horaPedido:''}</span>`:''}
            ${dataEntrega?`<span>${modalidadePedidoAdmin(p)} · ${dataEntrega}</span>`:''}
          </div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${its}</div>
        </div>
        <div style="font-weight:700;color:var(--green-bright);font-size:12px;white-space:nowrap">R$ ${fp(p.total)}</div>
      </div>`;
    }).join('');
    if(totT>0)pedEl.innerHTML+=`<div style="padding:7px 0;display:flex;justify-content:space-between;font-size:11px;color:var(--orange)"><span>Total taxas</span><span style="font-weight:700">R$ ${fp(totT)}</span></div>`;
  }
  renderRPage();
  renderRPag();
}
function renderRPag(){
  const total=Math.ceil(rTotal/PER);
  const el=document.getElementById('r-pag');
  if(total<=1){el.innerHTML='';return}
  let html='<button class="pag-btn"'+(rPage===1?' disabled':'')+' onclick="goRPage('+(rPage-1)+')">\u2190 Ant</button>';
  const maxBtn=7;
  let start=Math.max(1,rPage-Math.floor(maxBtn/2));
  let end=Math.min(total,start+maxBtn-1);
  if(end-start<maxBtn-1)start=Math.max(1,end-maxBtn+1);
  if(start>1)html+='<button class="pag-btn" onclick="goRPage(1)">1</button><span style="padding:4px;color:var(--text3)">...</span>';
  for(let i=start;i<=end;i++)html+='<button class="pag-btn'+(i===rPage?' active':'')+'" onclick="goRPage('+i+')">'+i+'</button>';
  if(end<total)html+='<span style="padding:4px;color:var(--text3)">...</span><button class="pag-btn" onclick="goRPage('+total+')">'+total+'</button>';
  html+='<button class="pag-btn"'+(rPage===total?' disabled':'')+' onclick="goRPage('+(rPage+1)+')">Prox \u2192</button>';
  html+='<span style="padding:4px 8px;font-size:11px;color:var(--text3)">'+(rTotal)+' pedido(s)</span>';
  el.innerHTML=html;
}
function goRPage(p){
  const total=Math.ceil(rTotal/PER);
  rPage=Math.max(1,Math.min(total,p));
  renderRPage();renderRPag();
  document.getElementById('r-table').scrollIntoView({behavior:'smooth',block:'nearest'});
}


function exportRel(){
  if(!rCache.length){toast('Nenhum pedido para exportar.','err');return}
  const linhas=['=== RELATORIO DE PEDIDOS ===','Total: '+rCache.length+' pedido(s)','Gerado em: '+new Date().toLocaleString('pt-BR'),''];
  rCache.forEach((p,i)=>{
    const end=[p.cliente_endereco,p.cliente_numero].filter(Boolean).join(', no ');
    linhas.push('--- Pedido '+(i+1)+' ---');
    linhas.push('Cliente: '+p.cliente_nome);
    if(p.cliente_contato)linhas.push('Contato: '+p.cliente_contato);
    linhas.push('Entrega: '+fd(p.data_pedido));
    if(end)linhas.push('Endereco: '+end);
    linhas.push('Entrega: '+p.entrega+' | Pagamento: '+p.pagamento);
    if(p.status)linhas.push('Status: '+p.status);
    if(p.observacoes)linhas.push('Obs: '+p.observacoes);
    (p.itens_pedido||[]).forEach(it=>{
      linhas.push('  '+it.quantidade+'x '+it.nome_produto+(it.peso_produto?' ('+it.peso_produto+')':'')+'= R$ '+fp(it.subtotal));
    });
    if(p.taxa_entrega>0)linhas.push('  Taxa entrega = R$ '+fp(p.taxa_entrega));
    linhas.push('TOTAL: R$ '+fp(p.total));
    linhas.push('');
  });
  const totG=rCache.filter(p=>!isPedidoCancelado(p)).reduce((s,p)=>s+(Number(p.total)||0),0);
  linhas.push('=== TOTAL GERAL: R$ '+fp(totG)+' ===');
  const txt=linhas.join('\n');
  navigator.clipboard.writeText(txt)
    .then(()=>toast('Relatório copiado!','ok'))
    .catch(()=>{
      const w=window.open('','_blank','width=600,height=700');
      if(w){w.document.write('<html><body style="font-family:monospace;font-size:13px;padding:20px;white-space:pre-wrap">'+txt.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</body></html>');w.document.close();}
    });
}

async function verPed(id){
  const caches=[rCache,rpCache,window._entCache||[],window._pedClienteCache||[]];
  let p=caches.flat().find(x=>String(x.id)===String(id));
  if(!p?.itens_pedido){
    const {data,error}=await sb.from('pedidos').select('*,itens_pedido(*)').eq('id',id).single();
    if(error||!data){toast('Não foi possível abrir os detalhes do pedido.','err');return;}
    p=data;
  }
  window._pedDetalheAtual=p;
  const end=[p.cliente_endereco,p.cliente_numero].filter(Boolean).join(', nº ');
  const subtotal=Number(p.subtotal)||(p.itens_pedido||[]).reduce((s,it)=>s+(Number(it.subtotal)||0),0);
  const its=(p.itens_pedido||[]).map(it=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px"><span>${Number(it.quantidade)||0}x ${h(it.nome_produto)}${it.peso_produto?' ('+h(it.peso_produto)+')':''}</span><span style="font-weight:700;color:var(--green-bright)">R$ ${fp(Number(it.subtotal)||0)}</span></div>`).join('');
  const taxa=Number(p.taxa_entrega)>0?`<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;color:var(--orange)"><span>Taxa de entrega</span><span style="font-weight:700">R$ ${fp(Number(p.taxa_entrega))}</span></div>`:'';
  const cupom=p.cupom?`<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px"><span>Cupom</span><span style="font-weight:700">${h(p.cupom)}</span></div>`:'';
  const total=`<div style="display:flex;justify-content:space-between;padding:9px 0;font-size:14px;font-weight:800;border-top:2px solid var(--border);margin-top:4px"><span>Total</span><span style="color:var(--green-bright)">R$ ${fp(Number(p.total)||0)}</span></div>`;

  document.getElementById('ped-det-codigo').textContent='Pedido '+(p.codigo||'#'+p.id);
  document.getElementById('ped-det-status').innerHTML=
    `<div style="text-align:center;font-size:12px;font-weight:800;color:var(--green-bright)">${h(p.status||'Pendente')}</div>`
    +`<div style="text-align:center;font-size:11px;color:var(--text3);margin-top:4px">${modalidadePedidoAdmin(p)}: ${fdLabel(p.data_pedido)}</div>`;
  document.getElementById('ped-det-body').innerHTML=`
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px;display:flex;flex-direction:column;gap:3px">
      <div class="ico-gap">${lucideIcon('user')} ${h(p.cliente_nome||'Cliente')} · ${h(p.cliente_contato||'Sem contato')}</div>
      ${end?`<div class="ico-gap">${lucideIcon('map-pin')} ${h(end)}</div>`:''}
      <div class="ico-gap">${lucideIcon('credit-card')} ${h(p.pagamento||'Não informado')} · ${modalidadePedidoAdmin(p)}</div>
      ${p.observacoes?`<div class="ico-gap">${lucideIcon('notebook-pen')} ${h(p.observacoes)}</div>`:''}
    </div>
    <div>${its}<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px"><span>Subtotal</span><span style="font-weight:700">R$ ${fp(subtotal)}</span></div>${taxa}${cupom}${total}</div>`;
  document.getElementById('ped-det-btns').innerHTML=
    `<div style="display:flex;gap:8px">
      <button class="btn btn-o" style="flex:1" onclick="imprimirPedido(${id});document.getElementById('ped-det-modal').classList.remove('open')">Imprimir</button>
      <button class="btn btn-g" style="flex:1" onclick="document.getElementById('ped-det-modal').classList.remove('open')">OK</button>
    </div>`;
  const _pdm2=document.getElementById('ped-det-modal');
  document.body.appendChild(_pdm2);
  _pdm2.removeAttribute('inert');
  _pdm2.style.display='flex';
  _pdm2.classList.add('open');
  refreshIcons();
}
function imprimirPedido(id){
  const p=[rCache,rpCache,window._entCache||[],[window._pedDetalheAtual].filter(Boolean)].flat().find(x=>String(x.id)===String(id));if(!p)return;
  const _sub=(p.itens_pedido||[]).reduce((s,it)=>s+it.subtotal,0);
    const _end=[p.cliente_endereco,p.cliente_numero].filter(Boolean).join(', n. ');
    const _comp=p.cliente_complemento||'';
    const _isPix=(p.pagamento||'').toLowerCase().includes('pix');const _pago=p.status==='Pendente'?'PIX — AGUARDANDO PGTO':_isPix?'PGTO: PAGO':'PGTO: NA ENTREGA';
    const _dt=p.created_at?new Date(p.created_at).toLocaleString('pt-BR'):'';
    const _taxa=p.taxa_entrega>0?'R$ '+fp(p.taxa_entrega):'R$ 0,00';
    const _its=(p.itens_pedido||[]).map(it=>`<div class="item-row"><span class="chk">[ ]</span><span class="in">${it.quantidade}x ${it.nome_produto}${it.peso_produto?' ('+it.peso_produto+')':''}</span><span class="iv">R$ ${fp(it.subtotal)}</span></div>`).join('');
    const _html=`<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>@page{size:80mm auto;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    html{width:80mm}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;width:76mm;margin:0 auto;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{html,body{height:auto!important;overflow:visible!important}*{-webkit-font-smoothing:none!important}}
    .dt{text-align:center;font-size:10px;padding:5px 0 2px}
    .header{background:#000;color:#fff;text-align:center;padding:8px 4px 6px}
    .num{font-size:32px;font-weight:900;line-height:1}
    .sep{border:none;border-top:1px dashed #000;margin:5px 0;width:100%}
    .info-block{padding:5px 3px 3px}
    .ir{font-size:11px;margin-bottom:3px;line-height:1.4}
    .lbl{font-weight:400}
    .val{font-weight:900}
    .item-row{display:flex;align-items:flex-start;gap:2px;padding:3px 0;border-bottom:1px dotted #aaa}
    .chk{font-size:11px;flex-shrink:0;font-weight:900;min-width:18px}
    .in{flex:1;font-weight:900;font-size:11px}
    .iv{font-weight:900;font-size:11px;white-space:nowrap;min-width:55px;text-align:right}
    .totals{padding:4px 3px}
    .tr{display:flex;justify-content:space-between;font-size:11px;padding:1px 0}
    .tl{font-weight:400}
    .tv{font-weight:900}
    .tr.main .tl,.tr.main .tv{font-weight:900;font-size:12px}
    .pgto{background:#000;color:#fff;text-align:center;padding:7px 4px;margin:5px 0;font-size:13px;font-weight:900;letter-spacing:.5px}
    .obs{padding:3px 3px 5px;font-size:11px}
    .footer{text-align:center;font-size:10.5px;font-weight:700;padding:6px 2px;border-top:1px dashed #000}</style></head><body>
    <div class="dt">${_dt}</div>
    <div class="header"><div class="num">${h(p.codigo||'#'+p.id)}</div></div>
    <hr class="sep">
    <div class="info-block">
      <div class="ir"><span class="lbl">NOME: </span><span class="val">${h(p.cliente_nome)}</span></div>
      <div class="ir"><span class="lbl">TELEFONE: </span><span class="val">${h(p.cliente_contato||'—')}</span></div>
      <div class="ir"><span class="lbl">PAGAMENTO: </span><span class="val">${p.pagamento}</span></div>
      <div class="ir"><span class="lbl">MODALIDADE: </span><span class="val">${fdLabel(p.data_pedido)} · ${modalidadePedidoAdmin(p)}</span></div>
      ${_end?`<div class="ir"><span class="lbl">ENDEREÇO: </span><span class="val">${_end}</span></div>`:''}
      ${_comp?`<div class="ir"><span class="lbl">COMPLEMENTO: </span><span class="val">${_comp}</span></div>`:''}
    </div>
    <hr class="sep">
    ${_its}
    <hr class="sep">
    <div class="totals">
      <div class="tr"><span class="tl">TOTAL DOS ITENS:</span><span class="tv">R$ ${fp(_sub)}</span></div>
      <div class="tr"><span class="tl">TOTAL DE ENTREGA:</span><span class="tv">${_taxa}</span></div>
      <div class="tr main"><span class="tl">TOTAL DO PEDIDO:</span><span class="tv">R$ ${fp(p.total)}</span></div>
    </div>
    <div class="pgto">${_pago}</div>
    <div class="obs"><span class="lbl">OBSERVAÇÃO: </span><span class="val">${h(p.observacoes||'')}</span></div>
    <hr class="sep">
    <div class="footer">Seu pedido foi preparado com cuidado!</div>
    ${'<script>'}window.onload=function(){window.print();}<\/script>
    </body></html>`;
  const blob=new Blob([_html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.target='_blank';a.rel='noopener';
  document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url)},3000);
}


// ══════════════════════════════════════
// WHATSAPP AUTOMÁTICO POR STATUS
// ══════════════════════════════════════
// Mensagens padrão (usadas se não houver customização)
const WPP_STATUS_MSGS_DEFAULT = {
  'Em preparo': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! 👋\n\n`+
    `Seu pedido *${p.codigo||'#'+p.id}* está sendo preparado com carinho! 🌿\n`+
    `Entrega prevista: *${fdLabel(p.data_pedido)}*\n\n`+
    `Qualquer dúvida estamos aqui! 😊`,
  'Saiu para entrega': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! 🚚\n\n`+
    `Seu pedido *${p.codigo||'#'+p.id}* saiu para entrega agora!\n`+
    `Fique de olho, está a caminho! 🌱\n\n`+
    `Qualquer dúvida estamos aqui! 😊`,
  'Entregue': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! ✅\n\n`+
    `Seu pedido *${p.codigo||'#'+p.id}* foi entregue!\n`+
    `Obrigado pela preferência e até a próxima! 💚\n\n`+
    `*Cortadinhos com Carinho* 🌿`,
  'Cancelado': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! 😔\n\n`+
    `Infelizmente seu pedido *${p.codigo||'#'+p.id}* foi cancelado.\n`+
    `Em caso de dúvidas, entre em contato conosco.\n\n`+
    `*Cortadinhos com Carinho* 🌿`
};

// Mensagens customizadas salvas no banco (sobrescrevem as padrão)
let WPP_STATUS_CUSTOM = {};

const WPP_STATUS_MSGS = {
  'Em preparo': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! 👋\n\n`+
    `Seu pedido *${p.codigo||'#'+p.id}* está sendo preparado com carinho! 🌿\n`+
    `Entrega prevista: *${fdLabel(p.data_pedido)}*\n\n`+
    `Qualquer dúvida estamos aqui! 😊`,

  'Saiu para entrega': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! 🚚\n\n`+
    `Seu pedido *${p.codigo||'#'+p.id}* saiu para entrega agora!\n`+
    `Fique de olho, está a caminho! 🌱\n\n`+
    `Qualquer dúvida estamos aqui! 😊`,

  'Entregue': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! ✅\n\n`+
    `Seu pedido *${p.codigo||'#'+p.id}* foi entregue!\n`+
    `Obrigado pela preferência e até a próxima! 💚\n\n`+
    `*Cortadinhos com Carinho* 🌿`,

  'Cancelado': (p) =>
    `Olá, ${p.cliente_nome.split(' ')[0]}! 😔\n\n`+
    `Infelizmente seu pedido *${p.codigo||'#'+p.id}* foi cancelado.\n`+
    `Em caso de dúvidas, entre em contato conosco.\n\n`+
    `*Cortadinhos com Carinho* 🌿`
};

function dispararWppStatus(pedido, status){
  // Prioridade: mensagem customizada → mensagem padrão
  let msg;
  if(WPP_STATUS_CUSTOM[status]){
    // Substituir variáveis na mensagem customizada
    msg = WPP_STATUS_CUSTOM[status]
      .replace(/{nome}/g, pedido.cliente_nome.split(' ')[0])
      .replace(/{nomeCompleto}/g, pedido.cliente_nome)
      .replace(/{codigo}/g, pedido.codigo||'#'+pedido.id)
      .replace(/{data}/g, fdLabel(pedido.data_pedido)||fd(pedido.data_pedido));
  }else{
    const fn = WPP_STATUS_MSGS[status];
    if(!fn) return;
    msg = fn(pedido);
  }
  const tel = (pedido.cliente_contato||'').replace(/\D/g,'');
  if(!tel || tel.length < 10){
    toast('Sem telefone do cliente para enviar WhatsApp.','err',3000);
    return;
  }
  // Adicionar DDI 55 se não tiver
  const telFull = tel.startsWith('55') ?tel : '55'+tel;
  const url = 'https://wa.me/'+telFull+'?text='+encodeURIComponent(msg);
  window.open(url, '_blank');
}

async function alterarStatus(id,status){
  const {error}=await sb.from('pedidos').update({status}).eq('id',id);
  if(error){toast('Erro ao salvar status: '+error.message,'err');return;}
  // Buscar pedido do cache (rCache ou rpCache)
  const p=rCache.find(x=>x.id===id)||rpCache.find(x=>x.id===id);
  if(p){
    p.status=status;
    // Disparar WhatsApp se status envia mensagem
    if(WPP_STATUS_MSGS[status]){
      dispararWppStatus(p, status);
    }
  }
  toast('Status atualizado: '+status,'ok');
}
function renderRPage(){
  const start=(rPage-1)*PER;
  const pagina=rCache.slice(start,start+PER);
  document.getElementById('r-loading').classList.add('hidden');
  const table=document.getElementById('r-table');table.classList.remove('hidden');
  const tbody=document.getElementById('r-tbody');
  if(!pagina.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text3)">Nenhum pedido</td></tr>';renderRPag();return}
  tbody.innerHTML=pagina.map(p=>{
    const opts=renderStatusOptionsPedido(p);
    return '<tr>'
      +'<td><span style="font-size:11px;font-weight:700;font-family:monospace;color:var(--text2)">'+h(p.codigo||'-')+'</span></td>'
      +'<td><div style="font-weight:700;font-size:12px">'+h(p.cliente_nome)+'</div><div style="font-size:10px;color:var(--text2)">'+h(p.cliente_contato||'')+'</div></td>'
      +'<td><div style="font-size:11px">'+( p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):'-')+'</div>'
      +(p.created_at?'<div style="font-size:10px;color:var(--text3)">'+new Date(p.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</div>':'')
      +'</td>'
      +'<td><div style="font-size:11px;font-weight:600">'+fdLabel(p.data_pedido)+'</div></td>'
      +'<td><select onchange="alterarStatus('+p.id+',this.value)" style="font-size:11px;padding:4px 6px;border-radius:6px;width:100%;min-width:120px">'+opts+'</select></td>'
      +'<td>'+(!isRetiradaPedido(p)?'<span class="badge bg-orange">Entrega</span>':'<span class="badge bg-gray">Retirada</span>')+'</td>'
      +'<td>'+p.pagamento+'</td>'
      +'<td style="text-align:right;font-weight:700;color:var(--green-bright)">R$ '+fp(p.total)+'</td>'
      +'<td><button class="btn btn-o btn-sm" onclick="verPed('+p.id+')">Ver</button></td>'
      +'</tr>';
  }).join('');
}

async function editEstoque(id){
  const p=prods.find(x=>x.id===id);if(!p)return;
  // Abre modal de estoque
  document.getElementById('est-modal-t').textContent=emoji(p)+' '+p.nome;
  document.getElementById('est-modal-atual').textContent='Atual: '+(p.estoque!=null?p.estoque+' un':'Ilimitado');
  document.getElementById('est-val').value=p.estoque!=null?p.estoque:'';
  document.getElementById('est-delta').value='';
  document.getElementById('est-produto-id').value=id;
  document.getElementById('est-modal').classList.add('open');
  setTimeout(()=>document.getElementById('est-val').select(),60);
}
async function salvarEstoque(){
  const id=parseInt(document.getElementById('est-produto-id').value);
  const p=prods.find(x=>x.id===id);if(!p)return;
  const valRaw=document.getElementById('est-val').value.trim();
  const deltaRaw=document.getElementById('est-delta').value.trim();
  let novo;
  if(deltaRaw!==''){
    const d=parseInt(deltaRaw);
    if(isNaN(d)){toast('Delta inválido.','err');return}
    novo=(p.estoque!=null?p.estoque:0)+d;
    if(novo<0)novo=0;
  }else if(valRaw===''){
    novo=null; // ilimitado
  }else{
    novo=parseInt(valRaw);
    if(isNaN(novo)||novo<0){toast('Valor inválido.','err');return}
  }
  const {error}=await sb.from('produtos').update({estoque:novo}).eq('id',id);
  if(error){toast('Erro: '+error.message,'err');return}
  p.estoque=novo;
  document.getElementById('est-modal').classList.remove('open');
  renderProdList();
}
function abrirEditProd(id){
  const p=prods.find(x=>x.id===id);if(!p)return;
  document.getElementById('edit-prod-id').value=id;
  document.getElementById('edit-prod-sub').textContent=emoji(p)+' Editando: '+p.nome;
  document.getElementById('edit-p-nome').value=p.nome||'';
  document.getElementById('edit-p-desc').value=p.descricao||'';
  document.getElementById('edit-p-peso').value=p.peso||'';
  document.getElementById('edit-p-preco').value=p.preco||'';
  document.getElementById('edit-p-emoji').value=p.emoji||'';
  document.getElementById('edit-p-tags').value=p.tags||'';
  document.getElementById('edit-prod-modal').classList.add('open');
}
async function salvarEditProd(){
  const id=parseInt(document.getElementById('edit-prod-id').value);
  const p=prods.find(x=>x.id===id);if(!p)return;
  const nome=document.getElementById('edit-p-nome').value.trim();
  const preco=parseFloat(document.getElementById('edit-p-preco').value);
  if(!nome||isNaN(preco)){toast('Nome e preço são obrigatórios.','err');return}
  const upd={
    nome,
    descricao:document.getElementById('edit-p-desc').value.trim(),
    peso:document.getElementById('edit-p-peso').value.trim(),
    preco,
    emoji:document.getElementById('edit-p-emoji').value.trim()||p.emoji||'\u{1F966}',
    tags:document.getElementById('edit-p-tags').value.trim()||null
  };
  const {error}=await sb.from('produtos').update(upd).eq('id',id);
  if(error){toast('Erro: '+error.message,'err');return}
  Object.assign(p,upd);
  document.getElementById('edit-prod-modal').classList.remove('open');
  renderProdList();renderAGrid();
}
async function togAtivo(id){const p=prods.find(x=>x.id===id);if(!p)return;await sb.from('produtos').update({ativo:!p.ativo}).eq('id',id);p.ativo=!p.ativo;renderProdList();renderAGrid();}

function renderEstoque(){
  const el=document.getElementById('estoque-list');
  if(!el)return;
  const lista=[...prods].sort((a,b)=>{
    const ea=a.estoque!=null?a.estoque:Infinity;
    const eb=b.estoque!=null?b.estoque:Infinity;
    return ea-eb;
  });
  const countEl=document.getElementById('estoque-count');
  if(countEl){
    const zerados=prods.filter(p=>p.estoque!=null&&p.estoque<=0).length;
    const semInfo=prods.filter(p=>p.estoque==null).length;
    countEl.textContent=zerados>0?zerados+' esgotado'+(zerados>1?'s':''):'todos com estoque';
  }
  if(!lista.length){el.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:12px">Nenhum produto.</div>';return}
  el.innerHTML=lista.map(p=>{
    const est=p.estoque;
    const label=est==null?'<span style="font-size:11px;color:var(--text3)">∞ ilimitado</span>'
      :est<=0?'<span style="font-size:12px;font-weight:800;color:var(--red);background:var(--red-soft);padding:3px 10px;border-radius:20px">Esgotado</span>'
      :est<=5?'<span style="font-size:12px;font-weight:800;color:var(--orange)">'+est+'</span>'
      :'<span style="font-size:12px;font-weight:800;color:var(--green-bright)">'+est+'</span>';
    const bar=est!=null&&est>0
      ?'<div style="height:4px;border-radius:2px;background:var(--bg4);margin-top:6px;overflow:hidden"><div style="height:100%;border-radius:2px;background:'+(est<=5?'var(--orange)':'var(--green)')+';width:'+Math.min(100,Math.round(est/50*100))+'%"></div></div>'
      :'';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(p.ativo?'':'🔇 ')+(p.nome)+'</div>'
      +'<div style="font-size:11px;color:var(--text3)">'+(p.peso||'')+(p.peso?' · ':'')+'R$ '+p.preco.toFixed(2).replace('.',',')+'</div>'
      +bar
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
      +label
      +'<button class="btn btn-o btn-sm" onclick="editEstoque('+p.id+')" title="Editar estoque" style="padding:4px 8px"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>'
      +'</div>'
      +'</div>';
  }).join('');
  refreshIcons();
}
function filtrarEstoque(){
  const q=(document.getElementById('estoque-search')?.value||'').toLowerCase().trim();
  const el=document.getElementById('estoque-list');
  if(!el)return;
  if(!q){renderEstoque();return;}
  const lista=[...prods]
    .filter(p=>p.nome.toLowerCase().includes(q))
    .sort((a,b)=>{
      const ea=a.estoque!=null?a.estoque:Infinity;
      const eb=b.estoque!=null?b.estoque:Infinity;
      return ea-eb;
    });
  if(!lista.length){el.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:12px">Nenhum produto encontrado.</div>';return;}
  el.innerHTML=lista.map(p=>{
    const est=p.estoque;
    const label=est==null?'<span style="font-size:11px;color:var(--text3)">∞ ilimitado</span>'
      :est<=0?'<span style="font-size:12px;font-weight:800;color:var(--red);background:var(--red-soft);padding:3px 10px;border-radius:20px">Esgotado</span>'
      :est<=5?'<span style="font-size:12px;font-weight:800;color:var(--orange)">'+est+'</span>'
      :'<span style="font-size:12px;font-weight:800;color:var(--green-bright)">'+est+'</span>';
    const bar=est!=null&&est>0
      ?'<div style="height:4px;border-radius:2px;background:var(--bg4);margin-top:6px;overflow:hidden"><div style="height:100%;border-radius:2px;background:'+(est<=5?'var(--orange)':'var(--green)')+';width:'+Math.min(100,Math.round(est/50*100))+'%"></div></div>'
      :'';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(p.ativo?'':'🔇 ')+(p.nome)+'</div>'
      +'<div style="font-size:11px;color:var(--text3)">'+(p.peso||'')+( p.peso?' · ':'')+'R$ '+p.preco.toFixed(2).replace('.',',')+'</div>'
      +bar
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
      +label
      +'<button class="btn btn-o btn-sm" onclick="editEstoque('+p.id+')" title="Editar estoque" style="padding:4px 8px"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>'
      +'</div>'
      +'</div>';
  }).join('');
  refreshIcons();
}

async function rmProd(id){
  popConfirm('🗑️','Remover produto?','Esta ação não pode ser desfeita.','Remover','pbtn-danger',async()=>{
    const {error}=await sb.from('produtos').delete().eq('id',id);
    if(error){toast('Erro: '+error.message,'err');return}
    prods=prods.filter(p=>p.id!==id);
    renderProdList();renderAGrid();
    toast('Produto removido.','ok');
  });
}


/* PRODUTOS ADMIN */
async function renderCatList(){
  const el=document.getElementById('cat-list');
  if(!cats.length){el.innerHTML='<div style="padding:1rem;color:var(--text3);font-size:12px">Nenhuma categoria.</div>';return}
  const total = cats.length;
  const countEl = document.getElementById('cat-count');
  if(countEl) countEl.textContent = total + ' categoria' + (total!==1?'s':'');
  el.innerHTML=cats.map(c=>'<div class="cat-list-item" data-nome="'+h(c.nome)+'" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +(c.imagem_url?'<img src="'+c.imagem_url+'" style="width:32px;height:18px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">':
      '<div style="width:32px;height:18px;border-radius:4px;background:var(--bg4);border:1px solid var(--border);display:flex;align-items:center;justify-content:center"><i data-lucide="leaf" style="width:10px;height:10px"></i></div>')
    +'<span style="font-size:13px;font-weight:700">'+h(c.nome)+'</span>'
    +'</div>'
    +'<button class="btn btn-r btn-sm" onclick="rmCat('+c.id+')">Remover</button>'
    +'</div>').join('');
  refreshIcons();
  filtrarCatList();
}

function filtrarCatList(){
  const lista=document.getElementById('cat-list');
  const busca=(document.getElementById('cat-busca')?.value||'').trim().toLowerCase();
  if(!lista)return;
  const itens=Array.from(lista.querySelectorAll('.cat-list-item'));
  if(!itens.length)return;
  let visiveis=0;
  itens.forEach(item=>{
    const nome=(item.dataset.nome||item.textContent||'').toLowerCase();
    const show=!busca||nome.includes(busca);
    item.style.display=show?'flex':'none';
    if(show)visiveis++;
  });
  let empty=lista.querySelector('[data-cat-empty]');
  if(!visiveis&&busca){
    if(!empty){
      empty=document.createElement('div');
      empty.dataset.catEmpty='1';
      empty.style.cssText='padding:1rem;color:var(--text3);font-size:12px;text-align:center';
      lista.appendChild(empty);
    }
    empty.textContent='Nenhuma categoria encontrada.';
    empty.style.display='block';
  }else if(empty){
    empty.style.display='none';
  }
}

async function addCat(){
  const nome=document.getElementById('cat-nome').value.trim();
  if(!nome)return;
  const saveBtn=document.querySelector('#ap-categorias .btn-g');
  const origLabel=saveBtn?saveBtn.textContent:'';
  if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Salvando…';}
  try{
    let imagem_url=null;
    const imgFile=document.getElementById('cat-img-file')?.files[0];
    if(imgFile){
      if(imgFile.size>5*1024*1024){toast('Imagem muito grande. Máx 5 MB.','err');return}
      const ext=imgFile.name.split('.').pop().toLowerCase();
      const path='categorias/'+Date.now()+'.'+ext;
      const {error:upErr}=await sb.storage.from('imagens').upload(path,imgFile,{upsert:true});
      if(upErr){
        console.error('Upload error:',upErr);
        toast('Erro no upload da imagem: '+upErr.message,'err');
        return;
      }
      imagem_url=IMG_BASE+'/'+path;
    }
    const {data,error}=await sb.from('categorias').insert({nome,imagem_url}).select().single();
    if(error){toast('Erro: '+error.message,'err');return}
    cats.push(data);
    document.getElementById('cat-nome').value='';
    const cf=document.getElementById('cat-img-file');if(cf)cf.value='';
    const cp=document.getElementById('cat-img-preview');if(cp){cp.innerHTML=lucideIcon('leaf');refreshIcons();}
    renderCatList();renderCatSel();renderPPills();renderACpills();
    toast('Categoria adicionada!','ok');
  }finally{
    if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=origLabel;}
  }
}

async function rmCat(id){
  // Verificar se tem produtos vinculados
  const {data:pVinc} = await sb.from('produtos').select('id').eq('cat_id',id).limit(1);
  const cat = cats.find(c=>c.id===id);
  if(pVinc && pVinc.length > 0){
    popConfirm('⚠️','Categoria com produtos',
      '"'+(cat?.nome||'Categoria')+'" tem produtos vinculados.\n\nRemovê-la irá desvincular todos os produtos desta categoria. Deseja continuar?',
      'Sim, remover','pbtn-danger',async()=>{
        // Desvincular produtos primeiro (setar cat_id = null)
        await sb.from('produtos').update({cat_id:null}).eq('cat_id',id);
        const {error}=await sb.from('categorias').delete().eq('id',id);
        if(error){toast('Erro: '+error.message,'err');return}
        cats=cats.filter(c=>c.id!==id);
        prods.forEach(p=>{if(p.cat_id===id)p.cat_id=null});
        renderCatList();renderAGrid();renderPPills();renderACpills();
        toast('Categoria removida!','ok');
      });
    return;
  }
  popConfirm('🗑️','Remover categoria?','"'+(cat?.nome||'Categoria')+'" será removida permanentemente.','Remover','pbtn-danger',async()=>{
    const {error}=await sb.from('categorias').delete().eq('id',id);
    if(error){toast('Erro: '+error.message,'err');return}
    cats=cats.filter(c=>c.id!==id);
    renderCatList();renderAGrid();renderPPills();renderACpills();
    toast('Categoria removida.','ok');
  });
}

function renderCatSel(){
  const el=document.getElementById('p-cat');
  if(!el)return;
  el.innerHTML=cats.map(c=>'<option value="'+c.id+'">'+h(c.nome)+'</option>').join('');
}

async function addProd(){
  const nome=document.getElementById('p-nome').value.trim();
  const preco=parseFloat(document.getElementById('p-preco').value);
  if(!nome||isNaN(preco)){toast('Informe nome e preço.','err');return}
  const estoqueVal=document.getElementById('p-estoque').value;
  const estoque=estoqueVal!==''?parseInt(estoqueVal):null;

  const saveBtn=document.querySelector('#ap-produtos .btn-g[onclick="addProd()"]');
  const origLabel=saveBtn?saveBtn.textContent:'';
  if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Salvando…';}

  try{
    let imagem_url=null;
    const imgFile=document.getElementById('p-img-file')?.files[0];
    if(imgFile){
      if(imgFile.size>5*1024*1024){toast('Imagem muito grande. Máx 5 MB.','err');return}
      const ext=imgFile.name.split('.').pop().toLowerCase();
      const path='produtos/'+Date.now()+'.'+ext;
      toast('Enviando imagem…','ok');
      const {error:upErr}=await sb.storage.from('imagens').upload(path,imgFile,{upsert:true});
      if(upErr){
        console.error('Upload error:',upErr);
        toast('Erro no upload da imagem: '+upErr.message,'err');
        return;
      }
      imagem_url=IMG_BASE+'/'+path;
    }

    const {data,error}=await sb.from('produtos').insert({
      cat_id:parseInt(document.getElementById('p-cat').value),
      nome,
      descricao:document.getElementById('p-desc').value.trim(),
      peso:document.getElementById('p-peso').value.trim(),
      imagem_url,
      preco,estoque,ativo:true,
      tags:document.getElementById('p-tags').value.trim()||null
    }).select().single();
    if(error){toast('Erro ao salvar produto: '+error.message,'err');return}

    prods.push(data);
    ['p-nome','p-desc','p-peso','p-preco','p-estoque','p-tags'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.value='';
    });
    const pf=document.getElementById('p-img-file');if(pf)pf.value='';
    const pp=document.getElementById('p-img-preview');if(pp){pp.innerHTML=lucideIcon('sprout');refreshIcons();}
    renderProdList();renderAGrid();
    toast('Produto adicionado!','ok');
  }finally{
    if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=origLabel;}
  }
}
function previewProdImg(input){
  const f=input.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    const prev=document.getElementById('p-img-preview');
    if(prev)prev.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
  };
  r.readAsDataURL(f);
}
function previewCatImg(input){
  const f=input.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    const prev=document.getElementById('cat-img-preview');
    if(prev)prev.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
  };
  r.readAsDataURL(f);
}

function renderPPills(){
  const el=document.getElementById('p-pills');
  if(!el)return;
  el.innerHTML='<button class="cpill'+(fCatP===null?' active':'')+'" onclick="fCatP=null;renderPPills()">Todos</button>'
    +cats.map(c=>'<button class="cpill'+(fCatP===c.id?' active':'')+'" onclick="fCatP='+c.id+';renderPPills()">'+h(c.nome)+'</button>').join('');
  renderProdList();
}

function renderProdList(){
  const el=document.getElementById('p-list');
  if(!el)return;
  const ps=fCatP?prods.filter(p=>p.cat_id===fCatP):prods;
  const prodCountEl = document.getElementById('prod-count');
  if(prodCountEl) prodCountEl.textContent = prods.filter(p=>p.ativo).length + ' ativos de ' + prods.length + ' produtos';
  if(!ps.length){el.innerHTML='<div class="empty">Nenhum produto.</div>';return}
  el.innerHTML=ps.map(p=>{
    const cat=cats.find(c=>c.id===p.cat_id);
    const estoq=p.estoque!=null
      ?'<span style="color:'+(p.estoque<=5?'var(--red)':'var(--text2)')+'">Est: '+p.estoque+'</span>'
      :'<span style="color:var(--text3)">Ilimitado</span>';
    return '<div class="prod-row" data-nome="'+p.nome.toLowerCase()+'" data-cat="'+p.cat_id+'">'  
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700">'+emoji(p)+' '+p.nome+' <span style="font-weight:400;color:var(--text2)">'+(p.peso?'('+p.peso+')':'')+'</span></div>'
      +'<div style="font-size:10px;color:var(--text2)">'+(cat?cat.nome:'')+' &middot; R$ '+fp(p.preco)+' &middot; '+estoq+'</div>'
      +'</div>'
      +'<span class="badge '+(p.ativo?'bg-green':'bg-gray')+'">'+(p.ativo?'Ativo':'Inativo')+'</span>'
      +'<button class="btn btn-o btn-sm" onclick="abrirEditProd('+p.id+')" title="Editar produto">&#9999;</button>'
      +'<button class="btn btn-o btn-sm" onclick="editEstoque('+p.id+')" title="Editar estoque">'+(p.estoque!=null?p.estoque:'∞')+'</button>'
      +'<button class="btn btn-o btn-sm" onclick="togAtivo('+p.id+')">'+(p.ativo?'Off':'On')+'</button>'
      +'<button class="btn btn-r btn-sm" onclick="rmProd('+p.id+')">x</button>'
      +'</div>';
  }).join('');
}

function filtrarProdListInline(){
  const q=(document.getElementById('p-busca-inline')?.value||'').toLowerCase().trim();
  const el=document.getElementById('p-list');
  if(!el)return;
  if(!q){renderProdList();return;}
  const base=fCatP?prods.filter(p=>p.cat_id===fCatP):prods;
  const ps=base.filter(p=>
    p.nome.toLowerCase().includes(q)||
    (p.tags||'').toLowerCase().includes(q)||
    (p.descricao||'').toLowerCase().includes(q)
  );
  if(!ps.length){el.innerHTML='<div class="empty">Nenhum produto encontrado.</div>';return;}
  el.innerHTML=ps.map(p=>{
    const cat=cats.find(c=>c.id===p.cat_id);
    const estoq=p.estoque!=null
      ?'<span style="color:'+(p.estoque<=5?'var(--red)':'var(--text2)')+'">' + 'Est: '+p.estoque+'</span>'
      :'<span style="color:var(--text3)">Ilimitado</span>';
    return '<div class="prod-row">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700">'+emoji(p)+' '+p.nome+' <span style="font-weight:400;color:var(--text2)">'+(p.peso?'('+p.peso+')':'')+'</span></div>'
      +'<div style="font-size:10px;color:var(--text2)">'+(cat?cat.nome:'')+' &middot; R$ '+fp(p.preco)+' &middot; '+estoq+'</div>'
      +'</div>'
      +'<span class="badge '+(p.ativo?'bg-green':'bg-gray')+'">'+(p.ativo?'Ativo':'Inativo')+'</span>'
      +'<button class="btn btn-o btn-sm" onclick="abrirEditProd('+p.id+')" title="Editar produto">&#9999;</button>'
      +'<button class="btn btn-o btn-sm" onclick="editEstoque('+p.id+')" title="Editar estoque">'+(p.estoque!=null?p.estoque:'\u221e')+'</button>'
      +'<button class="btn btn-o btn-sm" onclick="togAtivo('+p.id+')">'+(p.ativo?'Off':'On')+'</button>'
      +'<button class="btn btn-r btn-sm" onclick="rmProd('+p.id+')">x</button>'
      +'</div>';
  }).join('');
}

/* USUARIOS */
let uCache=[],uPage=1;
const U_PER=15;

async function renderUsers(){
  const loading=document.getElementById('u-loading');
  loading.classList.remove('hidden');
  const {data}=await sb.from('profiles').select('*').order('created_at');
  const {data:todospeds}=await sb.from('pedidos').select('id,user_id,codigo,data_pedido,total').order('created_at',{ascending:false});
  loading.classList.add('hidden');
  const pedsByUser={};
  (todospeds||[]).forEach(p=>{
    if(!pedsByUser[p.user_id])pedsByUser[p.user_id]=[];
    pedsByUser[p.user_id].push(p);
  });
  uCache=(data||[]).map(u=>({...u,_peds:pedsByUser[u.id]||[]}));
  uPage=1;
  renderUPagina();
}

function filtrarUsers(){
  const q=(document.getElementById('u-busca')?.value||'').toLowerCase();
  uPage=1;renderUPagina(q);
}

function renderUPagina(q){
  if(q===undefined)q=(document.getElementById('u-busca')?.value||'').toLowerCase();
  const filtrado=q
    ?uCache.filter(u=>u.nome.toLowerCase().includes(q)||(u.telefone||'').includes(q)||(u.email||'').toLowerCase().includes(q))
    :uCache;
  const total=Math.ceil(filtrado.length/U_PER);
  const pagina=filtrado.slice((uPage-1)*U_PER,uPage*U_PER);
  const el=document.getElementById('u-lista');
  if(!pagina.length){el.innerHTML='<div class="empty">Nenhum usuário encontrado.</div>';document.getElementById('u-pag').innerHTML='';return}
  el.innerHTML=pagina.map(u=>{
    const peds=u._peds||[];
    const pedRows=peds.length
      ?peds.map(p=>`<div style="padding:4px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span style="font-size:11px;font-weight:700;font-family:monospace;color:var(--text2)">${h(p.codigo||'#'+p.id)}</span>
          <span style="font-size:11px;color:var(--text3)">${fd(p.data_pedido)}</span>
          <span style="font-size:11px;font-weight:700;color:var(--green-bright)">R$ ${fp(p.total)}</span>
        </div>`).join('')
      :'<div style="font-size:11px;color:var(--text3);padding:4px 0">Nenhum pedido.</div>';
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;font-size:13px">${h(u.nome)}</div>
          <div style="font-size:11px;color:var(--text2)">${u.telefone||'—'} · ${new Date(u.created_at).toLocaleDateString('pt-BR')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="badge ${u.role==='admin'?'bg-orange':'bg-blue'}">${u.role==='admin'?'Admin':'Cliente'}</span>
          ${u.id!==perfil?.id?`<button class="btn btn-o btn-sm" onclick="togRole('${u.id}','${u.role}')">${u.role==='admin'?'→Cliente':'→Admin'}</button>`:'<span style="font-size:11px;color:var(--text3)">Você</span>'}
          <button class="btn btn-o btn-sm" onclick="toggleUserInfo('u-inf-${u.id}')">▾ Pedidos (${peds.length})</button>
          <button class="btn btn-o btn-sm ico-gap" onclick="toggleUserInfo('u-dados-${u.id}')">${lucideIcon('user')} Info</button>
        </div>
      </div>
      <div id="u-inf-${u.id}" style="display:none;margin-top:8px;padding:8px;background:var(--bg3);border-radius:8px;max-height:160px;overflow-y:auto">
        ${pedRows}
      </div>
      <div id="u-dados-${u.id}" style="display:none;margin-top:8px;padding:10px;background:var(--bg3);border-radius:8px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
          <div><span style="color:var(--text3)">Nome: </span><strong>${h(u.nome)}</strong></div>
          <div><span style="color:var(--text3)">Telefone: </span><strong>${u.telefone||'—'}</strong></div>
          <div><span style="color:var(--text3)">Cadastro: </span><strong>${new Date(u.created_at).toLocaleDateString('pt-BR')}</strong></div>
          <div><span style="color:var(--text3)">Perfil: </span><strong>${u.role==='admin'?'Admin':'Cliente'}</strong></div>
          ${u.endereco?`<div style="grid-column:1/-1"><span style="color:var(--text3)">Endereço: </span><strong>${u.endereco}${u.endereco_num?', '+u.endereco_num:''} — ${u.bairro||''} — ${u.cidade||''}</strong></div>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
  // Paginação
  const pag=document.getElementById('u-pag');
  if(total<=1){pag.innerHTML='';return}
  let html='<button class="pag-btn"'+(uPage===1?' disabled':'')+` onclick="uPage--;renderUPagina()">← Ant</button>`;
  for(let i=1;i<=total;i++)html+=`<button class="pag-btn${i===uPage?' active':''}" onclick="uPage=${i};renderUPagina()">${i}</button>`;
  html+=`<button class="pag-btn"${uPage===total?' disabled':''} onclick="uPage++;renderUPagina()">Prox →</button>`;
  html+=`<span style="padding:4px 8px;font-size:11px;color:var(--text3)">${filtrado.length} usuário(s)</span>`;
  pag.innerHTML=html;
}

function toggleUserInfo(id){
  const el=document.getElementById(id);
  if(el)el.style.display=el.style.display==='none'?'block':'none';
}
async function togRole(uid,cur){
  const nr=cur==='admin'?'cliente':'admin';
  popConfirm('👤','Alterar função?','Alterar para "'+nr+'"?','Confirmar','pbtn-ok',async()=>{
    await sb.from('profiles').update({role:nr}).eq('id',uid);
    renderUsers();
    toast('Função alterada para '+nr+'.','ok');
  });
}

function showMsg(el,msg,type){el.className='auth-msg '+type;el.textContent=msg}
function tErr(msg){
  if(msg.includes('Invalid login'))return'Email ou senha incorretos.';
  if(msg.includes('Email not confirmed'))return'Confirme seu email antes de entrar.';
  if(msg.includes('already registered'))return'Este email ja esta cadastrado.';
  return msg;
}

document.getElementById('a-qty')?.addEventListener('keydown',e=>{if(e.key==='Enter')confQty()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('a-modal')?.classList.remove('open')});

/* ── PRODUCT MODAL ── */




/* ── LOCAIS DE RETIRADA ── */


/* ── MOBILE CART BAR ── */


/* ── DASHBOARD ── */
let cupons=[];


// ── PAGE PEDIDOS ──
let rpPage=1, rpTotal=0, rpCache=[];

function toggleRPFiltro(){
  const t=document.getElementById('rp-tipo').value;
  document.getElementById('rp-fdia').classList.toggle('hidden',t!=='dia');
  document.getElementById('rp-fper').classList.toggle('hidden',t!=='periodo');
  renderPedidos();
}

async function renderPedidos(){
  const busca=(document.getElementById('rp-busca')?.value||'').toLowerCase();
  const tipo=document.getElementById('rp-tipo')?.value||'dia';
  const dataFiltro=tipo==='dia'?document.getElementById('rp-data')?.value:null;
  const deFiltro=document.getElementById('rp-de')?.value;
  const ateFiltro=document.getElementById('rp-ate')?.value;

  let q=sb.from('pedidos').select('*,itens_pedido(*)').order('created_at',{ascending:false});
  if(tipo==='dia'){if(dataFiltro)q=q.eq('data_pedido',dataFiltro);}
  else{if(deFiltro)q=q.gte('data_pedido',deFiltro);if(ateFiltro)q=q.lte('data_pedido',ateFiltro);}
  const {data:peds}=await q;
  const lista=(peds||[]).filter(p=>!busca||p.cliente_nome.toLowerCase().includes(busca)||(p.codigo&&p.codigo.includes(busca)));
  const listaVisivel=lista.filter(p=>!isPedidoCancelado(p));
  rpCache=listaVisivel;rpTotal=listaVisivel.length;rpPage=1;

  const statsAtivos=lista.filter(p=>!isPedidoCancelado(p));
  const totG=statsAtivos.reduce((s,p)=>s+p.total,0);
  const totT=statsAtivos.reduce((s,p)=>s+(Number(p.taxa_entrega)||0),0);
  const statsEl=document.getElementById('rp-stats');
  if(statsEl)statsEl.innerHTML=
    '<div class="scard"><div class="scard-l">Pedidos</div><div class="scard-v">'+statsAtivos.length+'</div></div>'
    +'<div class="scard"><div class="scard-l">Faturamento</div><div class="scard-v green">R$ '+fp(totG)+'</div></div>'
    +'<div class="scard"><div class="scard-l">Ticket médio</div><div class="scard-v">R$ '+(statsAtivos.length?fp(totG/statsAtivos.length):'0,00')+'</div></div>';

  const pedEl=document.getElementById('rp-peds');
  if(!pedEl)return;
  const listaHistorico=listaVisivel;
  if(!listaHistorico.length){pedEl.innerHTML='<div class="empty">Nenhum pedido no período.</div>';renderRPPage();return}
  pedEl.innerHTML=listaHistorico.map(p=>{
    const its=(p.itens_pedido||[]).map(it=>it.quantidade+'x '+it.nome_produto).join(' / ');
    const dtCompra=p.created_at?new Date(p.created_at):null;
    const dataPedido=dtCompra?dtCompra.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}):'';
    const horaPedido=dtCompra?dtCompra.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
    return`<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--border);gap:8px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:12px">${h(p.cliente_nome)}</span>
          ${p.codigo?`<span style="font-size:9px;font-weight:700;font-family:monospace;color:var(--text3)">${h(p.codigo)}</span>`:''}
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${dataPedido?`📝 ${dataPedido} ${horaPedido}`:''} ${fdLabel(p.data_pedido)?`${modalidadePedidoAdmin(p)} · ${fdLabel(p.data_pedido)}`:''}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">${its}</div>
      </div>
      <div style="font-weight:700;color:var(--green-bright);font-size:12px;white-space:nowrap">R$ ${fp(p.total)}</div>
    </div>`;
  }).join('');
  if(totT>0)pedEl.innerHTML+=`<div style="padding:7px 0;display:flex;justify-content:space-between;font-size:11px;color:var(--orange)"><span>Total taxas</span><span style="font-weight:700">R$ ${fp(totT)}</span></div>`;
  renderRPPage();
  renderRPPag();
}

function renderRPPage(){
  const start=(rpPage-1)*PER;
  const pagina=rpCache.slice(start,start+PER);
  const loading=document.getElementById('rp-loading');
  if(loading)loading.classList.add('hidden');
  const table=document.getElementById('rp-table');if(table)table.classList.remove('hidden');
  const tbody=document.getElementById('rp-tbody');if(!tbody)return;
  if(!pagina.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text3)">Nenhum pedido</td></tr>';renderRPPag();return}
  tbody.innerHTML=pagina.map(p=>{
    const opts=renderStatusOptionsPedido(p);
    return'<tr>'
      +'<td><span style="font-size:11px;font-weight:700;font-family:monospace;color:var(--text2)">'+h(p.codigo||'-')+'</span></td>'
      +'<td><div style="font-weight:700;font-size:12px">'+h(p.cliente_nome)+'</div><div style="font-size:10px;color:var(--text2)">'+h(p.cliente_contato||'')+'</div></td>'
      +'<td><div style="font-size:11px">'+(p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):'-')+'</div></td>'
      +'<td><div style="font-size:11px;font-weight:600">'+fdLabel(p.data_pedido)+'</div></td>'
      +'<td><select onchange="alterarStatus('+p.id+',this.value)" style="font-size:11px;padding:4px 6px;border-radius:6px;width:100%;min-width:120px">'+opts+'</select></td>'
      +'<td>'+(!isRetiradaPedido(p)?'<span class="badge bg-orange">Entrega</span>':'<span class="badge bg-gray">Retirada</span>')+'</td>'
      +'<td>'+p.pagamento+'</td>'
      +'<td style="text-align:right;font-weight:700;color:var(--green-bright)">R$ '+fp(p.total)+'</td>'
      +'<td><button class="btn btn-o btn-sm" onclick="verPedRP('+p.id+')">Ver</button></td>'
      +'</tr>';
  }).join('');
}

function verPedRP(id){return verPed(id);}

function renderRPPag(){
  const total=Math.ceil(rpTotal/PER);
  const el=document.getElementById('rp-pag');if(!el)return;
  if(total<=1){el.innerHTML='';return}
  let html='<button class="pag-btn"'+(rpPage===1?' disabled':'')+' onclick="goRPPage('+(rpPage-1)+')">← Ant</button>';
  let start=Math.max(1,rpPage-3),end=Math.min(total,start+6);
  if(start>1)html+='<button class="pag-btn" onclick="goRPPage(1)">1</button><span style="padding:4px;color:var(--text3)">...</span>';
  for(let i=start;i<=end;i++)html+='<button class="pag-btn'+(i===rpPage?' active':'')+'" onclick="goRPPage('+i+')">'+i+'</button>';
  if(end<total)html+='<span style="padding:4px;color:var(--text3)">...</span><button class="pag-btn" onclick="goRPPage('+total+')">'+total+'</button>';
  html+='<button class="pag-btn"'+(rpPage===total?' disabled':'')+' onclick="goRPPage('+(rpPage+1)+')">Prox →</button>';
  html+='<span style="padding:4px 8px;font-size:11px;color:var(--text3)">'+rpTotal+' pedido(s)</span>';
  el.innerHTML=html;
}
function goRPPage(p){const t=Math.ceil(rpTotal/PER);rpPage=Math.max(1,Math.min(t,p));renderRPPage();renderRPPag();}


// ── PAGE FINANCEIRO ──
let _finChart=null, _finPie=null;

async function initFinanceiro(){
  // Datas padrão: mês atual
  const hoje=new Date();
  const de=hoje.toISOString().slice(0,7)+'-01';
  const ate=hoje.toISOString().split('T')[0];
  if(!document.getElementById('fin-de').value)document.getElementById('fin-de').value=de;
  if(!document.getElementById('fin-ate').value)document.getElementById('fin-ate').value=ate;
  await renderFinanceiro();
  await carregarGastos();
}

async function renderFinanceiro(){
  const de=document.getElementById('fin-de')?.value;
  const ate=document.getElementById('fin-ate')?.value;
  if(!de||!ate)return;

  const {data:peds}=await sb.from('pedidos').select('total,status,data_pedido')
    .gte('data_pedido',de).lte('data_pedido',ate);
  const ativos=(peds||[]).filter(p=>!isPedidoCancelado(p));
  const total=ativos.reduce((s,p)=>s+p.total,0);
  const ticket=ativos.length?total/ativos.length:0;

  document.getElementById('fin-total').textContent='R$ '+fp(total);
  document.getElementById('fin-ticket').textContent='R$ '+fp(ticket);
  const label=de.split('-').reverse().slice(0,2).join('/')+'–'+ate.split('-').reverse().slice(0,2).join('/');
  if(document.getElementById('fin-chart-label'))document.getElementById('fin-chart-label').textContent=label;

  // Gráfico de linha por dia
  const diasMap={};
  ativos.forEach(p=>{if(!diasMap[p.data_pedido])diasMap[p.data_pedido]=0;diasMap[p.data_pedido]+=p.total;});
  const dias=Object.keys(diasMap).sort();
  const vals=dias.map(d=>diasMap[d]);
  const ctx=document.getElementById('fin-chart')?.getContext('2d');
  if(ctx){
    if(_finChart)_finChart.destroy();
    _finChart=new Chart(ctx,{
      type:'bar',
      data:{labels:dias.map(d=>d.slice(5).split('-').reverse().join('/')),datasets:[{label:'Faturamento',data:vals,backgroundColor:'rgba(45,140,78,0.7)',borderRadius:6}]},
      options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'R$ '+fp(c.raw)}}},scales:{x:{ticks:{font:{size:10},color:'var(--text3)'}},y:{ticks:{callback:v=>'R$'+fp(v),font:{size:10},color:'var(--text3)'},beginAtZero:true}}}
    });
  }
  await atualizarResultado();
}

let _catsGasto=[];
async function carregarGastos(){
  let gastosData=[],catsData=[];
  try{const r=await sb.from('gastos').select('*').order('data',{ascending:false}).limit(50);gastosData=r.data||[];}catch(e){}
  try{const r=await sb.from('categorias_gasto').select('*').order('nome');catsData=r.data||[];}catch(e){}
  _catsGasto=catsData;
  renderGastos(gastosData);
  renderPieGastos(gastosData);
  atualizarResultado();
  const sel=document.getElementById('fin-gasto-cat');
  if(sel){
    sel.innerHTML=catsData.length
      ?catsData.map(c=>'<option value="'+c.id+'">'+h(c.nome)+'</option>').join('')
      :'<option value="">— Crie uma categoria acima primeiro —</option>';
  }
  // Renderizar select customizado de categorias
  _renderCatDropdown(catsData);
}

// ── SELECT CUSTOMIZADO DE CATEGORIAS DE GASTO ──
let _catDropdownOpen=false;

function _renderCatDropdown(cats){
  const opts=document.getElementById('fin-cat-opts');
  const hiddenInput=document.getElementById('fin-gasto-cat');
  if(!opts)return;
  if(!cats.length){
    opts.innerHTML='<div style="padding:12px;text-align:center;font-size:12px;color:var(--text3)">Nenhuma categoria. Crie uma acima.</div>';
    return;
  }
  opts.innerHTML='';
  const curVal=hiddenInput?.value||'';
  cats.forEach(c=>{
    const div=document.createElement('div');
    div.className='fin-cat-opt'+(curVal===String(c.id)?' selected':'');
    div.innerHTML='<span class="fin-cat-opt-nome">'+h(c.nome)+'</span>'
      +'<button class="fin-cat-opt-rm" title="Remover categoria" data-catid="'+c.id+'" data-catnome="'+encodeURIComponent(c.nome)+'">×</button>';
    div.querySelector('.fin-cat-opt-nome').onclick=()=>{
      if(hiddenInput)hiddenInput.value=c.id;
      const lbl=document.getElementById('fin-cat-label');
      if(lbl){lbl.textContent=c.nome;lbl.style.color='var(--text)';}
      fecharCatDropdown();
    };
    div.querySelector('.fin-cat-opt-rm').onclick=(e)=>{
      e.stopPropagation();
      rmCategGasto(c.id, decodeURIComponent(encodeURIComponent(c.nome)));
    };
    opts.appendChild(div);
  });
}

function toggleCatDropdown(){
  const dd=document.getElementById('fin-cat-dropdown');
  if(!dd)return;
  _catDropdownOpen=!_catDropdownOpen;
  dd.style.display=_catDropdownOpen?'block':'none';
  if(_catDropdownOpen)dd.scrollTop=0;
}

function fecharCatDropdown(){
  _catDropdownOpen=false;
  const dd=document.getElementById('fin-cat-dropdown');
  if(dd)dd.style.display='none';
}

// Fechar ao clicar fora
document.addEventListener('click',e=>{
  const wrap=document.getElementById('fin-cat-custom');
  if(wrap&&!wrap.contains(e.target))fecharCatDropdown();
});

async function rmCategGasto(id,nome){
  popConfirm('🗑️','Remover categoria?',
    '"'+nome+'" será removida. Os gastos vinculados ficam sem categoria.',
    'Remover','pbtn-danger',async()=>{
      const {error}=await sb.from('categorias_gasto').delete().eq('id',id);
      if(error){toast('Erro: '+error.message,'err');return;}
      toast('Categoria removida.','ok');
      await carregarGastos();
    }
  );
}

async function addCategGasto(){
  const nome=document.getElementById('fin-cat-nome').value.trim();
  if(!nome){toast('Digite o nome da categoria.','err');return;}
  const {error}=await sb.from('categorias_gasto').insert({nome});
  if(error){
    if(error.message.includes('duplicate')||error.message.includes('unique'))
      toast('Categoria "'+nome+'" já existe.','err');
    else
      toast('Erro: '+error.message,'err');
    return;
  }
  document.getElementById('fin-cat-nome').value='';
  await carregarGastos();
  toast('Categoria "'+nome+'" adicionada!','ok');
}

async function addGasto(){
  const catEl=document.getElementById('fin-gasto-cat');
  const cat=catEl?.value||null;
  const desc=document.getElementById('fin-gasto-desc').value.trim();
  const val=parseFloat(document.getElementById('fin-gasto-val').value);
  const data=document.getElementById('fin-gasto-data').value;
  if(!desc){toast('Informe a descrição do gasto.','err');return}
  if(isNaN(val)||val<=0){toast('Informe um valor válido.','err');return}
  if(!data){toast('Informe a data do gasto.','err');return}
  const {error}=await sb.from('gastos').insert({descricao:desc,valor:val,data,categoria_id:cat||null});
  if(error){toast('Erro ao registrar: '+error.message,'err');return}
  document.getElementById('fin-gasto-desc').value='';
  document.getElementById('fin-gasto-val').value='';
  document.getElementById('fin-gasto-data').value='';
  toast('Gasto registrado!','ok');
  await carregarGastos();
}

function renderGastos(lista){
  const el=document.getElementById('fin-gastos-list');if(!el)return;
  const total=lista.reduce((s,g)=>s+g.valor,0);
  if(document.getElementById('fin-gastos-total'))document.getElementById('fin-gastos-total').textContent='R$ '+fp(total);
  if(!lista.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">Nenhum gasto registrado.</div>';return}
  el.innerHTML=lista.map(g=>'<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">'
    +'<div><div style="font-weight:600">'+g.descricao+'</div><div style="font-size:10px;color:var(--text3)">'+fd(g.data)+'</div></div>'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<span style="font-weight:700;color:var(--red)">R$ '+fp(g.valor)+'</span>'
    +'<button onclick="rmGasto('+g.id+')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px">×</button>'
    +'</div></div>').join('');
}

async function rmGasto(id){
  const {error}=await sb.from('gastos').delete().eq('id',id);
  if(error){toast('Erro ao excluir: '+error.message,'err');return;}
  toast('Gasto removido.','ok');
  await carregarGastos();
}

async function atualizarResultado(){
  const de=document.getElementById('fin-de')?.value;
  const ate=document.getElementById('fin-ate')?.value;
  if(!de||!ate)return;
  let peds_data=[],gastos_data=[];
  try{const r=await sb.from('pedidos').select('total,status,data_pedido').gte('data_pedido',de).lte('data_pedido',ate);peds_data=r.data||[];}catch(e){}
  const peds=peds_data;
  const totalVendas=(peds||[]).filter(p=>!isPedidoCancelado(p)).reduce((s,p)=>s+p.total,0);
  try{const r=await sb.from('gastos').select('valor,data').gte('data',de).lte('data',ate);gastos_data=r.data||[];}catch(e){}
  const gastos=gastos_data;
  const totalGastos=(gastos||[]).reduce((s,g)=>s+g.valor,0);
  const resultado=totalVendas-totalGastos;
  const el=document.getElementById('fin-resultado');
  if(el){el.textContent='R$ '+fp(resultado);el.style.color=resultado>=0?'var(--green-bright)':'var(--red)';}
  if(document.getElementById('fin-gastos-total'))document.getElementById('fin-gastos-total').textContent='R$ '+fp(totalGastos);
}

function renderPieGastos(lista){
  const ctx=document.getElementById('fin-pie')?.getContext('2d');if(!ctx)return;
  // Resolver nome da categoria pelo ID
  const getNomeCat=id=>{
    if(!id)return'Sem categoria';
    const cat=_catsGasto.find(c=>String(c.id)===String(id));
    return cat?cat.nome:'Cat '+id;
  };
  const mapa={};
  lista.forEach(g=>{
    const k=g.categoria_id||null;
    const nome=getNomeCat(k);
    if(!mapa[nome])mapa[nome]=0;
    mapa[nome]+=g.valor;
  });
  const sorted=Object.entries(mapa).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const total=sorted.reduce((s,[,v])=>s+v,0);
  if(!total)return;
  const COLORS=['#e53935','#f57c00','#2d8c4e','#3b82f6','#8b5cf6'];
  if(_finPie)_finPie.destroy();
  _finPie=new Chart(ctx,{type:'doughnut',data:{labels:sorted.map(([k])=>k),datasets:[{data:sorted.map(([,v])=>v),backgroundColor:COLORS,borderWidth:0}]},options:{responsive:false,plugins:{legend:{display:false}},cutout:'60%'}});
  const leg=document.getElementById('fin-pie-legend');
  if(leg)leg.innerHTML=sorted.map(([k,v],i)=>'<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:11px">'
    +'<div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:'+COLORS[i]+';flex-shrink:0"></div><span>'+k+'</span></div>'
    +'<span style="font-weight:700">R$ '+fp(v)+'</span></div>').join('');
}

// ══════════════════════════════════════
// DASHBOARD — métricas, gráfico, top produtos
// ══════════════════════════════════════
let _dashChart=null, _dashPie=null;

async function loadDashMetrics(){
  const hoje=new Date();
  const isoHoje=hoje.toISOString().split('T')[0];
  const primeiroDiaMes=isoHoje.slice(0,7)+'-01';

  // Buscar pedidos de hoje e do mês
  const [{data:pedHoje},{data:pedMes},{data:pedOntem}]=await Promise.all([
    sb.from('pedidos').select('id,total,status,created_at,data_pedido').eq('data_pedido',isoHoje),
    sb.from('pedidos').select('id,total,status,data_pedido').gte('data_pedido',primeiroDiaMes),
    sb.from('pedidos').select('id,total,status').eq('data_pedido',getISODate(-1)),
  ]);

  const ativos=p=>!isPedidoCancelado(p);
  const soma=arr=>arr.filter(ativos).reduce((s,p)=>s+p.total,0);

  const totHoje=soma(pedHoje||[]);
  const totOntem=soma(pedOntem||[]);
  const totMes=soma(pedMes||[]);
  const qtdHoje=(pedHoje||[]).filter(ativos).length;
  const qtdMes=(pedMes||[]).filter(ativos).length;
  const ticket=qtdMes>0?totMes/qtdMes:0;

  // Variação vs ontem
  const varFat=totOntem>0?((totHoje-totOntem)/totOntem*100):0;
  const varSub=varFat>=0?`+${varFat.toFixed(0)}% vs ontem`:`${varFat.toFixed(0)}% vs ontem`;
  const varCls=varFat>=0?'up':'down';

  document.getElementById('dm-pedidos').textContent=qtdHoje;
  document.getElementById('dm-pedidos-sub').textContent=`${qtdMes} no mês`;
  document.getElementById('dm-fat').textContent='R$ '+fp(totHoje);
  document.getElementById('dm-fat-sub').innerHTML=`<span class="${varCls}">${varSub}</span>`;
  document.getElementById('dm-mes').textContent='R$ '+fp(totMes);
  document.getElementById('dm-mes-sub').textContent=`${qtdMes} pedidos`;
  document.getElementById('dm-ticket').textContent='R$ '+fp(ticket);
  document.getElementById('dm-ticket-sub').textContent='média por pedido';
}

function getISODate(offset=0){
  const d=new Date();
  d.setDate(d.getDate()+offset);
  return d.toISOString().split('T')[0];
}

async function loadDashChart(){
  // Últimos 7 dias
  const dias=[];
  for(let i=6;i>=0;i--)dias.push(getISODate(-i));
  const de=dias[0],ate=dias[dias.length-1];

  const {data:peds}=await sb.from('pedidos')
    .select('total,status,data_pedido')
    .gte('data_pedido',de).lte('data_pedido',ate);

  const por_dia={};
  dias.forEach(d=>por_dia[d]=0);
  (peds||[]).filter(p=>!isPedidoCancelado(p)).forEach(p=>{
    if(por_dia[p.data_pedido]!==undefined)por_dia[p.data_pedido]+=p.total;
  });

  const labels=dias.map(d=>{
    const[,m,dy]=d.split('-');
    return dy+'/'+m;
  });
  const valores=dias.map(d=>por_dia[d]);
  const total=valores.reduce((a,b)=>a+b,0);
  document.getElementById('dm-chart-total').textContent='R$ '+fp(total);

  const ctx=document.getElementById('dash-chart').getContext('2d');
  if(_dashChart)_dashChart.destroy();
  _dashChart=new Chart(ctx,{
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Faturamento',
        data:valores,
        borderColor:'#2d8c4e',
        backgroundColor:'rgba(45,140,78,0.08)',
        borderWidth:2.5,
        pointBackgroundColor:'#2d8c4e',
        pointRadius:4,
        pointHoverRadius:6,
        tension:0.4,
        fill:true
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'R$ '+fp(c.raw)}}},
      scales:{
        x:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:11},color:'#8aab8e'}},
        y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:11},color:'#8aab8e',callback:v=>'R$'+fp(v)},beginAtZero:true}
      }
    }
  });
}

async function loadDashRecentes(){
  const {data:pedsRaw}=await sb.from('pedidos')
    .select('id,codigo,cliente_nome,total,status,data_pedido')
    .order('created_at',{ascending:false}).limit(6);
  const peds=(pedsRaw||[]).filter(p=>!isPedidoCancelado(p)).slice(0,6);

  const statusColor={
    'Pendente':'var(--orange)',
    'Em preparo':'#3b82f6',
    'Saiu para entrega':'#8b5cf6',
    'Entregue':'var(--green-bright)',
    'Cancelado':'var(--red)'
  };

  const el=document.getElementById('dm-recentes');
  if(!peds?.length){el.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">Nenhum pedido ainda.</div>';return}
  el.innerHTML=peds.map(p=>`
    <div class="dash-recent-item">
      <span class="dash-recent-code">${h(p.codigo||'#'+p.id)}</span>
      <span class="dash-recent-name">${h(p.cliente_nome)}</span>
      <span style="font-size:10px;font-weight:700;color:${statusColor[p.status]||'var(--text3)'};white-space:nowrap;margin-right:8px">${p.status||'Pendente'}</span>
      <span class="dash-recent-val">R$ ${fp(p.total)}</span>
    </div>`).join('');
}

async function loadDashTopProds(){
  // Buscar pedidos não cancelados
  const {data:pedidos}=await sb.from('pedidos').select('id,status');
  const pedIds=(pedidos||[]).filter(p=>!isPedidoCancelado(p)).map(p=>p.id);
  if(!pedIds.length){document.getElementById('dm-top-prods').innerHTML='<div style="color:var(--text3);font-size:12px">Sem dados ainda.</div>';return;}
  const {data:itens}=await sb.from('itens_pedido')
    .select('produto_id,nome_produto,quantidade,subtotal')
    .in('pedido_id',pedIds);

  const mapa={};
  (itens||[]).forEach(it=>{
    const k=it.produto_id||it.nome_produto;
    if(!mapa[k])mapa[k]={nome:it.nome_produto,qty:0,total:0};
    mapa[k].qty+=it.quantidade;
    mapa[k].total+=it.subtotal;
  });
  const top=Object.values(mapa).sort((a,b)=>b.qty-a.qty).slice(0,5);
  const rankCls=['gold','silver','bronze','',''];

  const el=document.getElementById('dm-top-prods');
  if(!top.length){el.innerHTML='<div style="color:var(--text3);font-size:12px">Sem dados ainda.</div>';return}
  el.innerHTML=top.map((p,i)=>`
    <div class="top-prod-row">
      <div class="top-prod-rank ${rankCls[i]}">${i+1}</div>
      <div class="top-prod-name">${h(p.nome)}</div>
      <div class="top-prod-qty">${p.qty} un</div>
      <div class="top-prod-val">R$ ${fp(p.total)}</div>
    </div>`).join('');
}

async function loadDashPie(){
  const {data:pedidos}=await sb.from('pedidos').select('id,status');
  const pedIds=(pedidos||[]).filter(p=>!isPedidoCancelado(p)).map(p=>p.id);
  if(!pedIds.length)return;
  const {data:itens}=await sb.from('itens_pedido')
    .select('produto_id,quantidade,subtotal')
    .in('pedido_id',pedIds);
  const {data:ps}=await sb.from('produtos').select('id,cat_id');
  const catMap={};
  (ps||[]).forEach(p=>catMap[p.id]=p.cat_id);

  const mapa={};
  (itens||[]).forEach(it=>{
    const cid=catMap[it.produto_id]||0;
    const cat=cats.find(c=>c.id===cid);
    const nome=cat?cat.nome:'Outros';
    if(!mapa[nome])mapa[nome]=0;
    mapa[nome]+=it.subtotal;
  });
  const sorted=Object.entries(mapa).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const total=sorted.reduce((s,[,v])=>s+v,0);
  if(!total)return;

  const COLORS=['#2d8c4e','#4ade80','#86efac','#bbf7d0','#d1fae5'];
  const ctx=document.getElementById('dash-pie').getContext('2d');
  if(_dashPie)_dashPie.destroy();
  _dashPie=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:sorted.map(([k])=>k),
      datasets:[{data:sorted.map(([,v])=>v),backgroundColor:COLORS,borderWidth:0,hoverOffset:4}]
    },
    options:{
      responsive:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>{
          const pct=(c.raw/total*100).toFixed(0);
          return c.label+': '+pct+'% (R$ '+fp(c.raw)+')';
        }}}
      },
      cutout:'65%'
    }
  });

  const leg=document.getElementById('dm-pie-legend');
  leg.innerHTML=sorted.map(([k,v],i)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:11px">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:8px;height:8px;border-radius:50%;background:${COLORS[i]};flex-shrink:0"></div>
        <span style="color:var(--text)">${k}</span>
      </div>
      <span style="font-weight:700;color:var(--text2)">${(v/total*100).toFixed(0)}%</span>
    </div>`).join('');
}

async function initDashboard(){
  Promise.all([
    loadDashMetrics(),
    loadDashChart(),
    loadDashRecentes(),
    loadDashTopProds(),
    loadDashPie()
  ]).catch(e=>console.warn('Dashboard metrics:',e));
}

async function initConfig(){
  document.getElementById('dash-pedmin').value=PEDIDO_MIN>0?PEDIDO_MIN.toFixed(2):'';
  if(LOJA_ENDERECO)document.getElementById('dash-loja-end').value=LOJA_ENDERECO;
  document.getElementById('dash-raio').value=RAIO_MAX;
  await carregarZonas();
  renderZonas();
  try{
    const {data}=await sb.from('configuracoes').select('chave,valor');
    (data||[]).forEach(r=>{
      if(r.chave==='whatsapp_num')document.getElementById('dash-wpp').value=r.valor;
      if(r.chave==='instagram_url')document.getElementById('dash-ig').value=r.valor;
      if(r.chave==='wpp_msg_template')document.getElementById('dash-wpp-msg').value=r.valor;
      // Mensagens de status
      if(r.chave==='wpp_status_preparo'){
        document.getElementById('wpp-msg-preparo').value=r.valor;
        if(r.valor)WPP_STATUS_CUSTOM['Em preparo']=r.valor;
      }
      if(r.chave==='wpp_status_saiu'){
        document.getElementById('wpp-msg-saiu').value=r.valor;
        if(r.valor)WPP_STATUS_CUSTOM['Saiu para entrega']=r.valor;
      }
      if(r.chave==='wpp_status_entregue'){
        document.getElementById('wpp-msg-entregue').value=r.valor;
        if(r.valor)WPP_STATUS_CUSTOM['Entregue']=r.valor;
      }
      if(r.chave==='wpp_status_cancelado'){
        document.getElementById('wpp-msg-cancelado').value=r.valor;
        if(r.valor)WPP_STATUS_CUSTOM['Cancelado']=r.valor;
      }
    });
  }catch(e){}
  await carregarCupons();
}

async function initClientes(){
  await renderUsers();
  // Limpar histórico ao entrar
  const el = document.getElementById('ped-cliente-lista');
  if(el) el.innerHTML='<div style="padding:20px 0;text-align:center;color:var(--text3);font-size:13px">Busque por um cliente ou código de pedido acima.</div>';
  const inp = document.getElementById('ped-busca-cliente');
  if(inp) inp.value='';
}
async function buscarPedidosCliente(){
  const inp=document.getElementById('ped-busca-cliente');
  const lista=document.getElementById('ped-cliente-lista');
  const loading=document.getElementById('ped-cliente-loading');
  if(!inp||!lista)return;
  const termo=(inp.value||'').trim();
  if(!termo){
    if(loading)loading.classList.add('hidden');
    lista.innerHTML='<div style="padding:20px 0;text-align:center;color:var(--text3);font-size:13px">Busque por um cliente ou código de pedido acima.</div>';
    return;
  }
  if(loading)loading.classList.remove('hidden');
  try{
    const q=termo.replace(/[,%]/g,' ').trim();
    const {data,error}=await sb.from('pedidos')
      .select('id,codigo,cliente_nome,cliente_contato,total,status,data_pedido,created_at')
      .or(`cliente_nome.ilike.%${q}%,cliente_contato.ilike.%${q}%,codigo.ilike.%${q}%`)
      .order('created_at',{ascending:false})
      .limit(80);
    if(error)throw error;
    let filtrados=data||[];
    if(/^\d+$/.test(q)){
      const id=Number(q);
      const [{data:pedidoId},{data:itemIds}]=await Promise.all([
        sb.from('pedidos').select('id,codigo,cliente_nome,cliente_contato,total,status,data_pedido,created_at').eq('id',id),
        sb.from('itens_pedido').select('pedido_id').eq('produto_id',id)
      ]);
      const idsProduto=[...new Set((itemIds||[]).map(it=>it.pedido_id))];
      let pedidosProduto=[];
      if(idsProduto.length){
        const {data:porProduto}=await sb.from('pedidos')
          .select('id,codigo,cliente_nome,cliente_contato,total,status,data_pedido,created_at')
          .in('id',idsProduto);
        pedidosProduto=porProduto||[];
      }
      filtrados=[...filtrados,...(pedidoId||[]),...pedidosProduto]
        .filter((p,i,arr)=>arr.findIndex(x=>String(x.id)===String(p.id))===i)
        .slice(0,80);
    }
    window._pedClienteCache=filtrados;
    if(!filtrados.length){
      lista.innerHTML='<div style="padding:20px 0;text-align:center;color:var(--text3);font-size:13px">Nenhum pedido encontrado.</div>';
      return;
    }
    lista.innerHTML=filtrados.map(p=>`
      <div style="padding:11px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;font-family:monospace;color:var(--text2)">${h(p.codigo||'#'+p.id)}</span>
            <span class="badge bg-gray">${p.status||'--'}</span>
          </div>
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-top:3px">${h(p.cliente_nome||'Cliente')}</div>
          <div style="font-size:11px;color:var(--text3)">${h(p.cliente_contato||'--')} - ${fd(p.data_pedido)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:12px;font-weight:800;color:var(--green-bright)">R$ ${fp(Number(p.total)||0)}</div>
          <button class="btn btn-o btn-sm" style="margin-top:5px" onclick="verPed(${p.id})">Ver</button>
        </div>
      </div>`).join('');
  }catch(e){
    console.warn('buscarPedidosCliente falhou',e);
    lista.innerHTML='<div style="padding:20px 0;text-align:center;color:var(--red);font-size:13px">Erro ao buscar pedidos.</div>';
  }finally{
    if(loading)loading.classList.add('hidden');
  }
}

async function salvarRedes(){
  const wpp=document.getElementById('dash-wpp').value.trim().replace(/\D/g,'');
  const ig=document.getElementById('dash-ig').value.trim();
  const msg=document.getElementById('dash-redes-msg');
  const upserts=[];
  if(wpp)upserts.push({chave:'whatsapp_num',valor:wpp});
  if(ig)upserts.push({chave:'instagram_url',valor:ig});
  if(!upserts.length){msg.style.color='var(--red)';msg.textContent='Preencha ao menos um campo.';return}
  const {error}=await sb.from('configuracoes').upsert(upserts,{onConflict:'chave'});
  if(error){msg.style.color='var(--red)';msg.textContent='Erro: '+error.message;return}
  if(wpp)window._WHATSAPP_NUM_DB=wpp;
  if(ig)INSTAGRAM_URL=ig;
  // Atualiza ícones imediatamente
  const wppBtn=document.querySelector('.dd-icon-btn.wpp');
  if(wppBtn&&wpp)wppBtn.setAttribute('onclick',`fecharDropdown();window.open('https://wa.me/${wpp}','_blank')`);
  const igBtn=document.querySelector('.dd-icon-btn.ig');
  if(igBtn&&ig)igBtn.setAttribute('onclick',`fecharDropdown();window.open('${ig}','_blank')`);
  msg.style.color='var(--green-bright)';msg.textContent='✓ Redes sociais atualizadas!';
  setTimeout(()=>msg.textContent='',3000);
}
async function salvarMsgWpp(){
  const template=document.getElementById('dash-wpp-msg').value.trim();
  const msg=document.getElementById('dash-msg-msg');
  const {error}=await sb.from('configuracoes').upsert({chave:'wpp_msg_template',valor:template},{onConflict:'chave'});
  if(error){msg.style.color='var(--red)';msg.textContent='Erro: '+error.message;return}
  WPP_MSG_TEMPLATE=template;
  msg.style.color='var(--green-bright)';msg.textContent='✓ Mensagem salva!';
  setTimeout(()=>msg.textContent='',3000);
}
async function salvarMsgsStatus(){
  const campos = [
    {id:'wpp-msg-preparo',   chave:'wpp_status_preparo'},
    {id:'wpp-msg-saiu',      chave:'wpp_status_saiu'},
    {id:'wpp-msg-entregue',  chave:'wpp_status_entregue'},
    {id:'wpp-msg-cancelado', chave:'wpp_status_cancelado'},
  ];
  const upserts = campos.map(c=>({
    chave: c.chave,
    valor: document.getElementById(c.id)?.value||''
  }));
  const {error}=await sb.from('configuracoes').upsert(upserts,{onConflict:'chave'});
  if(error){toast('Erro: '+error.message,'err');return;}
  // Atualizar em memória
  WPP_STATUS_CUSTOM['Em preparo']         = upserts[0].valor||'';
  WPP_STATUS_CUSTOM['Saiu para entrega']  = upserts[1].valor||'';
  WPP_STATUS_CUSTOM['Entregue']           = upserts[2].valor||'';
  WPP_STATUS_CUSTOM['Cancelado']          = upserts[3].valor||'';
  const msg=document.getElementById('wpp-status-msg');
  msg.textContent='✓ Mensagens salvas!';
  setTimeout(()=>msg.textContent='',3000);
  toast('Mensagens de status salvas!','ok');
}


async function salvarPedidoMin(){
  const val=parseFloat(document.getElementById('dash-pedmin').value)||0;
  if(val<0){toast('Valor inválido.','err');return}
  const {error}=await sb.from('configuracoes').upsert({chave:'pedido_minimo',valor:String(val)},{onConflict:'chave'});
  if(error){toast('Erro: '+error.message,'err');return}
  PEDIDO_MIN=val;
  const msg=document.getElementById('dash-pedmin-msg');
  msg.textContent=val>0?'✓ Mínimo R$ '+fp(val)+' para entrega.':'✓ Sem pedido mínimo.';
  setTimeout(()=>msg.textContent='',3000);
  toast('Pedido mínimo atualizado!','ok');
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
    // Atualiza ícones com links do banco
    const wppBtn=document.querySelector('.dd-icon-btn.wpp');
    if(wppBtn&&window._WHATSAPP_NUM_DB)wppBtn.setAttribute('onclick',`fecharDropdown();window.open('https://wa.me/${window._WHATSAPP_NUM_DB}','_blank')`);
    const igBtn=document.querySelector('.dd-icon-btn.ig');
    if(igBtn&&INSTAGRAM_URL)igBtn.setAttribute('onclick',`fecharDropdown();window.open('${INSTAGRAM_URL}','_blank')`);
  }catch(e){}
}
async function carregarCupons(){
  const {data}=await sb.from('cupons').select('*').order('created_at',{ascending:false});
  cupons=data||[];renderCupons();
}
function renderCupons(){
  const el=document.getElementById('dash-cup-list');if(!el)return;
  if(!cupons.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">Nenhum cupom.</div>';return}
  el.innerHTML=cupons.map(c=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px">
    <div><div style="font-size:12px;font-weight:800;font-family:monospace">${h(c.nome)}</div>
    <div style="font-size:11px;color:var(--text2)">${c.desconto}% · ${c.usos_restantes} uso(s)</div></div>
    <button class="btn btn-r btn-sm" onclick="rmCupom(${c.id})">x</button>
  </div>`).join('');
}
async function criarCupom(){
  const nome=document.getElementById('dash-cup-nome').value.trim().toUpperCase();
  const pct=parseInt(document.getElementById('dash-cup-pct').value);
  const qty=parseInt(document.getElementById('dash-cup-qty').value);
  if(!nome||isNaN(pct)||isNaN(qty)||pct<1||pct>100||qty<1){toast('Preencha todos os campos.','err');return}
  const {data,error}=await sb.from('cupons').insert({nome,desconto:pct,usos_restantes:qty,ativo:true}).select().single();
  if(error){toast('Erro: '+error.message,'err');return}
  cupons.unshift(data);
  ['dash-cup-nome','dash-cup-pct','dash-cup-qty'].forEach(id=>document.getElementById(id).value='');
  renderCupons();toast('Cupom criado!','ok');
}
async function rmCupom(id){
  if(!confirm('Remover cupom?'))return;
  await sb.from('cupons').delete().eq('id',id);
  cupons=cupons.filter(c=>c.id!==id);renderCupons();
}

async function togDestaque(id){
  const p=prods.find(x=>x.id===id);if(!p)return;
  const novo=!p.destaque;
  const {error}=await sb.from('produtos').update({destaque:novo}).eq('id',id);
  if(error){toast('Erro: '+error.message,'err');return}
  p.destaque=novo;
  renderProdList();
  toast(novo?'★ Em destaque!':'Removido do destaque','ok');
}


// ── RASTREAR PEDIDO ──
function abrirRastrearPedido(){
  popInput('📦','Acompanhar Pedido','Digite o número do seu pedido:','Ex: 260012205','Consultar',async(val)=>{
    const codigo=val.trim().toUpperCase();
    if(!codigo){toast('Digite o código do pedido.','err');return}
    const {data,error}=await sb.from('pedidos')
      .select('codigo,id,status,total,created_at,cliente_nome,entrega,data_pedido')
      .or('codigo.eq.'+codigo+',id.eq.'+(parseInt(codigo)||0))
      .single();
    if(error||!data){toast('Pedido não encontrado. Verifique o código.','err');return}
    const statusEmoji={
      'Pendente':'⏳','Em preparo':'👨‍🍳','Saiu para entrega':'🛵','Entregue':'✅','Cancelado':'❌'
    };
    const st=data.status||'Pendente';
    const dt=data.data_pedido?data.data_pedido.split('-').reverse().join('/'):'—';
    popTrackAlert(
      (statusEmoji[st]||'📦')+' Pedido '+data.codigo,
      'Cliente: '+(data.cliente_nome||'Cliente')+'\n'+'Data: '+dt+'\nModalidade: '+(data.entrega||'—')+'\nTotal: R$ '+fp(data.total)+'\n\nStatus atual:\n'+st
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
function popTrackAlert(title,msg){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:24px 22px 18px;max-width:330px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.35)">
    <div style="font-size:16px;font-weight:800;text-align:center;margin-bottom:12px;color:var(--text)">${h(title)}</div>
    <div style="font-size:13px;color:var(--text2);text-align:center;line-height:1.7;margin-bottom:18px;white-space:pre-line">${h(msg)}</div>
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
let _lpDepoimentos = [];

async function initLanding(){
  const opt = '<option value="">— Nenhum —</option>' + prods.filter(p=>p.ativo).map(p=>`<option value="${p.id}">${h(p.nome)}</option>`).join('');
  ['lp-prod1','lp-prod2','lp-prod3'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.innerHTML = opt;
  });
  try{
    const {data} = await sb.from('configuracoes').select('chave,valor')
      .in('chave',['landing_hero','landing_stats','landing_destaques','landing_depoimentos']);
    (data||[]).forEach(r=>{
      try{
        if(r.chave==='landing_hero'){
          const h = JSON.parse(r.valor);
          document.getElementById('lp-titulo1').value = h.titulo1||'';
          document.getElementById('lp-titulo2').value = h.titulo2||'';
          document.getElementById('lp-titulo3').value = h.titulo3||'';
          document.getElementById('lp-subtitulo').value = h.subtitulo||'';
          document.getElementById('lp-badge').value = h.badge||'';
        }
        if(r.chave==='landing_stats'){
          const s = JSON.parse(r.valor);
          s.forEach((st,i)=>{
            const n = i+1;
            const v = document.getElementById('lp-s'+n+'v');
            const l = document.getElementById('lp-s'+n+'l');
            if(v) v.value = st.valor||'';
            if(l) l.value = st.label||'';
          });
        }
        if(r.chave==='landing_destaques'){
          const ids = JSON.parse(r.valor);
          ids.forEach((id,i)=>{
            const el = document.getElementById('lp-prod'+(i+1));
            if(el) el.value = id||'';
          });
        }
        if(r.chave==='landing_depoimentos'){
          _lpDepoimentos = JSON.parse(r.valor)||[];
          renderLpDepoimentos();
        }
      }catch(e){}
    });
  }catch(e){}
}

async function salvarLandingHero(){
  const hero = {
    titulo1: document.getElementById('lp-titulo1').value.trim(),
    titulo2: document.getElementById('lp-titulo2').value.trim(),
    titulo3: document.getElementById('lp-titulo3').value.trim(),
    subtitulo: document.getElementById('lp-subtitulo').value.trim(),
    badge: document.getElementById('lp-badge').value.trim(),
  };
  const {error} = await sb.from('configuracoes').upsert({chave:'landing_hero',valor:JSON.stringify(hero)},{onConflict:'chave'});
  const msg = document.getElementById('lp-hero-msg');
  if(error){msg.style.color='var(--red)';msg.textContent='Erro: '+error.message;return;}
  msg.style.color='var(--green-bright)';msg.textContent='✓ Hero salvo!';
  setTimeout(()=>msg.textContent='',3000);
  toast('Hero da landing page salvo!','ok');
}

async function salvarLandingStats(){
  const stats = [1,2,3,4].map(n=>({
    valor: document.getElementById('lp-s'+n+'v')?.value.trim()||'',
    label: document.getElementById('lp-s'+n+'l')?.value.trim()||''
  }));
  const {error} = await sb.from('configuracoes').upsert({chave:'landing_stats',valor:JSON.stringify(stats)},{onConflict:'chave'});
  const msg = document.getElementById('lp-stats-msg');
  if(error){msg.style.color='var(--red)';msg.textContent='Erro: '+error.message;return;}
  msg.style.color='var(--green-bright)';msg.textContent='✓ Stats salvos!';
  setTimeout(()=>msg.textContent='',3000);
  toast('Estatísticas salvas!','ok');
}

async function salvarLandingDestaques(){
  const ids = ['lp-prod1','lp-prod2','lp-prod3'].map(id=>{
    const v = document.getElementById(id)?.value;
    return v ?parseInt(v) : null;
  }).filter(Boolean);
  const {error} = await sb.from('configuracoes').upsert({chave:'landing_destaques',valor:JSON.stringify(ids)},{onConflict:'chave'});
  const msg = document.getElementById('lp-prods-msg');
  if(error){msg.style.color='var(--red)';msg.textContent='Erro: '+error.message;return;}
  msg.style.color='var(--green-bright)';msg.textContent='✓ Destaques salvos!';
  setTimeout(()=>msg.textContent='',3000);
  toast('Produtos em destaque salvos!','ok');
}

function adicionarDepoimento(){
  const nome = document.getElementById('lp-dep-nome').value.trim();
  const local = document.getElementById('lp-dep-local').value.trim();
  const texto = document.getElementById('lp-dep-texto').value.trim();
  if(!nome||!texto){toast('Preencha nome e depoimento.','err');return;}
  _lpDepoimentos.push({nome, local, texto});
  renderLpDepoimentos();
  document.getElementById('lp-dep-nome').value='';
  document.getElementById('lp-dep-local').value='';
  document.getElementById('lp-dep-texto').value='';
}

function renderLpDepoimentos(){
  const el = document.getElementById('lp-depoi-list');
  if(!el) return;
  if(!_lpDepoimentos.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0;grid-column:1/-1">Nenhum depoimento. Adicione abaixo.</div>';
    return;
  }
  el.innerHTML = _lpDepoimentos.map((d,i)=>`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;position:relative">
      <button onclick="_lpDepoimentos.splice(${i},1);renderLpDepoimentos()" style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;font-weight:700">×</button>
      <div style="font-size:12px;font-weight:700;margin-bottom:4px">${h(d.nome)}</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:6px">${d.local||'—'}</div>
      <div style="font-size:11px;color:var(--text2);line-height:1.5">"${d.texto.slice(0,80)}${d.texto.length>80?'...':''}"</div>
    </div>`).join('');
}

let _pedidosPendentes = [];
let _bellOpen = false;

async function carregarPendentes(){
  const badge = document.getElementById('bell-badge');
  const list = document.getElementById('bell-list');
  try{
    const {data,error} = await sb.from('pedidos')
      .select('id,codigo,cliente_nome,total,created_at,data_pedido')
      .eq('status','Pendente')
      .order('created_at',{ascending:false})
      .limit(20);
    if(error) throw error;
    _pedidosPendentes = data || [];
  }catch(e){
    _pedidosPendentes = [];
    if(list) list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">Não foi possível carregar notificações</div>';
  }
  atualizarBadge();
  renderBellList();
  if(badge && window.lucide) refreshIcons();
}

function atualizarBadge(){
  const badge = document.getElementById('bell-badge');
  if(!badge) return;
  const n = _pedidosPendentes.length;
  if(n > 0){
    badge.style.display = 'flex';
    badge.textContent = n > 99 ? '99+' : n;
  }else{
    badge.style.display = 'none';
    badge.textContent = '';
  }
}

function renderBellList(){
  const el = document.getElementById('bell-list');
  if(!el) return;
  if(!_pedidosPendentes.length){
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">Nenhum pedido pendente</div>';
    return;
  }
  el.innerHTML = _pedidosPendentes.map(p => {
    const dt = p.created_at ? new Date(p.created_at) : null;
    const hora = dt ? dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
    const data = dt ? dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}) : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s" onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''" onclick="fecharBell();verPed(${p.id})">
      <div style="width:8px;height:8px;border-radius:50%;background:var(--orange);flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${h(p.cliente_nome || 'Cliente')}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">${h(p.codigo || '#'+p.id)} · ${data} às ${hora}</div>
      </div>
      <div style="font-size:12px;font-weight:800;color:var(--green-bright);white-space:nowrap">R$ ${fp(Number(p.total)||0)}</div>
    </div>`;
  }).join('');
}

function toggleBell(){
  _bellOpen = !_bellOpen;
  const dd = document.getElementById('bell-dropdown');
  if(dd) dd.style.display = _bellOpen ? 'block' : 'none';
  if(_bellOpen) carregarPendentes();
}

function fecharBell(){
  _bellOpen = false;
  const dd = document.getElementById('bell-dropdown');
  if(dd) dd.style.display = 'none';
}

async function marcarTodosLidos(){
  if(!_pedidosPendentes.length) return;
  const ids = _pedidosPendentes.map(p => p.id);
  const {error} = await sb.from('pedidos').update({status:'Em preparo'}).in('id', ids);
  if(error){toast('Não foi possível atualizar os pedidos','err');return}
  _pedidosPendentes = [];
  atualizarBadge();
  renderBellList();
  toast('Todos marcados como Em preparo','ok');
}

document.addEventListener('click', e => {
  const bell = document.getElementById('bell-btn');
  const dd = document.getElementById('bell-dropdown');
  if(bell && dd && !bell.contains(e.target) && !dd.contains(e.target)) fecharBell();
});

async function salvarLandingDepoimentos(){
  const {error} = await sb.from('configuracoes').upsert({chave:'landing_depoimentos',valor:JSON.stringify(_lpDepoimentos)},{onConflict:'chave'});
  const msg = document.getElementById('lp-dep-msg');
  if(error){msg.style.color='var(--red)';msg.textContent='Erro: '+error.message;return;}
  msg.style.color='var(--green-bright)';msg.textContent='✓ Depoimentos salvos!';
  setTimeout(()=>msg.textContent='',3000);
  toast('Depoimentos salvos!','ok');
}

// ══════════════════════════════════════
// PIX COPIA E COLA + QR CODE
// ══════════════════════════════════════

async function iniciarAdmin(){
  perfil = window.perfil;
  refreshIcons();
  await carregarTaxaRemota();
  await carregarZonas();
  await loadCatalog();
  const ava = document.getElementById('adm-ava'); if (ava) ava.textContent = ini(perfil.nome);
  const label = document.getElementById('adm-label'); if (label) label.textContent = 'Admin';
  const aData = document.getElementById('a-data'); if (aData) aData.value = '';
  const adb = document.getElementById('a-data-btn');
  if (adb) { adb.textContent = 'Selecionar data de entrega'; adb.classList.remove('selected'); }
  const tv = document.getElementById('a-taxa-val'); if (tv) tv.textContent = fp(TAXA);
  const trv = document.getElementById('a-tr-val'); if (trv) trv.textContent = '+ R$ ' + fp(TAXA);
  if (!fCatAdm && cats.length) fCatAdm = cats[0].id;
  renderACpills(); renderAGrid(); renderCatSel();
  showAEl('ap-dashboard');
  document.querySelectorAll('.aside-item').forEach(b => b.classList.remove('active'));
  const dash = document.getElementById('aside-painel');
  if (dash) dash.classList.add('active');
  refreshIcons();
  initDashboard();
  carregarPendentes();
}
document.addEventListener('DOMContentLoaded', async () => {
  refreshIcons();
  const allowed = await protegerAdmin();
  if (!allowed) return;
  iniciarAdmin();
});
