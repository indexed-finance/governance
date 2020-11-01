const { keccak256, formatEther } = require('ethers/lib/utils');

const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');

const ndx = '0xe366577a6712591c2e6f76fdcb96a99ac30a74c3';
const defi5r = '0x4537ed7011de71a99d7a34259da077f5b692be90';
const poolFactoryAddress = '0x82b9a888Bf130E6462AF7eED63AE3C036B5eE06e';
const uniswapFactoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const wethAddress = '0xc778417e063141139fce010982780140aa0cd5ab';
const zeroAddress = `0x${'00'.repeat(20)}`;

module.exports = async (bre) => {
  return;
  const { ethers, deployment, getChainId } = bre;
  const { provider } = ethers;
  const chainID = await getChainId();
  const [ signer ] = await ethers.getSigners();
  const { deployer } = await getNamedAccounts();
  const logger = Logger(chainID, 'init-staking-factory');
  const deploy = await Deployer(bre, logger);

  const { timestamp: now } = await provider.getBlock('latest');
  const stakingRewardsGenesis = now + 300;

  const uniswapFactory = await ethers.getContractAt('UniswapV2Factory', uniswapFactoryAddress);
  let wethPair = await uniswapFactory.getPair(wethAddress, defi5r);
  if (wethPair == zeroAddress) {
    wethPair = await uniswapFactory.getPair(defi5r, wethAddress);
  }
  const proxyManager = await ethers.getContract('DelegateCallProxyManager', signer);
  const poolFactory = await ethers.getContractAt('IPoolFactory', poolFactoryAddress, signer);
  const isPool = await poolFactory.isIPool(defi5r);
  logger.info(`DFI5r-WETH Pair: ${wethPair}`);
  logger.info(`DFI5r is IPool: ${isPool}`);
  const _pool = await ethers.getContractAt('IERC20Detailed', defi5r);
  const name = await _pool.name();
  logger.info(`Pool Name: ${name}`);
  const Ndx = await ethers.getContractAt('IERC20', ndx, signer)
  const bal = await Ndx.balanceOf(deployer);
  logger.info(`Deployer has ${formatEther(bal)} NDX`);

  const rewardsFactory = await deploy('StakingRewardsFactory', 'rewardsFactory', {
    from: deployer,
    gas: 4000000,
    args: [
      ndx,
      stakingRewardsGenesis,
      proxyManager.address,
      poolFactoryAddress,
      uniswapFactoryAddress,
      wethAddress
    ]
  },  true);

  logger.info(`Deployed rewards factory to ${rewardsFactory.address}`);
  logger.info('Approving rewards factory to deploy proxies...');
  await proxyManager.approveDeployer(rewardsFactory.address);
  logger.info('Approved rewards factory to deploy proxies');

  const stakingRewardsImplementation = await deploy('StakingRewards', 'stakingRewardsImplementation', {
    from: deployer,
    gas: 4000000,
    args: [
      rewardsFactory.address,
      ndx
    ]
  }, true);
  const stakingRewardsImplementationID = keccak256(Buffer.from('StakingRewards.sol'));
  logger.info('Creating StakingRewards implementation on proxy manager...')
  await proxyManager.setImplementationAddressManyToOne(
    stakingRewardsImplementationID,
    stakingRewardsImplementation.address
  );
  logger.info('Created StakingRewards implementation on proxy manager!');

  const transferAmount = bal.div(10);
  logger.info(`Sending ${formatEther(transferAmount)} NDX to rewards factory...`);
  await Ndx.transfer(rewardsFactory.address, transferAmount).then(tx => tx.wait());
  logger.info(`Sent ${formatEther(transferAmount)} NDX to rewards factory!`);
  const rewardAmount = transferAmount.div(2);
  logger.info(`Deploying staking rewards for DFI5r...`);
  const receipt1 = await rewardsFactory.deployStakingRewardsForPool(defi5r, rewardAmount).then(tx => tx.wait());
  const { args: { stakingRewards: rewards1 } } = receipt1.events.filter(e => e.event == 'IndexPoolStakingRewardsAdded')[0];
  logger.info(`Deployed staking rewards for DFI5r to ${rewards1}`);

  logger.info(`Deploying staking rewards for DFI5r-WETH pair...`);
  const receipt2 = await rewardsFactory.deployStakingRewardsForPoolUniswapPair(defi5r, rewardAmount).then(tx => tx.wait());
  const { args: { stakingRewards: rewards2 } } = receipt2.events.filter(e => e.event == 'UniswapStakingRewardsAdded')[0];
  logger.info(`Deployed staking rewards for DFI5r-WETH pair to ${rewards2}`);
}
// module.exports.tags = ['Staking'];