const ganache=require('ganache'); const {ethers}=require('ethers'); const crypto=require('crypto'); const fs=require('fs'); const {execFileSync}=require('child_process');
const artifact=require('./build/NotariaDigital.json');
const canon=(o)=>JSON.stringify(Object.keys(o).sort().reduce((a,k)=>(a[k]=o[k],a),{}));
function hashDoc(p7sPath, meta){ const b=fs.readFileSync(p7sPath); return '0x'+crypto.createHash('sha256').update(Buffer.concat([b,Buffer.from('\n'+canon(meta))])).digest('hex'); }

const verifyCMS = (p7s) => {
  try {
    execFileSync('openssl', [
      'cms', '-verify', '-binary', '-inform', 'DER',
      '-in', p7s, '-CAfile', 'demo/ca.crt', '-purpose', 'any'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return true;
  } catch (error) {
    console.error(error.stderr?.toString().trim() || error.message);
    return false;
  }
};

async function main() {
  const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:3,deterministic:true}}));
  const admin=await provider.getSigner(0); const c=await new ethers.ContractFactory(artifact.abi,artifact.bytecode,admin).deploy(); await c.waitForDeployment();
  const meta={expediente:'EXP-2026-0001',tipo:'RESOLUCION',entidad:'Municipalidad de Prueba',fecha_firma:'2026-11-06',certificado_serie_dni:'DNI12345678'};
  console.log('FASE OFF-CHAIN  1) Firma PKI valida:', verifyCMS('demo/resolucion.p7s'));
  const h=hashDoc('demo/resolucion.p7s',meta); console.log('GENERACION HASH 2) SHA-256(documento firmado + metadatos):\n   ',h);
  const tx=await(await c.registrarDocumento(h,meta.tipo,meta.expediente,'',1)).wait();
  const d=await c.consultarDocumento(h); const blk=await provider.getBlock(tx.blockNumber);
  console.log('FASE ON-CHAIN   3) Registrado en bloque',tx.blockNumber,'| tx',tx.hash.slice(0,18)+'...','| gas',tx.gasUsed.toString());
  console.log('    timestamp:',d.fechaRegistro.toString(),'=',new Date(Number(d.fechaRegistro)*1000).toISOString(),'| registrador:',d.registrador,'| estado:',['Inexistente','Pendiente','Vigente','Anulado'][Number(d.estado)]);
  // VERIFICACION CIUDADANA
  console.log('\nVERIFICACION (ciudadano/auditor):');
  console.log(' a) Archivo original -> hash coincide y existe on-chain:', await c.existe(hashDoc('demo/resolucion.p7s',meta)));
  fs.copyFileSync('demo/resolucion.p7s','demo/resolucion_alterada.p7s'); const buf=fs.readFileSync('demo/resolucion_alterada.p7s'); buf[buf.length-5]^=0x01; fs.writeFileSync('demo/resolucion_alterada.p7s',buf);
  console.log(' b) Archivo alterado (1 bit) -> existe on-chain:', await c.existe(hashDoc('demo/resolucion_alterada.p7s',meta)), '| firma PKI valida:', verifyCMS('demo/resolucion_alterada.p7s'));
  const meta2={...meta,fecha_firma:'2026-11-07'}; console.log(' c) Metadatos alterados (fecha)        -> existe on-chain:', await c.existe(hashDoc('demo/resolucion.p7s',meta2)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
