//! Fuzz / property-based tests for `create_proposal` input validation.
//!
//! # Coverage
//! | Input field  | Valid range                  | Invalid range tested |
//! |--------------|------------------------------|----------------------|
//! | `title`      | 1–128 bytes                  | 0 bytes, 129+ bytes  |
//! | `description`| 1–1024 bytes                 | 0 bytes, 1025+ bytes |
//! | `quorum`     | 1 – total_supply             | 0, negative, > supply|
//! | `duration`   | 60 – 2_592_000 seconds       | < 60, > 2_592_000    |
//!
//! All tests use `proptest` to drive arbitrary inputs and assert that
//! the contract either accepts valid inputs or rejects invalid inputs
//! with the expected `ContractError` variant.

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{
    types::ContractError,
    GovernanceContract, GovernanceContractClient,
};
use cosmosvote_token::{TokenContract, TokenContractClient};

const TOTAL_SUPPLY: i128 = 1_000_000_000;
const MIN_DURATION: u64 = 60;
const MAX_DURATION: u64 = 2_592_000;
const MAX_TITLE_LEN: usize = 128;
const MAX_DESC_LEN: usize = 1024;

/// Deploy contracts and return clients with a funded proposer.
fn setup(env: &Env) -> (GovernanceContractClient<'_>, Address) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let proposer = Address::generate(env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &token_id);
    token.initialize(&admin, &TOTAL_SUPPLY);
    token.mint(&admin, &proposer, &10_000_000i128);

    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(env, &gov_id);
    gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

    (gov, proposer)
}

// ---------------------------------------------------------------------------
// Title validation
// ---------------------------------------------------------------------------

proptest! {
    /// Valid titles (1–128 ASCII chars) must always be accepted.
    #[test]
    fn fuzz_valid_title_accepted(len in 1usize..=MAX_TITLE_LEN) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let title = "a".repeat(len);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, &title),
            &String::from_str(&env, "Valid description"),
            &1_000_000i128,
            &3_600u64,
        );
        prop_assert!(result.is_ok(), "valid title len={len} was rejected");
    }

    /// Empty title must be rejected with `InvalidTitle`.
    #[test]
    fn fuzz_empty_title_rejected(_seed in 0u32..1000u32) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, ""),
            &String::from_str(&env, "Valid description"),
            &1_000_000i128,
            &3_600u64,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidTitle)),
            "empty title should return InvalidTitle"
        );
    }

    /// Title longer than 128 bytes must be rejected with `InvalidTitle`.
    #[test]
    fn fuzz_oversized_title_rejected(extra in 1usize..=256usize) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let title = "x".repeat(MAX_TITLE_LEN + extra);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, &title),
            &String::from_str(&env, "Valid description"),
            &1_000_000i128,
            &3_600u64,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidTitle)),
            "title len={} should return InvalidTitle", MAX_TITLE_LEN + extra
        );
    }
}

// ---------------------------------------------------------------------------
// Description validation
// ---------------------------------------------------------------------------

proptest! {
    /// Valid descriptions (1–1024 chars) must always be accepted.
    #[test]
    fn fuzz_valid_description_accepted(len in 1usize..=MAX_DESC_LEN) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let desc = "d".repeat(len);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, &desc),
            &1_000_000i128,
            &3_600u64,
        );
        prop_assert!(result.is_ok(), "valid description len={len} was rejected");
    }

    /// Empty description must be rejected with `InvalidDescription`.
    #[test]
    fn fuzz_empty_description_rejected(_seed in 0u32..1000u32) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, ""),
            &1_000_000i128,
            &3_600u64,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidDescription)),
            "empty description should return InvalidDescription"
        );
    }

    /// Description longer than 1024 bytes must be rejected with `InvalidDescription`.
    #[test]
    fn fuzz_oversized_description_rejected(extra in 1usize..=256usize) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let desc = "y".repeat(MAX_DESC_LEN + extra);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, &desc),
            &1_000_000i128,
            &3_600u64,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidDescription)),
            "description len={} should return InvalidDescription", MAX_DESC_LEN + extra
        );
    }
}

// ---------------------------------------------------------------------------
// Quorum validation
// ---------------------------------------------------------------------------

proptest! {
    /// Valid quorum (1 – total_supply) must be accepted.
    #[test]
    fn fuzz_valid_quorum_accepted(quorum in 1i128..=TOTAL_SUPPLY) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, "Valid description"),
            &quorum,
            &3_600u64,
        );
        prop_assert!(result.is_ok(), "valid quorum={quorum} was rejected");
    }

    /// Zero quorum must be rejected with `InvalidQuorum`.
    #[test]
    fn fuzz_zero_quorum_rejected(_seed in 0u32..1000u32) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, "Valid description"),
            &0i128,
            &3_600u64,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidQuorum)),
            "zero quorum should return InvalidQuorum"
        );
    }

    /// Negative quorum must be rejected with `InvalidQuorum`.
    #[test]
    fn fuzz_negative_quorum_rejected(q in i128::MIN..=-1i128) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, "Valid description"),
            &q,
            &3_600u64,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidQuorum)),
            "negative quorum={q} should return InvalidQuorum"
        );
    }

    /// Quorum exceeding total supply must be rejected with `QuorumExceedsSupply`.
    #[test]
    fn fuzz_quorum_exceeds_supply_rejected(excess in 1i128..=1_000_000_000i128) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let quorum = TOTAL_SUPPLY + excess;
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, "Valid description"),
            &quorum,
            &3_600u64,
        );
        prop_assert!(
            result == Err(Ok(ContractError::QuorumExceedsSupply)),
            "quorum={quorum} exceeding supply should return QuorumExceedsSupply"
        );
    }
}

// ---------------------------------------------------------------------------
// Duration validation
// ---------------------------------------------------------------------------

proptest! {
    /// Valid durations (60 – 2_592_000 seconds) must be accepted.
    #[test]
    fn fuzz_valid_duration_accepted(duration in MIN_DURATION..=MAX_DURATION) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, "Valid description"),
            &1_000_000i128,
            &duration,
        );
        prop_assert!(result.is_ok(), "valid duration={duration} was rejected");
    }

    /// Duration below minimum (< 60s) must be rejected with `InvalidDurationRange`.
    #[test]
    fn fuzz_duration_too_short_rejected(duration in 0u64..MIN_DURATION) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, "Valid description"),
            &1_000_000i128,
            &duration,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidDurationRange)),
            "duration={duration} below min should return InvalidDurationRange"
        );
    }

    /// Duration above maximum (> 2_592_000s) must be rejected with `InvalidDurationRange`.
    #[test]
    fn fuzz_duration_too_long_rejected(excess in 1u64..=86_400u64) {
        let env = Env::default();
        let (gov, proposer) = setup(&env);
        let duration = MAX_DURATION + excess;
        let result = gov.try_create_proposal(
            &proposer,
            &String::from_str(&env, "Valid Title"),
            &String::from_str(&env, "Valid description"),
            &1_000_000i128,
            &duration,
        );
        prop_assert!(
            result == Err(Ok(ContractError::InvalidDurationRange)),
            "duration={duration} above max should return InvalidDurationRange"
        );
    }
}
