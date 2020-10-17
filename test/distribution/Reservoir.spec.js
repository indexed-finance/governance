const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { deployments, ethers, waffle: { provider, deployContract } } = bre;

const { mineBlock, expandTo18Decimals } = require('../utils')

describe('distribution:Reservoir', () => {
  let token, reservoir;
  let deployer;

  before(async () => {
    ({ deployer } = await getNamedAccounts());
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    token = await MockERC20.deploy("MockToken", "MTK");
    const Reservoir = await ethers.getContractFactory('Reservoir');
    reservoir = await Reservoir.deploy(expandTo18Decimals(10), token.address, deployer);
    await token.getFreeTokens(reservoir.address, expandTo18Decimals(1000));
  });

  it('drip()', async () => {
    const dripped = await reservoir.callStatic.drip();
    expect(dripped).to.eq(expandTo18Decimals(10));
    await reservoir.drip();
    const balance = await token.balanceOf(deployer);
    expect(balance).to.eq(expandTo18Decimals(20));
  });

  it('drip() many blocks', async () => {
    for (let i = 0; i < 10; i++) {
      const { timestamp: now } = await provider.getBlock('latest');
      await mineBlock(provider, now + 10);
    }
    await reservoir.drip();
    const balance = await token.balanceOf(deployer);
    expect(balance).to.eq(expandTo18Decimals(130));
  });
});