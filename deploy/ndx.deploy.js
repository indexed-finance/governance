const June_1st_2021 = 1622505600;
const Logger = require('../lib/logger');
const Deployer = require('../lib/deployer');

module.exports = async (bre) => {
  const { ethers, deployment, getChainId } = bre;
  const { provider } = ethers;
  const { deployer } = await getNamedAccounts();
  const chainID = await getChainId();
  const logger = Logger(chainID, 'ndx');
  const deploy = await Deployer(bre, logger);
  const gasPrice = 60000000000;

  const ndx = await deploy('Ndx', 'Ndx', {
    from: deployer,
    gas: 4000000,
    gasPrice,
    args: [deployer, deployer, June_1st_2021]
  });
}

module.exports.tags = ['Ndx'];