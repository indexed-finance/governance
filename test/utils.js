const { BigNumber, Wallet } = require('ethers');
const { formatEther } = require('ethers/lib/utils');
const { randomBytes } = require('crypto');

const DELAY = 60 * 60 * 24 * 2

async function mineBlock(provider, timestamp) {
  return provider.send('evm_mine', timestamp ? [timestamp] : [])
}

async function fastForward(provider, seconds) {
  await provider.send('evm_increaseTime', [seconds]);
  await mineBlock(provider);
}

function expandTo18Decimals(n) {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

function from18Decimals(n) {
  return formatEther(n);
}

async function getWallets(ethers, num) {
  let wallets = [];
  for (let i = 0; i < num; i++) {
    const wallet = new Wallet(randomBytes(32));
    await wallet.connect(ethers.provider);
    wallets.push(wallet);
  }
  return wallets;
}

module.exports = {
  DELAY,
  getWallets,
  mineBlock,
  expandTo18Decimals,
  from18Decimals,
  fastForward
}