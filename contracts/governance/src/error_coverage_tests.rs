//! Regression tests ensuring every `ContractError` variant can be triggered
//! and reports the expected numeric error code.
//!
//! Each test below explicitly constructs the error and asserts its code so
//! that adding a new variant without a corresponding test is caught in review
//! and by the CI coverage gate.

use crate::types::ContractError;

/// Helper: assert the numeric code of a `ContractError` variant.
fn assert_code(err: ContractError, expected: u32) {
    assert_eq!(err as u32, expected, "unexpected code for {:?}", err);
}

#[test]
fn test_already_initialized_code() {
    assert_code(ContractError::AlreadyInitialized, 1);
}

#[test]
fn test_not_initialized_code() {
    assert_code(ContractError::NotInitialized, 2);
}

#[test]
fn test_proposal_not_found_code() {
    assert_code(ContractError::ProposalNotFound, 10);
}

#[test]
fn test_proposal_not_active_code() {
    assert_code(ContractError::ProposalNotActive, 11);
}

#[test]
fn test_proposal_not_passed_code() {
    assert_code(ContractError::ProposalNotPassed, 12);
}

#[test]
fn test_invalid_title_code() {
    assert_code(ContractError::InvalidTitle, 13);
}

#[test]
fn test_invalid_description_code() {
    assert_code(ContractError::InvalidDescription, 14);
}

#[test]
fn test_invalid_quorum_code() {
    assert_code(ContractError::InvalidQuorum, 15);
}

#[test]
fn test_quorum_exceeds_supply_code() {
    assert_code(ContractError::QuorumExceedsSupply, 16);
}

#[test]
fn test_invalid_duration_range_code() {
    assert_code(ContractError::InvalidDurationRange, 17);
}

#[test]
fn test_insufficient_balance_code() {
    assert_code(ContractError::InsufficientBalance, 18);
}

#[test]
fn test_proposal_cooldown_code() {
    assert_code(ContractError::ProposalCooldown, 19);
}

#[test]
fn test_quorum_below_floor_code() {
    assert_code(ContractError::QuorumBelowFloor, 20);
}

#[test]
fn test_proposals_still_active_code() {
    assert_code(ContractError::ProposalsStillActive, 21);
}

#[test]
fn test_voting_not_started_code() {
    assert_code(ContractError::VotingNotStarted, 22);
}

#[test]
fn test_voting_period_ended_code() {
    assert_code(ContractError::VotingPeriodEnded, 23);
}

#[test]
fn test_voting_still_open_code() {
    assert_code(ContractError::VotingStillOpen, 24);
}

#[test]
fn test_already_voted_code() {
    assert_code(ContractError::AlreadyVoted, 25);
}

#[test]
fn test_no_voting_power_code() {
    assert_code(ContractError::NoVotingPower, 26);
}

#[test]
fn test_admin_vote_restricted_code() {
    assert_code(ContractError::AdminVoteRestricted, 27);
}

#[test]
fn test_vote_not_found_code() {
    assert_code(ContractError::VoteNotFound, 28);
}

#[test]
fn test_vote_already_same_code() {
    assert_code(ContractError::VoteAlreadySame, 29);
}

#[test]
fn test_not_admin_code() {
    assert_code(ContractError::NotAdmin, 30);
}

#[test]
fn test_invalid_new_admin_code() {
    assert_code(ContractError::InvalidNewAdmin, 31);
}

#[test]
fn test_quorum_update_not_allowed_code() {
    assert_code(ContractError::QuorumUpdateNotAllowed, 32);
}

#[test]
fn test_no_pending_admin_code() {
    assert_code(ContractError::NoPendingAdmin, 33);
}

#[test]
fn test_not_pending_admin_code() {
    assert_code(ContractError::NotPendingAdmin, 34);
}

#[test]
fn test_not_proposer_code() {
    assert_code(ContractError::NotProposer, 35);
}

#[test]
fn test_votes_already_cast_code() {
    assert_code(ContractError::VotesAlreadyCast, 36);
}

#[test]
fn test_invalid_link_code() {
    assert_code(ContractError::InvalidLink, 37);
}

#[test]
fn test_invalid_choice_code() {
    assert_code(ContractError::InvalidChoice, 38);
}

#[test]
fn test_contract_paused_code() {
    assert_code(ContractError::ContractPaused, 40);
}

#[test]
fn test_not_paused_code() {
    assert_code(ContractError::NotPaused, 41);
}

#[test]
fn test_arithmetic_overflow_code() {
    assert_code(ContractError::ArithmeticOverflow, 50);
}

#[test]
fn test_execution_failed_code() {
    assert_code(ContractError::ExecutionFailed, 60);
}

#[test]
fn test_invalid_treasury_amount_code() {
    assert_code(ContractError::InvalidTreasuryAmount, 61);
}
