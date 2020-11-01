const { keccak256 } = require('ethers/lib/utils');
const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');

let uniswapFactory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
let weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

module.exports = async (bre) => {
  const {
    deployments,
    getChainId,
    getNamedAccounts,
    ethers
  } = bre;
  const { deployer } = await getNamedAccounts();
  const [ signer ] = await ethers.getSigners();
  const { provider } = ethers;
  const chainID = await getChainId();
  const logger = Logger(chainID, 'deploy-staking');
  const deploy = await Deployer(bre, logger);
  if (chainID == 1) {
    logger.error('Not configured for mainnet deployment');
    return;
  }

  const weth = await ethers.getContract('weth', signer);
  const uniswapFactory = await ethers.getContract('uniswapFactory', signer);

  let stakingRewardsGenesis;
  if (chainID != 1) {
    const { timestamp: now } = await provider.getBlock('latest');
    stakingRewardsGenesis = now + 600;
  }

  const ndx = await deployments.get('Ndx');
  let proxyManager;

  if (chainID == 4) {
    proxyManager = await ethers.getContract('proxyManager', signer);
  } else {
    const proxyManagerDeployment = await deploy('DelegateCallProxyManager', {
      from: deployer,
      gas: 4000000,
      args: []
    });
  
    proxyManager = await ethers.getContractAt('DelegateCallProxyManager', proxyManagerDeployment.address, signer);
  }

  const poolFactory = await deploy('MockPoolFactory', {
    from: deployer,
    gas: 4000000,
    args: []
  });

  const rewardsFactory = await deploy('StakingRewardsFactory', {
    from: deployer,
    gas: 4000000,
    args: [
      ndx.address,
      stakingRewardsGenesis,
      proxyManager.address,
      poolFactory.address,
      uniswapFactory.address,
      weth.address
    ]
  });

  if (rewardsFactory.newlyDeployed) {
    logger.info('Approving rewards factory to deploy proxies...');
    await proxyManager.approveDeployer(rewardsFactory.address);
    logger.info('Approved rewards factory to deploy proxies');
  }

  const stakingRewardsImplementation = await deploy('StakingRewards', {
    from: deployer,
    gas: 4000000,
    args: [
      rewardsFactory.address,
      ndx.address
    ]
  });

  const stakingRewardsImplementationID = keccak256(Buffer.from('StakingRewards.sol'));
  logger.info('Creating StakingRewards implementation on proxy manager...')
  if (stakingRewardsImplementation.newlyDeployed) {
    await proxyManager.createManyToOneProxyRelationship(
      stakingRewardsImplementationID,
      stakingRewardsImplementation.address
    );
  }
  logger.info('Created StakingRewards implementation on proxy manager!');
};

module.exports.tags = ['Staking'];
module.exports.dependencies = ['Governance', 'Uniswap'];