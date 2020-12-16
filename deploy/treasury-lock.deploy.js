const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');
const { expandTo18Decimals } = require('../test/utils');

const January_22nd_2021 = 1611273600;

const gasPrice = 50000000000;

const lockAmount = expandTo18Decimals(2000000);

module.exports = async (bre) => {
  const {
    getChainId,
    getNamedAccounts,
    ethers
  } = bre;
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  const logger = Logger(chainID, 'TreasuryLock');
  const deploy = await Deployer(bre, logger);

  const ndx = await ethers.getContract('Ndx');
  const timelock = await ethers.getContract('timelock');

  const treasuryLock = await deploy('TreasuryLock', 'treasuryLock', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [
      timelock.address,
      ndx.address,
      January_22nd_2021
    ]
  });
  logger.info('Transferring tokens to contract...')
  await ndx.transfer(treasuryLock.address, lockAmount, {
    gasLimit: 250000,
    gasPrice
  }).then(tx => tx.wait());
  logger.success('Transferred tokens to contract')
}

module.exports.tags = ['TreasuryLock'];