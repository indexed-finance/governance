pragma solidity ^0.6.0;

/* ---  External Interfaces  --- */
import "@indexed-finance/proxies/contracts/interfaces/IDelegateCallProxyManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/* ---  External Libraries  --- */
import { SaltyLib as Salty } from  "@indexed-finance/proxies/contracts/SaltyLib.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@uniswap/v2-periphery/contracts/libraries/UniswapV2Library.sol";

/* ---  Internal Interfaces  --- */
import "../interfaces/IPoolFactory.sol";
import "../interfaces/IStakingRewards.sol";

/* ---  Inheritance  --- */
import "../lib/Owned.sol";


contract StakingRewardsFactory is Owned {
  using SafeMath for uint;

/* ---  Constants  --- */
  bytes32 public constant STAKING_REWARDS_IMPLEMENTATION_ID = keccak256("StakingRewards.sol");
  uint256 internal constant POINTS_MULTIPLIER = 10**18;

/* ---  Immutables  --- */
  IPoolFactory public immutable poolFactory;
  IDelegateCallProxyManager public immutable proxyManager;
  address public immutable rewardsToken;
  address public immutable uniswapFactory;
  address public immutable weth;

/* ---  Events  --- */
  event RewardsUpdated(address stakingPool, uint256 rewardsAdded);

/* ---  Structs  --- */
  struct RewardsData {
    uint96 totalRewards;
    uint160 totalRewardPoints;
  }

/* ---  Storage  --- */

  /**
   * @dev The staking tokens for which the rewards contract has been deployed.
   */
  address[] public stakingTokens;

  /**
   * @dev Metadata about all distributions.
   */
  RewardsData internal _rewards;

  /**
   * @dev Total points claimed by each staking pool.
   */
  mapping(address => uint256) internal _lastRewardPoints;

/* ---  Constructor  --- */
  constructor(
    address owner_,
    address rewardsToken_,
    uint stakingRewardsGenesis_,
    address proxyManager_,
    address poolFactory_,
    address uniswapFactory_,
    address weth_
  ) public Owned(owner_) {
    rewardsToken = rewardsToken_;
    stakingRewardsGenesis = stakingRewardsGenesis_;
    proxyManager = IDelegateCallProxyManager(proxyManager_);
    poolFactory = IPoolFactory(poolFactory_);
    uniswapFactory = uniswapFactory_;
    weth = weth_;
  }

  function deployStakingPoolForIndex(address indexPool) external _owner_ {
    require(poolFactory.isIPool(indexPool), "Error: Not an index pool.");
    bytes32 stakingPoolSalt = keccak256(abi.encode(indexPool));
    address stakingPool = proxyManager.deployProxyManyToOne(
      STAKING_REWARDS_IMPLEMENTATION_ID,
      stakingPoolSalt
    );
    IStakingRewards(stakingPool).initialize(indexPool);
    stakingTokens.push(indexPool);
    _lastRewardPoints[stakingPool] = _rewards.totalRewardPoints;
  }

  function deployStakingPoolForIndexUniswapPair(address indexPool) external _owner_ {
    require(poolFactory.isIPool(indexPool), "Error: Not an index pool.");
    address pairAddress = UniswapV2Library.pairFor(poolFactory, indexPool, weth);
    bytes32 stakingPoolSalt = keccak256(abi.encode(pairAddress));
    address stakingPool = proxyManager.deployProxyManyToOne(
      STAKING_REWARDS_IMPLEMENTATION_ID,
      stakingPoolSalt
    );
    stakingTokens.push(pairAddress);
    _lastRewardPoints[stakingPool] = _rewards.totalRewardPoints;
  }

/* ---  Reward Actions  --- */

  /**
   * @dev Updates the rewards with new tokens to distribute.
   *
   * Note: This assumes that the maximum total tokens distributed through the
   * rewards contract is less than 2**96 - 1
   */
  function addRewards() external {
    RewardsData memory rewards = _rewards;
    uint256 balance = IERC20(rewardsToken).balanceOf(address(this));
    uint256 amount = balance.sub(rewards.totalRewards);
    require(amount > 0, "Error: No new rewards to distribute.");
    rewards.totalRewards = uint96(balance);
    uint256 newPoints = (amount * POINTS_MULTIPLIER) / stakingTokens.length;
    rewards.totalRewardPoints = uint160(rewards.totalRewardPoints + newPoints);
    _rewards = rewards;
  }

  function notifyRewardAmount(address stakingPool) public {
    RewardsData memory rewards = _rewards;
    uint256 newPoints = rewards.totalRewardPoints.sub(_lastRewardPoints[stakingPool]);
    uint256 owed = newPoints / POINTS_MULTIPLIER;
    _lastRewardPoints[stakingPool] = rewards.totalRewardPoints;
    if (owed > 0) {
      IStakingRewards(stakingPool).notifyRewardAmount(owed);
    }
  }

/* ---  Reward Queries  --- */
  function rewardsOwed(address stakingPool) public view returns (uint256) {
    uint256 newPoints = _rewards.totalRewardPoints.sub(_lastRewardPoints[stakingPool]);
    return newPoints.div(POINTS_MULTIPLIER);
  }

  function getStakingPool(address stakingToken) public view returns (address) {
    return Salty.computeProxyAddressManyToOne(
      address(proxyManager),
      address(this),
      STAKING_REWARDS_IMPLEMENTATION_ID,
      keccak256(abi.encode(stakingToken))
    );
  }
}