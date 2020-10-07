const { BigNumber } = require('ethers');

const DELAY = 60 * 60 * 24 * 2

async function mineBlock(provider, timestamp) {
  return provider.send('evm_mine', [timestamp])
}

function expandTo18Decimals(n) {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

module.exports = {
  DELAY,
  mineBlock,
  expandTo18Decimals
}