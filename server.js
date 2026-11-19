const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ganache = require('ganache');
const { ethers } = require('ethers');
const artifact = require('./build/NotariaDigital.json');
const { hashDoc, demoMeta, validateMeta, verifyCMS } = require('./lib/document');
const ROOT = __dirname;
const MAX_FILE = 5 * 1024 * 1024;
const states = ['Inexistente', 'Pendiente', 'Vigente', 'Anulado'];
const stringify = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
async function createApp({ dataDir = path.join(ROOT, 'data') } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const rpc = ganache.provider({ database: { dbPath: path.join(dataDir, 'chain') }, logging: { quiet: true }, chain: { chainId: 1337 }, wallet: { deterministic: true, totalAccounts: 4 } });
  const provider = new ethers.BrowserProvider(rpc);
  const signers = await Promise.all([0, 1, 2, 3].map(i => provider.getSigner(i)));
  const addresses = await Promise.all(signers.map(s => s.getAddress()));
  const deploymentPath = path.join(dataDir, 'deployment.json');
  let contract;
  if (fs.existsSync(deploymentPath)) {
    const saved = JSON.parse(fs.readFileSync(deploymentPath));
    if (saved.artifactHash !== ethers.keccak256(artifact.bytecode)) throw new Error('El artefacto cambió. Use otro NOTARIA_DATA_DIR o restaure el artefacto; no se migran datos silenciosamente.');
    if (await provider.getCode(saved.address) === '0x') throw new Error('No se encontró el contrato persistido. Restaure data completo.');
    contract = new ethers.Contract(saved.address, artifact.abi, signers[0]);
  } else {
    contract = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, signers[0]).deploy();
    await contract.waitForDeployment();
    for (const i of [1, 2]) await (await contract.autorizarFuncionario(addresses[i], true)).wait();
    fs.writeFileSync(deploymentPath, stringify({ address: await contract.getAddress(), artifactHash: ethers.keccak256(artifact.bytecode) }));
  }
  const token = crypto.randomBytes(32).toString('hex');
  async function roles() {
    const admin = await contract.administrador();
    return Promise.all(addresses.map(async (address, i) => ({ id: i, name: ['Cuenta A', 'Cuenta B', 'Cuenta C', 'Ciudadano'][i], address, authorized: await contract.autorizado(address), admin: address === admin })));
  }
  function actor(body) {
    if (!Number.isInteger(body.actor) || body.actor < 0 || body.actor > 3) fail('Seleccione una cuenta local.');
    return contract.connect(signers[body.actor]);
  }
  function validHash(hash) { if (!/^0x[0-9a-fA-F]{64}$/.test(hash || '')) fail('Ingrese un hash SHA-256 de 64 caracteres hexadecimales con prefijo 0x.'); return hash; }
  async function record(hash, account = 3) {
    const d = await contract.consultarDocumento(validHash(hash));
    const result = Object.fromEntries(['hashDoc', 'tipo', 'expediente', 'uri', 'registrador', 'fechaRegistro', 'fechaVigencia', 'aprobacionesReq', 'aprobaciones', 'estado', 'motivoAnulacion'].map(k => [k, d[k]]));
    result.exists = await contract.existe(hash);
    result.state = states[Number(d.estado)]; result.current = Number(d.estado) === 2;
    const events = await contract.queryFilter(contract.filters.DocumentoRegistrado(hash), 0, 'latest');
    if (events[0]) { result.block = events[0].blockNumber; result.transaction = events[0].transactionHash; }
    result.canApprove = false; result.canCancel = false;
    if (Number.isInteger(account) && account >= 0 && account < 4) {
      const c = contract.connect(signers[account]);
      try { await c.aprobarDocumento.staticCall(hash); result.canApprove = true; } catch {}
      try { await c.anularDocumento.staticCall(hash, 'Consulta de permiso'); result.canCancel = true; } catch {}
    }
    return result;
  }
  async function document(body) {
    const meta = validateMeta(body.meta);
    if (typeof body.filename !== 'string' || !/\.p7s$/i.test(body.filename)) fail('Seleccione un archivo .p7s.');
    if (typeof body.file !== 'string') fail('Archivo codificado incorrectamente.');
    if (body.file.length > Math.ceil(MAX_FILE / 3) * 4) fail('El archivo supera los 5 MB.', 413);
    const bytes = Buffer.from(body.file, 'base64');
    if (!bytes.length || bytes.length > MAX_FILE) fail('El archivo debe pesar entre 1 byte y 5 MB.', 413);
    if (bytes.toString('base64') !== body.file) fail('Archivo codificado incorrectamente.');
    return { hash: hashDoc(bytes, meta), signature: await verifyCMS(bytes) };
  }
  let queue = Promise.resolve();
  const serialize = fn => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(stringify(body)); };
    try {
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) fail('Host no permitido.', 403);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET') {
        if (url.pathname === '/api/status') return send(200, { token, roles: await roles(), total: await contract.totalDocumentos(), contract: await contract.getAddress(), chainId: 1337, persistent: true });
        if (url.pathname === '/api/demo') return send(200, { meta: demoMeta, filename: 'resolucion.p7s', file: fs.readFileSync(path.join(ROOT, 'demo', url.searchParams.get('variant') === 'altered' ? 'resolucion_alterada.p7s' : 'resolucion.p7s')).toString('base64') });
        if (url.pathname === '/api/record') return send(200, await record(url.searchParams.get('hash'), Number(url.searchParams.get('actor') ?? 3)));
        if (url.pathname === '/api/history') {
          const logs = await contract.queryFilter('*', 0, 'latest');
          return send(200, logs.reverse().slice(0, 100).map(l => ({ event: l.fragment.name, block: l.blockNumber, transaction: l.transactionHash, args: Array.from(l.args) })));
        }
        const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
        if (!files[url.pathname]) fail('Ruta no encontrada.', 404);
        const [file, type] = files[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(fs.readFileSync(path.join(ROOT, 'public', file)));
      }
      if (req.method !== 'POST') fail('Método no permitido.', 405);
      if (req.headers['x-notaria-token'] !== token) fail('Sesión local vencida. Recargue la página.', 403);
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) fail('Origen no permitido.', 403);
      if (!req.headers['content-type']?.startsWith('application/json')) fail('Se requiere JSON.', 415);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 7 * 1024 * 1024) fail('Solicitud demasiado grande.', 413); chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { fail('JSON inválido.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Solicitud inválida.');
      if (url.pathname === '/api/verify') { const doc = await document(body); return send(200, { ...doc, record: await record(doc.hash, body.actor) }); }
      return await serialize(async () => {
        const c = actor(body); let tx; let hash;
        if (url.pathname === '/api/register') {
          if (!await contract.autorizado(addresses[body.actor])) fail('Esta cuenta no está autorizada para registrar.', 403);
          const doc = await document(body); hash = doc.hash;
          if (!doc.signature) fail('Firma inválida o certificado no confiable. No se creó ningún registro.', 422);
          if (await contract.existe(hash)) fail('Este documento y sus metadatos ya están registrados.', 409);
          if (!Number.isInteger(body.approvals) || body.approvals < 1 || body.approvals > 3) fail('Seleccione entre 1 y 3 aprobaciones.');
          if (typeof body.uri !== 'string' || body.uri.length > 256 || (body.uri && !/^(https:\/\/|ipfs:\/\/)[^\s]+$/.test(body.uri))) fail('La referencia debe ser https:// o ipfs:// (máximo 256 caracteres).');
          tx = await c.registrarDocumento(hash, body.meta.tipo, body.meta.expediente, body.uri, body.approvals);
        } else if (url.pathname === '/api/approve') { hash = validHash(body.hash); await c.aprobarDocumento.staticCall(hash); tx = await c.aprobarDocumento(hash); }
        else if (url.pathname === '/api/cancel') {
          hash = validHash(body.hash);
          if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 300) fail('Indique un motivo de anulación de 1 a 300 caracteres.');
          await c.anularDocumento.staticCall(hash, body.reason); tx = await c.anularDocumento(hash, body.reason);
        } else if (url.pathname === '/api/authorize' || url.pathname === '/api/transfer') {
          if (!ethers.isAddress(body.address)) fail('Dirección Ethereum inválida.');
          if (url.pathname === '/api/authorize') { if (typeof body.enabled !== 'boolean') fail('Permiso inválido.'); tx = await c.autorizarFuncionario(body.address, body.enabled); }
          else tx = await c.transferirAdministracion(body.address);
        } else fail('Ruta no encontrada.', 404);
        const receipt = await tx.wait();
        return send(200, { transaction: receipt.hash, block: receipt.blockNumber, gas: receipt.gasUsed, ...(hash ? { hash, record: await record(hash, body.actor) } : {}) });
      });
    } catch (error) {
      console.error('[Solicitud]', req.method, req.url, error);
      const messages = { NoAutorizado: 'La cuenta no está autorizada.', NoEsAdministrador: 'Solo el administrador puede gestionar permisos.', YaAprobo: 'Esta cuenta ya aprobó el documento.', EstadoInvalido: 'El estado actual no permite esta acción.', DocumentoYaRegistrado: 'Documento duplicado.', DocumentoInexistente: 'El documento no existe.' };
      let name = error.revert?.name;
      try { name ||= contract.interface.parseError(error.data || error.info?.error?.data?.result)?.name; } catch {}
      send(error.status || (name ? 409 : 400), { error: messages[name] || (error.code ? 'No se pudo completar la operación. Revise la terminal.' : error.message) });
    }
  });
  return { server, contract, provider, close: async () => { await new Promise(resolve => server.close(resolve)); await queue; provider.destroy(); await rpc.disconnect(); } };
}
if (require.main === module) createApp({ dataDir: process.env.NOTARIA_DATA_DIR || path.join(ROOT, 'data') }).then(app => {
  app.server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Notaría Digital: http://localhost:${process.env.PORT || 3000}\nGanache persistente en disco. Ctrl+C para cerrar.`));
  app.server.on('error', e => { console.error(e); process.exit(1); });
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await app.close(); process.exit(0); });
}).catch(e => { console.error(e); process.exit(1); });
module.exports = { createApp };
