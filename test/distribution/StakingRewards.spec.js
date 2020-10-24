const chai = require('chai');
const { BigNumber } = require("ethers");

chai.use(require('chai-as-promised'));
const { expect } = chai;
const { provider } = ethers;
const { expandTo18Decimals, fastForward } = require('../utils')

describe('distribution:StakingRewards', async () => {
  let stakingToken, rewardsToken, rewards;
  let owner, stakingAccount1, stakingAccount2;

  const DAY = 86400;
  const DURATION = 60 * DAY;
  const ZERO_BN = BigNumber.from(0);
  const zeroAddress = `0x${'00'.repeat(20)}`;

  before(async () => {
    ([owner, stakingAccount1, stakingAccount2] = await ethers.getSigners());
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    stakingToken = await MockERC20.deploy("MockToken", "MTK");
    rewardsToken = await MockERC20.deploy("Indexed Governance Token", "NDX");
    await rewardsToken.deployed();
    const StakingRewards = await ethers.getContractFactory('StakingRewards');
    rewards = await StakingRewards.deploy(await owner.getAddress(), rewardsToken.address);
    await rewards.deployed();
  });

  describe('Initialization', async () => {
    it('does not allow null staking token', async () => {
      await expect(rewards.initialize(zeroAddress)).to.be.rejectedWith(/Can not set null staking token/g);
    });

    it('sets the staking token', async () => {
      await rewards.initialize(stakingToken.address);
    });

    it('can not be initialized twice', async () => {
      await expect(rewards.initialize(stakingToken.address)).to.be.rejectedWith(/Already initialized/g);
    });
  });

  describe('Constructor & Settings', () => {
		it('should set rewards token on constructor', async () => {
      expect(await rewards.rewardsToken()).to.eq(rewardsToken.address);
		});

		it('should set staking token on initialize', async () => {
      expect(await rewards.stakingToken()).to.eq(stakingToken.address);
		});

		it('should set rewardsDistribution on constructor', async () => {
      expect(await rewards.rewardsDistribution()).to.eq(await owner.getAddress());
		});
  });

  describe('Function permissions', () => {
    const rewardValue = expandTo18Decimals(100);
    before(async () => {
      await rewardsToken.getFreeTokens(rewards.address, rewardValue);
    });

    it('only owner can call notifyRewardAmount', async () => {
      await expect(
        rewards.connect(stakingAccount1).notifyRewardAmount(rewardValue)
      ).to.be.rejectedWith(/Caller is not RewardsDistribution contract/g);

      await rewards.callStatic.notifyRewardAmount(rewardValue);
    });
  });

  describe('lastTimeRewardApplicable()', () => {
		it('should return 0', async () => {
      expect((await rewards.lastTimeRewardApplicable()).toNumber()).to.eq(0);
		});

		describe('when updated', () => {
			it('should equal current timestamp', async () => {
				await rewards.notifyRewardAmount(expandTo18Decimals(100));

        const { timestamp: now } = await provider.getBlock('latest');
				const lastTimeReward = await rewards.lastTimeRewardApplicable();

				expect(now.toString()).to.eq(lastTimeReward.toString());
			});
		});
  });

  describe('rewardPerToken()', () => {
		it('should return 0', async () => {
      expect((await rewards.rewardPerToken()).eq(ZERO_BN)).to.be.true;
		});

		it('should be > 0', async () => {
      const totalToStake = expandTo18Decimals(100);
      await stakingToken.getFreeTokens(await stakingAccount1.getAddress(), totalToStake);
      const _stakingToken = stakingToken.connect(stakingAccount1);
      await _stakingToken.approve(rewards.address, totalToStake);
      const _rewards = rewards.connect(stakingAccount1);
			await _rewards.stake(totalToStake);

      const totalSupply = await rewards.totalSupply();
      expect(totalSupply.gt(ZERO_BN)).to.be.true;

			const rewardValue = expandTo18Decimals(5000);
			await rewardsToken.getFreeTokens(rewards.address, rewardValue);
			await rewards.notifyRewardAmount(rewardValue);

			await fastForward(provider, DAY);

      const rewardPerToken = await rewards.rewardPerToken();
      expect(rewardPerToken.gt(ZERO_BN)).to.be.true;
		});
  });
  

	describe('stake()', () => {
		it('staking increases staking balance', async () => {
      const totalToStake = expandTo18Decimals(100);
      const stakerAddress = await stakingAccount1.getAddress();
      await stakingToken.getFreeTokens(stakerAddress, totalToStake);
      stakingToken.connect(stakingAccount1).approve(rewards.address, totalToStake);

			const initialStakeBal = await rewards.balanceOf(stakerAddress);
			const initialLpBal = await stakingToken.balanceOf(stakerAddress);

			await rewards.connect(stakingAccount1).stake(totalToStake);

			const postStakeBal = await rewards.balanceOf(stakerAddress);
			const postLpBal = await stakingToken.balanceOf(stakerAddress);
      expect(postLpBal.lt(initialLpBal)).to.be.true;
      expect(postStakeBal.gt(initialStakeBal)).to.be.true;
		});

		it('cannot stake 0', async () => {
      await expect(rewards.stake(0)).to.be.rejectedWith(/Cannot stake 0/g);
		});
  });
  
  describe('earned()', () => {
		it('should be 0 when not staking', async () => {
      const stakerAddress = await stakingAccount2.getAddress();
      const earned = await rewards.earned(stakerAddress)
			expect(earned.eq(ZERO_BN)).to.be.true;
		});

		it('should be > 0 when staking', async () => {
      const totalToStake = expandTo18Decimals(100);
      const stakerAddress = await stakingAccount1.getAddress();
			await stakingToken.getFreeTokens(stakerAddress, totalToStake);
			await stakingToken.connect(stakingAccount1).approve(rewards.address, totalToStake);
			await rewards.connect(stakingAccount1).stake(totalToStake);

			const rewardValue = expandTo18Decimals(5000);
			await rewardsToken.getFreeTokens(rewards.address, rewardValue);
			await rewards.notifyRewardAmount(rewardValue);

			await fastForward(provider, DAY);

			const earned = await rewards.earned(stakerAddress);

      expect(earned.gt(ZERO_BN)).to.be.true;
		});

		it('rewardRate should increase if new rewards come before DURATION ends', async () => {
			const totalToDistribute = expandTo18Decimals(5000);

			await rewardsToken.getFreeTokens(rewards.address, totalToDistribute);
			await rewards.notifyRewardAmount(totalToDistribute);

			const rewardRateInitial = await rewards.rewardRate();

			await rewardsToken.getFreeTokens(rewards.address, totalToDistribute);
			await rewards.notifyRewardAmount(totalToDistribute);

			const rewardRateLater = await rewards.rewardRate();
      expect(rewardRateInitial.gt(ZERO_BN)).to.be.true;
      expect(rewardRateLater.gt(rewardRateInitial)).to.be.true;
		});

		it('rewards token balance should rollover after DURATION', async () => {
      const stakerAddress = await stakingAccount1.getAddress();
			const totalToStake = expandTo18Decimals(100);
			const totalToDistribute = expandTo18Decimals(5000);

			await stakingToken.getFreeTokens(stakerAddress, totalToStake);
			await stakingToken.connect(stakingAccount1).approve(rewards.address, totalToStake);
			await rewards.connect(stakingAccount1).stake(totalToStake);

			await rewardsToken.getFreeTokens(rewards.address, totalToDistribute);
			await rewards.notifyRewardAmount(totalToDistribute);

			await fastForward(provider, DURATION);
			const earnedFirst = await rewards.earned(stakerAddress);

			await rewardsToken.getFreeTokens(rewards.address, totalToDistribute);
			await rewards.notifyRewardAmount(totalToDistribute);

			await fastForward(provider, DAY * 7);
			const earnedSecond = await rewards.earned(stakerAddress);
      expect(earnedSecond.eq(earnedFirst.mul(2)));
		});
  });
  

	describe('getReward()', () => {
		it('should increase rewards token balance', async () => {
      const stakerAddress = await stakingAccount1.getAddress();
			const totalToStake = expandTo18Decimals('100');
			const totalToDistribute = expandTo18Decimals('5000');

			await stakingToken.getFreeTokens(stakerAddress, totalToStake);
			await stakingToken.connect(stakingAccount1).approve(rewards.address, totalToStake);
			await rewards.connect(stakingAccount1).stake(totalToStake);

			await rewardsToken.getFreeTokens(rewards.address, totalToDistribute);
			await rewards.notifyRewardAmount(totalToDistribute);

			await fastForward(provider, DAY);

			const initialRewardBal = await rewardsToken.balanceOf(stakerAddress);
			const initialEarnedBal = await rewards.earned(stakerAddress);
			await rewards.connect(stakingAccount1).getReward();
			const postRewardBal = await rewardsToken.balanceOf(stakerAddress);
			const postEarnedBal = await rewards.earned(stakerAddress);
      expect(postEarnedBal.lt(initialEarnedBal)).to.be.true;
      expect(postRewardBal.gt(initialRewardBal)).to.be.true;
    });
    
    it('gives nothing for user with no owed rewards', async () => {
      const stakerAddress = await stakingAccount1.getAddress();
			const initialRewardBal = await rewardsToken.balanceOf(stakerAddress);
			await rewards.connect(stakingAccount1).getReward();
			const postRewardBal = await rewardsToken.balanceOf(stakerAddress);
      expect(postRewardBal.eq(initialRewardBal)).to.be.true;
    });
  });
  
  describe('getRewardForDuration()', () => {
		it('should increase rewards token balance', async () => {
			const totalToDistribute = expandTo18Decimals('5000');
			await rewardsToken.getFreeTokens(rewards.address, totalToDistribute);
			await rewards.notifyRewardAmount(totalToDistribute);

			const rewardForDuration = await rewards.getRewardForDuration();

			const duration = await rewards.rewardsDuration();
			const rewardRate = await rewards.rewardRate();
      expect(rewardForDuration.gt(ZERO_BN)).to.be.true;
      expect(rewardForDuration.eq(duration.mul(rewardRate))).to.be.true;
		});
  });
  
  describe('withdraw()', () => {
		it('cannot withdraw if nothing staked', async () => {
      await expect(rewards.withdraw(expandTo18Decimals('100'))).to.be.rejectedWith(/SafeMath: subtraction overflow/g);
		});

		it('should increases lp token balance and decreases staking balance', async () => {
      const stakerAddress = await stakingAccount1.getAddress();
			const totalToStake = expandTo18Decimals('100');
			await stakingToken.getFreeTokens(stakerAddress, totalToStake);
			await stakingToken.connect(stakingAccount1).approve(rewards.address, totalToStake);
			await rewards.connect(stakingAccount1).stake(totalToStake);

			const initialStakingTokenBal = await stakingToken.balanceOf(stakerAddress);
			const initialStakeBal = await rewards.balanceOf(stakerAddress);

			await rewards.connect(stakingAccount1).withdraw(totalToStake);

			const postStakingTokenBal = await stakingToken.balanceOf(stakerAddress);
			const postStakeBal = await rewards.balanceOf(stakerAddress);

      expect((postStakeBal.add(totalToStake)).eq(initialStakeBal)).to.be.true;
      expect((initialStakingTokenBal.add(totalToStake)).eq(postStakingTokenBal)).to.be.true;
		});

		it('cannot withdraw 0', async () => {
      await expect(rewards.withdraw(0)).to.be.rejectedWith(/Cannot withdraw 0/g);
		});
  });
  
  describe('exit()', () => {
		it('should retrieve all earned and increase rewards bal', async () => {
      const stakerAddress = await stakingAccount1.getAddress();
			const totalToStake = expandTo18Decimals('100');
			const totalToDistribute = expandTo18Decimals('5000');

			await stakingToken.getFreeTokens(stakerAddress, totalToStake);
			await stakingToken.connect(stakingAccount1).approve(rewards.address, totalToStake);
			await rewards.connect(stakingAccount1).stake(totalToStake);

			await rewardsToken.getFreeTokens(rewards.address, totalToDistribute);
			await rewards.notifyRewardAmount(expandTo18Decimals(5000));

			await fastForward(provider, DAY);

			const initialRewardBal = await rewardsToken.balanceOf(stakerAddress);
			const initialEarnedBal = await rewards.earned(stakerAddress);
			await rewards.connect(stakingAccount1).exit();
			const postRewardBal = await rewardsToken.balanceOf(stakerAddress);
      const postEarnedBal = await rewards.earned(stakerAddress);

      expect(postEarnedBal.lt(initialEarnedBal)).to.be.true;
      expect(postRewardBal.gt(initialRewardBal)).to.be.true;
      expect(postEarnedBal.eq(ZERO_BN)).to.be.true;
		});
  });
  
  describe('notifyRewardAmount()', () => {
		let localStakingRewards;

		before(async () => {
      const StakingRewards = await ethers.getContractFactory('StakingRewards');
      localStakingRewards = await StakingRewards.deploy(await owner.getAddress(), rewardsToken.address);
      await localStakingRewards.initialize(stakingToken.address);
		});

		it('Reverts if the provided reward is greater than the balance.', async () => {
			const rewardValue = expandTo18Decimals(1000);
      await rewardsToken.getFreeTokens(localStakingRewards.address, rewardValue);
      await expect(
        localStakingRewards.notifyRewardAmount(rewardValue.add(expandTo18Decimals(1).div(10)))
      ).to.be.rejectedWith(/Provided reward too high/g);
		});

		it('Reverts if the provided reward is greater than the balance, plus rolled-over balance.', async () => {
			const rewardValue = expandTo18Decimals(1000);
			await rewardsToken.getFreeTokens(localStakingRewards.address, rewardValue);
			await localStakingRewards.notifyRewardAmount(rewardValue);
      await rewardsToken.getFreeTokens(localStakingRewards.address, rewardValue);
      const dur = await localStakingRewards.rewardsDuration();
      const fin = await localStakingRewards.periodFinish();
      const rate = await localStakingRewards.rewardRate();
      const { timestamp: now } = await provider.getBlock('latest');
      const timestamp = BigNumber.from(now);
      const remaining = fin.sub(timestamp);
      const leftover = remaining.mul(rate);
      const rate2 = (rewardValue.add(leftover)).div(dur);
      const balRate = expandTo18Decimals(3000).div(dur);
      const addAmount = (balRate.sub(rate2)).mul(dur).mul(2);
      await expect(
        localStakingRewards.notifyRewardAmount(rewardValue.add(addAmount))
      ).to.be.rejectedWith(/Provided reward too high/g);
		});
	});
});