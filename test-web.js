const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('./server');
const { hashDoc, demoMeta } = require('./lib/document');
(async () => {
  fs.mkdirSync('tmp', { recursive: true });
  const dataDir = fs.mkdtempSync(path.resolve('tmp/web-test-'));
  let app, base, token, count = 0;
  async function start() { app = await createApp({ dataDir }); await new Promise(r => app.server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${app.server.address().port}`; token = (await request('/api/status')).token; }
  async function request(route, body, expected = 200) {
    const r = await fetch(base + route, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notaria-Token': token }, body: JSON.stringify(body) } : {});
    const json = await r.json(); assert.equal(r.status, expected, JSON.stringify(json)); return json;
  }
  const pass = name => console.log(`PASS W${++count} ${name}`);
  try {
    await start();
    const body = { ...await request('/api/demo'), actor: 1, approvals: 1, uri: '' };
    const originalHash = hashDoc(fs.readFileSync('demo/resolucion.p7s'), demoMeta);
    const registered = await request('/api/register', body);
    assert.equal(registered.hash, originalHash); assert.equal(registered.record.state, 'Vigente'); assert.ok(registered.block); assert.match(registered.transaction, /^0x/); pass('Registro firmado y hash compatible con flujo.js');
    const queried = await request(`/api/record?hash=${originalHash}&actor=3`); assert.equal(queried.expediente, demoMeta.expediente); assert.equal(queried.canCancel, false); pass('Consulta pública con permisos reales');
    let v = await request('/api/verify', body); assert.equal(v.signature, true); assert.equal(v.record.exists, true); assert.equal(v.record.current, true); pass('Original válido, registrado y vigente');
    const altered = { ...body, ...await request('/api/demo?variant=altered') };
    v = await request('/api/verify', altered); assert.equal(v.signature, false); assert.equal(v.record.exists, false); pass('Copia alterada: firma inválida y hash ausente');
    v = await request('/api/verify', { ...body, meta: { ...body.meta, fecha_firma: '2026-11-07' } }); assert.equal(v.signature, true); assert.equal(v.record.exists, false); pass('Fecha modificada: firma válida y hash ausente');
    const before = (await request('/api/status')).total;
    await request('/api/register', altered, 422); assert.equal((await request('/api/status')).total, before); pass('Firma inválida no crea registros');
    await request('/api/register', body, 409); await request('/api/register', { ...body, actor: 3 }, 403); pass('Duplicados y cuenta no autorizada rechazados');
    const pending = await request('/api/register', { ...body, meta: { ...body.meta, expediente: 'EXP-DOBLE' }, approvals: 2 });
    assert.equal(pending.record.state, 'Pendiente'); assert.equal(pending.record.canApprove, false);
    assert.equal((await request(`/api/record?hash=${pending.hash}&actor=2`)).canApprove, true);
    await request('/api/approve', { hash: pending.hash, actor: 1 }, 409);
    const approved = await request('/api/approve', { hash: pending.hash, actor: 2 }); assert.equal(approved.record.state, 'Vigente'); pass('Dos aprobaciones distintas y permisos de botones');
    const cancelled = await request('/api/cancel', { hash: pending.hash, actor: 2, reason: 'Error de prueba' }); assert.equal(cancelled.record.state, 'Anulado'); assert.equal(cancelled.record.exists, true); assert.equal(cancelled.record.current, false); pass('Anulación conserva existencia e historial');
    await request('/api/register', { ...body, filename: 'mal.txt' }, 400);
    await request('/api/register', { ...body, meta: { ...body.meta, fecha_firma: '2026-02-30' } }, 400);
    await request('/api/register', { ...body, file: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }, 413); pass('Validación de extensión, fecha y tamaño');
    const roles = (await request('/api/status')).roles;
    await request('/api/authorize', { actor: 1, address: roles[2].address, enabled: false }, 409);
    await request('/api/authorize', { actor: 0, address: roles[2].address, enabled: false });
    assert.equal((await request('/api/status')).roles[2].authorized, false);
    await request('/api/transfer', { actor: 0, address: roles[1].address }); assert.equal((await request('/api/status')).roles[1].admin, true); pass('Administración y retiro de permisos');
    const address = (await request('/api/status')).contract; await app.close(); app = null; await start();
    assert.equal((await request('/api/status')).contract, address); assert.equal((await request('/api/record?hash=' + originalHash)).state, 'Vigente');
    assert.equal((await request('/api/record?hash=' + pending.hash)).state, 'Anulado'); assert.equal((await request('/api/status')).roles[1].admin, true); pass('Reinicio conserva contrato, registros, estados y administrador');
    assert.ok((await request('/api/history')).some(e => e.event === 'DocumentoAnulado')); pass('Bitácora persistente');
    const html = await fetch(base); assert.equal(html.status, 200); assert.match(await html.text(), /Registrar documento/); pass('Interfaz servida por HTTP');
    console.log(`\n${count}/${count} verificaciones web aprobadas.`);
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
