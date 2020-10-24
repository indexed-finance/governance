const bre = require("@nomiclabs/buidler");
const chai = require('chai');
chai.use(require('chai-as-promised'));
const { expect } = chai;

const { Contract, BigNumber } = require("ethers");
const { formatEther } = require("ethers/lib/utils");
const { ethers } = bre;

const { mineBlock, expandTo18Decimals } = require('../utils')

describe('distribution:Reservoir', () => {
  let token, reservoir;
  let deployer;

  beforeEach(async () => {
    ({ deployer } = await getNamedAccounts());
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    token = await MockERC20.deploy("MockToken", "MTK");
    const Reservoir = await ethers.getContractFactory('Reservoir');
    const nonce = await ethers.provider.getTransactionCount(deployer);
    const reservoirAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 1 });
    await token.getFreeTokens(reservoirAddress, expandTo18Decimals(100));
    reservoir = await Reservoir.deploy(expandTo18Decimals(10), token.address, deployer);
  });

  it('drip()', async () => {
    await reservoir.drip();
    const balance = await token.balanceOf(deployer);
    expect(balance.eq(expandTo18Decimals(10))).to.be.true;
  });

  it('drip() 0 drip rate', async () => {
    const Reservoir = await ethers.getContractFactory('Reservoir');
    const _reservoir = await Reservoir.deploy(0, token.address, deployer);
    const dripped = await _reservoir.callStatic.drip();
    expect(dripped.eq(0)).to.be.true;
  });

  it('drip() many blocks', async () => {
    for (let i = 0; i < 5; i++) {
      const { timestamp: now } = await ethers.provider.getBlock('latest');
      await mineBlock(ethers.provider, now + 10);
    }
    await reservoir.drip();
    const balance = await token.balanceOf(deployer);
    expect(balance.eq(expandTo18Decimals(60))).to.be.true;
  });

  it('drip() more blocks than duration', async () => {
    for (let i = 0; i < 11; i++) {
      await mineBlock(ethers.provider);
    }
    await reservoir.drip();
    const balance = await token.balanceOf(deployer);
    expect(balance.eq(expandTo18Decimals(100))).to.be.true;
  });

  describe('errors', async () => {
    it('dripTotal overflow', async () => {
      const Reservoir = await ethers.getContractFactory('Reservoir');
      const dripRate = BigNumber.from(2).pow(255);
      const _reservoir = await Reservoir.deploy(dripRate, token.address, deployer);
      await mineBlock(ethers.provider);
      await expect(_reservoir.drip()).to.be.rejectedWith(/dripTotal overflow/g);
    });
  
    it('deltaDrip underflow', async () => {
      const Reservoir = await ethers.getContractFactory('ReservoirErrorTrigger');
      const _reservoir = await Reservoir.deploy(expandTo18Decimals(10), token.address, deployer);
      await mineBlock(ethers.provider);
      await expect(_reservoir.triggerDeltaDripUnderflow()).to.be.rejectedWith(/deltaDrip underflow/g);
    });

    it('addition overflow', async () => {
      const Reservoir = await ethers.getContractFactory('ReservoirErrorTrigger');
      const _reservoir = await Reservoir.deploy(9, token.address, deployer);
      await expect(_reservoir.triggerAdditionOverflow()).to.be.rejectedWith(/addition overflow/g);
    });
  });
});