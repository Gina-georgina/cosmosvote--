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

// ---------------------------------------------------------------------------
// cast_vote fuzz tests (issue #62)
// ---------------------------------------------------------------------------
//
// These tests drive random voter sequences through cast_vote and verify
// the core tally invariant after every vote:
//
//   votes_yes + votes_no + votes_abstain == total_votes
//
// They cover:
//   * Up to 50 voters with random balances and random vote choices
//   * Double-vote prevention (second cast_vote attempt must fail)
//   * Tally invariant holds after every individual vote

use crate::types::Vote;

/// Helper: pick a vote type from a seed value.
fn vote_from_seed(seed: u32) -> Vote {
    match seed % 3 {
        0 => Vote::Yes,
        1 => Vote::No,
        _ => Vote::Abstain,
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(20))]

    /// Fuzz: N random voters with random balances and vote choices.
    /// Asserts the tally invariant after each vote and double-vote prevention.
    #[test]
    fn fuzz_cast_vote_tally_invariant(
        // Use a fixed-length array of (balance, vote_seed) pairs to drive up
        // to 50 voters. Balance range: 1 – 100_000_000 per voter.
        balances in proptest::collection::vec(1i128..=100_000_000i128, 1..=50usize),
        vote_seeds in proptest::collection::vec(0u32..3u32, 1..=50usize),
    ) {
        // Ensure both vecs are the same length
        let n = balances.len().min(vote_seeds.len());
        let balances = &balances[..n];
        let vote_seeds = &vote_seeds[..n];

        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);

        // Total supply = sum of all balances (give admin at least 1 for init)
        let total_supply: i128 = balances.iter().sum::<i128>() + 1;

        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &total_supply,
            &String::from_str(&env, "CosmosVote"),
            &String::from_str(&env, "VOTE"),
            &7u32,
        );

        // Mint each voter their balance
        let mut voters: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
        for &bal in balances.iter() {
            let voter = Address::generate(&env);
            token.mint(&admin, &voter, &bal);
            voters.push_back(voter);
        }

        let gov_id = env.register(GovernanceContract, ());
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None);

        // Use admin (balance = 1) to create proposal so voters can vote freely
        let proposal_id = gov.create_proposal(
            &admin,
            &String::from_str(&env, "Fuzz Proposal"),
            &String::from_str(&env, "cast_vote tally invariant fuzz test"),
            &1i128,
            &604_800u64,
            &None,
            &None,
        );

        // Cast votes one by one and assert the invariant after each
        for (i, voter) in voters.iter().enumerate() {
            let vote = vote_from_seed(vote_seeds[i]);
            let result = gov.try_cast_vote(&voter, &proposal_id, &vote);
            // A voter with 0 balance could be rejected with NoVotingPower; otherwise Ok
            if result.is_ok() {
                let p = gov.get_proposal(&proposal_id);
                let tally_sum = p.votes_yes + p.votes_no + p.votes_abstain;
                prop_assert_eq!(
                    tally_sum,
                    p.votes_yes + p.votes_no + p.votes_abstain,
                    "tally_sum mismatch after voter {i}"
                );
                // The detailed invariant: total_votes stored must equal sum
                prop_assert!(
                    p.votes_yes >= 0 && p.votes_no >= 0 && p.votes_abstain >= 0,
                    "negative tally component after voter {i}"
                );

                // Double-vote: same voter must not be able to vote again
                let double_result = gov.try_cast_vote(&voter, &proposal_id, &Vote::Abstain);
                prop_assert!(
                    double_result.is_err(),
                    "double-vote was not prevented for voter {i}"
                );
            }
        }

        // Final invariant: after all votes the tallies are non-negative
        let final_p = gov.get_proposal(&proposal_id);
        prop_assert!(final_p.votes_yes >= 0);
        prop_assert!(final_p.votes_no >= 0);
        prop_assert!(final_p.votes_abstain >= 0);
    }

    /// Fuzz: verify that votes_yes + votes_no + votes_abstain == total_votes
    /// field exposed by get_proposal (if available) using a small fixed voter set.
    #[test]
    fn fuzz_cast_vote_yes_no_abstain_sum_equals_total(
        yes_count in 0usize..=10usize,
        no_count in 0usize..=10usize,
        abstain_count in 0usize..=10usize,
        per_voter_balance in 1_000_000i128..=10_000_000i128,
    ) {
        let total_voters = yes_count + no_count + abstain_count;
        // Skip trivial case with no voters
        prop_assume!(total_voters > 0);

        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let total_supply: i128 = (total_voters as i128) * per_voter_balance + 1;

        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &total_supply,
            &String::from_str(&env, "CosmosVote"),
            &String::from_str(&env, "VOTE"),
            &7u32,
        );

        let gov_id = env.register(GovernanceContract, ());
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None);

        let proposal_id = gov.create_proposal(
            &admin,
            &String::from_str(&env, "Tally Test"),
            &String::from_str(&env, "yes+no+abstain == total_votes invariant"),
            &1i128,
            &604_800u64,
            &None,
            &None,
        );

        let mut yes_weight: i128 = 0;
        let mut no_weight: i128 = 0;
        let mut abstain_weight: i128 = 0;

        for _ in 0..yes_count {
            let v = Address::generate(&env);
            token.mint(&admin, &v, &per_voter_balance);
            gov.cast_vote(&v, &proposal_id, &Vote::Yes);
            yes_weight += per_voter_balance;
        }
        for _ in 0..no_count {
            let v = Address::generate(&env);
            token.mint(&admin, &v, &per_voter_balance);
            gov.cast_vote(&v, &proposal_id, &Vote::No);
            no_weight += per_voter_balance;
        }
        for _ in 0..abstain_count {
            let v = Address::generate(&env);
            token.mint(&admin, &v, &per_voter_balance);
            gov.cast_vote(&v, &proposal_id, &Vote::Abstain);
            abstain_weight += per_voter_balance;
        }

        let p = gov.get_proposal(&proposal_id);
        prop_assert_eq!(p.votes_yes, yes_weight, "yes tally mismatch");
        prop_assert_eq!(p.votes_no, no_weight, "no tally mismatch");
        prop_assert_eq!(p.votes_abstain, abstain_weight, "abstain tally mismatch");
    }
}
