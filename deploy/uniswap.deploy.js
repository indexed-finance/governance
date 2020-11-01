const Deployer = require('../lib/deployer');
const Logger = require('../lib/logger');

module.exports = async (bre) => {
  const { getChainId, getNamedAccounts } = bre;
  const chainID = await getChainId();
  const logger = Logger(chainID, 'deploy-uniswap-mocks');

  const { deployer } = await getNamedAccounts();
  const deploy = await Deployer(bre, logger);

  if (chainID == 1) return;

  await deploy('MockERC20', 'weth', {
    from: deployer,
    gas: 4000000,
    args: ["Wrapped Ether V9", "WETH9"]
  });

  if (chainID == 4) return;

  await deploy("UniswapV2Factory", 'uniswapFactory', {
    from: deployer,
    gas: 4000000,
    args: [deployer]
  });
};

module.exports.tags = ['Mocks', 'Uniswap'];