pragma solidity ^0.6.0;

/* ==========  External Interfaces  ========== */
import "@indexed-finance/proxies/contracts/interfaces/IDelegateCallProxyManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/* ==========  External Libraries  ========== */
import "@indexed-finance/proxies/contracts/SaltyLib.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/* ==========  External Inheritance  ========== */
import "@openzeppelin/contracts/access/Ownable.sol";

/* ==========  Internal Interfaces  ========== */
import "../interfaces/IPoolFactory.sol";
import "../interfaces/IStakingRewards.sol";

/* ==========  Internal Libraries  ========== */
import "../lib/UniswapV2AddressLibrary.sol";

/* ==========  Internal Inheritance  ========== */
import "../interfaces/IStakingRewardsFactory.sol";


contract StakingRewardsFactory is Ownable, IStakingRewardsFactory {
  using SafeMath for uint256;

/* ==========  Constants  ========== */

  /**
   * @dev Used to identify the implementation for staking rewards proxies.
   */
  bytes32 public override constant STAKING_REWARDS_IMPLEMENTATION_ID = keccak256(
    "StakingRewards.sol"
  );

/* ==========  Immutables  ========== */

  /**
   * @dev Address of the pool factory - used to verify staking token eligibility.
   */
  IPoolFactory public override immutable poolFactory;

  /**
   * @dev The address of the proxy manager - used to deploy staking pools.
   */
  IDelegateCallProxyManager public override immutable proxyManager;

  /**
   * @dev The address of the token to distribute.
   */
  address public override immutable rewardsToken;

  /**
   * @dev The address of the Uniswap factory - used to compute the addresses
   * of Uniswap pairs eligible for distribution.
   */
  address public override immutable uniswapFactory;

  /**
   * @dev The address of the wrapped ether token - used to identify
   * Uniswap pairs eligible for distribution.
   */
  address public override immutable weth;

  /**
   * @dev Timestamp at which staking begins.
   */
  uint256 public override immutable stakingRewardsGenesis;

/* ==========  Events  ========== */

  event UniswapStakingRewardsAdded(
    address indexPool,
    address stakingToken,
    address stakingRewards
  );

  event IndexPoolStakingRewardsAdded(
    address stakingToken,
    address stakingRewards
  );

/* ==========  Structs  ========== */

  enum StakingTokenType { NDX_POOL, NDX_POOL_UNISWAP_PAIR }

  struct StakingRewardsInfo {
    StakingTokenType tokenType;
    address stakingRewards;
    uint88 rewardAmount;
  }

/* ==========  Storage  ========== */

  /**
   * @dev The staking tokens for which a rewards contract has been deployed.
   */
  address[] public override stakingTokens;

  /**
   * @dev Rewards info by staking token.
   */
  mapping(address => StakingRewardsInfo) public stakingRewardsInfoByStakingToken;

/* ==========  Constructor  ========== */

  constructor(
    address rewardsToken_,
    uint256 stakingRewardsGenesis_,
    address proxyManager_,
    address poolFactory_,
    address uniswapFactory_,
    address weth_
  ) public Ownable() {
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
    override
    onlyOwner
    returns (address)
  {

    StakingRewardsInfo storage info = stakingRewardsInfoByStakingToken[indexPool];
    require(
      info.stakingRewards == address(0),
      "StakingRewardsFactory::deployStakingRewardsForPool: Already deployed"
    );
    require(
      poolFactory.isRecognizedPool(indexPool),
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
    emit IndexPoolStakingRewardsAdded(indexPool, stakingRewards);
    return stakingRewards;
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
  )
    external
    override
    onlyOwner
  {
    require(
      poolFactory.isRecognizedPool(indexPool),
      "StakingRewardsFactory::deployStakingRewardsForPoolUniswapPair: Not an index pool."
    );

    address pairAddress = UniswapV2AddressLibrary.pairFor(
      address(uniswapFactory),
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

    IStakingRewards(stakingRewards).initialize(pairAddress);
    info.stakingRewards = stakingRewards;
    info.rewardAmount = rewardAmount;
    info.tokenType = StakingTokenType.NDX_POOL_UNISWAP_PAIR;
    stakingTokens.push(pairAddress);
    emit UniswapStakingRewardsAdded(indexPool, pairAddress, stakingRewards);
  }

/* ==========  Rewards Distribution  ========== */

  function notifyRewardAmounts() public override {
    require(
      stakingTokens.length > 0,
      "StakingRewardsFactory::notifyRewardAmounts: called before any deploys"
    );
    for (uint i = 0; i < stakingTokens.length; i++) {
      notifyRewardAmount(stakingTokens[i]);
    }
  }

  function notifyRewardAmount(address stakingToken) public override {
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

  function getStakingTokens() external override view returns (address[] memory) {
    return stakingTokens;
  }

  function getStakingRewards(address stakingToken) external override view returns (address) {
    StakingRewardsInfo storage info = stakingRewardsInfoByStakingToken[stakingToken];
    require(
      info.stakingRewards != address(0),
      "StakingRewardsFactory::getStakingRewards: Not deployed"
    );

    return info.stakingRewards;
  }

  function computeStakingRewardsAddress(address stakingToken) external override view returns (address) {
    bytes32 stakingRewardsSalt = keccak256(abi.encodePacked(stakingToken));
    return SaltyLib.computeProxyAddressManyToOne(
      address(proxyManager),
      address(this),
      STAKING_REWARDS_IMPLEMENTATION_ID,
      stakingRewardsSalt
    );
  }
}