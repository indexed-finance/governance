const { Contract } = require('ethers');

const DAY = 86400;

module.exports = async ({
  deployments,
  getChainId,
  getNamedAccounts,
  ethers,
}) => {
  const { deployer } = await getNamedAccounts();

  const DELAY = DAY * 2;

  const { deploy } = deployments;

  const nonce = await ethers.provider.getTransactionCount(deployer);

  const { timestamp } = await ethers.provider.getBlock('latest');

  const timelockAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 1 });
  const governorAlphaAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 2 });

  // deploy NDX, sending the total supply to the deployer
  const ndx = await deploy('Ndx', {
    from: deployer,
    gas: 4000000,
    args: [deployer, governorAlphaAddress, timestamp + DELAY]
  });

  // deploy timelock, controlled by what will be the governor
  const timelock = await deploy('Timelock', {
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
    args: [timelock.address, ndx.address, timestamp + (DAY * 14)]
  })

  if (governorAlpha.address != governorAlphaAddress) {
    throw new Error('Computed wrong governorAlpha address.' + ` Expected ${governorAlphaAddress} but got ${governorAlpha.address}`)
  }
};

module.exports.tags = ['Governance'];