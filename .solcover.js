module.exports = {
  mocha: {
    enableTimeouts: false,
    timeout: 250000
  },
  skipFiles: [
    'mocks/',
    'governance/Ndx.sol',
    'governance/GovernorAlpha.sol',
    'governance/Timelock.sol',
    'interfaces/'
  ]
}