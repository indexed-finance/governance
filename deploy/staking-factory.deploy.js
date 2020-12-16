const { keccak256, formatEther } = require('ethers/lib/utils');

const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');

const December_22nd_2020 = 1608595200;
const gasPrice = 75000000000;

module.exports = async (bre) => {
  const {
    getChainId,
    getNamedAccounts,
    ethers
  } = bre;
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  const logger = Logger(chainID, 'StakingRewardsFactory');
  const deploy = await Deployer(bre, logger);

  const getAddress = async (name) => (await ethers.getContract(name)).address;

  const weth = await getAddress('weth');
  const uniswapFactory = await getAddress('uniswapFactory');
  const poolFactory = await getAddress('poolFactory');
  const ndx = await getAddress('Ndx');
  const proxyManager = await ethers.getContract('proxyManager');

  const stakingRewardsGenesis = December_22nd_2020;

  const rewardsFactory = await deploy('StakingRewardsFactory', 'rewardsFactory', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [
      ndx,
      stakingRewardsGenesis,
      proxyManager.address,
      poolFactory,
      uniswapFactory,
      weth
    ]
  });

  logger.info('Approving rewards factory to deploy proxies...');
  await proxyManager.approveDeployer(rewardsFactory.address, { gasPrice, gasLimit: 250000 }).then(tx => tx.wait());
  logger.info('Approved rewards factory to deploy proxies');
};

module.exports.tags = ['StakingRewardsFactory'];