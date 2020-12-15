const bre = require("@nomiclabs/buidler");
const chai = require('chai');
const { keccak256, formatEther } = require("ethers/lib/utils");

chai.use(require('chai-as-promised'));
const { expect } = chai;
const { ethers } = bre;
const { provider } = ethers;
const { expandTo18Decimals, fastForward } = require('../utils')
const { stakingFixture } = require('./staking.fixture');

const DURATION = 60 * 24 * 60 * 60;

describe('distribution:StakingRewardsFactory', async () => {
  let stakingToken, rewardsToken, rewards;
  let stakingFactory, mockPoolFactory, uniswapFactory, weth, proxyManager;
  let owner, signer1, signer2;
  let stakingRewards;
  const zeroAddress = `0x${'00'.repeat(20)}`;

  before(async () => {
    ([owner, signer1, signer2] = await ethers.getSigners());
    ({
      proxyManager,
      stakingToken,
      rewardsToken,
      mockPoolFactory,
      stakingFactory,
      uniswapFactory,
      weth
    } = await stakingFixture());
  });

  describe('Constructor & Settings', async () => {
    it('Rejects genesis earlier than block timestamp', async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const StakingRewardsFactory = await ethers.getContractFactory('StakingRewardsFactory');
      await expect(
        StakingRewardsFactory.deploy(zeroAddress, timestamp - 1, zeroAddress, zeroAddress, zeroAddress, zeroAddress)
      ).to.be.rejectedWith(/StakingRewardsFactory::constructor: genesis too soon/g);
    });

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
      const expected = proxyManager.address;
      const actual = await stakingFactory.proxyManager();
      expect(expected).to.eq(actual);
    });

    it('rewardsToken', async () => {
      const expected = rewardsToken.address;
      const actual = await stakingFactory.rewardsToken();
      expect(expected).to.eq(actual);
    });

    it('uniswapFactory', async () => {
      const expected = uniswapFactory.address;
      const actual = await stakingFactory.uniswapFactory();
      expect(expected).to.eq(actual);
    });

    it('weth', async () => {
      const expected = weth.address;
      const actual = await stakingFactory.weth();
      expect(expected).to.eq(actual);
    });
  });

  describe('notifyRewardAmounts()', async () => {
    let factory, token1, token2;

    before(async () => {
      const StakingRewardsFactory = await ethers.getContractFactory('StakingRewardsFactory');
      const { timestamp: now } = await provider.getBlock('latest');
      const stakingRewardsGenesis = now + 5;
      const DelegateCallProxyManager = await ethers.getContractFactory('DelegateCallProxyManager');
      const proxyManager = await DelegateCallProxyManager.deploy();
      const stakingRewardsImplementationID = keccak256(Buffer.from('StakingRewards.sol'));
      const StakingRewards = await ethers.getContractFactory('StakingRewards');
     
      factory = await StakingRewardsFactory.deploy(
        rewardsToken.address,
        stakingRewardsGenesis,
        proxyManager.address,
        mockPoolFactory.address,
        uniswapFactory.address,
        weth.address
      );
      await fastForward(ethers.provider, 10);
      const stakingRewardsImplementation = await StakingRewards.deploy(factory.address, rewardsToken.address);
      await proxyManager.createManyToOneProxyRelationship(
        stakingRewardsImplementationID,
        stakingRewardsImplementation.address
      );
      await rewardsToken.transfer(factory.address, expandTo18Decimals(200));
      await proxyManager.approveDeployer(factory.address);
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      token1 = await MockERC20.deploy('Staking Token1', 'STK1');
      token2 = await MockERC20.deploy('Staking Token2', 'STK2');
      await mockPoolFactory.addIPool(token1.address);
      await mockPoolFactory.addIPool(token2.address);
    });

    it('Reverts if there are no staking pools', async () => {
      await expect(
        factory.notifyRewardAmounts()
      ).to.be.rejectedWith(/StakingRewardsFactory::notifyRewardAmounts: called before any deploys/g);
    });

    it('Notifies all the pools of their rewards', async () => {
      const rewardValue = expandTo18Decimals(100);
      await factory.deployStakingRewardsForPool(token1.address, rewardValue, DURATION).then(tx => tx.wait());
      await factory.deployStakingRewardsForPool(token2.address, rewardValue, DURATION).then(tx => tx.wait());
      expect((await factory.stakingRewardsInfoByStakingToken(token1.address)).rewardAmount.eq(rewardValue)).to.be.true;
      expect((await factory.stakingRewardsInfoByStakingToken(token2.address)).rewardAmount.eq(rewardValue)).to.be.true;
      await factory.notifyRewardAmounts();
      expect((await factory.stakingRewardsInfoByStakingToken(token1.address)).rewardAmount.eq(0)).to.be.true;
      expect((await factory.stakingRewardsInfoByStakingToken(token2.address)).rewardAmount.eq(0)).to.be.true;
    });
  });

  describe('getStakingRewards()', async () => {
    it('Reverts if the staking token provided does not have a rewards pool', async () => {
      await expect(stakingFactory.getStakingRewards(zeroAddress)).to.be.rejectedWith(/StakingRewardsFactory::_getRewards: Not deployed/g);
    });
  });

  describe('deployStakingRewardsForPool()', async () => {
    it('Only allows owner to call deployStakingRewardsForPool', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.connect(signer1).deployStakingRewardsForPool(zeroAddress, rewardValue, DURATION)
      ).to.be.rejectedWith(/Ownable: caller is not the owner/g);
    });

    it('Reverts if the staking token is not an index lp token', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPool(zeroAddress, rewardValue, DURATION)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPool: Not an index pool/g);
    });

    it('Allows the owner to deploy a staking pool for an index lp token', async () => {
      await mockPoolFactory.addIPool(stakingToken.address);
      const rewardValue = expandTo18Decimals(100);
      const retAddr = await stakingFactory.callStatic.deployStakingRewardsForPool(stakingToken.address, rewardValue, DURATION);
      console.log(`Returned address ${retAddr}`);

      const {events} = await stakingFactory.deployStakingRewardsForPool(stakingToken.address, rewardValue, DURATION).then(tx => tx.wait());
      const { args } = events.filter(e => e.event == 'IndexPoolStakingRewardsAdded')[0];
      expect(args.stakingToken).to.eq(stakingToken.address);
      stakingRewards = args.stakingRewards;
      console.log(`Event address ${retAddr}`);
    });

    it('Fails duplicate deployment without calling proxy manager', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPool(stakingToken.address, rewardValue, DURATION)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPool: Already deployed/g);
    });

    describe('Staking Info', async () => {
      it('computeStakingRewardsAddress()', async () => {
        const expected = stakingRewards;
        const actual = await stakingFactory.computeStakingRewardsAddress(stakingToken.address);
        expect(expected).to.eq(actual);
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
        expect(stakingInfo.rewardAmount.eq(expandTo18Decimals(100))).to.be.true;
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
        ).to.be.rejectedWith(/StakingRewardsFactory::_getRewards: Not deployed/g);
      });
  
      it('Notifies the pool of its rewards if there are pending rewards', async () => {
        const receipt = await stakingFactory.notifyRewardAmount(stakingToken.address).then(tx => tx.wait());
        const { timestamp } = await provider.getBlock(receipt.blockHash);
        const duration = 60*24*60*60;
        const expectedRate = expandTo18Decimals(100).div(duration);
        const expectedFinish = timestamp + duration;
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const actualRate = await stakingPool.rewardRate();
        expect(actualRate.eq(expectedRate)).to.be.true;
        const actualFinish = await stakingPool.periodFinish();
        expect(actualFinish.eq(expectedFinish)).to.be.true;
      });

      it('Does nothing if there are no pending rewards', async () => {
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const initialRate = await stakingPool.rewardRate();
        await stakingFactory.notifyRewardAmount(stakingToken.address);
        const rateAfter = await stakingPool.rewardRate();
        expect(initialRate.eq(rateAfter)).to.be.true;
      });
    });
    
    describe('setRewardsDuration()', async () => {
      it('Reverts if not called by owner', async () => {
        await expect(
          stakingFactory.connect(signer1).setRewardsDuration(stakingToken.address, DURATION / 2)
        ).to.be.rejectedWith(/Ownable: caller is not the owner/g);
      });

      it('Reverts if stakingToken has no pool', async () => {
        await expect(
          stakingFactory.setRewardsDuration(zeroAddress, DURATION / 2)
        ).to.be.rejectedWith(/StakingRewardsFactory::_getRewards: Not deployed/g);
      });

      it('Updates the duration', async () => {
        await fastForward(provider, DURATION + 1);
        const rewards = await ethers.getContractAt('IStakingRewards', stakingRewards);
        const duration = await rewards.rewardsDuration();
        expect(duration.eq(DURATION)).to.be.true;
        await stakingFactory.setRewardsDuration(stakingToken.address, DURATION / 2);
        const newDuration = await rewards.rewardsDuration();
        expect(newDuration.eq(DURATION / 2)).to.be.true;
      });
    });
  });

  describe('recoverERC20()', async () => {
    let recoveryToken, target;

    before(async () => {
      target = await owner.getAddress();
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      recoveryToken = await MockERC20.deploy('Recovery Token', 'RCT');
    });

    it('Reverts if token is rewards or staking token', async () => {
      await expect(
        stakingFactory.recoverERC20(stakingToken.address, stakingToken.address)
      ).to.be.rejectedWith(/Cannot withdraw the staking or rewards tokens/g);
      await expect(
        stakingFactory.recoverERC20(stakingToken.address, rewardsToken.address)
      ).to.be.rejectedWith(/Cannot withdraw the staking or rewards tokens/g);
    });

    it('Recovers tokens', async () => {
      await recoveryToken.getFreeTokens(stakingRewards, expandTo18Decimals(1000));
      await stakingFactory.recoverERC20(stakingToken.address, recoveryToken.address);
      const balance = await recoveryToken.balanceOf(target);
      expect(balance.eq(expandTo18Decimals(1000))).to.be.true;
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
        stakingFactory.connect(signer1).deployStakingRewardsForPoolUniswapPair(zeroAddress, rewardValue, DURATION)
      ).to.be.rejectedWith(/Ownable: caller is not the owner/g);
    });

    it('Reverts if the staking token is not an index lp token', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPoolUniswapPair(zeroAddress, rewardValue, DURATION)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPoolUniswapPair: Not an index pool/g);
    });

    // the following 2 tests are not really necessary given the structure of the real pool factory
    // but they get coverage to 100%

    it('Reverts if index token is null address', async () => {
      await mockPoolFactory.addIPool(zeroAddress);
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPoolUniswapPair(zeroAddress, rewardValue, DURATION)
      ).to.be.rejectedWith(/UniswapV2Library: ZERO_ADDRESS/g);
    });

    it('Reverts if token is weth', async () => {
      await mockPoolFactory.addIPool(weth.address);
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPoolUniswapPair(weth.address, rewardValue, DURATION)
      ).to.be.rejectedWith(/UniswapV2Library: IDENTICAL_ADDRESSES/g);
    });

    it('Allows the owner to deploy a staking pool for an index lp token <-> weth uniswap pair', async () => {
      const rewardValue = expandTo18Decimals(100);
      const {events} = await stakingFactory.deployStakingRewardsForPoolUniswapPair(stakingToken.address, rewardValue, DURATION).then(tx => tx.wait());
      const { args } = events.filter(e => e.event == 'UniswapStakingRewardsAdded')[0];
      expect(args.stakingToken).to.eq(pairAddress);
      expect(args.indexPool).to.eq(stakingToken.address);
      stakingRewards = args.stakingRewards;
    });

    it('Fails duplicate deployment without calling proxy manager', async () => {
      const rewardValue = expandTo18Decimals(100);
      await expect(
        stakingFactory.deployStakingRewardsForPoolUniswapPair(stakingToken.address, rewardValue, DURATION)
      ).to.be.rejectedWith(/StakingRewardsFactory::deployStakingRewardsForPoolUniswapPair: Already deployed/g);
    });

    describe('Staking Info', async () => {
      it('computeStakingRewardsAddress()', async () => {
        const expected = stakingRewards;
        const actual = await stakingFactory.computeStakingRewardsAddress(pairAddress);
        expect(expected).to.eq(actual);
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
        expect(stakingInfo.rewardAmount.eq(expandTo18Decimals(100))).to.be.true;
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
        ).to.be.rejectedWith(/StakingRewardsFactory::_getRewards: Not deployed/g);
      });
  
      it('Notifies the pool of its rewards if there are pending rewards', async () => {
        const receipt = await stakingFactory.notifyRewardAmount(pairAddress).then(tx => tx.wait());
        const { timestamp } = await provider.getBlock(receipt.blockHash);
        const duration = 60*24*60*60;
        const expectedRate = expandTo18Decimals(100).div(duration);
        const expectedFinish = timestamp + duration;
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const actualRate = await stakingPool.rewardRate();
        expect(actualRate.eq(expectedRate)).to.be.true;
        const actualFinish = await stakingPool.periodFinish();
        expect(actualFinish.eq(expectedFinish)).to.be.true;
      });

      it('Does nothing if there are no pending rewards', async () => {
        const stakingPool = await ethers.getContractAt('StakingRewards', stakingRewards);
        const initialRate = await stakingPool.rewardRate();
        await stakingFactory.notifyRewardAmount(pairAddress);
        const rateAfter = await stakingPool.rewardRate();
        expect(initialRate.eq(rateAfter)).to.be.true;
      });
    });
  });

  describe('increaseStakingRewards', async () => {
    let token, pool, rewardValue, factory;
    before(async () => {
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      token = await MockERC20.deploy('Staking Token', 'STK');
      await mockPoolFactory.addIPool(token.address);

      rewardValue = expandTo18Decimals(100);
      await rewardsToken.transfer(stakingFactory.address, rewardValue);
      const {events} = await stakingFactory.deployStakingRewardsForPool(token.address, rewardValue, DURATION).then(tx => tx.wait());
      const { args } = events.filter(e => e.event == 'IndexPoolStakingRewardsAdded')[0];
      pool = args.stakingRewards;
    });

    it('Can only be called by owner', async () => {
      await expect(
        stakingFactory.connect(signer1).increaseStakingRewards(token.address, 1)
      ).to.be.rejectedWith(/Ownable: caller is not the owner/g);
    })

    it('Reverts if amount is zero', async () => {
      await expect(
        stakingFactory.increaseStakingRewards(zeroAddress, 0)
      ).to.be.rejectedWith(/StakingRewardsFactory::increaseStakingRewards: Can not add 0 rewards\./g);
    });

    it('Reverts if pool does not exist', async () => {
      await expect(
        stakingFactory.increaseStakingRewards(zeroAddress, 1)
      ).to.be.rejectedWith(/StakingRewardsFactory::_getRewards: Not deployed/g);
    });

    it('Reverts if pool has pending rewards', async () => {
      await expect(
        stakingFactory.increaseStakingRewards(token.address, rewardValue)
      ).to.be.rejectedWith(/StakingRewardsFactory::increaseStakingRewards: Can not add rewards while pool still has pending rewards\./g);
      await token.getFreeTokens(stakingFactory.address, rewardValue);
    });

    it('Reverts if pool is still active', async () => {
      await stakingFactory.notifyRewardAmount(token.address);
      await expect(
        stakingFactory.increaseStakingRewards(token.address, rewardValue)
      ).to.be.rejectedWith(/StakingRewardsFactory::increaseStakingRewards: Previous rewards period must be complete to add rewards\./g)
    });

    it('Reverts if factory has insufficient balance', async () => {
      await fastForward(provider, DURATION);
      await expect(
        stakingFactory.increaseStakingRewards(token.address, expandTo18Decimals(1e5))
      ).to.be.rejectedWith(/Ndx::_transferTokens: transfer amount exceeds balance/g);
    });

    it('Succeeds when the pool is finished', async () => {
      const poolContract = await ethers.getContractAt('IStakingRewards', pool);
      const rewardRate = await poolContract.rewardRate();
      await rewardsToken.transfer(stakingFactory.address, rewardValue.mul(2));
      await stakingFactory.increaseStakingRewards(token.address, rewardValue.mul(2));
      const rewardRate2 = await poolContract.rewardRate();
      expect(rewardRate2.eq(rewardRate.mul(2))).to.be.true;
    });
  });
});