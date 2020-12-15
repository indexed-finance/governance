const chai = require('chai')
const { constants, utils, BigNumber } = require('ethers')
const bre = require("@nomiclabs/buidler");
const { deployments, ethers } = bre;
const { ecsign } = require('ethereumjs-util')
chai.use(require('chai-as-promised'));

const { expect } = chai;
const { expandTo18Decimals, getWallets, DELAY, fastForward } = require('./utils')

const DOMAIN_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)')
)

const PERMIT_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
);

describe('Ndx', () => {
  let wallet, other0, other1;
  let wallet1;
  let mintingAllowedAfter;

  let ndx;

  beforeEach(async () => {    
    (
      [wallet, other0, other1] = await ethers.getSigners()
        .then(async (signers) => Promise.all(
          signers.map(async (signer) => Object.assign(signer, { address: await signer.getAddress() })))
        )
    );
    [wallet1] = await getWallets(ethers, 1);
    const Ndx = await ethers.getContractFactory('Ndx');
    const { timestamp } = await ethers.provider.getBlock('latest');
    mintingAllowedAfter = timestamp + DELAY;
    ndx = await Ndx.deploy(wallet.address, wallet.address, mintingAllowedAfter);
  });

  describe('Constructor & Settings', async () => {
    it('totalSupply()', async () => {
      const actual = await ndx.totalSupply();
      const expected = expandTo18Decimals(1e7);
      expect(actual.eq(expected)).to.be.true;
    });

    it('Gave supply to address in constructor', async () => {
      const actual = await ndx.balanceOf(wallet.address);
      const expected = expandTo18Decimals(1e7);
      expect(actual.eq(expected)).to.be.true;
    });

    it('Set the minter as the governor contract', async () => {
      expect(await ndx.minter()).to.eq(wallet.address);
    });

    it('Sets the mint timestamp', async () => {
      expect((await ndx.mintingAllowedAfter()).eq(mintingAllowedAfter)).to.be.true;
    });
  });

  it('permit()', async () => {
    const chainID = bre.network.name == 'coverage' ? 1 : +(await getChainId());
    const domainSeparator = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'uint256', 'address'],
        [DOMAIN_TYPEHASH, utils.keccak256(utils.toUtf8Bytes('Indexed')), chainID, ndx.address]
      )
    );

    const owner = wallet1.address;
    const spender = other0.address;
    const value = 123
    const nonce = await ndx.nonceOf(owner)
    const deadline = constants.MaxUint256
    const digest = utils.keccak256(
      utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          domainSeparator,
          utils.keccak256(
            utils.defaultAbiCoder.encode(
              ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
              [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
            )
          ),
        ]
      )
    );
    await ndx.transfer(owner, expandTo18Decimals(1));
    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet1.privateKey.slice(2), 'hex'));

    await ndx.permit(owner, spender, value, deadline, v, utils.hexlify(r), utils.hexlify(s));
    expect((await ndx.allowance(owner, spender)).eq(value)).to.be.true;
    expect((await ndx.nonces(wallet1.address)).eq(1)).to.be.true;
    
    await ndx.connect(other0).transferFrom(owner, spender, value);
  });

  it('nested delegation', async () => {
    await ndx.transfer(other0.address, expandTo18Decimals(1))
    await ndx.transfer(other1.address, expandTo18Decimals(2))

    let currectVotes0 = await ndx.getCurrentVotes(other0.address)
    let currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes0.eq(0)).to.be.true;
    expect(currectVotes1.eq(0)).to.be.true;

    await ndx.connect(other0).delegate(other1.address)
    currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes1.eq(expandTo18Decimals(1))).to.be.true;
    await ndx.connect(other1).delegate(other1.address)
    currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes1.eq(expandTo18Decimals(1).add(expandTo18Decimals(2)))).to.be.true;

    await ndx.connect(other1).delegate(wallet.address)
    currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes1.eq(expandTo18Decimals(1))).to.be.true;
  });


  describe('setMinter()', async () => {
    it('reverts if not called by owner', async () => {
      await expect(
        ndx.connect(other1).setMinter(`0x${'00'.repeat(20)}`)
      ).to.be.rejectedWith(/Ndx::setMinter: only the minter can change the minter address/g)
    });

    it('sets the minter', async () => {
      await ndx.setMinter(other1.address);
      expect(await ndx.minter()).to.eq(other1.address);
      await ndx.connect(other1).setMinter(wallet.address);
      expect(await ndx.minter()).to.eq(wallet.address);
    });
  });

  describe('mint()', async () => {
    it('reverts if not called by owner', async () => {
      await expect(
        ndx.connect(other1).mint(`0x${'00'.repeat(20)}`, 0)
      ).to.be.rejectedWith(/Ndx::mint: only the minter can mint/g);
    });

    it('reverts if called before mintingAllowedAfter', async () => {
      await expect(
        ndx.mint(`0x${'00'.repeat(20)}`, 0)
      ).to.be.rejectedWith(/Ndx::mint: minting not allowed yet/g);
    });
  
    it('reverts if target is null address', async () => {
      await fastForward(ethers.provider, DELAY);
      await expect(
        ndx.mint(`0x${'00'.repeat(20)}`, 0)
      ).to.be.rejectedWith(/Ndx::mint: cannot transfer to the zero address/g);
    });

    it('reverts if amount exceeds 96 bits', async () => {
      await fastForward(ethers.provider, DELAY);
      const maxAmount = BigNumber.from(2).pow(96);
      await expect(
        ndx.mint(`0x${'ff'.repeat(20)}`, maxAmount)
      ).to.be.rejectedWith(/Ndx::mint: amount exceeds 96 bits/g);
    });

    it('reverts if amount exceeds 10% supply', async () => {
      await fastForward(ethers.provider, DELAY);
      const amount = BigNumber.from(10).pow(25).add(1);
      await expect(
        ndx.mint(`0x${'ff'.repeat(20)}`, amount)
      ).to.be.rejectedWith(/Ndx::mint: exceeded mint cap/g);
    });
  
    it('mints tokens to target', async () => {
      await fastForward(ethers.provider, DELAY);
      const tx = await ndx.mint(other1.address, expandTo18Decimals(1));
      const { blockNumber } = await tx.wait();
      const { timestamp } = await ethers.provider.getBlock(blockNumber);
      const ninetyDays = 90 * 24 * 3600;
      expect((await ndx.balanceOf(other1.address)).eq(expandTo18Decimals(1))).to.be.true;
      expect((await ndx.mintingAllowedAfter()).eq(timestamp + ninetyDays)).to.be.true;
      expect(await ndx.totalSupply()).to.eq(expandTo18Decimals(10000001))
    });
  });

  // it('adds ')
});
