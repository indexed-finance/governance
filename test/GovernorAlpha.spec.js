const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { constants } = require('ethers')
const { deployments, ethers, waffle: { provider } } = bre;

const { DELAY } = require('./utils');

describe('GovernorAlpha', () => {
  const [wallet] = provider.getWallets()

  let ndx, timelock, governorAlpha;

  beforeEach(async () => {
    await deployments.fixture();
    ndx = await ethers.getContract('ndx');
    timelock = await ethers.getContract('timelock');
    governorAlpha = await ethers.getContract('governorAlpha');
  })

  it('ndx', async () => {
    const balance = await ndx.balanceOf(wallet.address)
    const totalSupply = await ndx.totalSupply()
    expect(balance).to.be.eq(totalSupply)
  })

  it('timelock', async () => {
    const admin = await timelock.admin()
    expect(admin).to.be.eq(governorAlpha.address)
    const pendingAdmin = await timelock.pendingAdmin()
    expect(pendingAdmin).to.be.eq(constants.AddressZero)
    const delay = await timelock.delay()
    expect(delay).to.be.eq(DELAY)
  })

  it('governor', async () => {
    const votingPeriod = await governorAlpha.votingPeriod()
    expect(votingPeriod).to.be.eq(40320)
    const timelockAddress = await governorAlpha.timelock()
    expect(timelockAddress).to.be.eq(timelock.address)
    const uniFromGovernor = await governorAlpha.ndx()
    expect(uniFromGovernor).to.be.eq(ndx.address)
  })
})
