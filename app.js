const SUPABASE_URL = 'https://ngtkrtabbxrwduleenwn.supabase.co';
// Publishable browser key, deliberately public. Never put a service-role key here.
const SUPABASE_KEY = 'sb_publishable_eRvwUkoqMNtX7xHTa_w-sQ_5IeedVRV';
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icons = {
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>',
  instagram:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17 7h.01"/></svg>',
  mountain:'<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m2 26 11-20 8 14 4-7 6 13H2Z"/><path d="m9 13 4 4 4-4"/></svg>',
  strava:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 14 7-12 7 12h-5l-2-4-2 4H4Zm9 3 4 6 4-6"/></svg>',
  bars:'<svg viewBox="0 0 18 14" aria-hidden="true"><path d="M2 13V9m6 4V5m6 8V1"/></svg>',
};
const countryCodes = 'AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');
const regionNames = new Intl.DisplayNames(['sl'], {type:'region'});
const countryName = code => /^[A-Z]{2}$/.test(code ?? '') ? regionNames.of(code) : (code || '');
const flag = code => /^[A-Z]{2}$/.test(code ?? '') ? [...code].map(char => String.fromCodePoint(127397 + char.charCodeAt(0))).join('') : '';
const countries = countryCodes.map(code => ({code,name:countryName(code)})).sort((a,b) => a.name.localeCompare(b.name,'sl'));
const option = ({code,name}) => `<option value="${esc(code)}">${flag(code) ? flag(code) + ' ' : ''}${esc(name)}</option>`;
$('#hike-country').insertAdjacentHTML('beforeend', countries.filter(c => ['SI','AT','IT'].includes(c.code)).sort((a,b) => ['SI','AT','IT'].indexOf(a.code)-['SI','AT','IT'].indexOf(b.code)).map(option).join('') + '<option value="custom">Druga država...</option>');
const englishNames = new Intl.DisplayNames(['en'], {type:'region'});
const normalizeCountry = value => {
  const text = value.trim();
  const key = text.toLocaleLowerCase('sl');
  const found = countries.find(c => [c.name, englishNames.of(c.code), c.code].some(name => name.toLocaleLowerCase('sl') === key));
  return found ? found.code : text;
};
function toggleCustomCountry() {
  const custom = $('#hike-country').value === 'custom';
  $('#custom-country-label').hidden = !custom;
  $('#custom-country').required = custom;
  if (custom) $('#custom-country').focus();
}
$('#hike-country').addEventListener('change', toggleCustomCountry);
const difficulties = {easy:'Lahko',medium:'Srednje',hard:'Težko'};
let hikes = [];
let activeTab = 'planned';
let loaded = false;
let editHike = null;
let currentAction = null;
let isSaving = false;
let revision = 0;
let loadSequence = 0;
let toastTimer;
let undoHike = null;

async function api(action, data = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hikes_api`, {
      method:'POST', headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_action:action,p_data:data}),signal:controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.code === '40001') throw new Error('Pohod se je medtem spremenil. Zapri obrazec, osveži seznam in poskusi znova.');
      if (result.code === '23514') throw new Error('Preveri vnos. Za prehojen pohod je obvezna veljavna Strava povezava.');
      throw new Error('Shranjevanje ni uspelo. Poskusi znova; tvoj vnos ostaja v obrazcu.');
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Povezava je zatajila. Preveri internet in poskusi znova.');
    throw error;
  } finally { clearTimeout(timer); }
}

function syncCountryFilter() {
  const selected = $('#country-filter').value;
  const available = new Set(hikes.map(h => h.country).filter(Boolean));
  $('#country-filter').innerHTML = '<option value="">Vse države</option>' + [...available].sort((a,b) => countryName(a).localeCompare(countryName(b),'sl')).map(code => option({code,name:countryName(code)})).join('');
  if (available.has(selected)) $('#country-filter').value = selected;
}

async function load() {
  const seq = ++loadSequence;
  const startRevision = revision;
  $('#refresh').disabled = true;
  try {
    const rows = await api('list');
    if (seq !== loadSequence || startRevision !== revision) return;
    hikes = rows;
    loaded = true;
    $('#connection-error').hidden = true;
    syncCountryFilter();
    render();
  } catch (error) {
    if (seq !== loadSequence) return;
    $('#connection-error').textContent = loaded ? 'Seznama ni bilo mogoče osvežiti. Prikazan je zadnji uspešno naložen seznam. Poskusi z gumbom za osvežitev.' : 'Seznama ni bilo mogoče naložiti. Preveri povezavo in pritisni gumb za osvežitev.';
    $('#connection-error').hidden = false;
    if (!loaded) $('#hikes').innerHTML = '<div class="empty"><h3>Seznam je še za ovinkom.</h3><p>Poskusi znova z gumbom za osvežitev.</p></div>';
    $('#hikes').setAttribute('aria-busy','false');
  } finally { if (seq === loadSequence) $('#refresh').disabled = false; }
}

function safeHref(url) {
  try { const parsed = new URL(url); return ['https:','http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null; }
  catch { return null; }
}

function sourceLink(url, label, icon, css='') {
  const href = safeHref(url);
  return href ? `<a class="source-link ${css}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${icons[icon]}${label}</a>` : '';
}

function card(hike) {
  const title = esc(hike.title);
  const badge = difficulties[hike.difficulty] ? `<span class="difficulty ${hike.difficulty}">${icons.bars}${difficulties[hike.difficulty]}</span>` : '';
  return `<article class="hike" data-id="${esc(hike.id)}" aria-label="${title}">
    <button class="complete-button ${hike.completed?'done':''}" data-action="${hike.completed?'reopen':'complete'}" aria-label="${hike.completed?'Vrni na seznam':'Označi kot prehojeno'}: ${title}" title="${hike.completed?'Vrni na seznam':'Označi kot prehojeno'}">${icons.check}</button>
    <div class="hike-main"><div class="hike-title-row"><h3>${title}</h3>${hike.country?`<span class="flag" role="img" aria-label="${esc(countryName(hike.country))}" title="${esc(countryName(hike.country))}">${flag(hike.country) || `<span class="country-text">${esc(countryName(hike.country))}</span>`}</span>`:''}${badge}
    <div class="hike-bottom">${sourceLink(hike.reel_url,'Reel','instagram')}${sourceLink(hike.hribi_url,'Hribi.net','mountain')}${hike.completed?sourceLink(hike.strava_url,'Strava','strava','strava'):''}
    <div class="hike-actions"><button class="icon-button" data-action="edit" aria-label="Uredi: ${title}" title="Uredi pohod">${icons.edit}</button><button class="icon-button" data-action="delete" aria-label="Odstrani: ${title}" title="Odstrani pohod">${icons.trash}</button></div></div></div>
    ${hike.notes?`<p class="hike-notes">${esc(hike.notes)}</p>`:''}</div></article>`;
}

function render() {
  const planned = hikes.filter(h => !h.completed).length;
  const done = hikes.length - planned;
  $('#planned-count').textContent = planned;
  $('#done-count').textContent = done;
  $('#country-count').textContent = new Set(hikes.map(h=>h.country).filter(Boolean)).size;
  $('#planned-badge').textContent = planned;
  $('#done-badge').textContent = done;
  const query = $('#search').value.trim().toLocaleLowerCase('sl');
  const country = $('#country-filter').value;
  const difficulty = $('#difficulty-filter').value;
  const filtered = hikes.filter(h => h.completed === (activeTab === 'done') &&
    (!country || h.country === country) &&
    (!difficulty || (difficulty === 'unset' ? !h.difficulty : h.difficulty === difficulty)) &&
    (!query || `${h.title} ${h.notes??''} ${countryName(h.country)}`.toLocaleLowerCase('sl').includes(query)));
  const isFiltered = query || country || difficulty;
  if (filtered.length) $('#hikes').innerHTML = filtered.map(card).join('');
  else {
    const title = isFiltered ? 'Ta pot še nima zadetkov.' : activeTab === 'done' ? 'Razgledi še čakajo.' : 'Vsak pohod se začne z »ej, poglej to«.';
    const copy = isFiltered ? 'Poskusi drugo iskanje ali odstrani filtre.' : activeTab === 'done' ? 'Ko prehodita prvi pohod, ga označita in prilepita Strava povezavo. Tukaj bo dobil svoje mesto.' : 'Dodajta prvo idejo. Lahko je vrh, sprehod ali tisti reel, ki že tri mesece čaka med shranjenimi.';
    $('#hikes').innerHTML = `<div class="empty"><div class="empty-icon">${icons.mountain}</div><h3>${title}</h3><p>${copy}</p>${isFiltered?'<button class="button ghost" id="clear-filters">Počisti filtre</button>':activeTab==='planned'?'<button class="button primary" id="add-empty">＋ Dodaj prvi pohod</button>':''}</div>`;
  }
  $('#hikes').setAttribute('aria-busy','false');
  $('#result-count').textContent = filtered.length ? `Prikazano: ${filtered.length} / ${activeTab==='done'?done:planned}` : '';
}

function setTab(tab, focus = false) {
  activeTab = tab;
  for (const name of ['planned','done']) {
    const button = $(`#${name}-tab`);
    button.setAttribute('aria-selected',name===tab?'true':'false');
    button.tabIndex = name===tab?0:-1;
  }
  $('#hike-panel').setAttribute('aria-labelledby',`${tab}-tab`);
  if (focus) $(`#${tab}-tab`).focus();
  if (loaded) render();
}

function openForm(hike = null) {
  editHike = hike ? {...hike} : null;
  $('#hike-form').reset();
  $('#form-error').hidden = true;
  $('#form-title').textContent = hike ? 'Še malo popraviva.' : 'Kam greva?';
  $('#save-hike').textContent = hike ? 'Shrani spremembe' : 'Dodaj na seznam';
  $('#edit-strava-label').hidden = !hike?.completed;
  $('#hike-form').elements.strava_url.required = Boolean(hike?.completed);
  if (hike) for (const name of ['title','difficulty','reel_url','hribi_url','notes','strava_url']) $('#hike-form').elements[name].value = hike[name] ?? '';
  const country = hike?.country || '';
  $('#hike-country').value = country && !['SI','AT','IT'].includes(country) ? 'custom' : country;
  $('#custom-country').value = $('#hike-country').value === 'custom' ? countryName(country) : '';
  toggleCustomCountry();
  $('#hike-dialog').showModal();
  $('#hike-title').focus();
}

function openAction(hike, action) {
  currentAction = {hike:{...hike},action};
  $('#action-form').reset();
  $('#action-error').hidden = true;
  $('#complete-label').hidden = action !== 'complete';
  $('#complete-strava').required = action === 'complete';
  const copy = {
    complete:['TO JE TO!','Še en osvojen vrh!',`»${hike.title}« gre med prehojene. Dodaj povezavo do aktivnosti za spomin na vse tiste višince.`,'Shrani med prehojene'],
    reopen:['ŠE ENKRAT NA POT','Spet na seznam?',`»${hike.title}« bo spet med načrtovanimi pohodi. Povezava do prejšnje Strava aktivnosti bo odstranjena s tega vpisa.`,'Vrni na seznam'],
    delete:['SPREMEMBA NAČRTA','Ta hrib pa kdaj drugič?',`Želiš odstraniti »${hike.title}« s seznama? Takoj po odstranitvi lahko dejanje razveljaviš.`,'Odstrani pohod'],
  }[action];
  $('#action-eyebrow').textContent = copy[0];
  $('#action-title').textContent = copy[1];
  $('#action-description').textContent = copy[2];
  $('#confirm-action').textContent = copy[3];
  $('#action-dialog').showModal();
  if (action === 'complete') $('#complete-strava').focus();
  else $('#action-dialog .close-dialog').focus();
}

function setSaving(value, dialog) {
  isSaving = value;
  dialog.querySelectorAll('button').forEach(button => button.disabled = value);
  dialog.setAttribute('aria-busy',String(value));
}

function applyRow(row) {
  revision++;
  const previous = hikes.findIndex(h=>h.id===row.id);
  if (row.deleted_at) hikes = hikes.filter(h=>h.id!==row.id);
  else if (previous >= 0) hikes[previous] = row;
  else hikes.unshift(row);
  $('#connection-error').hidden = true;
  loaded = true;
  syncCountryFilter();
  render();
}

function showToast(message, removed = null) {
  clearTimeout(toastTimer);
  undoHike = removed;
  $('#toast-message').textContent = message;
  $('#undo').hidden = !removed;
  $('#toast').hidden = false;
  // Keep undo available until dismissed or replaced by another action.
  if (!removed) toastTimer = setTimeout(()=>$('#toast').hidden=true,6500);
}

function validStrava(value) {
  return /^https:\/\/((www\.)?strava\.com\/activities\/[0-9]+([/?#].*)?|strava\.app\.link\/[A-Za-z0-9_-]+([/?#].*)?)$/i.test(value);
}

function validateSource(value, domain, label) {
  if (!value) return;
  const href = safeHref(value);
  if (!href) throw new Error(`Preveri povezavo za ${label}. Uporabi spletni naslov s https://.`);
  const host = new URL(href).hostname;
  if (host !== domain && !host.endsWith(`.${domain}`)) throw new Error(`V polje ${label} prilepi povezavo z domene ${domain}.`);
}

$('#hike-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (isSaving) return;
  const data = Object.fromEntries(new FormData(event.target));
  for (const key in data) data[key] = data[key].trim();
  try {
    if (data.country === 'custom' && !data.custom_country) throw new Error('Vpiši ime druge države.');
    data.country = data.country === 'custom' ? normalizeCountry(data.custom_country) : data.country;
    delete data.custom_country;
    if (!data.title) throw new Error('Vpiši ime hriba ali pohoda.');
    validateSource(data.reel_url,'instagram.com','Instagram reel');
    validateSource(data.hribi_url,'hribi.net','Hribi.net');
    if (editHike?.completed && !validStrava(data.strava_url)) throw new Error('Prilepi Strava povezavo do aktivnosti ali kratko povezavo strava.app.link.');
    if (editHike) Object.assign(data,{id:editHike.id,version:editHike.version});
    setSaving(true,$('#hike-dialog'));
    const row = await api(editHike?'update':'create',data);
    applyRow(row);
    $('#hike-dialog').close();
    showToast(editHike?'Spremembe so shranjene.':'Nova ideja je na seznamu. Zdaj pa še čevlje obut.');
  } catch (error) { $('#form-error').textContent = error.message; $('#form-error').hidden = false; }
  finally { setSaving(false,$('#hike-dialog')); }
});

$('#action-form').addEventListener('submit',async event => {
  event.preventDefault();
  if (isSaving || !currentAction) return;
  const {hike,action} = currentAction;
  const data = {id:hike.id,version:hike.version};
  try {
    if (action === 'complete') {
      data.strava_url = $('#complete-strava').value.trim();
      if (!validStrava(data.strava_url)) throw new Error('Prilepi Strava povezavo do aktivnosti ali kratko povezavo strava.app.link.');
    }
    setSaving(true,$('#action-dialog'));
    const row = await api(action,data);
    applyRow(row);
    $('#action-dialog').close();
    showToast(action==='complete'?'Še en pohod pod streho. Oziroma pod nebom.':action==='reopen'?'Pohod je spet na seznamu.':'Pohod je odstranjen.',action==='delete'?row:null);
  } catch (error) { $('#action-error').textContent = error.message; $('#action-error').hidden = false; }
  finally { setSaving(false,$('#action-dialog')); }
});

$('#undo').addEventListener('click',async()=>{
  if (!undoHike) return;
  const row = undoHike;
  $('#undo').disabled = true;
  try { applyRow(await api('undelete',{id:row.id,version:row.version})); showToast('Pohod je spet na seznamu.'); }
  catch(error) { $('#toast-message').textContent = error.message; }
  finally { $('#undo').disabled = false; }
});
$('#dismiss-toast').addEventListener('click',()=>$('#toast').hidden=true);
for (const id of ['add-hero','add-list']) $(`#${id}`).addEventListener('click',()=>openForm());
$('#planned-tab').addEventListener('click',()=>setTab('planned'));
$('#done-tab').addEventListener('click',()=>setTab('done'));
$('.tabs').addEventListener('keydown',event=>{
  if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    setTab(event.key==='Home'?'planned':event.key==='End'?'done':activeTab==='planned'?'done':'planned',true);
  }
});
$('#search').addEventListener('input',()=>loaded&&render());
for (const id of ['country-filter','difficulty-filter']) $(`#${id}`).addEventListener('change',()=>loaded&&render());
$('#refresh').addEventListener('click',load);
$('#hikes').addEventListener('click',event=>{
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id==='add-empty') return openForm();
  if (button.id==='clear-filters') { $('#search').value=''; $('#country-filter').value=''; $('#difficulty-filter').value=''; render(); return; }
  const hike = hikes.find(h=>h.id===button.closest('[data-id]')?.dataset.id);
  if (!hike) return;
  if (button.dataset.action==='edit') openForm(hike);
  else openAction(hike,button.dataset.action);
});
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>{if(!isSaving)button.closest('dialog').close();}));
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('cancel',event=>{if(isSaving)event.preventDefault();});
  dialog.addEventListener('click',event=>{if(event.target===dialog&&!isSaving){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
});
document.querySelectorAll('input[type=url]').forEach(input=>input.addEventListener('blur',()=>{
  const value=input.value.trim();
  if (value && !/^[a-z][a-z0-9+.-]*:/i.test(value)) input.value=`https://${value}`;
  else input.value=value;
}));
setInterval(()=>{if(!document.hidden&&!isSaving&&!document.querySelector('dialog[open]'))load();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!isSaving&&!document.querySelector('dialog[open]'))load();});
load();

