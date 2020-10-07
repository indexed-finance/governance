pragma solidity ^0.6.0;


interface IPoolFactory {
  function isIPool(address pool) external view returns (bool);
}