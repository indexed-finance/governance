const path = require('path');
const url = require('url');
const Table = require('cli-table3');
const moment = require('moment');

require('dotenv').config();
require('@nomiclabs/buidler/config');

const { InfuraProvider } = require('@ethersproject/providers');
const { fromPrivateKey } = require('ethereumjs-wallet');
const { randomBytes } = require('crypto');
const { types, task } = require('@nomiclabs/buidler/config');
const { expandTo18Decimals, from18Decimals, fastForward } = require('./test/utils');

// usePlugin('@nomiclabs/buidler-waffle');
usePlugin('buidler-ethers-v5');
usePlugin('buidler-deploy');
usePlugin('buidler-abi-exporter');
usePlugin('solidity-coverage');

/* =========== Tasks for any network =========== */

task('list-pools', 'Lists the staking tokens and their staking pools')
  .setAction(async () => {
    const stakingFactory = await ethers.getContract('StakingRewardsFactory');
    const tokens = await stakingFactory.getStakingTokens();
    const rewards = await Promise.all(
      tokens.map((token) => stakingFactory.getStakingRewards(token))
    );
    const table = new Table({
      head: ['Staking Token', 'Staking Rewards']
    });
    for (let i = 0; i < tokens.length; i++) {
      table.push([tokens[i], rewards[i]]);
    }
    console.log(table.toString());
  });

task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();
  for (const account of accounts) {
    console.log(await account.getAddress());
  }
  return accounts;
});

task('stake', 'Stake some tokens on a staking rewards contract')
  .addOptionalParam('token', 'Address of the token to stake.')
  .addOptionalParam('rewards', 'Address of the staking rewards contract.')
  .addParam('amount', 'Amount of tokens to stake.')
  .setAction(async ({ token, rewards, amount }) => {
    if (!token && !rewards) {
      throw new Error(`Must provide either staking token address or rewards address.`);
    }
    if (!rewards) {
      const stakingFactory = await ethers.getContract('StakingRewardsFactory');
      rewards = await stakingFactory.computeStakingRewardsAddress(token);
    }
    const [signer] = await ethers.getSigners();
    const address = await signer.getAddress();
    const stakingRewards = await ethers.getContractAt('StakingRewards', rewards, signer);
    if (!token) {
      token = await stakingRewards.stakingToken();
    }
    const erc20 = await ethers.getContractAt('IERC20Detailed', token, signer);
    const balance = await erc20.balanceOf(address);
    const stakeAmount = expandTo18Decimals(amount)
    if (balance.lt(stakeAmount)) {
      const chainID = await getChainId();
      if (chainID != 31337 && chainID != 4) {
        throw new Error(`Balance too low: must be on testnet to mint additional test tokens`);
      }
      const diff = stakeAmount.sub(balance);
      await erc20.getFreeTokens(address, diff);
    }
    await erc20.approve(rewards, stakeAmount);
    await stakingRewards.stake(stakeAmount);
    const symbol = await erc20.symbol();
    console.log(`Staked ${amount} ${symbol} on ${rewards}`);
  });

task('earned', 'Check earned rewards on staking pool')
  .addOptionalParam('token', 'Address of the staking token.')
  .addOptionalParam('rewards', 'Address of the staking rewards contract.')
  .addOptionalParam('staker', 'Account to check earned rewards for.')
  .setAction(async ({ staker, token, rewards }) => {
    if (!token && !rewards) {
      throw new Error(`Must provide either staking token address or rewards address.`);
    }
    if (!rewards) {
      const stakingFactory = await ethers.getContract('StakingRewardsFactory');
      rewards = await stakingFactory.computeStakingRewardsAddress(token);
    }
    if (!staker) {
      const [signer] = await ethers.getSigners();
      staker = await signer.getAddress();
    }
    const stakingRewards = await ethers.getContractAt('StakingRewards', rewards);
    const stakingTokenAddress = await stakingRewards.stakingToken();
    const stakingToken = await ethers.getContractAt('IERC20Detailed', stakingTokenAddress);
    const symbol = await stakingToken.symbol();
    const earned = await stakingRewards.earned(staker);
    console.log(`Account ${staker} has earned ${from18Decimals(earned)} ${symbol}`);
  });

/* =========== Tasks for test networks =========== */

task('deploy-test-token', 'Deploys a mock ERC20 token')
  .addParam('name', 'Token name', 'TestToken', types.string)
  .addParam('symbol', 'Token symbol', 'TKN', types.string)
  .addParam('balance', 'Balance to mint for yourself', 1000, types.int)
  .setAction(async ({ name, symbol, balance }) => {
    const chainID = await getChainId();
    if (chainID != 31337 && chainID != 4) {
      throw new Error(`Must be on testnet to deploy test token.`);
    }
    const [account] = await ethers.getSigners();
    const address = await account.getAddress();
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const erc20 = await MockERC20.deploy(name, symbol);
    await erc20.getFreeTokens(address, expandTo18Decimals(balance));
    console.log(`Deployed test token ${name} (${symbol})\naddress: ${erc20.address}\nand minted ${balance} tokens to ${address}`);
  });

task('deploy-staking-pool', 'Deploys a staking pool using the factory')
  .addParam('token', 'Address of the staking token to deploy rewards for')
  .addParam('rewards', 'Amount of rewards to distribute to staking pool', 1000, types.int)
  .setAction(async ({ token, rewards }) => {
    const chainID = await getChainId();
    if (chainID != 31337 && chainID != 4) {
      throw new Error(`Must be on testnet to directly deploy staking rewards`);
    }
    const stakingFactory = await ethers.getContract('StakingRewardsFactory');
    const mockPoolFactory = await ethers.getContract('MockPoolFactory');
    await mockPoolFactory.addIPool(token).then(tx => tx.wait());
    const rewardValue = expandTo18Decimals(rewards);
    await stakingFactory.deployStakingRewardsForPool(token, rewardValue).then(tx => tx.wait());
    const stakingRewards = await stakingFactory.computeStakingRewardsAddress(token);
    const erc20 = await ethers.getContractAt('MockERC20', token, signer);
    await erc20.getFreeTokens(stakingFactory.address, rewardValue);
    const genesis = await stakingFactory.stakingRewardsGenesis();
    const { timestamp } = await ethers.provider.getBlock('latest');
    if (genesis > timestamp) {
      const diff = genesis - timestamp;
      await fastForward(ethers.provider, diff);
    }
    await stakingRewards.notifyRewardAmount(token);
    const symbol = await erc20.symbol();
    console.log(`Deployed staking rewards for ${symbol} - rewards address: ${stakingRewards}`);
    console.log(`Minted ${rewards} ${symbol} for staking rewards`);
  });



const measurements = ["years", "months", "weeks", "days", "hours", "minutes", "seconds"];
const withPadding = (duration) => {
  let step = null;
  return measurements.map((m) => duration[m]()).filter((n,i,a) => {
    var nonEmpty = Boolean(n);
    if (nonEmpty || step || i >= a.length - 2) {
        step = true;
    }
    return step;
  }).map((n) => ('0' + n).slice(-2)).join(':')
}

task('fast-forward', 'Move the node\'s clock forward')
  .addOptionalParam('seconds', 'Number of seconds to fast-forward')
  .addOptionalParam('minutes', 'Number of minutes to fast-forward')
  .addOptionalParam('hours', 'Number of hours to fast-forward')
  .addOptionalParam('days', 'Number of days to fast-forward')
  .setAction(async ({ seconds, minutes, hours, days }) => {
    const chainID = await getChainId();
    if (chainID != 31337 && chainID != 4) {
      throw new Error(`Must be on testnet to fast-forward`);
    }
    let totalSeconds = 0;
    totalSeconds += (seconds || 0);
    totalSeconds += (minutes || 0) * 60;
    totalSeconds += (hours || 0) * 3600;
    totalSeconds += (days || 0) * 86400;
    if (totalSeconds == 0) totalSeconds = 3600;
    const duration = withPadding(moment.duration(totalSeconds, 'seconds'));
    await fastForward(ethers.provider, totalSeconds);
    // moment.duration(totalSeconds, 'seconds').format('h:mm:ss');
    console.log(`Moved the node clock forward by ${duration}`)
  });

const keys = {
  rinkeby: fromPrivateKey(
    process.env.RINKEBY_PVT_KEY
      ? Buffer.from(process.env.RINKEBY_PVT_KEY.slice(2), 'hex')
      : randomBytes(32)).getPrivateKeyString()
};

module.exports = {
  namedAccounts: {
    deployer: {
      default: 0
    },
  },
  external: {
    artifacts: [
      'node_modules/@uniswap/v2-core/build',
      'node_modules/@uniswap/v2-periphery/build',
      'node_modules/@indexed-finance/proxies/artifacts'
    ],
    deployments: {
      rinkeby: ['node_modules/@indexed-finance/proxies/deployments/rinkeby']
    }
  },
  networks: {
    buidlerevm: {
      live: false,
      saveDeployment: false
    },
    local: {
      url: url.format({
        protocol: 'http:',
        port: 8545,
        hostname: 'localhost',
      }),
    },
    mainnet: {
      url: new InfuraProvider('mainnet', process.env.INFURA_PROJECT_ID).connection.url,
      accounts: [keys.rinkeby],
      chainId: 1
    },
    rinkeby: {
      url: new InfuraProvider('rinkeby', process.env.INFURA_PROJECT_ID).connection.url,
      accounts: [keys.rinkeby],
      chainId: 4
    },
    coverage: {
      url: url.format({
        protocol: 'http:',
        port: 8555,
        hostname: 'localhost',
      }),
    }
  },
  paths: {
    sources: path.join(__dirname, 'contracts'),
    tests: path.join(__dirname, 'test'),
    cache: path.join(__dirname, 'cache'),
    artifacts: path.join(__dirname, 'artifacts'),
    deploy: path.join(__dirname, 'deploy'),
    deployments: path.join(__dirname, 'deployments')
  },
  solc: {
    version: '0.6.12',
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
};
