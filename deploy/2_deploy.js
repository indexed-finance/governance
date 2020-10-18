const chalk = require('chalk');
const { keccak256 } = require('ethers/lib/utils');
const moment = require('moment');

const logger = {
  info(v) {
    console.log(
      chalk.bold.cyan(
        '@indexed-finance/governance/deploy:' + moment(new Date()).format('HH:mm:ss') + ': '
      ) + v
    );
    return v;
  }
};

let uniswapFactory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
let weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

module.exports = async ({
  deployments,
  getChainId,
  getNamedAccounts,
  ethers,
  waffle: { provider }
}) => {
  const { deployer } = await getNamedAccounts();
  const [ signer ] = await ethers.getSigners();
  const chainID = await getChainId();

  const deploy = async (name, opts) => {
    logger.info(`Deploying [${name}]`);
    const deployment = await deployments.deploy(name, opts);
    if (deployment.newlyDeployed) {
      if (opts.contractName) {
        await deployments.save(opts.contractName, deployment)
      }
      logger.info(`Deployed ${name}`);
    } else {
      logger.info(`Found ${name}`)
    }
    return deployment;
  };

  if (chainID != 1) {
    const WETH = await deploy('MockERC20', {
      from: deployer,
      contractName: 'weth',
      gas: 4000000,
      args: ["Wrapped Ether V9", "WETH9"]
    });
    weth = WETH.address;
    if (chainID != 4) {
      logger.info('Deploying UniSwap mocks');
  
      const factory = await deploy("UniswapV2Factory", {
        from: deployer,
        gas: 4000000,
        args: [deployer]
      });
      uniswapFactory = factory.address;
  
      const router = await deploy('UniswapV2Router02', {
        from: deployer,
        gas: 4000000,
        args: [uniswapFactory, weth]
      });
      uniswapRouter = router.address;
    }
  }

  const ndx = await deployments.get('Ndx');
  const { timestamp: now } = await provider.getBlock('latest');
  const stakingRewardsGenesis = now + 600;
  let proxyManager;

  if (chainID == 4) {
    proxyManager = await ethers.getContract('proxyManager', signer);
  } else {
    const proxyManagerDeployment = await deploy('DelegateCallProxyManager', {
      from: deployer,
      contractName: 'proxyManager',
      gas: 4000000,
      args: []
    });
  
    proxyManager = await ethers.getContractAt('proxyManager', proxyManagerDeployment.address, signer);
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
      deployer,
      ndx.address,
      stakingRewardsGenesis,
      proxyManager.address,
      poolFactory.address,
      uniswapFactory,
      weth
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
module.exports.dependencies = ['Governance'];