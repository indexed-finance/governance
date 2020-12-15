const { Contract } = require('ethers');

const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');

const DAY = 86400;

module.exports = async (bre) => {
  const { ethers, deployment, getChainId } = bre;
  const { provider } = ethers;
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  const logger = Logger(chainID, 'ndx');
  const deploy = await Deployer(bre, logger);
  const gasPrice = 60000000000;

  const nonce = await ethers.provider.getTransactionCount(deployer);
  const governorAlphaAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 1 });
  const timelock = await deploy('Timelock', 'timelock', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [governorAlphaAddress, DAY * 2]
  });
}

module.exports.tags = ['Timelock'];