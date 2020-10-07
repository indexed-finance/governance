const chalk = require('chalk');
const moment = require('moment');
const { Contract } = require('ethers')

const DELAY = 60 * 60 * 24 * 2

const logger = {
  info(v) {
    console.log(
      chalk.bold.cyan(
        '@indexed-finance/core/deploy:' + moment(new Date()).format('HH:mm:ss') + ': '
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
  // waffle: {provider}
}) => {
  const { save } = deployments;
  const { deployer } = await getNamedAccounts();
  // For some reason the contractName field wasn't properly being saved
  // to deployments.
  const deploy = async (name, contractName, opts) => {
    logger.info(`Deploying ${contractName} [${name}]`);
    const deployment = await deployments.deploy(name, {
      ...opts,
      contractName
    });
    if (deployment.newlyDeployed) {
      await save(contractName, deployment);
    }
    return deployment;
  };

  logger.info('Executing deployment script.');

  const nonce = await ethers.provider.getTransactionCount(deployer);

  // deploy NDX, sending the total supply to the deployer
  const timelockAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 1 });
  const ndx = await deploy('Ndx', 'ndx', {
    from: deployer,
    args: [deployer]
  });

  // deploy timelock, controlled by what will be the governor
  const governorAlphaAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 2 })
  const timelock = await deploy('Timelock', 'timelock', {
    from: deployer,
    args: [governorAlphaAddress, DELAY]
  })

  if (timelock.address != timelockAddress) {
    throw new Error('Computed wrong timelock address.')
  }

  // deploy governorAlpha
  const governorAlpha = await deploy('GovernorAlpha', 'governorAlpha', {
    from: deployer,
    args: [timelock.address, ndx.address]
  })

  if (governorAlpha.address != governorAlphaAddress) {
    throw new Error('Computed wrong governorAlpha address.')
  }
};

module.exports.tags = ['Core'];