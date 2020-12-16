const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { deployments, ethers } = bre;
const { provider } = ethers;

const governanceFixture = require('../governance.fixture');
const { mineBlock, expandTo18Decimals, fastForward } = require('../utils')

const zeroAddress = `0x${'00'.repeat(20)}`;

describe('distribution:TreasuryLock', () => {
  let recipient, notRecipient;
  let ndx, treasuryLock;
  let factory;
  let unlockDate;

  before(async () => {
    await deployments.createFixture(governanceFixture)();
    ndx = await ethers.getContract('Ndx');
    [notRecipient, recipient] = await ethers.getSigners()
      .then(async (signers) => Promise.all(
        signers.map(async (signer) => Object.assign(signer, { address: await signer.getAddress() })))
      );
    factory = await ethers.getContractFactory('TreasuryLock')
    const { timestamp } = await ethers.provider.getBlock('latest');
    unlockDate = timestamp + 86400;
  });

  describe('Constructor', async () => {
    it('Reverts if recipient is null', async () => {
      await expect(
        factory.deploy(zeroAddress, ndx.address, 0)
      ).to.be.revertedWith('TreasuryLock::constructor: can not set null recipient');
    });
  
    it('Reverts if token is null', async () => {
      await expect(
        factory.deploy(recipient.address, zeroAddress, 0)
      ).to.be.revertedWith('TreasuryLock::constructor: can not set null token');
    });
  
    it('Reverts if unlockDate is too soon', async () => {
      await expect(
        factory.deploy(recipient.address, ndx.address, 0)
      ).to.be.revertedWith('TreasuryLock::constructor: unlockDate too soon');
    });

    it('Sets the correct values', async () => {
      treasuryLock = await factory.deploy(recipient.address, ndx.address, unlockDate);
      expect(await treasuryLock.recipient()).to.eq(recipient.address);
      expect(await treasuryLock.token()).to.eq(ndx.address);
      expect(await treasuryLock.unlockDate()).to.eq(unlockDate);
    });
  });

  describe('claim()', async () => {
    it('Reverts if unlock date has not passed', async () => {
      await expect(
        treasuryLock.claim()
      ).to.be.revertedWith('TreasuryLock::claim: not ready');
    });

    it('Transfers balance', async () => {
      await ndx.transfer(treasuryLock.address, expandTo18Decimals(10000)).then(tx => tx.wait());
      await fastForward(ethers.provider, 86400)
      const tx = await treasuryLock.claim();
      expect(await ndx.balanceOf(recipient.address)).to.eq(expandTo18Decimals(10000));
    });
  });
});
