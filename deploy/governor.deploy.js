const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');

const January_7th_2021 = 1609977600;

module.exports = async (bre) => {
  const { ethers, deployment, getChainId } = bre;
  const { provider } = ethers;
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  const logger = Logger(chainID, 'ndx');
  const deploy = await Deployer(bre, logger);
  const gasPrice = 60000000000;

  const timelock = await ethers.getContract('timelock');
  const ndx = await ethers.getContract('Ndx');
  await deploy('GovernorAlpha', 'GovernorAlpha', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [timelock.address, ndx.address, January_7th_2021]
  });
}

module.exports.tags = ['GovernorAlpha'];