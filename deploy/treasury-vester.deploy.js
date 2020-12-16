const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');
const { expandTo18Decimals } = require('../test/utils');

const January_1st_2021 = 1609459200;
const March_1st_2021 = 1614556800;
const January_1st_2022 = 1640995200;

const gasPrice = 50000000000;

module.exports = async (bre) => {
  const {
    getChainId,
    getNamedAccounts,
    ethers
  } = bre;
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  const logger = Logger(chainID, 'TreasuryVester');
  const deploy = await Deployer(bre, logger);

  const ndx = await ethers.getContract('Ndx');
  const timelock = await ethers.getContract('timelock');

  const vestingAmount = expandTo18Decimals(3000000);
  const balance = await ndx.balanceOf(deployer);
  if (!vestingAmount.eq(balance.div(2))) {
    throw Error('Vesting amount not half balance')
  }
  const vestingBegin = January_1st_2021;
  const vestingCliff = March_1st_2021;
  const vestingEnd = January_1st_2022;

  const vester = await deploy('TreasuryVester', 'treasuryVester', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [
      ndx.address,
      timelock.address,
      vestingAmount,
      vestingBegin,
      vestingCliff,
      vestingEnd,
    ]
  });
  logger.info('Transferring tokens to vesting contract...')
  await ndx.transfer(vester.address, vestingAmount, {
    gasLimit: 250000,
    gasPrice
  }).then(tx => tx.wait());
  logger.success('Transferred tokens to vesting contract')
}

module.exports.tags = ['TreasuryVester'];