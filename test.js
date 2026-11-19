const ganache = require('ganache'); const { ethers } = require('ethers'); const assert = require('assert');
const artifact = require('./build/NotariaDigital.json'); const crypto = require('crypto');
const sha = (s)=>'0x'+crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
  const provider = new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}, chain:{chainId:1337}, wallet:{totalAccounts:5, deterministic:true}}));
  const [admin, func1, func2, intruso] = await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
  const F = new ethers.ContractFactory(artifact.abi, artifact.bytecode, admin);
  const c = await F.deploy(); const rc = await c.deploymentTransaction().wait();
  console.log('Deploy OK | gas:', rc.gasUsed.toString());
  const results=[]; const ok=(n,g)=>{results.push(n); console.log('PASS', n, g?('| gas: '+g):'');};

  await (await c.autorizarFuncionario(await func1.getAddress(), true)).wait();
  await (await c.autorizarFuncionario(await func2.getAddress(), true)).wait();
  ok('T1 Admin autoriza funcionarios');

  const h1 = sha('RESOLUCION-001-2026 firmada + metadatos');
  let tx = await (await c.connect(func1).registrarDocumento(h1,'RESOLUCION','EXP-2026-0001','',1)).wait();
  let d = await c.consultarDocument?.(h1) ?? await c.consultarDocumento(h1);
  assert.equal(Number(d.estado),2); assert.equal(d.registrador, await func1.getAddress()); assert(d.fechaRegistro>0n);
  ok('T2 Registro por funcionario autorizado (estado Vigente + timestamp)', tx.gasUsed);

  await assert.rejects(c.connect(intruso).registrarDocumento(sha('x'),'X','E','',1)); ok('T3 Usuario no autorizado es rechazado');
  await assert.rejects(
  c.connect(func1).registrarDocumento.staticCall(h1, 'RESOLUCION', 'EXP-2026-0001', '', 1)
);
ok('T4 Hash duplicado es rechazado');

  assert.equal(await c.existe(h1), true);
  assert.equal(await c.existe(sha('RESOLUCION-001-2026 firmada + metadatos ALTERADA')), false);
  ok('T5 Verificacion: documento alterado produce hash distinto (no registrado)');

  const h2 = sha('CONTRATO-OBRA-77');
  await (await c.connect(func1).registrarDocumento(h2,'CONTRATO','EXP-2026-0042','ipfs://demo',2)).wait();
  assert.equal(Number((await c.consultarDocumento(h2)).estado),1);
  await assert.rejects(c.connect(func1).aprobarDocumento(h2)); 
  let tA = await (await c.connect(func2).aprobarDocumento(h2)).wait();
  assert.equal(Number((await c.consultarDocumento(h2)).estado),2);
  ok('T6 Regla de negocio: contrato requiere 2 aprobaciones distintas (Pendiente -> Vigente)', tA.gasUsed);

  let tN = await (await c.connect(func2).anularDocumento(h1,'Error material en el numero de expediente')).wait();
  d = await c.consultarDocumento(h1);
  assert.equal(Number(d.estado),3); assert.equal(await c.existe(h1), true);
  ok('T7 Anulacion conserva historial (no borra el registro)', tN.gasUsed);

  const contenido = ethers.toUtf8Bytes('doc pequeno'); const hp = sha('doc pequeno');
  await (await c.connect(func1).registrarDocumento(hp,'ACTA','EXP-3','',1)).wait();
  const [reg, est] = await c.verificarContenido(contenido); assert.equal(reg,true); assert.equal(Number(est),2);
  ok('T8 Verificacion on-chain con precompilado SHA-256');

  await (await c.transferirAdministracion(await func2.getAddress())).wait();
  assert.equal(await c.administrador(), await func2.getAddress());
  await assert.rejects(c.connect(admin).autorizarFuncionario(await intruso.getAddress(), true));
  ok('T9 Transferencia de administracion y control de acceso');

  const logs = await c.queryFilter('*'); console.log('Eventos emitidos (auditoria):', logs.length);
  console.log('\nResumen: '+results.length+'/9 pruebas aprobadas. Total de documentos:', (await c.totalDocumentos()).toString());
})().catch(e=>{console.error('FALLO',e);process.exit(1)});
