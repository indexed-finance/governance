pragma solidity ^0.6.0;

/* ---  External Interfaces  --- */
import "@indexed-finance/proxies/contracts/interfaces/IDelegateCallProxyManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/* ---  External Libraries  --- */
import {SaltyLib as Salty} from "@indexed-finance/proxies/contracts/SaltyLib.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/* ---  Internal Interfaces  --- */
import "../interfaces/IPoolFactory.sol";
import "../interfaces/IStakingRewards.sol";

/* ---  Internal Libraries  --- */
import {UniswapV2AddressLibrary} from "../lib/UniswapV2AddressLibrary.sol";

/* ---  Inheritance  --- */
import "../lib/Owned.sol";

contract StakingRewardsFactory is Owned {
  using SafeMath for uint256;

/* ==========  Constants  ========== */
  /**
   * @dev Used to identify the implementation for staking rewards proxies.
   */
  bytes32 public constant STAKING_REWARDS_IMPLEMENTATION_ID = keccak256(
    "StakingRewards.sol"
  );

  /* ==========  Immutables  ========== */
  /**
   * @dev Address of the pool factory - used to verify staking token eligibility.
   */
  IPoolFactory public immutable poolFactory;

  /**
   * @dev The address of the proxy manager - used to deploy staking pools.
   */
  IDelegateCallProxyManager public immutable proxyManager;

  /**
   * @dev The address of the token to distribute.
   */
  address public immutable rewardsToken;

  /**
   * @dev The address of the Uniswap factory - used to compute the addresses
   * of Uniswap pairs eligible for distribution.
   */
  address public immutable uniswapFactory;

  /**
   * @dev The address of the wrapped ether token - used to identify
   * Uniswap pairs eligible for distribution.
   */
  address public immutable weth;

  /**
   * @dev Timestamp at which staking begins.
   */
  uint256 public immutable stakingRewardsGenesis;

  /* ==========  Events  ========== */
  event StakingRewardsAdded(address stakingToken, address stakingRewards);

  /* ==========  Structs  ========== */
  enum StakingTokenType { NDX_POOL_UNISWAP_PAIR, NDX_POOL }

  struct StakingRewardsInfo {
    StakingTokenType tokenType;
    address stakingRewards;
    uint88 rewardAmount;
  }

  /* ==========  Storage  ========== */

  /**
   * @dev The staking tokens for which the rewards contract has been deployed.
   */
  address[] public stakingTokens;

  /**
   * @dev Rewards info by staking token.
   */
  mapping(address => StakingRewardsInfo) public stakingRewardsInfoByStakingToken;

  /* ==========  Constructor  ========== */
  constructor(
    address owner_,
    address rewardsToken_,
    uint256 stakingRewardsGenesis_,
    address proxyManager_,
    address poolFactory_,
    address uniswapFactory_,
    address weth_
  ) public Owned(owner_) {
    rewardsToken = rewardsToken_;
    require(
      stakingRewardsGenesis_ >= block.timestamp,
      "StakingRewardsFactory::constructor: genesis too soon"
    );
    stakingRewardsGenesis = stakingRewardsGenesis_;
    proxyManager = IDelegateCallProxyManager(proxyManager_);
    poolFactory = IPoolFactory(poolFactory_);
    uniswapFactory = uniswapFactory_;
    weth = weth_;
  }

  /* ==========  Pool Deployment  ==========  */
  // Pool deployment functions are permissioned.

  /**
   * @dev Deploys a staking pool for the LP token of an index pool.
   *
   * Verifies that the staking token is the address of a pool deployed by the
   * Indexed pool factory.
   */
  function deployStakingRewardsForPool(address indexPool, uint88 rewardAmount)
    external
    _owner_
  {

    StakingRewardsInfo storage info = stakingRewardsInfoByStakingToken[indexPool];
    require(
      info.stakingRewards == address(0),
      "StakingRewardsFactory::deployStakingRewardsForPool: Already deployed"
    );
    require(
      poolFactory.isIPool(indexPool),
      "StakingRewardsFactory::deployStakingRewardsForPool: Not an index pool."
    );
    bytes32 stakingRewardsSalt = keccak256(abi.encodePacked(indexPool));
    address stakingRewards = proxyManager.deployProxyManyToOne(
      STAKING_REWARDS_IMPLEMENTATION_ID,
      stakingRewardsSalt
    );
    IStakingRewards(stakingRewards).initialize(indexPool);
    info.stakingRewards = stakingRewards;
    info.rewardAmount = rewardAmount;
    info.tokenType = StakingTokenType.NDX_POOL;
    stakingTokens.push(indexPool);
    emit StakingRewardsAdded(indexPool, stakingRewards);
  }

  /**
   * @dev Deploys staking rewards for the LP token of the Uniswap pair between an
   * index pool token and WETH.
   *
   * Verifies that the LP token is the address of a pool deployed by the
   * Indexed pool factory, then uses the address of the Uniswap pair between
   * it and WETH as the staking token.
   */
  function deployStakingRewardsForPoolUniswapPair(
    address indexPool,
    uint88 rewardAmount
  ) external _owner_ {
    require(
      poolFactory.isIPool(indexPool),
      "StakingRewardsFactory::deploystakingRewardsForIndexUniswapPair: Not an index pool."
    );

    address pairAddress = UniswapV2AddressLibrary.pairFor(
      address(poolFactory),
      indexPool,
      weth
    );


    StakingRewardsInfo storage info = stakingRewardsInfoByStakingToken[pairAddress];
    require(
      info.stakingRewards == address(0),
      "StakingRewardsFactory::deployStakingRewardsForPoolUniswapPair: Already deployed"
    );

    bytes32 stakingRewardsSalt = keccak256(abi.encodePacked(pairAddress));
    address stakingRewards = proxyManager.deployProxyManyToOne(
      STAKING_REWARDS_IMPLEMENTATION_ID,
      stakingRewardsSalt
    );

    IStakingRewards(stakingRewards).initialize(indexPool);
    info.stakingRewards = stakingRewards;
    info.rewardAmount = rewardAmount;
    info.tokenType = StakingTokenType.NDX_POOL_UNISWAP_PAIR;
    stakingTokens.push(pairAddress);
  }

  /* ==========  Rewards  ========== */

  function notifyRewardAmounts() public {
    require(
      stakingTokens.length > 0,
      "StakingRewardsFactory::notifyRewardAmounts: called before any deploys"
    );
    for (uint i = 0; i < stakingTokens.length; i++) {
      notifyRewardAmount(stakingTokens[i]);
    }
  }

  function notifyRewardAmount(address stakingToken) public {
    require(
      block.timestamp >= stakingRewardsGenesis,
      "StakingRewardsFactory::notifyRewardAmount: Not ready"
    );

    StakingRewardsInfo storage info = stakingRewardsInfoByStakingToken[stakingToken];
    require(
      info.stakingRewards != address(0),
      "StakingRewardsFactory::notifyRewardAmount: Not deployed"
    );

    if (info.rewardAmount > 0) {
      uint256 rewardAmount = info.rewardAmount;
      info.rewardAmount = 0;

      require(
        IERC20(rewardsToken).transfer(info.stakingRewards, rewardAmount),
        "StakingRewardsFactory::notifyRewardAmount: Transfer failed"
      );
      IStakingRewards(info.stakingRewards).notifyRewardAmount(rewardAmount);
    }
  }

  /* ==========  Queries  ========== */

  function getStakingTokens() external view returns (address[] memory) {
    return stakingTokens;
  }

  function getStakingRewards(address stakingToken) external view returns (address) {
    StakingRewardsInfo storage info = stakingRewardsInfoByStakingToken[stakingToken];
    require(
      info.stakingRewards != address(0),
      "StakingRewardsFactory::getStakingRewards: Not deployed"
    );

    return info.stakingRewards;
  }

  function computeStakingRewardsAddress(address stakingToken) external view returns (address) {
    bytes32 stakingRewardsSalt = keccak256(abi.encodePacked(stakingToken));
    return Salty.computeProxyAddressManyToOne(
      address(proxyManager),
      address(this),
      STAKING_REWARDS_IMPLEMENTATION_ID,
      stakingRewardsSalt
    );
  }
}