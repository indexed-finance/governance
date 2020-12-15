const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { deployments, ethers } = bre;
const { provider } = ethers;

const { mineBlock, expandTo18Decimals } = require('../utils')

describe('distribution:DelegatingVester', () => {
  let ndx
  let owner, newOwner;

  beforeEach(async () => {
    await deployments.fixture('Governance')
    ndx = await ethers.getContract('Ndx');
    [deployer, owner, newOwner] = await ethers.getSigners()
      .then(async (signers) => Promise.all(
        signers.map(
          async (signer) => Object.assign(signer, {
            address: await signer.getAddress()
          }))
        )
      );
  })

  let delegatingVester
  let vestingAmount
  let vestingBegin
  let vestingEnd

  beforeEach('deploy treasury vesting contract', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest')
    vestingAmount = expandTo18Decimals(100)
    vestingBegin = now + 60
    vestingEnd = vestingBegin + 60 * 60 * 24 * 365
    const DelegatingVester = await ethers.getContractFactory('DelegatingVester');
    delegatingVester = await DelegatingVester.deploy(
      ndx.address,
      owner.address,
      vestingAmount,
      vestingBegin,
      vestingEnd,
    );

    // fund the treasury
    await ndx.transfer(delegatingVester.address, vestingAmount)
    delegatingVester = delegatingVester.connect(owner);
  });

  it('Constructor fails with invalid vesting times', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest');
    const DelegatingVester = await ethers.getContractFactory('DelegatingVester');
    const deploy = (begin, end) => DelegatingVester.deploy(
      ndx.address,
      owner.address,
      expandTo18Decimals(100),
      begin,
      end,
    );
    await expect(deploy(now - 10, now + 60)).to.be.revertedWith(/DelegatingVester::constructor: vesting begin too early/g);
    await expect(deploy(now + 60, now + 60)).to.be.revertedWith(/DelegatingVester::constructor: vesting end too early/g);
  });

  it('claim:~half', async () => {
    await mineBlock(provider, vestingBegin + Math.floor((vestingEnd - vestingBegin) / 2))
    await delegatingVester.claim()
    const balance = await ndx.balanceOf(owner.address)
    expect(vestingAmount.div(2).sub(balance).abs().lte(vestingAmount.div(2).div(10000))).to.be.true
  });

  it('claim:all', async () => {
    await mineBlock(provider, vestingEnd)
    await delegatingVester.claim()
    const balance = await ndx.balanceOf(owner.address)
    expect(balance.eq(vestingAmount)).to.be.true;
  });

  it('delegate:fail', async () => {
    await expect(
      delegatingVester.connect(newOwner).delegate(newOwner.address)
    ).to.be.revertedWith('DelegatingVester::delegate: unauthorized');
  });

  it('delegate', async () => {
    await delegatingVester.delegate(newOwner.address);
    const votes = await ndx.getCurrentVotes(newOwner.address);
    expect(votes).to.eq(expandTo18Decimals(100))
  });

  it('setRecipient:fail', async () => {
    await expect(
      delegatingVester.connect(newOwner).setRecipient(newOwner.address)
    ).to.be.revertedWith('DelegatingVester::setRecipient: unauthorized');
  });

  it('setRecipient', async () => {
    const { timestamp: now } = await ethers.provider.getBlock('latest');
    const DelegatingVester = await ethers.getContractFactory('DelegatingVester');
    const vester = await DelegatingVester.deploy(
      ndx.address,
      owner.address,
      expandTo18Decimals(100),
      now + 60,
      now + 120,
    );
    await vester.connect(owner).setRecipient(newOwner.address);
    expect(await vester.recipient()).to.eq(newOwner.address);
  });
});
