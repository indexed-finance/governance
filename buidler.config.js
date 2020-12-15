const path = require('path');
const url = require('url');

require('dotenv').config();
require('@nomiclabs/buidler/config');

const { InfuraProvider } = require('@ethersproject/providers');
const { fromPrivateKey } = require('ethereumjs-wallet');
const { randomBytes } = require('crypto');
const { usePlugin } = require('@nomiclabs/buidler/config');

usePlugin('@nomiclabs/buidler-waffle');
usePlugin('@nomiclabs/buidler-etherscan');
usePlugin('buidler-ethers-v5');
usePlugin('buidler-deploy');
usePlugin('solidity-coverage');

const keys = {
  mainnet: fromPrivateKey(
    process.env.MAINNET_PVT_KEY
      ? Buffer.from(process.env.MAINNET_PVT_KEY.slice(2), 'hex')
      : randomBytes(32)).getPrivateKeyString(),
  rinkeby: fromPrivateKey(
    process.env.RINKEBY_PVT_KEY
      ? Buffer.from(process.env.RINKEBY_PVT_KEY.slice(2), 'hex')
      : randomBytes(32)).getPrivateKeyString()
};

module.exports = {
  etherscan: {
    url: "https://api.etherscan.io/api",
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
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
      rinkeby: [
        "node_modules/@indexed-finance/indexed-core/deployments/rinkeby",
        "node_modules/@indexed-finance/proxies/deployments/rinkeby",
        "node_modules/@indexed-finance/uniswap-deployments/rinkeby"
      ],
      mainnet: [
        "node_modules/@indexed-finance/indexed-core/deployments/mainnet",
        "node_modules/@indexed-finance/proxies/deployments/mainnet",
        "node_modules/@indexed-finance/uniswap-deployments/mainnet"
      ]
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
