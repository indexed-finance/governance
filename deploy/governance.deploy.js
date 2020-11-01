const chalk = require('chalk');
const moment = require('moment');
const { Contract } = require('ethers');

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

module.exports = async ({
  deployments,
  getChainId,
  getNamedAccounts,
  ethers,
}) => {
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  /* Testnet uses a delay of 20 minutes */
  const [timelockContract, DELAY] = (chainID != 4)
    ? ['Timelock', 60 * 60 * 24 * 2]
    : ['MockTimelock', 20 * 60];

  const deploy = async (name, opts) => {
    logger.info(`Deploying [${name}]`);
    const deployment = await deployments.deploy(name, opts);
    if (deployment.newlyDeployed) {
      logger.info(`Deployed ${name}`);
    } else {
      logger.info(`Found ${name}`)
    }
    return deployment;
  };

  let nonce = await ethers.provider.getTransactionCount(deployer);

  // deploy NDX, sending the total supply to the deployer
  const timelockAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 1 });
  const ndx = await deploy('Ndx', {
    from: deployer,
    gas: 4000000,
    args: [deployer]
  });

  // deploy timelock, controlled by what will be the governor
  const governorAlphaAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 2 });
  const timelock = await deploy(timelockContract, {
    from: deployer,
    gas: 4000000,
    args: [governorAlphaAddress, DELAY]
  });

  if (timelock.address != timelockAddress) {
    throw new Error('Computed wrong timelock address.' + ` Expected ${timelockAddress} but got ${timelock.address}`)
  }

  // deploy governorAlpha
  const governorAlpha = await deploy('GovernorAlpha', {
    from: deployer,
    gas: 4000000,
    args: [timelock.address, ndx.address]
  })

  if (governorAlpha.address != governorAlphaAddress) {
    throw new Error('Computed wrong governorAlpha address.' + ` Expected ${governorAlphaAddress} but got ${governorAlpha.address}`)
  }
};

module.exports.tags = ['Governance'];