const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { deployments, ethers } = bre;
const { provider } = ethers;

const { mineBlock, expandTo18Decimals } = require('../utils')

describe('distribution:TreasuryVester', () => {
  let wallet;
  let ndx, timelock

  beforeEach(async () => {
    await deployments.fixture('Governance')
    ndx = await ethers.getContract('Ndx');
    timelock = await ethers.getContract('Timelock');
    [wallet] = await ethers.getSigners();
  })

  let treasuryVester
  let vestingAmount
  let vestingBegin
  let vestingCliff
  let vestingEnd

  beforeEach('deploy treasury vesting contract', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest')
    vestingAmount = expandTo18Decimals(100)
    vestingBegin = now + 60
    vestingCliff = vestingBegin + 60
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365
    const TreasuryVester = await ethers.getContractFactory('TreasuryVester');
    treasuryVester = await TreasuryVester.deploy(
      ndx.address,
      timelock.address,
      vestingAmount,
      vestingBegin,
      vestingCliff,
      vestingEnd,
    );

    // fund the treasury
    await ndx.transfer(treasuryVester.address, vestingAmount)
  });

  it('Constructor fails with invalid vesting times', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest');
    const TreasuryVester = await ethers.getContractFactory('TreasuryVester');
    const deploy = (begin, cliff, end) => TreasuryVester.deploy(
      ndx.address,
      timelock.address,
      expandTo18Decimals(100),
      begin,
      cliff,
      end,
    );
    await expect(deploy(now - 10, now + 60, now + 60)).to.be.rejectedWith(/TreasuryVester::constructor: vesting begin too early/g);
    await expect(deploy(now + 60, now, now + 60)).to.be.rejectedWith(/TreasuryVester::constructor: cliff is too early/g);
    await expect(deploy(now + 60, now + 100, now + 60)).to.be.rejectedWith(/TreasuryVester::constructor: end is too early/g);
  });

  it('claim:fail', async () => {
    await expect(treasuryVester.claim()).to.be.rejectedWith('TreasuryVester::claim: not time yet')
    await mineBlock(provider, vestingBegin + 1)
    await expect(treasuryVester.claim()).to.be.rejectedWith('TreasuryVester::claim: not time yet')
  });

  it('claim:~half', async () => {
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    await treasuryVester.claim()
    const balance = await ndx.balanceOf(timelock.address)
    expect(vestingAmount.div(2).sub(balance).abs().lte(vestingAmount.div(2).div(10000))).to.be.true
  });

  it('claim:all', async () => {
    await mineBlock(provider, vestingEnd)
    await treasuryVester.claim()
    const balance = await ndx.balanceOf(timelock.address)
    expect(balance.eq(vestingAmount)).to.be.true;
  });

  it('setRecipient:fail', async () => {
    await expect(treasuryVester.setRecipient(await wallet.getAddress())).to.be.rejectedWith(
      'TreasuryVester::setRecipient: unauthorized'
    )
  });

  it('setRecipient', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest');
    const TreasuryVester = await ethers.getContractFactory('TreasuryVester');
    const vester = await TreasuryVester.deploy(
      ndx.address,
      await wallet.getAddress(),
      expandTo18Decimals(100),
      now + 60,
      now + 100,
      now + 120,
    );
    await vester.setRecipient(timelock.address);
    expect(await vester.recipient()).to.eq(timelock.address);
  });
});
