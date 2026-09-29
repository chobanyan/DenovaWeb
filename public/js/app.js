const $ = s => document.querySelector(s);
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d }catch(e){ return d } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch(e){} }
};

/* ---------- i18n: [ru, hy, en] ---------- */
const DICT = {hy:{}, en:{}};
L.forEach(([ru,hy,en])=>{ DICT.hy[ru]=hy; DICT.en[ru]=en; });
const norm = s => s.replace(/\s+/g,' ').trim();
let lang = 'ru';
const t = s => lang==='ru' ? s : (DICT[lang][s] ?? s);
const CAL = {
  ru:{dow:['Вс','Пн','Вт','Ср','Чт','Пт','Сб'], mon:['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек']},
  hy:{dow:['Կիր','Երկ','Երք','Չրք','Հնգ','Ուրբ','Շբթ'], mon:['հնվ','փտվ','մրտ','ապր','մյս','հնս','հլս','օգս','սեպ','հոկ','նոյ','դեկ']},
  en:{dow:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], mon:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']}
};
const TPL = {
  ru:{from:v=>'от '+v, now:(i,n,s,d)=>`Этап ${i} из ${n}: ${s.toLowerCase()} · до завершения лечения ${d} дн.`, prog:(a,b)=>`Прошло ${a} дн., осталось ${b} дн.`},
  hy:{from:v=>v+'-ից', now:(i,n,s,d)=>`Փուլ ${i}/${n}՝ ${s.toLowerCase()} · մինչև բուժման ավարտը՝ ${d} օր`, prog:(a,b)=>`Անցել է ${a} օր, մնացել է ${b} օր`},
  en:{from:v=>'from '+v, now:(i,n,s,d)=>`Stage ${i} of ${n}: ${s.toLowerCase()} · ${d} days until treatment ends`, prog:(a,b)=>`${a} days passed, ${b} days left`}
};
const DOW = () => CAL[lang].dow, MON = () => CAL[lang].mon;
const fmt = n => n.toLocaleString(lang==='en'?'en-US':'ru-RU') + ' ֏';

/* static text collected once, before any rendering */
const STATIC = [];
(function(){
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {acceptNode:n => n.parentElement.closest('script,style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
  let n; while((n = w.nextNode())){ const k = norm(n.nodeValue); if(k && k in DICT.en) STATIC.push({n,k}); }
  document.querySelectorAll('[placeholder],[aria-label],[alt],[title]').forEach(el=>['placeholder','aria-label','alt','title'].forEach(a=>{
    const v = el.getAttribute(a); if(v && norm(v) in DICT.en) STATIC.push({el,a,k:norm(v)});
  }));
})();
function applyStatic(){
  STATIC.forEach(s => s.n ? (s.n.nodeValue = t(s.k)) : s.el.setAttribute(s.a, t(s.k)));
  document.documentElement.lang = lang;
  document.title = t('Denova — имплантация зубов');
}

function toast(x){ const el=$('#toast'); el.textContent=x; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),3200); }

/* menu */
$('#menuBtn').onclick = () => { const n=$('#nav'); const o=n.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded',o); };
document.querySelectorAll('#nav a').forEach(a=>a.onclick=()=>$('#nav').classList.remove('open'));

/* ---------- smile drawing ---------- */
const SHADES = [
  {id:'BL1', c:'#FBFBF7', n:'BL1 — голливудская белизна'},
  {id:'A1',  c:'#F4F0E4', n:'A1 — светлый естественный'},
  {id:'A2',  c:'#EEE6D2', n:'A2 — самый частый естественный'},
  {id:'B1',  c:'#F5F2E8', n:'B1 — светлый холодный'},
  {id:'A3',  c:'#E6D9BC', n:'A3 — тёплый естественный'},
];
const TW = [.55,.62,.72,.8,.9,1.1,1.1,.9,.8,.72,.62,.55];
function teethPaths(curve, gaps=[], stain=false, shade='#F4F0E4'){
  const total = TW.reduce((a,b)=>a+b,0);
  let x = 20, out = '';
  const W = 360;
  TW.forEach((w,i)=>{
    const tw = w/total*W;
    const cx = x + tw/2;
    const tt = (cx-200)/180;
    const drop = curve * tt*tt;
    const h = 70 * (0.62 + 0.38*(w/1.1));
    const top = 8 + drop;
    const light = 1 - Math.abs(tt)*0.22;
    if(!gaps.includes(i)){
      const fill = stain ? (i%3===0?'#CDBE95':'#DCCFAA') : shade;
      out += `<path d="M${x+1.5} ${top} L${x+tw-1.5} ${top} L${x+tw-2} ${top+h-10} Q${x+tw/2} ${top+h+4} ${x+2} ${top+h-10} Z" fill="${fill}" style="filter:brightness(${light})"/>`;
      out += `<path d="M${x+tw*0.28} ${top+6} L${x+tw*0.34} ${top+h-18}" stroke="#fff" stroke-opacity=".45" stroke-width="${tw*0.12}" stroke-linecap="round"/>`;
    }
    x += tw;
  });
  return out;
}

/* ---------- works ---------- */
const WORKS = [
  {t:'Один имплант, передний зуб', d:'Одномоментная имплантация с временной коронкой в день удаления.', gaps:[5], time:'4 месяца', n:'1 имплант'},
  {t:'Жевательная группа', d:'Три импланта с синус-лифтингом, коронки из циркония.', gaps:[1,2,10], time:'7 месяцев', n:'3 импланта'},
  {t:'All-on-4, верхняя челюсть', d:'Несъёмный протез на четырёх имплантах, временный — через 2 дня.', gaps:[0,1,3,4,7,8,10,11], stain:true, time:'5 месяцев', n:'4 импланта'},
  {t:'Замена мостовидного протеза', d:'Старый мост снят, соседние зубы сохранены, два импланта.', gaps:[3,8], stain:true, time:'4 месяца', n:'2 импланта'},
  {t:'Навигационная имплантация', d:'Установка по шаблону без разрезов, минимальный отёк.', gaps:[6], time:'3 месяца', n:'1 имплант'},
  {t:'Полная реабилитация', d:'Импланты на обеих челюстях и виниры на свои зубы.', gaps:[0,2,4,5,6,9,11], stain:true, time:'9 месяцев', n:'8 имплантов'},
];
function mouthSVG(inner, bg){
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
    <rect width="400" height="300" fill="${bg}"/>
    <ellipse cx="200" cy="160" rx="170" ry="92" fill="#B26C6A"/>
    <ellipse cx="200" cy="168" rx="150" ry="70" fill="#3B1E22"/>
    <g transform="translate(0,108)">${inner}</g>
    <path d="M30 160 Q200 60 370 160 Q200 120 30 160Z" fill="#C57C78"/>
    <path d="M30 160 Q200 262 370 160 Q200 236 30 160Z" fill="#C57C78"/>
  </svg>`;
}
function renderWorks(){
  const grid = $('#worksGrid');
  grid.innerHTML = '';
  WORKS.forEach(w=>{
    const el = document.createElement('article');
    el.className='work';
    el.innerHTML = `<div class="ba" style="--pos:50%" role="slider" tabindex="0" aria-label="${t('Сравнение до и после')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
        ${mouthSVG(teethPaths(18,w.gaps,w.stain), '#E7C8B6')}
        <div class="after" style="position:absolute;inset:0">${mouthSVG(teethPaths(18,[],false,'#F4F0E4'), '#E7C8B6')}</div>
        <div class="handle"></div><span class="tag l">${t('До')}</span><span class="tag r">${t('После')}</span>
      </div>
      <div class="info"><h3>${t(w.t)}</h3><p>${t(w.d)}</p><div class="row"><span>${t(w.n)}</span><span>${t(w.time)}</span></div></div>`;
    grid.appendChild(el);
    const ba = el.querySelector('.ba');
    const setPos = p => { p=Math.max(0,Math.min(100,p)); ba.style.setProperty('--pos',p+'%'); ba.setAttribute('aria-valuenow',Math.round(p)); };
    const fromEvt = e => { const r=ba.getBoundingClientRect(); setPos((e.clientX-r.left)/r.width*100); };
    let drag=false;
    ba.addEventListener('pointerdown',e=>{drag=true;ba.setPointerCapture(e.pointerId);fromEvt(e)});
    ba.addEventListener('pointermove',e=>drag&&fromEvt(e));
    ba.addEventListener('pointerup',()=>drag=false);
    ba.addEventListener('keydown',e=>{const v=+ba.getAttribute('aria-valuenow'); if(e.key==='ArrowLeft')setPos(v-5); if(e.key==='ArrowRight')setPos(v+5);});
  });
}

/* ---------- try-on ---------- */
const ov = $('#overlay'), stage = $('#stage');
let tState = {x:50, y:62, scale:36, curve:18, rot:0, op:94, shade:SHADES[1]};
function renderOverlay(){
  ov.innerHTML = teethPaths(tState.curve, [], false, tState.shade.c);
  ov.setAttribute('viewBox', `0 0 400 ${100+tState.curve}`);
  ov.style.left = tState.x+'%'; ov.style.top = tState.y+'%';
  ov.style.width = tState.scale+'%';
  ov.style.opacity = tState.op/100;
  ov.style.transform = `translate(-50%,-50%) rotate(${tState.rot}deg)`;
  $('#shadeName').textContent = t(tState.shade.n);
}
const shWrap = $('#shades');
SHADES.forEach(s=>{
  const b=document.createElement('button');
  b.className='shade'; b.style.background=s.c; b._s=s;
  b.setAttribute('aria-pressed', s===tState.shade);
  b.onclick=()=>{tState.shade=s; shWrap.querySelectorAll('.shade').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderOverlay();};
  shWrap.appendChild(b);
});
function labelShades(){ shWrap.querySelectorAll('.shade').forEach(b=>b.setAttribute('aria-label',t(b._s.n))); }
[['sScale','scale'],['sCurve','curve'],['sRot','rot'],['sOp','op']].forEach(([id,k])=>{
  $('#'+id).addEventListener('input',e=>{tState[k]=+e.target.value;renderOverlay();});
});
function loadPhoto(file){
  if(!file) return;
  const r = new FileReader();
  r.onload = () => { const img=$('#photo'); img.src=r.result; img.hidden=false; $('#empty').hidden=true; ov.classList.remove('hidden'); renderOverlay(); };
  r.readAsDataURL(file);
}
$('#fileIn').onchange = e=>loadPhoto(e.target.files[0]);
$('#fileIn2').onchange = e=>loadPhoto(e.target.files[0]);
let od=null;
ov.addEventListener('pointerdown',e=>{od={sx:e.clientX,sy:e.clientY,x:tState.x,y:tState.y};ov.setPointerCapture(e.pointerId);e.preventDefault();});
ov.addEventListener('pointermove',e=>{ if(!od) return; const r=stage.getBoundingClientRect();
  tState.x = od.x + (e.clientX-od.sx)/r.width*100; tState.y = od.y + (e.clientY-od.sy)/r.height*100; renderOverlay(); });
ov.addEventListener('pointerup',()=>od=null);
const hold=$('#holdBtn');
const hide=v=>{ if(!$('#photo').hidden) ov.classList.toggle('hidden',v); };
['pointerdown','keydown'].forEach(ev=>hold.addEventListener(ev,e=>{ if(ev==='keydown'&&e.key!==' '&&e.key!=='Enter')return; e.preventDefault(); hide(true);}));
['pointerup','pointerleave','keyup','blur'].forEach(ev=>hold.addEventListener(ev,()=>hide(false)));

/* ---------- prices ---------- */
const PRICES = [
  ['Консультация, осмотр и КТ','План лечения и смета','1 визит',15000],
  ['Профессиональная гигиена','Подготовка полости рта','1 визит',25000],
  ['Синус-лифтинг / костная пластика','Только при нехватке кости','1 визит',180000],
  ['Установка импланта','Osstem (Корея) / Straumann (Швейцария)','30–60 мин',250000,true],
  ['Приживление импланта','Контрольные осмотры включены','2–6 месяцев',0],
  ['Формирователь десны','Создание контура десны','10–14 дней',30000],
  ['Цифровой слепок и примерка','Сканирование, дизайн коронки','1–2 визита',40000],
  ['Коронка из циркония на имплант','Включая абатмент','1 визит',120000,true],
  ['All-on-4 под ключ','4 импланта и несъёмный протез','3–6 месяцев',2400000,true],
];
function renderPrices(){
  $('#priceBody').innerHTML = PRICES.map(p=>`<tr><td>${t(p[0])}<small>${t(p[1])}</small></td><td>${t(p[2])}</td><td>${p[3]===0 ? t('Входит в стоимость') : p[4] ? TPL[lang].from(fmt(p[3])) : fmt(p[3])}</td></tr>`).join('');
}

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const D = s => new Date(String(s)+'T00:00:00');
const digits = s => String(s||'').replace(/\D/g,'');
const samePhone = (a,b) => { const x=digits(a), y=digits(b); return x.length>=8 && y.length>=8 && x.slice(-8)===y.slice(-8); };

/* ---------- data layer: REST API (see server/app.js) ---------- */
const API = (() => {
  const cache = {taken:[], mine:[], bookings:[], patients:[], me:null};
  const subs = {};
  const emit = c => (subs[c]||[]).forEach(f => { try{ f(cache[c]) }catch(e){ console.error(e) } });
  // re-render only when polled data actually changed, so half-typed inputs survive
  const put = (c, v) => { if(JSON.stringify(cache[c]) === JSON.stringify(v)) return; cache[c] = v; emit(c); };
  async function req(method, url, body, token){
    const headers = {};
    if(body !== undefined) headers['Content-Type'] = 'application/json';
    if(token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch(url, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
    const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if(!r.ok){ const e = new Error(j.error || 'http_' + r.status); e.status = r.status; e.data = j; throw e; }
    return j;
  }
  const myKeys = () => store.get('denova_my', []).filter(x => x && x.id && x.key);
  const adminToken = () => store.get('denova_admin', null);
  const patientToken = () => store.get('denova_ptoken', null);
  // any 401 from the clinic endpoints means the session expired
  const asAdmin = async (method, url, body) => {
    try{ return await req(method, url, body, adminToken()); }
    catch(e){ if(e.status === 401){ store.set('denova_admin', null); emit('admin'); } throw e; }
  };
  return {
    on(c, f){ (subs[c] = subs[c] || []).push(f); },
    all(c){ return cache[c] },
    get me(){ return cache.me },
    get isAdmin(){ return !!adminToken() },
    get isPatient(){ return !!patientToken() },

    /* public */
    async loadSlots(){ put('taken', (await req('GET', '/api/slots')).taken); },
    async loadMine(){
      const items = myKeys();
      put('mine', items.length ? (await req('POST', '/api/bookings/mine', {items})).bookings : []);
    },
    async book(data){
      const r = await req('POST', '/api/bookings', data);
      store.set('denova_my', [...myKeys(), {id: r.booking.id, key: r.key}]);
      cache.mine = [r.booking, ...cache.mine]; emit('mine');
      if(r.booking.date){ cache.taken = [...cache.taken, {date: r.booking.date, time: r.booking.time}]; emit('taken'); }
      return r.booking;
    },
    async cancelMine(id){
      const k = myKeys().find(x => x.id === id);
      await req('POST', `/api/bookings/${encodeURIComponent(id)}/cancel`, {key: k && k.key});
      await Promise.all([this.loadMine(), this.loadSlots()]);
    },
    forget(id){ store.set('denova_my', myKeys().filter(x => x.id !== id)); cache.mine = cache.mine.filter(b => b.id !== id); emit('mine'); },

    /* patient portal */
    async login(phone, code){
      const r = await req('POST', '/api/auth/login', {phone, code});
      store.set('denova_ptoken', r.token); cache.me = r.patient; emit('me');
    },
    async loadMe(){
      if(!patientToken()){ put('me', null); return; }
      try{ put('me', (await req('GET', '/api/me', undefined, patientToken())).patient); }
      catch(e){ if(e.status !== 401) throw e; store.set('denova_ptoken', null); put('me', null); }
    },
    logout(){ store.set('denova_ptoken', null); cache.me = null; emit('me'); },

    /* clinic */
    async adminLogin(password){ store.set('denova_admin', (await req('POST', '/api/admin/login', {password})).token); emit('admin'); },
    adminLogout(){ store.set('denova_admin', null); cache.bookings = []; cache.patients = []; emit('admin'); },
    async loadAdmin(){
      if(!adminToken()) return;
      const [b, p] = await Promise.all([asAdmin('GET', '/api/admin/bookings'), asAdmin('GET', '/api/admin/patients')]);
      put('bookings', b.bookings); put('patients', p.patients);
    },
    async updateBooking(id, patch){
      const r = await asAdmin('PATCH', `/api/admin/bookings/${encodeURIComponent(id)}`, patch);
      cache.bookings = cache.bookings.map(b => b.id === id ? r.booking : b); emit('bookings');
      this.loadSlots().catch(()=>{});
    },
    async savePatient(id, data){
      const r = id ? await asAdmin('PUT', `/api/admin/patients/${encodeURIComponent(id)}`, data) : await asAdmin('POST', '/api/admin/patients', data);
      cache.patients = id ? cache.patients.map(p => p.id === id ? r.patient : p) : [...cache.patients, r.patient];
      emit('patients'); return r.patient.id;
    },
    async deletePatient(id){
      await asAdmin('DELETE', `/api/admin/patients/${encodeURIComponent(id)}`);
      cache.patients = cache.patients.filter(p => p.id !== id); emit('patients');
    },
    uploadUrl(b){ return b.attachment && b.attachment.url ? b.attachment.url + '?t=' + encodeURIComponent(adminToken()) : ''; }
  };
})();
const STATUS = {new:'Ожидает подтверждения', confirmed:'Подтверждена', done:'Завершена', cancelled:'Отменена', asked:'Ожидает ответа врача', answered:'Врач ответил'};

/* ---------- booking ---------- */
const MODES = {clinic:'Консультация в клинике', online:'Видеоконсультация', chat:'Вопрос врачу'};
let bk = {mode:'clinic', day:null, slot:null};
const today = new Date(); today.setHours(0,0,0,0);
const dayList = [];
for(let i=1; dayList.length<14; i++){ const d=new Date(today); d.setDate(d.getDate()+i); if(d.getDay()!==0) dayList.push(d); }
const takenSlot = (date, time) => API.all('taken').some(b => b.date===date && b.time===time);
function renderDays(){
  $('#days').innerHTML = dayList.map((d,i)=>`<button type="button" class="day" data-i="${i}" aria-pressed="${bk.day===i}"><small>${DOW()[d.getDay()]}</small><b>${d.getDate()}</b><small>${MON()[d.getMonth()]}</small></button>`).join('');
  $('#days').querySelectorAll('.day').forEach(b=>b.onclick=()=>{bk.day=+b.dataset.i; bk.slot=null; renderDays(); renderSlots(); renderSummary();});
}
function renderSlots(){
  if(bk.day===null){ $('#slots').innerHTML=''; return; }
  const d = iso(dayList[bk.day]);
  const hours = bk.mode==='online' ? ['10:00','10:30','11:00','13:00','13:30','17:00','17:30','18:00'] : ['10:00','11:00','12:00','13:00','15:00','16:00','17:00','18:00'];
  if(bk.slot && takenSlot(d, bk.slot)) bk.slot = null;
  $('#slots').innerHTML = hours.map(h=>`<button type="button" class="slot" data-h="${h}" ${takenSlot(d,h)?'disabled':''} aria-pressed="${bk.slot===h}">${h}</button>`).join('');
  $('#slots').querySelectorAll('.slot').forEach(b=>b.onclick=()=>{bk.slot=b.dataset.h; renderSlots(); renderSummary();});
}
function renderSummary(){
  const s = $('#summary');
  if(bk.mode==='chat'){ s.textContent=t('Вопрос врачу — ответ придёт по SMS или в WhatsApp'); return; }
  if(bk.day===null){ s.textContent=t('Выберите день и время'); return; }
  const d = dayList[bk.day];
  s.textContent = `${t(MODES[bk.mode])}: ${DOW()[d.getDay()]}, ${d.getDate()} ${MON()[d.getMonth()]}` + (bk.slot?`, ${bk.slot}`:t(' — выберите время'));
}
function setMode(m){
  bk.mode=m; bk.slot=null;
  document.querySelectorAll('.mode').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m));
  const chat = m==='chat';
  $('#dtPick').hidden = chat; $('#chatHint').hidden = !chat; $('#fileField').hidden = !chat;
  $('#fMsgLabel').textContent = t(chat ? 'Ваш вопрос' : 'Что беспокоит (необязательно)');
  $('#submitBtn').textContent = t(chat ? 'Отправить вопрос' : 'Записаться');
  renderSlots(); renderSummary();
}
document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
document.querySelectorAll('[data-mode]').forEach(a=>a.addEventListener('click',()=>setMode(a.dataset.mode)));
function bookingLabel(m){
  if(m.mode==='chat') return t('Вопрос врачу');
  const d = D(m.date);
  return `${t(MODES[m.mode])}, ${d.getDate()} ${MON()[d.getMonth()]}, ${esc(m.time)}`;
}
function renderMine(){
  const list = [...API.all('mine')].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  $('#mine').innerHTML = list.length ? `<h4 style="margin:6px 0 4px;font-size:14px">${t('Ваши записи')}</h4>` + list.map(m=>{
    const canCancel = m.mode!=='chat' && (m.status==='new' || m.status==='confirmed');
    const btn = canCancel ? `<button type="button" class="link-btn" data-act="cancel" data-id="${esc(m.id)}">${t('Отменить')}</button>`
      : `<button type="button" class="link-btn" data-act="hide" data-id="${esc(m.id)}" style="color:var(--muted)">${t('Скрыть')}</button>`;
    const ans = m.answer ? `<div class="answer"><b>${t('Ответ врача:')}</b> ${esc(m.answer)}</div>` : '';
    return `<div class="item"><div style="flex:1;min-width:0"><span>${bookingLabel(m)}</span> <span class="st st-${esc(m.status)}">${t(STATUS[m.status]||'')}</span>${ans}</div>${btn}</div>`;
  }).join('') : '';
}
$('#mine').addEventListener('click', async e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  if(b.dataset.act==='hide'){ API.forget(b.dataset.id); return; }
  try{ await API.cancelMine(b.dataset.id); toast(t('Запись отменена')); }
  catch(err){ toast(t('Не удалось сохранить. Попробуйте ещё раз.')); }
});
const fileB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
$('#bookForm').onsubmit = async e=>{
  e.preventDefault();
  const name=$('#fName').value.trim(), phone=$('#fPhone').value.trim(), msg=$('#fMsg').value.trim();
  const err=$('#err'), chat = bk.mode==='chat';
  if(!chat && (bk.day===null || !bk.slot)){ err.textContent=t('Выберите день и время записи.'); return; }
  if(!name){ err.textContent=t('Укажите имя.'); $('#fName').focus(); return; }
  if(digits(phone).length<8){ err.textContent=t('Укажите телефон, чтобы администратор мог подтвердить запись.'); $('#fPhone').focus(); return; }
  if(chat && !msg){ err.textContent=t('Опишите ваш вопрос.'); $('#fMsg').focus(); return; }
  const data = {mode:bk.mode, name, phone, msg, lang};
  const file = chat && $('#fFile').files[0];
  if(file){
    if(file.size > 5*1024*1024){ err.textContent=t('Файл больше 5 МБ.'); return; }
    data.attachment = {name:file.name, type:file.type, data: await fileB64(file)};
  }
  if(!chat){ data.date = iso(dayList[bk.day]); data.time = bk.slot; if(takenSlot(data.date, data.time)){ renderSlots(); err.textContent=t('Выберите день и время записи.'); return; } }
  err.textContent=''; $('#submitBtn').disabled = true;
  try{
    await API.book(data);
    toast(t(chat ? 'Вопрос отправлен. Врач ответит в течение дня.' : 'Вы записаны. Администратор позвонит для подтверждения.'));
    bk.slot=null; $('#fMsg').value=''; $('#fFile').value=''; renderSlots(); renderSummary();
  }catch(x){
    if(x.message==='slot_taken'){ bk.slot=null; API.loadSlots().catch(()=>{}); err.textContent=t('Это время только что заняли. Выберите другое.'); }
    else err.textContent=t('Не удалось сохранить. Попробуйте ещё раз.');
  }
  finally{ $('#submitBtn').disabled = false; }
};

/* ---------- patient cabinet ---------- */
const fd = d => `${d.getDate()} ${MON()[d.getMonth()]} ${d.getFullYear()}`;
const dayMs = 864e5;
const curPatient = () => API.me;
function renderCabinet(){
  const P = curPatient();
  if(!P){ showCab(false); return; }
  const stages = Array.isArray(P.stages) ? P.stages : [];
  const now = today;
  $('#pName').textContent = t(P.name);
  $('#pPlan').textContent = t(P.plan||'');
  let curIdx = stages.findIndex(s=>s.status==='current');
  if(curIdx<0) curIdx = stages.findIndex(s=>s.status!=='done');
  if(curIdx<0) curIdx = stages.length;
  let pct = 100, daysLeft = 0;
  if(stages.length && curIdx < stages.length){
    const start = D(stages[0].start), end = D(stages[stages.length-1].end);
    pct = end>start ? Math.max(0,Math.min(99, Math.round((now-start)/(end-start)*100))) : 0;
    daysLeft = Math.max(0, Math.round((end-now)/dayMs));
  }
  const C = 2*Math.PI*56;
  $('#ring').innerHTML = `<svg width="132" height="132"><circle cx="66" cy="66" r="56" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="66" cy="66" r="56" fill="none" stroke="var(--sage-deep)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct/100)}"/></svg><div class="val"><div><b>${pct}%</b><br><small>${t('пройдено')}</small></div></div>`;
  $('#nowText').textContent = curIdx < stages.length ? TPL[lang].now(curIdx+1, stages.length, t(stages[curIdx].t), daysLeft) : t('Лечение завершено');
  $('#timeline').innerHTML = stages.map((s,i)=>{
    const st = s.status==='done' ? 'done' : i===curIdx ? 'current' : '';
    const sd=D(s.start), ed=D(s.end);
    const dates = +sd===+ed ? fd(sd) : `${fd(sd)} — ${fd(ed)}`;
    let extra='';
    if(i===curIdx && ed>sd){
      const p = Math.max(0,Math.min(100,Math.round((now-sd)/(ed-sd)*100)));
      extra = `<div class="bar"><i style="width:${p}%"></i></div><div class="t-meta" style="margin-top:6px">${TPL[lang].prog(Math.max(0,Math.round((now-sd)/dayMs)), Math.max(0,Math.round((ed-now)/dayMs)))}</div>`;
    }
    const cost = +s.cost||0;
    const badge = !cost ? '' : s.paid ? `<span class="badge b-paid">${t('Оплачено')}</span>` : `<span class="badge b-due">${t('К оплате')}</span>`;
    return `<li class="${st}"><span class="dot">${s.status==='done'?'✓':i+1}</span>
      <div class="t-head"><b>${esc(t(s.t))}</b><span class="t-cost">${cost?fmt(cost):t('Входит')}${badge}</span></div>
      <div class="t-meta">${i===curIdx?t('Сейчас · '):''}${dates}</div>
      <div class="t-desc">${esc(t(s.d))}</div>${extra}</li>`;
  }).join('');
  const total = stages.reduce((a,s)=>a+(+s.cost||0),0), paid = stages.filter(s=>s.paid).reduce((a,s)=>a+(+s.cost||0),0);
  const nextDue = stages.find(s=>!s.paid && +s.cost);
  $('#money').innerHTML = `<div><span>${t('Стоимость лечения')}</span><span>${fmt(total)}</span></div><div><span>${t('Оплачено')}</span><span>${fmt(paid)}</span></div>${nextDue?`<div><span>${t('Следующий платёж')}</span><span>${fmt(+nextDue.cost)}</span></div>`:''}<div><span>${t('Осталось оплатить')}</span><span>${fmt(total-paid)}</span></div>`;
  const nv = P.nextVisit;
  $('#nextVisit').hidden = !(nv && nv.date);
  if(nv && nv.date) $('#nextVisit').innerHTML = `<small>${t('Следующий визит')}</small><b>${fd(D(nv.date))}${nv.time?', '+esc(nv.time):''}</b><div style="font-size:14px;margin-bottom:14px">${esc(t(nv.what||''))}</div><a class="btn btn-sage" href="#book" style="padding:9px 16px;font-size:14px">${t('Перенести визит')}</a>`;
  const imp = (P.implants||[]).map(Number), miss = (P.missing||[]).map(Number);
  const tooth = n => `<div class="tooth ${imp.includes(n)?'imp':miss.includes(n)?'miss':''}" title="${t('Зуб')} ${n}">${n}</div>`;
  $('#upper').innerHTML = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28].map(tooth).join('');
  $('#lower').innerHTML = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(tooth).join('');
}
function showCab(on){ $('#loginForm').hidden = on; $('#cab').hidden = !on; if(on) renderCabinet(); }
$('#loginForm').onsubmit = async e=>{
  e.preventDefault();
  const le = $('#lErr');
  try{ await API.login($('#lPhone').value, $('#lCode').value.trim()); le.textContent=''; }
  catch(x){
    le.textContent = x.message==='bad_code' ? t('Неверный код. В демо-версии используйте 1234.')
      : x.message==='patient_not_found' ? t('Пациент с таким номером не найден.') + ' Demo: +374 91 234 567, +374 77 111 222'
      : t('Не удалось сохранить. Попробуйте ещё раз.');
  }
};
$('#logout').onclick = ()=>API.logout();

/* ---------- clinic admin ---------- */
const MODE_ADMIN = {clinic:'В клинике', online:'Видео', chat:'Вопрос'};
const STAGE_ST = {planned:'Запланирован', current:'Текущий', done:'Выполнен'};
let reqFilter = 'new', selPid = null, draft = null, delArm = false;
document.querySelectorAll('#adminTabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#adminTabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  $('#tab-req').hidden = b.dataset.tab!=='req'; $('#tab-pat').hidden = b.dataset.tab!=='pat';
});
function openTab(name){ document.querySelector(`#adminTabs [data-tab="${name}"]`).click(); }
document.querySelectorAll('#reqFilter button').forEach(b=>b.onclick=()=>{ reqFilter=b.dataset.f; document.querySelectorAll('#reqFilter button').forEach(x=>x.setAttribute('aria-pressed',x===b)); renderReqs(); });
function renderReqs(){
  const all = [...API.all('bookings')].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const open = all.filter(b=>b.status==='new'||b.status==='asked');
  $('#reqCount').textContent = open.length ? open.length : '';
  const list = reqFilter==='new' ? open : reqFilter==='confirmed' ? all.filter(b=>b.status==='confirmed') : reqFilter==='chat' ? all.filter(b=>b.mode==='chat') : all;
  if(!list.length){ $('#reqList').innerHTML = '<p class="lead" style="font-size:15px">Здесь пусто. Новые заявки с сайта появятся автоматически.</p>'; return; }
  $('#reqList').innerHTML = list.map(b=>{
    const when = b.mode==='chat' ? '' : ` · ${fdRu(b.date)}, ${esc(b.time)}`;
    const hasPat = API.all('patients').some(p=>samePhone(p.phone,b.phone));
    let acts = '';
    if(b.status==='new') acts = `<button class="btn btn-sage btn-sm" data-act="confirm" data-id="${esc(b.id)}">Подтвердить</button><button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${esc(b.id)}">Отменить</button>`;
    else if(b.status==='confirmed') acts = `<button class="btn btn-sage btn-sm" data-act="done" data-id="${esc(b.id)}">Визит состоялся</button><button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${esc(b.id)}">Отменить</button>`;
    if(!hasPat && b.mode!=='chat' && b.status!=='cancelled') acts += `<button class="btn btn-ghost btn-sm" data-act="patient" data-id="${esc(b.id)}">Создать карту пациента</button>`;
    const reply = b.mode==='chat' ? (b.answer ? `<div class="answer"><b>Ваш ответ:</b> ${esc(b.answer)}</div>` : `<textarea data-ans="${esc(b.id)}" placeholder="Ответ пациенту"></textarea><button class="btn btn-dark btn-sm" style="margin-top:8px" data-act="answer" data-id="${esc(b.id)}">Отправить ответ</button>`) : '';
    return `<article class="req"><div><h4>${esc(b.name)} <span class="st st-${esc(b.status)}">${STATUS[b.status]||''}</span></h4>
      <div class="meta">${MODE_ADMIN[b.mode]||''}${when} · <a href="tel:${esc(digits(b.phone))}">${esc(b.phone)}</a>${b.lang&&b.lang!=='ru'?' · язык: '+esc(b.lang):''}</div>
      ${b.msg?`<p>${esc(b.msg)}</p>`:''}${b.attachment?`<p><a href="${esc(API.uploadUrl(b))}" target="_blank" rel="noopener">📎 ${esc(b.attachment.name)}</a></p>`:''}${reply}</div><div class="acts">${acts}</div></article>`;
  }).join('');
}
const fdRu = s => { const d=D(s); return isNaN(d) ? '' : `${d.getDate()} ${CAL.ru.mon[d.getMonth()]}`; };
$('#reqList').addEventListener('click', async e=>{
  const b = e.target.closest('[data-act]'); if(!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  try{
    if(act==='confirm') await API.updateBooking(id, {status:'confirmed'});
    if(act==='done') await API.updateBooking(id, {status:'done'});
    if(act==='cancel') await API.updateBooking(id, {status:'cancelled'});
    if(act==='answer'){
      const v = document.querySelector(`[data-ans="${CSS.escape(id)}"]`).value.trim();
      if(!v){ toast('Напишите ответ'); return; }
      await API.updateBooking(id, {answer:v});
      toast('Ответ отправлен пациенту');
    }
    if(act==='patient'){
      const bkg = API.all('bookings').find(x=>x.id===id);
      selPid = 'new'; draft = blankPatient(); draft.name = bkg.name; draft.phone = bkg.phone;
      openTab('pat'); renderPatList(); renderEditor();
    }
  }catch(x){ toast('Не удалось сохранить. Попробуйте ещё раз.'); }
});
function blankPatient(){ return {name:'', phone:'', plan:'', implants:[], missing:[], nextVisit:{date:'',time:'',what:''},
  stages:[{t:'Консультация и КТ', d:'3D-диагностика, план лечения, смета', start:iso(today), end:iso(today), cost:15000, paid:false, status:'current'}]}; }
function renderPatList(){
  const ps = [...API.all('patients')].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  $('#patList').innerHTML = (selPid==='new' ? `<button class="pat-item" aria-pressed="true"><b>Новый пациент</b><small>не сохранён</small></button>` : '') +
    (ps.map(p=>`<button class="pat-item" data-id="${esc(p.id)}" aria-pressed="${p.id===selPid}"><b>${esc(p.name)}</b><small>${esc(p.phone)}</small></button>`).join('') || '<p class="lead" style="font-size:14px;margin-top:12px">Пациентов пока нет</p>');
  $('#patList').querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{ selPid=b.dataset.id; draft=null; renderPatList(); renderEditor(); });
}
const stOpts = v => Object.entries(STAGE_ST).map(([k,n])=>`<option value="${k}" ${v===k?'selected':''}>${n}</option>`).join('');
const stageRow = s => `<tr><td><input data-k="t" value="${esc(s.t)}" placeholder="Название этапа"><input class="sub" data-k="d" value="${esc(s.d)}" placeholder="Описание"></td>
  <td><input type="date" data-k="start" value="${esc(s.start)}"></td><td><input type="date" data-k="end" value="${esc(s.end)}"></td>
  <td><input type="number" data-k="cost" value="${+s.cost||0}" min="0" step="1000"></td><td><select data-k="status">${stOpts(s.status||'planned')}</select></td>
  <td style="text-align:center"><input type="checkbox" data-k="paid" ${s.paid?'checked':''} aria-label="Оплачено"></td>
  <td><button type="button" class="link-btn" data-act="rm" aria-label="Удалить этап">✕</button></td></tr>`;
function renderEditor(){
  delArm = false;
  const p = selPid==='new' ? draft : API.all('patients').find(x=>x.id===selPid);
  const box = $('#patEditor');
  if(!p){ box.innerHTML = '<p class="lead" style="font-size:15px;margin:0">Выберите пациента слева или создайте новую карту.</p>'; return; }
  const nv = p.nextVisit || {};
  box.innerHTML = `<div class="ed-grid">
    <div class="field"><label>ФИО</label><input id="eName" value="${esc(p.name)}"></div>
    <div class="field"><label>Телефон (логин в кабинет)</label><input id="ePhone" value="${esc(p.phone)}"></div>
    <div class="field" style="grid-column:1/-1"><label>План лечения</label><input id="ePlan" value="${esc(p.plan)}"></div>
    <div class="field"><label>Импланты (номера зубов через запятую)</label><input id="eImp" value="${esc((p.implants||[]).join(', '))}"></div>
    <div class="field"><label>Отсутствующие зубы</label><input id="eMiss" value="${esc((p.missing||[]).join(', '))}"></div>
    <div class="field"><label>Следующий визит</label><input id="eNvDate" type="date" value="${esc(nv.date)}"></div>
    <div class="field"><label>Время и цель визита</label><div style="display:flex;gap:8px"><input id="eNvTime" style="max-width:90px" placeholder="11:30" value="${esc(nv.time)}"><input id="eNvWhat" placeholder="Контрольный осмотр" value="${esc(nv.what)}"></div></div>
  </div>
  <h3 style="margin:10px 0 8px;font-size:18px">Этапы и стоимость</h3>
  <div class="table-scroll"><table class="stg"><thead><tr><th>Этап</th><th>Начало</th><th>Окончание</th><th>Цена, ֏</th><th>Статус</th><th>Оплачен</th><th></th></tr></thead><tbody id="stRows">${(p.stages||[]).map(stageRow).join('')}</tbody></table></div>
  <button type="button" class="btn btn-ghost btn-sm" id="addStage" style="margin-top:10px">Добавить этап</button>
  <div class="err" id="eErr"></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
    <button type="button" class="btn btn-dark" id="savePat">Сохранить карту</button>
    ${selPid!=='new'?'<button type="button" class="btn btn-ghost" id="delPat" style="color:var(--warn)">Удалить карту</button>':''}
  </div>`;
  $('#addStage').onclick = ()=>{ $('#stRows').insertAdjacentHTML('beforeend', stageRow({t:'',d:'',start:iso(today),end:iso(today),cost:0,paid:false,status:'planned'})); };
  $('#stRows').addEventListener('click', e=>{ const b=e.target.closest('[data-act="rm"]'); if(b) b.closest('tr').remove(); });
  $('#savePat').onclick = savePatient;
  const del = $('#delPat');
  if(del) del.onclick = async ()=>{
    if(!delArm){ delArm = true; del.textContent = 'Нажмите ещё раз для удаления'; return; }
    try{ await API.deletePatient(selPid); selPid=null; renderPatList(); renderEditor(); toast('Карта удалена'); }catch(x){ toast('Не удалось удалить'); }
  };
}
const nums = s => String(s).split(/[,\s;]+/).map(Number).filter(n=>n>=11 && n<=48);
async function savePatient(){
  const name=$('#eName').value.trim(), phone=$('#ePhone').value.trim();
  if(!name || digits(phone).length<8){ $('#eErr').textContent='Укажите ФИО и телефон — по номеру пациент входит в кабинет.'; return; }
  const dup = API.all('patients').find(p=>p.id!==selPid && samePhone(p.phone, phone));
  if(dup){ $('#eErr').textContent=`Этот номер уже привязан к карте: ${dup.name}.`; return; }
  const stages = [...$('#stRows').querySelectorAll('tr')].map(r=>{
    const g = k => r.querySelector(`[data-k="${k}"]`);
    return {t:g('t').value.trim(), d:g('d').value.trim(), start:g('start').value, end:g('end').value || g('start').value, cost:Math.max(0,+g('cost').value||0), status:g('status').value, paid:g('paid').checked};
  }).filter(s=>s.t && s.start).sort((a,b)=>a.start.localeCompare(b.start));
  const data = {name, phone, plan:$('#ePlan').value.trim(), implants:nums($('#eImp').value), missing:nums($('#eMiss').value),
    nextVisit:{date:$('#eNvDate').value, time:$('#eNvTime').value.trim(), what:$('#eNvWhat').value.trim()}, stages};
  $('#eErr').textContent=''; $('#savePat').disabled = true;
  try{
    selPid = await API.savePatient(selPid==='new' ? null : selPid, data); draft = null;
    toast('Карта сохранена — пациент видит изменения в кабинете'); renderPatList(); renderEditor();
  }catch(x){ $('#eErr').textContent = x.message==='phone_taken' ? `Этот номер уже привязан к карте: ${x.data.patient}.` : 'Не удалось сохранить. Попробуйте ещё раз.'; }
  finally{ const b=$('#savePat'); if(b) b.disabled=false; }
}
$('#newPat').onclick = ()=>{ selPid='new'; draft=blankPatient(); renderPatList(); renderEditor(); };

/* ---------- language switch ---------- */
function setLang(l){
  lang = CAL[l] ? l : 'ru';
  store.set('denova_lang', lang);
  document.querySelectorAll('.langs button').forEach(b=>b.setAttribute('aria-pressed', b.dataset.l===lang));
  $('#err').textContent=''; $('#lErr').textContent='';
  applyStatic();
  renderWorks(); renderOverlay(); labelShades(); renderPrices();
  renderDays(); setMode(bk.mode); renderMine();
  if(!$('#cab').hidden) renderCabinet();
}
document.querySelectorAll('.langs button').forEach(b=>b.onclick=()=>setLang(b.dataset.l));
setLang(store.get('denova_lang','ru'));

/* ---------- clinic login ---------- */
function showAdmin(){
  const want = API.isAdmin || location.hash==='#admin';
  $('#admin').hidden = !want; $('#adminLink').hidden = !API.isAdmin;
  $('#adminLogin').hidden = API.isAdmin; $('#adminPanel').hidden = !API.isAdmin; $('#adminOut').hidden = !API.isAdmin;
}
$('#adminLogin').onsubmit = async e=>{
  e.preventDefault();
  try{ await API.adminLogin($('#aPass').value); $('#aPass').value=''; $('#aErr').textContent=''; await API.loadAdmin(); }
  catch(x){ $('#aErr').textContent = x.message==='bad_password' ? 'Неверный пароль.' : 'Сервер недоступен. Попробуйте ещё раз.'; }
};
$('#adminOut').onclick = ()=>{ API.adminLogout(); history.replaceState(null,'',location.pathname); showAdmin(); };
window.addEventListener('hashchange', ()=>{ showAdmin(); if(location.hash==='#admin') $('#admin').scrollIntoView(); });

/* ---------- startup ---------- */
API.on('taken', ()=>renderSlots());
API.on('mine', ()=>renderMine());
API.on('me', ()=>showCab(!!curPatient()));
API.on('admin', ()=>{ showAdmin(); if(API.isAdmin){ renderReqs(); renderPatList(); renderEditor(); } });
API.on('bookings', ()=>{ if(API.isAdmin) renderReqs(); });
API.on('patients', ()=>{ if(!API.isAdmin) return; renderPatList(); if(selPid && selPid!=='new' && !API.all('patients').some(p=>p.id===selPid)){ selPid=null; renderEditor(); } });
const quiet = p => p.catch(e=>console.warn('api', e.message));
showAdmin();
quiet(API.loadSlots()); quiet(API.loadMine()); quiet(API.loadMe());
if(API.isAdmin){ quiet(API.loadAdmin().then(()=>renderEditor())); }
// light polling keeps slots, the patient's card and the clinic panel fresh
setInterval(()=>{
  if(document.hidden) return;
  quiet(API.loadSlots()); quiet(API.loadMine());
  if(API.isPatient) quiet(API.loadMe());
  if(API.isAdmin) quiet(API.loadAdmin());
}, 15000);


