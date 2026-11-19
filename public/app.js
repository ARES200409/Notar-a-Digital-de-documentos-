const $ = s => document.querySelector(s);
let status, tab = 'register', example = null, lastHash = null, busy = false;
const titles = { register: ['Registrar documento', 'De un documento firmado a una evidencia verificable.'], verify: ['Verificar integridad', 'Comprueba la firma, el registro y la vigencia por separado.'], search: ['Consultar registro', 'La información del contrato, disponible para cualquier cuenta.'], demo: ['Explora la evidencia', 'Comprueba qué sucede cuando cambia un archivo o un metadato.'], history: ['Bitácora de actividad', 'Cada acción deja una huella en la cadena.'], roles: ['Cuentas y permisos', 'Prueba los roles del contrato en un entorno local.'] };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const actor = () => Number($('#actor').value);
function notice(message, error = false) { $('#notice').hidden = false; $('#notice').className = error ? 'error' : ''; $('#notice').textContent = message; }
async function api(url, body) {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notaria-Token': status.token }, body: JSON.stringify(body) } : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
async function work(fn) {
  if (busy) return; busy = true;
  const buttons = [...document.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
  notice('Procesando… comprobando la evidencia y consultando el contrato.');
  try { await fn(); } catch (e) { notice(e.message, true); }
  finally { busy = false; buttons.forEach(b => b.disabled = false); permissions(); }
}
function permissions() {
  const role = status?.roles.find(r => r.id === actor());
  $('#submit-document').disabled = busy || (tab === 'register' && !role?.authorized);
  document.querySelector('[data-demo="register"]').disabled = busy || !role?.authorized;
  $('#role-form').hidden = !role?.admin;
}
async function refresh() {
  const selected = $('#actor').value || '1'; status = await api('/api/status');
  $('#actor').innerHTML = status.roles.map(r => `<option value="${r.id}">${escape(r.name)} · ${r.admin ? 'Administrador' : r.authorized ? 'Funcionario' : 'Consulta'}</option>`).join(''); $('#actor').value = selected;
  $('#total').textContent = status.total; $('#contract-address').textContent = status.contract;
  $('#role-list').innerHTML = status.roles.map(r => `<div class="role"><strong>${escape(r.name)}</strong> · ${r.admin ? 'Administrador · ' : ''}${r.authorized ? 'Autorizado para registrar, aprobar y anular' : 'Solo consulta'}<small>${escape(r.address)}</small></div>`).join('');
  $('#target-account').innerHTML = status.roles.map(r => `<option value="${escape(r.address)}">${escape(r.name)} · ${escape(r.address)}</option>`).join(''); permissions();
}
function selectTab(next) {
  tab = next; $('#title').textContent = titles[tab][0]; $('#subtitle').textContent = titles[tab][1];
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['document', 'search', 'demo', 'history', 'roles'].forEach(id => $(`#${id}-panel`).hidden = id === 'document' ? !['register', 'verify'].includes(tab) : id !== tab);
  document.querySelectorAll('.register-only').forEach(e => e.hidden = tab !== 'register');
  $('#submit-document').textContent = tab === 'register' ? 'Verificar firma y registrar →' : 'Verificar documento →';
  $('#result').hidden = true; $('#notice').hidden = true; permissions();
  if (tab === 'history') work(loadHistory);
}
async function loadExample() {
  example = await api('/api/demo'); $('#file').value = '';
  for (const [k, v] of Object.entries(example.meta)) $(`[name="${k}"]`).value = v;
  $('#file-label').textContent = 'resolucion.p7s · ejemplo de prueba cargado';
  notice('Ejemplo listo. Puedes registrar o verificar usando estos mismos metadatos.');
}
async function formBody() {
  const file = $('#file').files[0]; let encoded, filename;
  if (file) {
    if (!/\.p7s$/i.test(file.name) || file.size === 0 || file.size > 5 * 1024 * 1024) throw new Error('Selecciona un .p7s de hasta 5 MB y no vacío.');
    encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); filename = file.name;
  } else if (example) { encoded = example.file; filename = example.filename; } else throw new Error('Selecciona un archivo .p7s o carga el ejemplo.');
  return { file: encoded, filename, meta: Object.fromEntries(new FormData($('#document-form'))), actor: actor(), approvals: Number($('#approvals').value), uri: $('#uri').value };
}
const date = value => Number(value) ? new Date(Number(value) * 1000).toLocaleString('es-PE') : '—';
function render(result) {
  const d = result.record || result; lastHash = result.hash || (d.exists ? d.hashDoc : $('#search-hash').value);
  $('#search-hash').value = lastHash;
  const fields = { 'Hash SHA-256': lastHash, 'Expediente': d.expediente || '—', 'Tipo': d.tipo || '—', 'Estado del contrato': d.state, 'Registrador': d.exists ? d.registrador : '—', 'Fecha de registro': date(d.fechaRegistro), 'Fecha de vigencia': date(d.fechaVigencia), 'Aprobaciones': `${d.aprobaciones} / ${d.aprobacionesReq}`, 'Bloque de registro': d.block ?? '—', 'Transacción de registro': d.transaction || '—', 'Referencia externa': d.uri || '—', 'Motivo de anulación': d.motivoAnulacion || '—' };
  $('#result').hidden = false;
  $('#result').innerHTML = `<div class="eyebrow">RESULTADO DEL CONTRATO</div><h2>${d.exists ? escape(d.expediente) : 'No hay registro para esta huella'}</h2><div class="checks">${typeof result.signature === 'boolean' ? `<div class="check ${result.signature ? 'good' : 'bad'}">Firma PKI de prueba<br><strong>${result.signature ? 'Válida' : 'Inválida o no confiable'}</strong></div>` : ''}<div class="check ${d.exists ? 'good' : ''}">Existencia en blockchain<br><strong>${d.exists ? 'Registrado' : 'No registrado'}</strong></div><div class="check ${d.current ? 'good' : ''}">Vigencia del registro<br><strong>${escape(d.state)}</strong></div></div><dl>${Object.entries(fields).map(([k, v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`).join('')}</dl>${result.transaction ? `<p>Última operación: bloque ${escape(result.block)} · <code>${escape(result.transaction)}</code></p>` : ''}<div class="actions"><button id="copy-hash" class="secondary">Copiar hash</button>${d.canApprove ? '<button id="approve">Aprobar documento</button>' : ''}${d.canCancel ? '<form id="cancel-form"><input id="reason" required maxlength="300" placeholder="Motivo de anulación" aria-label="Motivo de anulación"><button class="secondary">Anular documento</button></form>' : ''}</div>`;
  $('#copy-hash').onclick = () => work(async () => {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(lastHash);
    else {
      const field = document.createElement('textarea'); field.value = lastHash; document.body.append(field); field.select();
      const copied = document.execCommand('copy'); field.remove();
      if (!copied) throw new Error('Copia manualmente el hash mostrado en el resultado.');
    }
    notice('Hash copiado.');
  });
  if ($('#approve')) $('#approve').onclick = () => work(async () => { render(await api('/api/approve', { hash: lastHash, actor: actor() })); await refresh(); notice('Aprobación confirmada en la cadena.'); });
  if ($('#cancel-form')) $('#cancel-form').onsubmit = e => { e.preventDefault(); const reason = $('#reason').value; work(async () => { render(await api('/api/cancel', { hash: lastHash, actor: actor(), reason })); await refresh(); notice('Documento anulado. Su registro y su historial se conservan.'); }); };
}
async function loadHistory() {
  const logs = await api('/api/history');
  $('#history').innerHTML = logs.length ? logs.map(l => `<div class="event"><strong>${escape(l.event)}</strong> · Bloque ${l.block}<small>Transacción: ${escape(l.transaction)}</small><small>${l.args.map(escape).join(' · ')}</small></div>`).join('') : '<p>No hay eventos.</p>'; notice('Bitácora actualizada desde el contrato.');
}
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
$('#load-example').onclick = () => work(loadExample);
$('#file').onchange = () => { example = null; $('#file-label').textContent = $('#file').files[0]?.name || 'Selecciona un documento firmado'; };
$('#document-form').onsubmit = e => { e.preventDefault(); work(async () => { const body = await formBody(); render(await api(tab === 'register' ? '/api/register' : '/api/verify', body)); await refresh(); notice(tab === 'register' ? 'Registro confirmado en la cadena local.' : 'Verificación terminada. Revisa cada resultado por separado.'); }); };
$('#search-form').onsubmit = e => { e.preventDefault(); work(async () => { render(await api(`/api/record?hash=${encodeURIComponent($('#search-hash').value)}&actor=${actor()}`)); notice('Consulta completada.'); }); };
$('#actor').onchange = () => work(async () => { permissions(); if (lastHash && !$('#result').hidden) render(await api(`/api/record?hash=${lastHash}&actor=${actor()}`)); notice('Cuenta cambiada. Permisos consultados en el contrato.'); });
document.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => work(async () => {
  const variant = b.dataset.demo; const body = await api(`/api/demo?variant=${variant}`);
  if (variant === 'date') body.meta.fecha_firma = '2026-11-07';
  Object.assign(body, { actor: actor(), approvals: 1, uri: '' });
  render(await api(variant === 'register' ? '/api/register' : '/api/verify', body)); await refresh(); notice(variant === 'register' ? 'Ejemplo registrado. Ya puedes comparar las tres verificaciones.' : 'Comparación completada: firma, existencia y estado son comprobaciones independientes.');
}));
$('#refresh-history').onclick = () => work(loadHistory);
$('#role-form').onsubmit = e => { e.preventDefault(); work(async () => { const action = $('#role-action').value; await api(action === 'transfer' ? '/api/transfer' : '/api/authorize', { actor: actor(), address: $('#target-account').value, enabled: action === 'enable' }); await refresh(); notice('Permisos actualizados en el contrato.'); }); };
refresh().catch(e => notice(`No se pudo conectar: ${e.message}`, true));
