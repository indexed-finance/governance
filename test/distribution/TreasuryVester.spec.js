const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { deployments, ethers, waffle: { provider, deployContract } } = bre;

const TreasuryVester = require('../../artifacts/TreasuryVester.json')

const { mineBlock, expandTo18Decimals } = require('../utils')

describe('distribution:TreasuryVester', () => {
  const [wallet] = provider.getWallets()

  let ndx, timelock

  beforeEach(async () => {
    await deployments.fixture()
    ndx = await ethers.getContract('Ndx');
    timelock = await ethers.getContract('Timelock');
  })

  let treasuryVester
  let vestingAmount
  let vestingBegin
  let vestingCliff
  let vestingEnd

  beforeEach('deploy treasury vesting contract', async () => {
    const { timestamp: now } = await provider.getBlock('latest')
    vestingAmount = expandTo18Decimals(100)
    vestingBegin = now + 60
    vestingCliff = vestingBegin + 60
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365
    treasuryVester = await deployContract(wallet, TreasuryVester, [
      ndx.address,
      timelock.address,
      vestingAmount,
      vestingBegin,
      vestingCliff,
      vestingEnd,
    ])

    // fund the treasury
    await ndx.transfer(treasuryVester.address, vestingAmount)
  })

  it('setRecipient:fail', async () => {
    await expect(treasuryVester.setRecipient(wallet.address)).to.be.revertedWith(
      'TreasuryVester::setRecipient: unauthorized'
    )
  })

  it('claim:fail', async () => {
    await expect(treasuryVester.claim()).to.be.revertedWith('TreasuryVester::claim: not time yet')
    await mineBlock(provider, vestingBegin + 1)
    await expect(treasuryVester.claim()).to.be.revertedWith('TreasuryVester::claim: not time yet')
  })

  it('claim:~half', async () => {
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    await treasuryVester.claim()
    const balance = await ndx.balanceOf(timelock.address)
    expect(vestingAmount.div(2).sub(balance).abs().lte(vestingAmount.div(2).div(10000))).to.be.true
  })

  it('claim:all', async () => {
    await mineBlock(provider, vestingEnd)
    await treasuryVester.claim()
    const balance = await ndx.balanceOf(timelock.address)
    expect(balance).to.be.eq(vestingAmount)
  })
})
