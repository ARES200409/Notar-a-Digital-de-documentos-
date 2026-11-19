const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const canon = o => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));
const hashDoc = (bytes, meta) => '0x' + crypto.createHash('sha256').update(Buffer.concat([bytes, Buffer.from('\n' + canon(meta))])).digest('hex');
const demoMeta = { expediente: 'EXP-2026-0001', tipo: 'RESOLUCION', entidad: 'Municipalidad de Prueba', fecha_firma: '2026-11-06', certificado_serie_dni: 'DNI12345678' };
function validateMeta(meta) {
  if (!meta || Object.keys(meta).sort().join() !== Object.keys(demoMeta).sort().join()) throw new Error('Complete los cinco metadatos requeridos.');
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\x00-\x1f]/.test(value)) throw new Error(`Campo inválido: ${key} (máximo 160 caracteres).`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.fecha_firma) || !Number.isFinite(Date.parse(meta.fecha_firma)) || new Date(meta.fecha_firma).toISOString().slice(0, 10) !== meta.fecha_firma) throw new Error('La fecha de firma no es válida.');
  return meta; // No recortar, cambiar mayúsculas ni normalizar Unicode: compatible con flujo.js.
}
const openssl = process.env.OPENSSL_PATH || (fs.existsSync('C:/laragon/bin/git/mingw64/bin/openssl.exe') ? 'C:/laragon/bin/git/mingw64/bin/openssl.exe' : 'openssl');
async function verifyCMS(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaria-'));
  try {
    const input = path.join(dir, 'documento.p7s');
    fs.writeFileSync(input, bytes);
    await run(openssl, ['cms', '-verify', '-binary', '-inform', 'DER', '-in', input, '-CAfile', path.resolve(__dirname, '../demo/ca.crt'), '-purpose', 'any', '-out', path.join(dir, 'contenido')], { timeout: 15000, windowsHide: true });
    return true;
  } catch (error) {
    console.error('[OpenSSL]', error.stderr || error.message);
    if (error.code === 'ENOENT' || error.killed) throw new Error('OpenSSL no está disponible o excedió el tiempo de espera. Revise la terminal y OPENSSL_PATH.');
    return false;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { canon, hashDoc, demoMeta, validateMeta, verifyCMS };
