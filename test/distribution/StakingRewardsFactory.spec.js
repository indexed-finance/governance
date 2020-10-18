const bre = require("@nomiclabs/buidler");
const chai = require('chai');
const { BigNumber } = require("ethers");
const { keccak256 } = require("ethers/lib/utils");

chai.use(require('chai-as-promised'));
const { expect } = chai;
const { ethers, waffle: { provider } } = bre;
const { expandTo18Decimals, fastForward } = require('../utils')

describe('distribution:StakingRewardsFactory', async () => {
  let stakingToken, rewardsToken, rewards;
  let stakingFactory, mockPoolFactory, uniswapFactory, weth;
  let owner, signer1, signer2;
  const zeroAddress = `0x${'00'.repeat(20)}`;

  before(async () => {
    ([owner, signer1, signer2] = await ethers.getSigners());
    await deployments.fixture('Staking');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    stakingToken = await MockERC20.deploy('Staking Token', 'STK');
    rewardsToken = await ethers.getContract('Ndx');
    mockPoolFactory = await ethers.getContract('MockPoolFactory');
    stakingFactory = await ethers.getContract('StakingRewardsFactory', owner);
    uniswapFactory = await ethers.getContract('UniswapV2Factory', owner);
    weth = await ethers.getContract('weth', owner);
  });

  describe('Constructor & Settings', async () => {
    it('STAKING_REWARDS_IMPLEMENTATION_ID', async () => {
      const expected = keccak256(Buffer.from('StakingRewards.sol'));
      const actual = await stakingFactory.STAKING_REWARDS_IMPLEMENTATION_ID();
      expect(expected).to.eq(actual);
    });

    it('poolFactory', async () => {
      const expected = mockPoolFactory.address;
      const actual = await stakingFactory.poolFactory();
      expect(expected).to.eq(actual);
    });

    it('proxyManager', async () => {
      const expected = (await deployments.get('DelegateCallProxyManager')).address;
      const actual = await stakingFactory.proxyManager();
      expect(expected).to.eq(actual);
    });

    it('rewardsToken', async () => {
      const expected = rewardsToken.address;
      const actual = await stakingFactory.rewardsToken();
      expect(expected).to.eq(actual);
    });

    it('uniswapFactory', async () => {
      const expected = (await deployments.get('UniswapV2Factory')).address;
      const actual = await stakingFactory.uniswapFactory();
      expect(expected).to.eq(actual);
    });

    it('weth', async () => {
      const expected = (await deployments.get('weth')).address;
      const actual = await stakingFactory.weth();
      expect(expected).to.eq(actual);
    });
  });

  let stakingRewards;

  describe('deployStakingRewardsForPool()', async () => {
    it('Only allows owner to call deployStakingRewardsForPool', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.connect(signer1).deployStakingRewardsForPool(zeroAddress, rewardValue)
      ).to.be.rejectedWith(/ERR_NOT_OWNER/g);
    });

    it('Reverts if the staking token is not an index lp token', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPool(zeroAddress, rewardValue)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPool: Not an index pool/g);
    });

    it('Allows the owner to deploy a staking pool for an index lp token', async () => {
      await mockPoolFactory.addIPool(stakingToken.address);
      const rewardValue = expandTo18Decimals(100);
      const {events} = await stakingFactory.deployStakingRewardsForPool(stakingToken.address, rewardValue).then(tx => tx.wait());
      const { args } = events.filter(e => e.event == 'StakingRewardsAdded')[0];
      expect(args.tokenType).to.eq(0);
      expect(args.stakingToken).to.eq(stakingToken.address);
      stakingRewards = args.stakingRewards;
    });

    it('Fails duplicate deployment without calling proxy manager', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPool(stakingToken.address, rewardValue)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPool: Already deployed/g);
    });

    describe('Staking Info', async () => {
      it('computeStakingRewardsAddress()', async () => {
        const expected = stakingRewards;
        const actual = await stakingFactory.computeStakingRewardsAddress(stakingToken.address);
        expect(actual).to.eq(expected);
      });
  
      it('getStakingRewards()', async () => {
        const expected = stakingRewards;
        const actual = await stakingFactory.getStakingRewards(stakingToken.address);
        expect(actual).to.eq(expected);
      });
  
      it('stakingTokens()', async () => {
        const storedToken = await stakingFactory.stakingTokens(0);
        expect(storedToken).to.eq(stakingToken.address);
        const storedTokens = await stakingFactory.getStakingTokens();
        expect(storedTokens).to.deep.eq([storedToken]);
      });
  
      it('stakingRewardsInfoByStakingToken()', async () => {
        const stakingInfo = await stakingFactory.stakingRewardsInfoByStakingToken(stakingToken.address);
        expect(stakingInfo.rewardAmount).to.eq(expandTo18Decimals(100));
        expect(stakingInfo.stakingRewards).to.eq(await stakingFactory.computeStakingRewardsAddress(stakingToken.address));
      });
    });

    describe('StakingRewards', async () => {
      it('rewardsToken()', async () => {
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const rewards = await stakingPool.rewardsToken();
        expect(rewards).to.eq(rewardsToken.address);
      });

      it('stakingToken()', async () => {
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const staking = await stakingPool.stakingToken();
        expect(staking).to.eq(stakingToken.address);
      });
    });

    describe('notifyRewardAmount()', async () => {
      it('Fails if the staking genesis timestamp has not passed', async () => {
        await expect(
          stakingFactory.notifyRewardAmount(stakingToken.address)
        ).to.be.rejectedWith(/StakingRewardsFactory::notifyRewardAmount: Not ready/g);
      });
  
      it('Fails if the factory does not have sufficient tokens', async () => {
        const stakingGenesis = await stakingFactory.stakingRewardsGenesis();
        const { timestamp: now } = await provider.getBlock('latest');
        const diff = stakingGenesis - now;
        await fastForward(provider, diff);
        await expect(
          stakingFactory.notifyRewardAmount(stakingToken.address)
        ).to.be.rejectedWith(/Ndx::_transferTokens: transfer amount exceeds balance/g);
      });
  
      it('Fails if the staking pool does not exist', async () => {
        const rewardValue = expandTo18Decimals(100);
        await rewardsToken.transfer(stakingFactory.address, rewardValue);
        await expect(
          stakingFactory.notifyRewardAmount(zeroAddress)
        ).to.be.rejectedWith(/StakingRewardsFactory::notifyRewardAmount: Not deployed/g);
      });
  
      it('Notifies the pool of its rewards', async () => {
        const receipt = await stakingFactory.notifyRewardAmount(stakingToken.address).then(tx => tx.wait());
        const { timestamp } = await provider.getBlock(receipt.blockHash);
        const duration = 60*24*60*60;
        const expectedRate = expandTo18Decimals(100).div(duration);
        const expectedFinish = timestamp + duration;
        const stakingPool = await ethers.getContractAt(
          'StakingRewards',
          await stakingFactory.computeStakingRewardsAddress(stakingToken.address)
        );
        const actualRate = await stakingPool.rewardRate();
        expect(actualRate.eq(expectedRate)).to.be.true;
        const actualFinish = await stakingPool.periodFinish();
        expect(actualFinish.eq(expectedFinish)).to.be.true;
      });
    });
  });

  describe('deployStakingRewardsForPoolUniswapPair', async () => {
    let pairAddress;

    before(async () => {
      const {events} = await uniswapFactory.createPair(weth.address, stakingToken.address).then(tx => tx.wait());
      ({ args: { pair: pairAddress } } = events.filter(e => e.event == 'PairCreated')[0]);
    });

    it('Only allows owner to call deployStakingRewardsForPoolUniswapPair', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.connect(signer1).deployStakingRewardsForPoolUniswapPair(zeroAddress, rewardValue)
      ).to.be.rejectedWith(/ERR_NOT_OWNER/g);
    });

    it('Reverts if the staking token is not an index lp token', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPoolUniswapPair(zeroAddress, rewardValue)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPoolUniswapPair: Not an index pool/g);
    });

    it('Allows the owner to deploy a staking pool for an index lp token <-> weth uniswap pair', async () => {
      const rewardValue = expandTo18Decimals(100);
      const {events} = await stakingFactory.deployStakingRewardsForPoolUniswapPair(stakingToken.address, rewardValue).then(tx => tx.wait());
      const { args } = events.filter(e => e.event == 'StakingRewardsAdded')[0];
      expect(args.tokenType).to.eq(1);
      expect(args.stakingToken).to.eq(pairAddress);
      stakingRewards = args.stakingRewards;
    });

    it('Fails duplicate deployment without calling proxy manager', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPoolUniswapPair(stakingToken.address, rewardValue)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPoolUniswapPair: Already deployed/g);
    });

    describe('Staking Info', async () => {
      it('computeStakingRewardsAddress()', async () => {
        const expected = stakingRewards;
        const actual = await stakingFactory.computeStakingRewardsAddress(pairAddress);
        expect(actual).to.eq(expected);
      });
  
      it('getStakingRewards()', async () => {
        const expected = stakingRewards;
        const actual = await stakingFactory.getStakingRewards(pairAddress);
        expect(actual).to.eq(expected);
      });
  
      it('stakingTokens()', async () => {
        const storedToken = await stakingFactory.stakingTokens(1);
        expect(storedToken).to.eq(pairAddress);
        const storedTokens = await stakingFactory.getStakingTokens();
        expect(storedTokens).to.deep.eq([stakingToken.address, pairAddress]);
      });
  
      it('stakingRewardsInfoByStakingToken()', async () => {
        const stakingInfo = await stakingFactory.stakingRewardsInfoByStakingToken(pairAddress);
        expect(stakingInfo.rewardAmount).to.eq(expandTo18Decimals(100));
        expect(stakingInfo.stakingRewards).to.eq(await stakingFactory.computeStakingRewardsAddress(pairAddress));
      });
    });

    describe('StakingRewards', async () => {
      it('rewardsToken()', async () => {
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const rewards = await stakingPool.rewardsToken();
        expect(rewards).to.eq(rewardsToken.address);
      });

      it('stakingToken()', async () => {
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const staking = await stakingPool.stakingToken();
        expect(staking).to.eq(pairAddress);
      });
    });

    describe('notifyRewardAmount()', async () => {
      it('Fails if the factory does not have sufficient tokens', async () => {
        const stakingGenesis = await stakingFactory.stakingRewardsGenesis();
        const { timestamp: now } = await provider.getBlock('latest');
        const diff = stakingGenesis - now;
        await fastForward(provider, diff);
        await expect(
          stakingFactory.notifyRewardAmount(pairAddress)
        ).to.be.rejectedWith(/Ndx::_transferTokens: transfer amount exceeds balance/g);
      });
  
      it('Fails if the staking pool does not exist', async () => {
        const rewardValue = expandTo18Decimals(100);
        await rewardsToken.transfer(stakingFactory.address, rewardValue);
        await expect(
          stakingFactory.notifyRewardAmount(zeroAddress)
        ).to.be.rejectedWith(/StakingRewardsFactory::notifyRewardAmount: Not deployed/g);
      });
  
      it('Notifies the pool of its rewards', async () => {
        const receipt = await stakingFactory.notifyRewardAmount(pairAddress).then(tx => tx.wait());
        const { timestamp } = await provider.getBlock(receipt.blockHash);
        const duration = 60*24*60*60;
        const expectedRate = expandTo18Decimals(100).div(duration);
        const expectedFinish = timestamp + duration;
        const stakingPool = await ethers.getContractAt(
          'StakingRewards',
          await stakingFactory.computeStakingRewardsAddress(pairAddress)
        );
        const actualRate = await stakingPool.rewardRate();
        expect(actualRate.eq(expectedRate)).to.be.true;
        const actualFinish = await stakingPool.periodFinish();
        expect(actualFinish.eq(expectedFinish)).to.be.true;
      });
    });
  });
});