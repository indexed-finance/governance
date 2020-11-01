const bre = require('@nomiclabs/buidler');
const { keccak256 } = require('ethers/lib/utils');
const { expandTo18Decimals } = require('../utils');
const {deployments} = bre;

const stakingFixture = deployments.createFixture(async ({
  deployments,
  getNamedAccounts,
  ethers,
}) => {
  await deployments.fixture('Governance');
  const { deployer } = await getNamedAccounts();
  const [ signer ] = await ethers.getSigners();
  const { provider } = ethers;

  const deploy = async (name, ...args) => {
    const factory = await ethers.getContractFactory(name, signer);
    const contract = await factory.deploy(...args);
    return contract;
  };
  const WETH = await deploy('MockERC20', "Wrapped Ether V9", "WETH9");
  const weth = WETH.address;
  const factory = await deploy("UniswapV2Factory", deployer);
  const uniswapFactory = factory.address;

  const { timestamp: now } = await provider.getBlock('latest');
  const stakingRewardsGenesis = now + 600;

  const ndx = await deploy('MockERC20', 'NDX', 'NDX');
  await ndx.getFreeTokens(deployer, expandTo18Decimals(1e7))
  const proxyManager = await deploy('DelegateCallProxyManager');

  const mockPoolFactory = await deploy('MockPoolFactory');

  const rewardsFactory = await deploy(
    'StakingRewardsFactory',
    ndx.address,
    stakingRewardsGenesis,
    proxyManager.address,
    mockPoolFactory.address,
    uniswapFactory,
    weth
  );
  
  await proxyManager.approveDeployer(rewardsFactory.address);

  const stakingRewardsImplementation = await deploy('StakingRewards', rewardsFactory.address, ndx.address);
  const stakingRewardsImplementationID = keccak256(Buffer.from('StakingRewards.sol'));
  await proxyManager.createManyToOneProxyRelationship(
    stakingRewardsImplementationID,
    stakingRewardsImplementation.address
  );
  const stakingToken = await deploy('MockERC20', 'Staking Token', 'STK');
  return {
    proxyManager,
    stakingToken,
    rewardsToken: ndx,
    mockPoolFactory: mockPoolFactory,
    stakingFactory: rewardsFactory,
    uniswapFactory: factory,
    weth: WETH
  }
});

module.exports = { stakingFixture }