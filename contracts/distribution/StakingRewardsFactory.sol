pragma solidity ^0.6.0;

import "../interfaces/IPoolFactory.sol";
import "../interfaces/IDelegateCallProxyManager.sol";

import "../lib/Owned.sol";


contract StakingRewardsFactory is Owned {
  bytes32 public constant STAKING_REWARDS_IMPLEMENTATION_ID = keccak256("StakingRewards.sol");

  // immutables
  DelegateCallProxyManager public immutable proxyManager;
  address public immutable rewardsToken;
  uint public immutable stakingRewardsGenesis;

  // the staking tokens for which the rewards contract has been deployed
  address[] public stakingTokens;


  // info about rewards for a particular staking token
  struct StakingRewardsInfo {
    address stakingRewards;
    uint rewardAmount;
  }

  // rewards info by staking token
  mapping(address => StakingRewardsInfo) public stakingRewardsInfoByStakingToken;

  constructor(
    address owner_,
    address rewardsToken_,
    uint stakingRewardsGenesis_,
    address proxyManager_
  ) public Owned(owner_) {
    rewardsToken = rewardsToken_;
    stakingRewardsGenesis = stakingRewardsGenesis_;
    proxyManager = DelegateCallProxyManager(proxyManager_);
  }

  function deploy(address stakingToken) external _owner_ {
    
  }
}