# @indexed-finance/governance

Forked from 
[https://github.com/Uniswap/governance/tree/v1.0.2](https://github.com/Uniswap/governance/tree/v1.0.2)

## Tests

### **GovernorAlpha.sol**
> `npm run test:governor`

Note: only tests functions added by UNI

### **TreasuryVester.sol**
> `npm run test:vester`

### **Reservoir.sol**
> `npm run test:reservoir`

### **StakingRewards.sol**
> `npm run test:rewards`

### **StakingRewardsFactory.sol**
> `npm run test:rewards-factory`


## Buidler Tasks

All tasks must be called in the cli with:

> `npx buidler --network <NETWORK> <TASK> [TASK OPTIONS]`

# Buidler Tasks

Command-line instructions for interacting with the contracts.

## Local Deployment

`npx buidler node`

## Universal Tasks
The following tasks will work on any network the contracts are deployed to.

> `npx buidler --network <rinkeby|localhost > accounts`

List available accounts.

> `npx buidler --network <rinkeby|localhost > list-pools`

List all staking tokens and their staking rewards pools.

> `npx buidler --network <rinkeby|localhost > earned --token <staking_token> --rewards <staking_rewards> --staker <staker_rewards>`

Query the rewards earned by `staker` on a staking rewards contract. Either `token` or `rewards` must be provided - either can be determined if the other is given. If `staker` is not given it will default to the first address in `accounts`

> `npx buidler --network <rinkeby|localhost > stake --token <staking_token> --rewards <staking_rewards> --amount <amount>`

Stakes `amount` of `token` on the rewards contract `rewards`. Either token or rewards must be provided - either can be determined if the other is given.

`amount` should be provided in `ether` format, as the task will convert it to wei, i.e. provide 1, not 1e18.

If stake is called for a test network, any missing balance under `amount` will automatically be minted (assuming the token is an instance of MockERC20).

## Test Network Tasks
The following tasks will only work on test networks that the contracts are deployed to.

> `npx buidler --network <rinkeby|localhost > deploy-test-token --name <name> --symbol <symbol> --balance <balance>`

Deploys an instance of `MockERC20` and mints `balance` to the caller.

> `npx buidler --network <rinkeby|localhost > deploy-staking-pool --token <token_address> --rewards <rewards_amount>`

Deploys an instance of `StakingRewards` for the staking token `token` and mints `rewards` as its staking rewards.

`rewards` should be provided in `ether` format, as the task will convert it to wei, i.e. provide 1, not 1e18.

> `npx buidler --network <rinkeby|localhost > fast-forward --seconds <seconds> --minutes <minutes> --hours <hours> --days <days>`

Moves the node's clock forward by the amount of time provided. Can provide any or none of the options - defaults to 1 hour.