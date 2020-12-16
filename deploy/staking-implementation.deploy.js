const { keccak256, formatEther } = require('ethers/lib/utils');

const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');
const gasPrice = 75000000000;

module.exports = async (bre) => {
  const { ethers, deployment, getChainId } = bre;
  const { provider } = ethers;
  const chainID = await getChainId();
  const [ signer ] = await ethers.getSigners();
  const { deployer } = await getNamedAccounts();
  const logger = Logger(chainID, 'staking');
  const deploy = await Deployer(bre, logger);

  const getAddress = async (name) => (await ethers.getContract(name)).address;
  const ndx = await getAddress('Ndx');
  const rewardsFactory = await getAddress('rewardsFactory');
  const proxyManager = await ethers.getContract('DelegateCallProxyManager');
  
  const stakingRewardsImplementation = await deploy('StakingRewards', 'stakingRewardsImplementation', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [rewardsFactory, ndx]
  }, true);

  const stakingRewardsImplementationID = keccak256(Buffer.from('StakingRewards.sol'));
  logger.info('Creating StakingRewards implementation on proxy manager...')
  await proxyManager.createManyToOneProxyRelationship(
    stakingRewardsImplementationID,
    stakingRewardsImplementation.address,
    {
      gasLimit: 1000000,
      gasPrice
    }
  );
  logger.info('Created StakingRewards implementation on proxy manager!');
};

module.exports.tags = ['StakingRewards'];