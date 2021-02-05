const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { deployments, ethers } = bre;
const { provider } = ethers;

const governanceFixture = require('../governance.fixture');
const { mineBlock, expandTo18Decimals } = require('../utils')

describe('distribution:CancelableDelegatingVester', () => {
  let ndx
  let owner, newOwner, terminator;

  beforeEach(async () => {
    await deployments.createFixture(governanceFixture)();
    ndx = await ethers.getContract('Ndx');
    [deployer, owner, newOwner, terminator] = await ethers.getSigners()
      .then(async (signers) => Promise.all(
        signers.map(
          async (signer) => Object.assign(signer, {
            address: await signer.getAddress()
          }))
        )
      );
  })

  let cancelableDelegatingVester
  let vestingAmount
  let vestingBegin
  let vestingEnd

  beforeEach(async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest')
    vestingAmount = expandTo18Decimals(100)
    vestingBegin = now + 60
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365
    const CancelableDelegatingVester = await ethers.getContractFactory('CancelableDelegatingVester');
    cancelableDelegatingVester = await CancelableDelegatingVester.deploy(
      terminator.address,
      ndx.address,
      owner.address,
      vestingAmount,
      vestingBegin,
      vestingEnd,
    );

    // fund the treasury
    await ndx.transfer(cancelableDelegatingVester.address, vestingAmount)
    cancelableDelegatingVester = cancelableDelegatingVester.connect(owner);
  });

  it('Constructor fails with invalid vesting times', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest');
    const CancelableDelegatingVester = await ethers.getContractFactory('CancelableDelegatingVester');
    const deploy = (begin, end) => CancelableDelegatingVester.deploy(
      terminator.address,
      ndx.address,
      owner.address,
      expandTo18Decimals(100),
      begin,
      end,
    );
    await expect(deploy(now - 10, now + 60)).to.be.revertedWith(/CancelableDelegatingVester::constructor: vesting begin too early/g);
    await expect(deploy(now + 60, now + 60)).to.be.revertedWith(/CancelableDelegatingVester::constructor: vesting end too early/g);
  });

  it('claim:~half', async () => {
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    await cancelableDelegatingVester.claim()
    const balance = await ndx.balanceOf(owner.address)
    expect(vestingAmount.div(2).sub(balance).abs().lte(vestingAmount.div(2).div(10000))).to.be.true
  });

  it('claim:all', async () => {
    await mineBlock(provider, vestingEnd)
    await cancelableDelegatingVester.claim()
    const balance = await ndx.balanceOf(owner.address)
    expect(balance.eq(vestingAmount)).to.be.true;
  });

  it('delegate:fail', async () => {
    await expect(
      cancelableDelegatingVester.connect(newOwner).delegate(newOwner.address)
    ).to.be.revertedWith('CancelableDelegatingVester::delegate: unauthorized');
  });

  it('delegate', async () => {
    await cancelableDelegatingVester.delegate(newOwner.address);
    const votes = await ndx.getCurrentVotes(newOwner.address);
    expect(votes).to.eq(expandTo18Decimals(100))
  });

  it('setRecipient:fail', async () => {
    await expect(
      cancelableDelegatingVester.connect(newOwner).setRecipient(newOwner.address)
    ).to.be.revertedWith('CancelableDelegatingVester::setRecipient: unauthorized');
  });

  it('setRecipient', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest');
    const CancelableDelegatingVester = await ethers.getContractFactory('CancelableDelegatingVester');
    const vester = await CancelableDelegatingVester.deploy(
      terminator.address,
      ndx.address,
      owner.address,
      expandTo18Decimals(100),
      now + 60,
      now + 120,
    );
    await vester.connect(owner).setRecipient(newOwner.address);
    expect(await vester.recipient()).to.eq(newOwner.address);
  });

  it('terminate:fail', async () => {
    await expect(
      cancelableDelegatingVester.terminate()
    ).to.be.revertedWith('CancelableDelegatingVester::terminate: unauthorized')
  });

  it('terminate', async () => {
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    const receipt = await cancelableDelegatingVester.connect(terminator).terminate().then(tx => tx.wait())
    const { blockHash } = receipt;
    const { timestamp } = await ethers.provider.getBlock(blockHash);
    const duration = vestingEnd - vestingBegin;
    const expectedVestedAmount = vestingAmount.mul(timestamp - vestingBegin).div(duration);
    const balanceRecipient = await ndx.balanceOf(owner.address);
    expect(balanceRecipient).to.eq(expectedVestedAmount);
    const remainder = vestingAmount.sub(expectedVestedAmount);
    const balanceTerminator = await ndx.balanceOf(terminator.address);
    expect(balanceTerminator).to.eq(remainder);
  })
});
