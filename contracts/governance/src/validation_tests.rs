//! Input validation and arithmetic overflow tests — Issue #367
//!
//! Verifies that contracts reject invalid parameter values and that all
//! arithmetic paths are protected against overflow.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{
    types::{ContractError, Vote},
    GovernanceContract, GovernanceContractClient,
};
use cosmosvote_token::{TokenContract, TokenContractClient};

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

fn setup(env: &Env) -> (GovernanceContractClient<'_>, TokenContractClient<'_>, Address, Address) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let voter = Address::generate(env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &token_id);
    token.initialize(
        &admin,
        &1_000_000_000i128,
        &String::from_str(env, "CosmosVote"),
        &String::from_str(env, "VOTE"),
        &7u32,
    );
    token.mint(&admin, &voter, &10_000_000i128);

    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(env, &gov_id);
    gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

    (gov, token, admin, voter)
}

// ---------------------------------------------------------------------------
// create_proposal — title validation
// ---------------------------------------------------------------------------

#[test]
fn test_create_proposal_empty_title_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, ""),   // empty title
        &String::from_str(&env, "Valid description"),
        &1_000i128,
        &3600u64,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidTitle)));
}

#[test]
fn test_create_proposal_title_too_long_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    // 129 'a' characters — exceeds the 128-char limit
    let long_title = String::from_str(&env, &"a".repeat(129));
    let result = gov.try_create_proposal(
        &admin,
        &long_title,
        &String::from_str(&env, "Valid description"),
        &1_000i128,
        &3600u64,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidTitle)));
}

// ---------------------------------------------------------------------------
// create_proposal — description validation
// ---------------------------------------------------------------------------

#[test]
fn test_create_proposal_empty_description_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, "Valid title"),
        &String::from_str(&env, ""),  // empty description
        &1_000i128,
        &3600u64,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDescription)));
}

#[test]
fn test_create_proposal_description_too_long_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    // 1025 characters — exceeds the 1024-char limit
    let long_desc = String::from_str(&env, &"d".repeat(1025));
    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, "Valid title"),
        &long_desc,
        &1_000i128,
        &3600u64,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDescription)));
}

// ---------------------------------------------------------------------------
// create_proposal — quorum validation
// ---------------------------------------------------------------------------

#[test]
fn test_create_proposal_zero_quorum_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &0i128,   // zero quorum
        &3600u64,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidQuorum)));
}

#[test]
fn test_create_proposal_negative_quorum_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &-1i128,  // negative quorum
        &3600u64,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidQuorum)));
}

#[test]
fn test_create_proposal_quorum_exceeds_supply_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    // total supply is 1_000_000_000; quorum > supply must fail
    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &2_000_000_000i128,
        &3600u64,
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::QuorumExceedsSupply)));
}

// ---------------------------------------------------------------------------
// create_proposal — duration validation
// ---------------------------------------------------------------------------

#[test]
fn test_create_proposal_duration_too_short_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &1_000i128,
        &59u64,   // below the 60-second minimum
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDurationRange)));
}

#[test]
fn test_create_proposal_duration_too_long_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    let result = gov.try_create_proposal(
        &admin,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &1_000i128,
        &2_592_001u64,  // exceeds 30-day maximum
        &None,
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::InvalidDurationRange)));
}

// ---------------------------------------------------------------------------
// cast_vote — already voted guard
// ---------------------------------------------------------------------------

#[test]
fn test_cast_vote_double_vote_rejected() {
    let env = Env::default();
    let (gov, _, admin, voter) = setup(&env);

    let id = gov.create_proposal(
        &admin,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &1_000i128,
        &3600u64,
        &None,
        &None,
    );
    gov.cast_vote(&voter, &id, &Vote::Yes);

    let result = gov.try_cast_vote(&voter, &id, &Vote::No);
    assert_eq!(result, Err(Ok(ContractError::AlreadyVoted)));
}

// ---------------------------------------------------------------------------
// cast_vote — no voting power
// ---------------------------------------------------------------------------

#[test]
fn test_cast_vote_no_balance_rejected() {
    let env = Env::default();
    let (gov, _, admin, _) = setup(&env);

    // Generate a fresh address with zero balance
    let broke = Address::generate(&env);

    let id = gov.create_proposal(
        &admin,
        &String::from_str(&env, "Title"),
        &String::from_str(&env, "Description"),
        &1_000i128,
        &3600u64,
        &None,
        &None,
    );
    let result = gov.try_cast_vote(&broke, &id, &Vote::Yes);
    assert_eq!(result, Err(Ok(ContractError::NoVotingPower)));
}

// ---------------------------------------------------------------------------
// Token mint — arithmetic overflow protection
// ---------------------------------------------------------------------------

#[test]
fn test_token_mint_overflow_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(&env, &token_id);

    // Initialize with i128::MAX to make any further mint overflow
    token.initialize(
        &admin,
        &i128::MAX,
        &String::from_str(&env, "CosmosVote"),
        &String::from_str(&env, "VOTE"),
        &7u32,
    );

    let result = token.try_mint(&admin, &user, &1i128);
    assert_eq!(
        result,
        Err(Ok(cosmosvote_token::types::ContractError::ArithmeticOverflow))
    );
}

// ---------------------------------------------------------------------------
// Token transfer — negative / zero amount
// ---------------------------------------------------------------------------

#[test]
fn test_token_transfer_zero_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(&env, &token_id);
    token.initialize(
        &admin,
        &1_000_000i128,
        &String::from_str(&env, "CosmosVote"),
        &String::from_str(&env, "VOTE"),
        &7u32,
    );

    let result = token.try_transfer(&admin, &user, &0i128);
    assert!(result.is_err(), "zero-amount transfer should be rejected");
}

#[test]
fn test_token_transfer_negative_amount_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(&env, &token_id);
    token.initialize(
        &admin,
        &1_000_000i128,
        &String::from_str(&env, "CosmosVote"),
        &String::from_str(&env, "VOTE"),
        &7u32,
    );

    let result = token.try_transfer(&admin, &user, &-100i128);
    assert!(result.is_err(), "negative-amount transfer should be rejected");
}
