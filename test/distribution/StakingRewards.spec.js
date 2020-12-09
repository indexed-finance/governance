const chai = require('chai');
const { BigNumber } = require("ethers");
const { formatEther } = require('ethers/lib/utils');

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
      await expect(rewards.initialize(zeroAddress, DURATION)).to.be.rejectedWith(/Can not set null staking token/g);
    });

    it('does not allow zero duration', async () => {
      await expect(rewards.initialize(stakingToken.address, 0)).to.be.rejectedWith(/Can not set null rewards duration/g);
    });

    it('sets the staking token', async () => {
      await rewards.initialize(stakingToken.address, DURATION);
    });

    it('can not be initialized twice', async () => {
      await expect(rewards.initialize(stakingToken.address, DURATION)).to.be.rejectedWith(/Already initialized/g);
    });
  });

  describe('Constructor & Initializer', () => {
		it('should set rewards token on constructor', async () => {
      expect(await rewards.rewardsToken()).to.eq(rewardsToken.address);
		});

		it('should set rewardsDistribution on constructor', async () => {
      expect(await rewards.rewardsDistribution()).to.eq(await owner.getAddress());
		});

		it('should set staking token on initialize', async () => {
      expect(await rewards.stakingToken()).to.eq(stakingToken.address);
		});

		it('should set rewardsDuration on initialize', async () => {
      expect((await rewards.rewardsDuration()).eq(DURATION)).to.be.true;
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
      const stakerAddress = await stakingAccount2.getAddress();
			const initialRewardBal = await rewardsToken.balanceOf(stakerAddress);
			await rewards.connect(stakingAccount2).getReward();
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
      await localStakingRewards.initialize(stakingToken.address, DURATION);
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

  describe('recoverERC20', async () => {
    let recoveryToken, target;

    before(async () => {
      target = await stakingAccount1.getAddress();
      const MockERC20 = await ethers.getContractFactory('MockERC20');
      recoveryToken = await MockERC20.deploy('Recovery Token', 'RCT');
    });

    it('Reverts if not called by owner', async () => {
      await expect(
        rewards.connect(stakingAccount1).recoverERC20(recoveryToken.address, target)
      ).to.be.rejectedWith(/Caller is not RewardsDistribution contract/g);
    });

    it('Reverts if token is rewards or staking token', async () => {
      await expect(
        rewards.recoverERC20(stakingToken.address, target)
      ).to.be.rejectedWith(/Cannot withdraw the staking or rewards tokens/g);
      await expect(
        rewards.recoverERC20(rewardsToken.address, target)
      ).to.be.rejectedWith(/Cannot withdraw the staking or rewards tokens/g);
    });

    it('Recovers tokens', async () => {
      await recoveryToken.getFreeTokens(rewards.address, expandTo18Decimals(1000));
      await rewards.recoverERC20(recoveryToken.address, target);
      const balance = await recoveryToken.balanceOf(target);
      expect(balance.eq(expandTo18Decimals(1000))).to.be.true;
    });
  });
  
  describe('setRewardsDuration()', () => {
    let localStakingRewards;
    let nonOwnerLocalStakingRewards;
    let nonOwnerStakingToken;

		const sevenDays = DAY * 7;
		const seventyDays = DAY * 70;

		beforeEach(async () => {
      const StakingRewards = await ethers.getContractFactory('StakingRewards');
      localStakingRewards = await StakingRewards.deploy(await owner.getAddress(), rewardsToken.address);
      await localStakingRewards.initialize(stakingToken.address, sevenDays);
      nonOwnerLocalStakingRewards = localStakingRewards.connect(stakingAccount1);
      nonOwnerStakingToken = stakingToken.connect(stakingAccount1);
    });

    it('should revert if not called by owner', async () => {
      await expect(
        nonOwnerLocalStakingRewards.setRewardsDuration(0)
      ).to.be.rejectedWith(/Caller is not RewardsDistribution contract/g);
    })

		it('should increase rewards duration before starting distribution', async () => {
			const oldDuration = await localStakingRewards.rewardsDuration();
			expect(oldDuration.eq(sevenDays)).to.be.true;

			await localStakingRewards.setRewardsDuration(seventyDays);
			const newDuration = await localStakingRewards.rewardsDuration();
			expect(newDuration.eq(seventyDays)).to.be.true;
		});

    it('should revert when setting setRewardsDuration before the period has finished', async () => {
			const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);
 

      await stakingToken.getFreeTokens(await stakingAccount1.getAddress(), totalToStake)
			await nonOwnerStakingToken.approve(localStakingRewards.address, totalToStake);
			await nonOwnerLocalStakingRewards.stake(totalToStake);

			await rewardsToken.getFreeTokens(localStakingRewards.address, totalToDistribute);
			await localStakingRewards.notifyRewardAmount(totalToDistribute);

      await fastForward(provider, DAY);

      await expect(
        localStakingRewards.setRewardsDuration(seventyDays)
      ).to.be.rejectedWith(/Previous rewards period must be complete before changing the duration for the new period/g);
    });

		it('should update when setting setRewardsDuration after the period has finished', async () => {
			const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

			await stakingToken.getFreeTokens(await stakingAccount1.getAddress(), totalToStake);
			await nonOwnerStakingToken.approve(localStakingRewards.address, totalToStake);
			await nonOwnerLocalStakingRewards.stake(totalToStake);

			await rewardsToken.getFreeTokens(localStakingRewards.address, totalToDistribute);
			await localStakingRewards.notifyRewardAmount(totalToDistribute);

			await fastForward(provider, DAY * 80);

      const { events } = await localStakingRewards.setRewardsDuration(sevenDays).then(tx => tx.wait());
      expect(events.find(e => e.event == 'RewardsDurationUpdated').args.newDuration.eq(sevenDays)).to.be.true;

      const newDuration = await localStakingRewards.rewardsDuration();
      expect(newDuration.eq(sevenDays)).to.be.true;

			await localStakingRewards.notifyRewardAmount(totalToDistribute);
		});

		it('should update when setting setRewardsDuration after the period has finished', async () => {
			const totalToStake = expandTo18Decimals(100);
      const totalToDistribute = expandTo18Decimals(5000);

			await stakingToken.getFreeTokens(await stakingAccount1.getAddress(), totalToStake);
			await nonOwnerStakingToken.approve(localStakingRewards.address, totalToStake);
			await nonOwnerLocalStakingRewards.stake(totalToStake);

			await rewardsToken.getFreeTokens(localStakingRewards.address, totalToDistribute);
			await localStakingRewards.notifyRewardAmount(totalToDistribute);

			await fastForward(provider, DAY * 4);
			await nonOwnerLocalStakingRewards.getReward();
			await fastForward(provider, DAY * 4);

			// New Rewards period much lower
			await rewardsToken.getFreeTokens(localStakingRewards.address, totalToDistribute);
      const { events } = await localStakingRewards.setRewardsDuration(seventyDays).then(tx => tx.wait());
      expect(events.find(e => e.event == 'RewardsDurationUpdated').args.newDuration.eq(seventyDays)).to.be.true;

			const newDuration = await localStakingRewards.rewardsDuration();
      expect(newDuration.eq(seventyDays)).to.be.true;

			await localStakingRewards.notifyRewardAmount(totalToDistribute);

			await fastForward(provider, DAY * 71);
			await nonOwnerLocalStakingRewards.getReward();
		});
	});
});