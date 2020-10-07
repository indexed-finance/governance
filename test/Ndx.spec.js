const { expect } = require('chai')
const { constants, utils } = require('ethers')
const bre = require("@nomiclabs/buidler");
const { deployments, ethers, waffle: { provider } } = bre;
const { ecsign } = require('ethereumjs-util')

const { expandTo18Decimals } = require('./utils')

const DOMAIN_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)')
)

const PERMIT_TYPEHASH = utils.keccak256(
  utils.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

describe('Ndx', () => {
  let wallet, other0, other1;

  let ndx;

  beforeEach(async () => {
    await deployments.fixture();
    ndx = await ethers.getContract('ndx');
    ([wallet, other0, other1] = provider.getWallets());
  })

  it('permit', async () => {
    const domainSeparator = utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['bytes32', 'bytes32', 'uint256', 'address'],
        [DOMAIN_TYPEHASH, utils.keccak256(utils.toUtf8Bytes('Indexed')), 31337, ndx.address]
      )
    )

    const owner = wallet.address
    const spender = other0.address
    const value = 123
    const nonce = await ndx.nonceOf(wallet.address)
    const deadline = constants.MaxUint256
    const digest = utils.keccak256(
      utils.solidityPack(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        [
          '0x19',
          '0x01',
          domainSeparator,
          utils.keccak256(
            utils.defaultAbiCoder.encode(
              ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
              [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
            )
          ),
        ]
      )
    )

    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    await ndx.permit(owner, spender, value, deadline, v, utils.hexlify(r), utils.hexlify(s))
    expect(await ndx.allowance(owner, spender)).to.eq(value)
    expect(await ndx.nonces(owner)).to.eq(1)

    await ndx.connect(other0).transferFrom(owner, spender, value)
  })

  it('nested delegation', async () => {
    await ndx.transfer(other0.address, expandTo18Decimals(1))
    await ndx.transfer(other1.address, expandTo18Decimals(2))

    let currectVotes0 = await ndx.getCurrentVotes(other0.address)
    let currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes0).to.be.eq(0)
    expect(currectVotes1).to.be.eq(0)

    await ndx.connect(other0).delegate(other1.address)
    currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1))

    await ndx.connect(other1).delegate(other1.address)
    currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1).add(expandTo18Decimals(2)))

    await ndx.connect(other1).delegate(wallet.address)
    currectVotes1 = await ndx.getCurrentVotes(other1.address)
    expect(currectVotes1).to.be.eq(expandTo18Decimals(1))
  })
})
