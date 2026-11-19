// Uso: SEPOLIA_RPC_URL=<url Alchemy/Infura/publicnode> PRIVATE_KEY=<clave de cuenta de PRUEBA> node deploy-sepolia.js
// Requiere ETH de prueba de Sepolia (faucet). NUNCA use una cuenta con fondos reales.
const { ethers } = require('ethers'); const artifact = require('./build/NotariaDigital.json');
(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log('Cuenta:', wallet.address, '| saldo:', ethers.formatEther(await provider.getBalance(wallet.address)), 'SepoliaETH');
  const c = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet).deploy();
  await c.waitForDeployment();
  console.log('Contrato desplegado en:', await c.getAddress());
  console.log('Ver en: https://sepolia.etherscan.io/address/' + await c.getAddress());
})();
