pragma solidity ^0.6.0;

import "../interfaces/IPoolFactory.sol";


contract MockPoolFactory {
  mapping(address => bool) public isRecognizedPool;

  function addIPool(address poolAddress) public {
    isRecognizedPool[poolAddress] = true;
  }
}