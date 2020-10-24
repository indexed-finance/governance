pragma solidity ^0.6.0;

/* ---  External Interfaces  --- */
import "@indexed-finance/proxies/contracts/interfaces/IDelegateCallProxyManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/* ---  Internal Interfaces  --- */
import "../interfaces/IPoolFactory.sol";
import "../interfaces/IStakingRewards.sol";


interface IStakingRewardsFactory {
/* ==========  Constants  ========== */

  function STAKING_REWARDS_IMPLEMENTATION_ID() external pure returns (bytes32);

/* ==========  Immutables  ========== */

  function poolFactory() external view returns (IPoolFactory);

  function proxyManager() external view returns (IDelegateCallProxyManager);

  function rewardsToken() external view returns (address);

  function uniswapFactory() external view returns (address);

  function weth() external view returns (address);

  function stakingRewardsGenesis() external view returns (uint256);

/* ==========  Storage  ========== */

  function stakingTokens(uint256) external view returns (address);

  /* ==========  Pool Deployment  ==========  */
  // Pool deployment functions are permissioned.

  function deployStakingRewardsForPool(address indexPool, uint88 rewardAmount) external returns (address);

  function deployStakingRewardsForPoolUniswapPair(address indexPool, uint88 rewardAmount) external;

/* ==========  Rewards  ========== */

  function notifyRewardAmounts() external;

  function notifyRewardAmount(address stakingToken) external;

/* ==========  Queries  ========== */

  function getStakingTokens() external view returns (address[] memory);

  function getStakingRewards(address stakingToken) external view returns (address);

  function computeStakingRewardsAddress(address stakingToken) external view returns (address);
}