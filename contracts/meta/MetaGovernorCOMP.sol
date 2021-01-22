// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";


contract MetaGovernorCOMP {
  using SafeMath for uint256;

  /** @dev The name of this contract */
  string public constant name = "Indexed COMP Meta Governor";

  /**
   * @dev The number of blocks subtracted from the endBlock of an external
   * proposal to set the end block of a meta proposal.
   */
  uint256 public immutable votingGracePeriod;

  /** @dev The address of the Indexed governance token */
  NdxInterface public immutable ndx;


  /** @dev The address of the COMP GovernorAlpha */
  IGovernorAlpha public immutable compGovernor;

  struct MetaProposal {
    uint256 startBlock;
    uint256 endBlock;
    uint256 forVotes;
    uint256 againstVotes;
    bool voteSubmitted;
    mapping(address => Receipt) receipts;
  }

  /**
   * @dev Possible states that a meta proposal may be in
   */
  enum MetaProposalState {
    Active,
    Defeated,
    Succeeded,
    Executed
  }

  mapping(uint256 => MetaProposal) public proposals;

  /**
   * @dev Ballot receipt record for a voter
   * @param hasVoted Whether or not a vote has been cast
   * @param support Whether or not the voter supports the proposal
   * @param votes The number of votes the voter had, which were cast
   */
  struct Receipt {
    bool hasVoted;
    bool support;
    uint96 votes;
  }

  /**
   * @dev An event emitted when a vote has been cast on a proposal
   */
  event MetaVoteCast(
    address voter,
    uint256 proposalId,
    bool support,
    uint256 votes
  );

  event ExternalVoteSubmitted(
    uint256 proposalId,
    bool support
  );

  constructor(address ndx_, address compGovernor_, uint256 votingGracePeriod_) public {
    ndx = NdxInterface(ndx_);
    compGovernor = IGovernorAlpha(compGovernor_);
    votingGracePeriod = votingGracePeriod_;
  }

  function getReceipt(uint256 proposalId, address voter)
    public
    view
    returns (Receipt memory)
  {
    return proposals[proposalId].receipts[voter];
  }

  function submitExternalVote(uint256 proposalId) external {
    MetaProposal storage proposal = proposals[proposalId];
    MetaProposalState state = _state(proposal);
    require(
      state == MetaProposalState.Succeeded || state == MetaProposalState.Defeated,
      "MetaGovernorCOMP::submitExternalVote: proposal must be in Succeeded or Defeated state to execute"
    );
    proposal.voteSubmitted = true;
    bool support = state == MetaProposalState.Succeeded;
    compGovernor.castVote(proposalId, support);
    emit ExternalVoteSubmitted(proposalId, support);
  }

  function castVote(uint256 proposalId, bool support) public {
    return _castVote(msg.sender, proposalId, support);
  }

  function _getMetaProposal(uint256 proposalId) internal returns (MetaProposal storage) {
    MetaProposal storage proposal = proposals[proposalId];
    if (proposal.startBlock == 0) {
      IGovernorAlpha.Proposal memory externalProposal = compGovernor.proposals(proposalId);
      proposal.startBlock = externalProposal.startBlock;
      proposal.endBlock = SafeMath.sub(externalProposal.endBlock, votingGracePeriod);
    }
    return proposal;
  }

  function _castVote(
    address voter,
    uint256 proposalId,
    bool support
  ) internal {
    MetaProposal storage proposal = _getMetaProposal(proposalId);
    require(
      _state(proposal) == MetaProposalState.Active,
      "MetaGovernorCOMP::_castVote: meta proposal not active"
    );
    Receipt storage receipt = proposal.receipts[voter];
    require(
      receipt.hasVoted == false,
      "MetaGovernorCOMP::_castVote: voter already voted"
    );
    uint96 votes = ndx.getPriorVotes(voter, proposal.startBlock);

    if (support) {
      proposal.forVotes = SafeMath.add(proposal.forVotes, votes);
    } else {
      proposal.againstVotes = SafeMath.add(proposal.againstVotes, votes);
    }

    receipt.hasVoted = true;
    receipt.support = support;
    receipt.votes = votes;

    emit MetaVoteCast(voter, proposalId, support, votes);
  }

  function state(uint256 proposalId) public view returns (MetaProposalState) {
    MetaProposal storage proposal = proposals[proposalId];
    return _state(proposal);
  }

  function _state(MetaProposal storage proposal) internal view returns (MetaProposalState) {
    require(
      proposal.startBlock != 0 && block.number > proposal.startBlock,
      "MetaGovernorCOMP::_state: meta proposal does not exist or is not ready"
    );
    if (block.number <= proposal.endBlock) {
      return MetaProposalState.Active;
    } else if (proposal.voteSubmitted) {
      return MetaProposalState.Executed;
    } else if (proposal.forVotes > proposal.againstVotes) {
      return MetaProposalState.Succeeded;
    }
    return MetaProposalState.Defeated;
  }
}


interface IGovernorAlpha {
  struct Proposal {
    uint256 id;
    address proposer;
    uint256 eta;
    uint256 startBlock;
    uint256 endBlock;
    uint256 forVotes;
    uint256 againstVotes;
    bool canceled;
    bool executed;
  }

  function proposals(uint256 proposalId) external view returns (Proposal memory);

  function castVote(uint256 proposalId, bool support) external;
}


interface NdxInterface {
  function getPriorVotes(address account, uint256 blockNumber)
    external
    view
    returns (uint96);
}
