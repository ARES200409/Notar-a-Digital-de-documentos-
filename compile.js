const solc = require('solc'); const fs = require('fs'); const path = require('path');
const src = fs.readFileSync('contracts/NotariaDigital.sol','utf8');
const input = { language:'Solidity', sources:{'NotariaDigital.sol':{content:src}},
  settings:{ optimizer:{enabled:true,runs:200}, evmVersion:'paris', outputSelection:{'*':{'*':['abi','evm.bytecode.object']}} } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) out.errors.forEach(e=>console.log(e.severity, e.formattedMessage));
if (out.errors && out.errors.some(e=>e.severity==='error')) process.exit(1);
const c = out.contracts['NotariaDigital.sol'].NotariaDigital;
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync('build/NotariaDigital.json', JSON.stringify({abi:c.abi, bytecode:'0x'+c.evm.bytecode.object},null,2));
console.log('OK compilado, bytecode bytes:', c.evm.bytecode.object.length/2, 'solc', solc.version());
