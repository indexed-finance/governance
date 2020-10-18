pragma solidity ^0.6.0;

import "../interfaces/IPoolFactory.sol";


contract MockPoolFactory {
  mapping(address => bool) public isIPool;

  function addIPool(address poolAddress) public {
    isIPool[poolAddress] = true;
  }
}