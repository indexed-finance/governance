pragma solidity ^0.6.0;


interface IPoolFactory {
  function isRecognizedPool(address pool) external view returns (bool);
}