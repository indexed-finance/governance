const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');

const December_22nd_2020 = 1608595200;
const December_22nd_2021 = 1640131200;

const gasPrice = 60000000000;

module.exports = async (bre) => {
  const {
    getChainId,
    getNamedAccounts,
    ethers
  } = bre;
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  const logger = Logger(chainID, 'DelegatingVester');
  const deploy = await Deployer(bre, logger);

  const ndx = await ethers.getContract('Ndx')
  const balance = await ndx.balanceOf(deployer)
  const vestingAmount = balance.div(5);
  const vestingBegin = December_22nd_2020;
  const vestingEnd = December_22nd_2021;

  const vester = await deploy('DelegatingVester', 'teamVesting', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [
      ndx.address,
      deployer,
      vestingAmount,
      vestingBegin,
      vestingEnd,
    ]
  });
  logger.info('Transferring vesting amount to contract...')
  await ndx.transfer(vester.address, vestingAmount, {
    gasLimit: 250000,
    gasPrice
  }).then(tx => tx.wait());
  logger.success('Transferred vesting amount to contract')
}

module.exports.tags = ['DelegatingVester'];