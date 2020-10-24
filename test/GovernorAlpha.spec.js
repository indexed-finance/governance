const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { constants } = require('ethers')
const { deployments, ethers } = bre;

const { DELAY } = require('./utils');

describe('GovernorAlpha', () => {
  let wallet, address;

  let ndx, timelock, governorAlpha;

  beforeEach(async () => {
    await deployments.fixture();
    ndx = await ethers.getContract('Ndx');
    timelock = await ethers.getContract('Timelock');
    governorAlpha = await ethers.getContract('GovernorAlpha');
    [wallet] = await ethers.getSigners();
    address = await wallet.getAddress();
  })

  it('ndx', async () => {
    const balance = await ndx.balanceOf(address)
    const totalSupply = await ndx.totalSupply()
    expect(balance.eq(totalSupply)).to.be.true;
  })

  it('timelock', async () => {
    const admin = await timelock.admin()
    expect(admin).to.be.eq(governorAlpha.address)
    const pendingAdmin = await timelock.pendingAdmin()
    expect(pendingAdmin).to.be.eq(constants.AddressZero)
    const delay = await timelock.delay()
    expect(delay.eq(DELAY)).to.be.true;
  })

  it('governor', async () => {
    const votingPeriod = await governorAlpha.votingPeriod()
    expect(votingPeriod.eq(40320)).to.be.true;
    const timelockAddress = await governorAlpha.timelock()
    expect(timelockAddress).to.be.eq(timelock.address)
    const uniFromGovernor = await governorAlpha.ndx()
    expect(uniFromGovernor).to.be.eq(ndx.address)
  })
})
