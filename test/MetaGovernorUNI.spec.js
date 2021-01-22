const bre = require("@nomiclabs/buidler");
const { expect } = require('chai')
const { constants, Contract } = require('ethers')
const { deployments, ethers } = bre;

const { expandTo18Decimals, mineBlock } = require('./utils');

const governanceFixture = require('./governance.fixture');
const { defaultAbiCoder } = require("ethers/lib/utils");

async function deploy(contractName, ...args) {
  const Factory = await ethers.getContractFactory(contractName);
  return Factory.deploy(...args);
}

async function govSetup() {
  const { deployer } = await getNamedAccounts();
  const DELAY = 86400 * 2;
  const nonce = await ethers.provider.getTransactionCount(deployer);

  const { timestamp } = await ethers.provider.getBlock('latest');

  const governorAlphaAddress = Contract.getContractAddress({ from: deployer, nonce: nonce + 2 });

  const token = await deploy('Ndx', deployer, governorAlphaAddress, timestamp + DELAY);
  const timelock = await deploy('Timelock', governorAlphaAddress, DELAY);
  const governorAlpha = await deploy('GovernorAlpha', timelock.address, token.address, timestamp + (86400 * 14));
  return {
    token,
    timelock,
    governorAlpha
  };
}

describe('MetaGovernorUNI', () => {
  let deployer;
  let ndx, ndxTimelock, ndxGovernor;
  let uni, uniTimelock, uniGovernor;
  let metaGovernor
  let testToken;
  let signer2;

  function setupTests() {
    before(async () => {
      ({ deployer } = await getNamedAccounts());
      ({ token: ndx, timelock: ndxTimelock, governorAlpha: ndxGovernor } = await govSetup());
      ({ token: uni, timelock: uniTimelock, governorAlpha: uniGovernor } = await govSetup());
      testToken = await deploy('MockERC20', 'Test Token', 'Token');
      await testToken.getFreeTokens(uniTimelock.address, expandTo18Decimals(100));
      await ndx.delegate(deployer);
      metaGovernor = await deploy('MetaGovernorUNI', ndx.address, uniGovernor.address, 1440);
  
      const signatures = ['transfer(address,uint256)'];
      const calldatas = [defaultAbiCoder.encode(['address', 'uint256'], [deployer, expandTo18Decimals(100)])];
      const targets = [testToken.address];
      const description = '';
      ([x, signer2] = await ethers.getSigners());
      const uniBalance = await uni.balanceOf(deployer);
      await uni.transfer(await signer2.getAddress(), uniBalance.div(2));
      await uni.delegate(deployer);
      await uni.connect(signer2).delegate(metaGovernor.address);
      await ndx.delegate(deployer);
      await mineBlock(ethers.provider);
      await uniGovernor.propose(
        targets,
        [0],
        signatures,
        calldatas,
        description
      );
      await mineBlock(ethers.provider);
    });
  }

  describe('castVote', async () => {
    let balance, metaProposal, proposal;
    setupTests();

    it('casts vote', async () => {
      balance = await ndx.balanceOf(deployer);
      await metaGovernor.castVote(1, true);
      metaProposal = await metaGovernor.proposals( 1);
      proposal = await uniGovernor.proposals(1);
    })

    it('stores the correct start and end block', async () => {
      expect(metaProposal.startBlock).to.eq(proposal.startBlock);
      expect(metaProposal.endBlock).to.eq(proposal.endBlock.sub(1440));
    })

    it('records caller vote', async () => {
      expect(metaProposal.forVotes).to.eq(balance);
      expect(metaProposal.againstVotes).to.eq(0);
    })

    it('does not set voteSubmitted', async () => {
      expect(metaProposal.voteSubmitted).to.be.false
    })

    it('creates receipt', async () => {
      const receipt = await metaGovernor.getReceipt(1, deployer);
      expect(receipt.hasVoted).to.be.true;
      expect(receipt.support).to.be.true;
      expect(receipt.votes).to.eq(balance);
    })

    it('rejects duplicate vote', async () => {
      await expect(
        metaGovernor.castVote(1, true)
      ).to.be.revertedWith(
        'MetaGovernorUNI::_castVote: voter already voted'
      )
    })

    it('rejects if proposal not active', async () => {
      const blocks = proposal.endBlock - proposal.startBlock;
      for (let i = 0; i < blocks; i++) await mineBlock(ethers.provider);
      await expect(
        metaGovernor.castVote(1, true)
      ).to.be.revertedWith(
        'MetaGovernorUNI::_castVote: meta proposal not active'
      )
    })
  })

  describe('state', async () => {
    setupTests();

    it('Active', async () => {
      await metaGovernor.castVote(1, false)
      expect(await metaGovernor.state(1)).to.eq(0)
    })

    it('Defeated', async () => {
      const metaProposal = await metaGovernor.proposals( 1);
      const blocks = metaProposal.endBlock - metaProposal.startBlock;
      for (let i = 0; i < blocks; i++) await mineBlock(ethers.provider);
      expect(await metaGovernor.state(1)).to.eq(1)
      await metaGovernor.submitExternalVote(1);
      await uni.delegate(`0x${'00'.repeat(20)}`)
      await uniGovernor.cancel(1)
      await uni.delegate(deployer)
    })

    it('Succeeded', async () => {
      const signatures = ['transfer(address,uint256)'];
      const calldatas = [defaultAbiCoder.encode(['address', 'uint256'], [deployer, expandTo18Decimals(100)])];
      const targets = [testToken.address];
      const description = '';
      await uniGovernor.propose(
        targets,
        [0],
        signatures,
        calldatas,
        description
      );
      await mineBlock(ethers.provider)
      await metaGovernor.castVote(2, true)
      const metaProposal = await metaGovernor.proposals(2);
      const blocks = metaProposal.endBlock - metaProposal.startBlock;
      for (let i = 0; i < blocks; i++) await mineBlock(ethers.provider);
      expect(await metaGovernor.state(2)).to.eq(2)
      await uni.delegate(`0x${'00'.repeat(20)}`)
      await uniGovernor.cancel(2)
      await uni.delegate(deployer)
    })

    it('Null / Not ready', async () => {
      const signatures = ['transfer(address,uint256)'];
      const calldatas = [defaultAbiCoder.encode(['address', 'uint256'], [deployer, expandTo18Decimals(100)])];
      const targets = [testToken.address];
      const description = '';
      await uniGovernor.propose(
        targets,
        [0],
        signatures,
        calldatas,
        description
      );
      await expect(metaGovernor.state(3)).to.be.revertedWith('MetaGovernorUNI::_state: meta proposal does not exist or is not ready');
      await expect(metaGovernor.state(4)).to.be.revertedWith('MetaGovernorUNI::_state: meta proposal does not exist or is not ready');
    })

    it('Executed', async () => {
      await mineBlock(ethers.provider)
      await metaGovernor.castVote(3, true)
      const metaProposal = await metaGovernor.proposals(3);
      const blocks = metaProposal.endBlock - metaProposal.startBlock;
      for (let i = 0; i < blocks; i++) await mineBlock(ethers.provider);
      await metaGovernor.submitExternalVote(3);
      expect(await metaGovernor.state(3)).to.eq(3)
    })
  })

  describe('submitExternalVote', async () => {
    describe('rejection', async () => {
      setupTests();

      it('rejects if proposal does not exist', async () => {
        await expect(
          metaGovernor.submitExternalVote(2)
        ).to.be.revertedWith(
          'MetaGovernorUNI::_state: meta proposal does not exist'
        )
      })
  
      it('rejects if proposal not ready', async () => {
        await metaGovernor.castVote(1, true);
        await expect(
          metaGovernor.submitExternalVote(1)
        ).to.be.revertedWith(
          'MetaGovernorUNI::submitExternalVote: proposal must be in Succeeded or Defeated state to execute'
        )
      })
    })

    describe('vote for', async () => {
      setupTests();

      it('submits to governor', async () => {
        await metaGovernor.castVote(1, true);
        const metaProposal = await metaGovernor.proposals( 1);
        const blocks = metaProposal.endBlock - metaProposal.startBlock;
        for (let i = 0; i < blocks; i++) await mineBlock(ethers.provider);
        await metaGovernor.submitExternalVote(1);
        const delegation = await uni.getCurrentVotes(metaGovernor.address);
        const receipt = await uniGovernor.getReceipt(1, metaGovernor.address);
        expect(receipt.hasVoted).to.be.true;
        expect(receipt.support).to.be.true;
        expect(receipt.votes).to.eq(delegation);
      })
    })

    describe('vote against', async () => {
      setupTests();

      it('submits to governor', async () => {
        await metaGovernor.castVote(1, false);
        const metaProposal = await metaGovernor.proposals( 1);
        const blocks = metaProposal.endBlock - metaProposal.startBlock;
        for (let i = 0; i < blocks; i++) await mineBlock(ethers.provider);
        await metaGovernor.submitExternalVote(1);
        const delegation = await uni.getCurrentVotes(metaGovernor.address);
        const receipt = await uniGovernor.getReceipt(1, metaGovernor.address);
        expect(receipt.hasVoted).to.be.true;
        expect(receipt.support).to.be.false;
        expect(receipt.votes).to.eq(delegation);
      })
    })
  })
})
