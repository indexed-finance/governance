const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { constants } = require('ethers')
const { deployments, ethers } = bre;

const { DELAY, fastForward } = require('./utils');

describe('GovernorAlpha', () => {
  let wallet, address;

  let ndx, timelock, governorAlpha;

  beforeEach(async () => {
    await deployments.fixture('Governance');
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
    const timelockAddress = await governorAlpha.timelock()
    expect(timelockAddress).to.be.eq(timelock.address)
    const uniFromGovernor = await governorAlpha.ndx()
    expect(uniFromGovernor).to.be.eq(ndx.address)
  })

  describe('voting period', async () => {
    it('votingPeriod initialized to 2880', async () => {
      const votingPeriod = await governorAlpha.votingPeriod();
      expect(votingPeriod).to.eq(2880);
    })

    it('permanentVotingPeriod set to 17280', async () => {
      const permanentVotingPeriod = await governorAlpha.permanentVotingPeriod();
      expect(permanentVotingPeriod).to.eq(17280);
    })

    it('setPermanentVotingPeriod: reverts if too early', async () => {
      await expect(
        governorAlpha.setPermanentVotingPeriod()
      ).to.be.revertedWith('GovernorAlpha::setPermanentVotingPeriod: setting permanent voting period not allowed yet');
    })

    it('setPermanentVotingPeriod: adjusts voting period when allowed', async () => {
      await fastForward(ethers.provider, 86400 * 14);
      await governorAlpha.setPermanentVotingPeriod();
      const votingPeriod = await governorAlpha.votingPeriod();
      expect(votingPeriod).to.eq(17280);
    })
  });
})
