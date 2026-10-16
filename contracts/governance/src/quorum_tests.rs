//! Quorum and majority validation tests — issue #296
//!
//! Covers all edge cases for proposal finalization rules:
//! - Quorum exactly met vs. just below quorum
//! - Abstain counting toward quorum but not toward outcome
//! - Tie (yes == no) results in rejection
//! - Majority (yes > no) with quorum met results in pass

#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, String};

use crate::{
    types::{ProposalState, Vote},
    GovernanceContract, GovernanceContractClient,
};
use cosmosvote_token::{TokenContract, TokenContractClient};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup(env: &Env) -> (GovernanceContractClient<'_>, TokenContractClient<'_>, Address) {
    env.mock_all_auths();
    let admin = Address::generate(env);

    let token_id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &token_id);
    token.initialize(
        &admin,
        &1_000_000_000i128,
        &String::from_str(env, "CosmosVote"),
        &String::from_str(env, "VOTE"),
        &7u32,
    );

    let gov_id = env.register(GovernanceContract, ());
    let gov = GovernanceContractClient::new(env, &gov_id);
    gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &None, &0u32);

    (gov, token, admin)
}

fn make_voter(env: &Env, token: &TokenContractClient, admin: &Address, balance: i128) -> Address {
    let voter = Address::generate(env);
    token.mint(admin, &voter, &balance);
    voter
}

fn create_proposal(gov: &GovernanceContractClient, env: &Env, proposer: &Address, quorum: i128) -> u64 {
    gov.create_proposal(
        proposer,
        &String::from_str(env, "Quorum Test"),
        &String::from_str(env, "Testing quorum and majority rules"),
        &quorum,
        &3600u64,
        &None,
        &None,
    )
}

fn finalise(gov: &GovernanceContractClient, env: &Env, id: u64) {
    let end = gov.get_proposal(&id).end_time;
    env.ledger().with_mut(|l| l.timestamp = end + 1);
    gov.finalise(&id);
}

// ---------------------------------------------------------------------------
// Quorum edge cases
// ---------------------------------------------------------------------------

/// Quorum is exactly met (total_votes == quorum) and yes > no → Passed.
#[test]
fn test_quorum_exactly_met_passes() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    // quorum = 1_000; voter has exactly 1_000 tokens
    let voter = make_voter(&env, &token, &admin, 1_000);
    let id = create_proposal(&gov, &env, &voter, 1_000);
    gov.cast_vote(&voter, &id, &Vote::Yes);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Passed);
}

/// One token below quorum → Rejected even if yes > no.
#[test]
fn test_quorum_one_below_rejects() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    // quorum = 1_000; voter has only 999 tokens
    let voter = make_voter(&env, &token, &admin, 999);
    let id = create_proposal(&gov, &env, &voter, 1_000);
    gov.cast_vote(&voter, &id, &Vote::Yes);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
}

/// No votes cast at all → Rejected (quorum not met).
#[test]
fn test_no_votes_rejects() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let proposer = make_voter(&env, &token, &admin, 10_000);
    let id = create_proposal(&gov, &env, &proposer, 1_000);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
}

// ---------------------------------------------------------------------------
// Abstain counting
// ---------------------------------------------------------------------------

/// Abstain votes count toward quorum but not toward yes/no outcome.
/// abstain_weight >= quorum, but yes == 0 → Rejected (yes not > no).
#[test]
fn test_abstain_meets_quorum_but_no_majority_rejects() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let voter = make_voter(&env, &token, &admin, 5_000);
    let id = create_proposal(&gov, &env, &voter, 5_000);
    gov.cast_vote(&voter, &id, &Vote::Abstain);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
}

/// Abstain helps reach quorum; yes > no → Passed.
#[test]
fn test_abstain_plus_yes_meets_quorum_passes() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    // quorum = 3_000; yes_voter = 2_000, abstain_voter = 1_000 → total = 3_000
    let yes_voter = make_voter(&env, &token, &admin, 2_000);
    let abs_voter = make_voter(&env, &token, &admin, 1_000);
    let id = create_proposal(&gov, &env, &yes_voter, 3_000);
    gov.cast_vote(&yes_voter, &id, &Vote::Yes);
    gov.cast_vote(&abs_voter, &id, &Vote::Abstain);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Passed);
}

/// Abstain alone is below quorum; yes > no but total < quorum → Rejected.
#[test]
fn test_abstain_below_quorum_rejects() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let yes_voter = make_voter(&env, &token, &admin, 1_000);
    let abs_voter = make_voter(&env, &token, &admin, 500);
    // quorum = 2_000; yes=1_000 + abstain=500 = 1_500 < 2_000
    let id = create_proposal(&gov, &env, &yes_voter, 2_000);
    gov.cast_vote(&yes_voter, &id, &Vote::Yes);
    gov.cast_vote(&abs_voter, &id, &Vote::Abstain);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
}

// ---------------------------------------------------------------------------
// Tie handling
// ---------------------------------------------------------------------------

/// Yes votes equal No votes (tie) → Rejected regardless of quorum.
#[test]
fn test_tie_yes_equals_no_rejects() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let yes_voter = make_voter(&env, &token, &admin, 5_000);
    let no_voter = make_voter(&env, &token, &admin, 5_000);
    // quorum = 10_000; both sides vote, total = 10_000 >= quorum but yes == no
    let id = create_proposal(&gov, &env, &yes_voter, 10_000);
    gov.cast_vote(&yes_voter, &id, &Vote::Yes);
    gov.cast_vote(&no_voter, &id, &Vote::No);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
}

/// Tie with abstain also present → Rejected (yes still == no).
#[test]
fn test_tie_with_abstain_still_rejects() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let yes_voter = make_voter(&env, &token, &admin, 4_000);
    let no_voter = make_voter(&env, &token, &admin, 4_000);
    let abs_voter = make_voter(&env, &token, &admin, 2_000);
    // quorum = 10_000; yes=4k no=4k abstain=2k → total=10k >= quorum, yes == no
    let id = create_proposal(&gov, &env, &yes_voter, 10_000);
    gov.cast_vote(&yes_voter, &id, &Vote::Yes);
    gov.cast_vote(&no_voter, &id, &Vote::No);
    gov.cast_vote(&abs_voter, &id, &Vote::Abstain);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
}

// ---------------------------------------------------------------------------
// Majority scenarios
// ---------------------------------------------------------------------------

/// Yes > No, quorum met → Passed.
#[test]
fn test_yes_majority_quorum_met_passes() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let yes_voter = make_voter(&env, &token, &admin, 6_000);
    let no_voter = make_voter(&env, &token, &admin, 4_000);
    let id = create_proposal(&gov, &env, &yes_voter, 10_000);
    gov.cast_vote(&yes_voter, &id, &Vote::Yes);
    gov.cast_vote(&no_voter, &id, &Vote::No);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Passed);
}

/// No > Yes, quorum met → Rejected.
#[test]
fn test_no_majority_quorum_met_rejects() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let yes_voter = make_voter(&env, &token, &admin, 3_000);
    let no_voter = make_voter(&env, &token, &admin, 7_000);
    let id = create_proposal(&gov, &env, &yes_voter, 10_000);
    gov.cast_vote(&yes_voter, &id, &Vote::Yes);
    gov.cast_vote(&no_voter, &id, &Vote::No);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Rejected);
}

/// Yes by single token margin, quorum exactly met → Passed.
#[test]
fn test_yes_wins_by_one_token_passes() {
    let env = Env::default();
    let (gov, token, admin) = setup(&env);
    let yes_voter = make_voter(&env, &token, &admin, 5_001);
    let no_voter = make_voter(&env, &token, &admin, 5_000);
    // quorum = 10_001
    let id = create_proposal(&gov, &env, &yes_voter, 10_001);
    gov.cast_vote(&yes_voter, &id, &Vote::Yes);
    gov.cast_vote(&no_voter, &id, &Vote::No);
    finalise(&gov, &env, id);
    assert_eq!(gov.get_proposal(&id).state, ProposalState::Passed);
}
