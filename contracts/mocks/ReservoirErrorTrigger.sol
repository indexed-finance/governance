pragma solidity ^0.6.0;

import "../distribution/Reservoir.sol";

contract ReservoirErrorTrigger is Reservoir {
  constructor(uint dripRate_, IERC20 token_, address target_)
    public
    Reservoir(dripRate_, token_, target_)
  {}

  function triggerDeltaDripUnderflow() public {
    uint dripRate_ = dripRate;
    uint dripStart_ = dripStart;
    uint blockNumber_ = block.number;
    uint dripTotal_ = mul(dripRate_, blockNumber_ - dripStart_, "");
    dripped = add(dripTotal_, 1, "");
    drip();
  }

  function triggerAdditionOverflow() public {
    uint a = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0;
    uint b = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0;
    add(a, b, "addition overflow");
  }
}