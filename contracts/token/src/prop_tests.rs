//! Token contract — property-based tests for delegation cycle detection.
//!
//! `delegate` guards against *direct* cycles (A→B when B already delegates
//! to A); longer chains are not accumulated for voting weight (see the
//! docstring on `delegate`). This suite generates random delegation graphs
//! of up to 10 nodes and arbitrary sequences of delegate/undelegate calls,
//! then asserts the direct-cycle invariant always holds: no two addresses
//! ever end up delegating to each other at the same time.

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{TokenContract, TokenContractClient};

const MAX_NODES: usize = 10;

#[derive(Debug, Clone, Copy)]
enum Action {
    Delegate { from: usize, to: usize },
    Undelegate { who: usize },
}

fn action_strategy() -> impl Strategy<Value = Action> {
    prop_oneof![
        (0..MAX_NODES, 0..MAX_NODES).map(|(from, to)| Action::Delegate { from, to }),
        (0..MAX_NODES).map(|who| Action::Undelegate { who }),
    ]
}

fn setup(env: &Env) -> (TokenContractClient<'_>, Vec<Address>) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let id = env.register(TokenContract, ());
    let token = TokenContractClient::new(env, &id);
    token.initialize(
        &admin,
        &1_000_000_000i128,
        &String::from_str(env, "CosmosVote"),
        &String::from_str(env, "VOTE"),
        &7u32,
    );
    let nodes: Vec<Address> = (0..MAX_NODES).map(|_| Address::generate(env)).collect();
    (token, nodes)
}

/// No two addresses may simultaneously delegate to each other.
fn assert_no_direct_cycle(token: &TokenContractClient, nodes: &[Address]) {
    for a in nodes {
        if let Some(b) = token.get_delegation(a) {
            if let Some(back) = token.get_delegation(&b) {
                assert_ne!(
                    &back, a,
                    "direct delegation cycle detected between two nodes"
                );
            }
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    #[test]
    fn prop_no_cycle_after_random_delegation_sequence(actions in prop::collection::vec(action_strategy(), 1..40)) {
        let env = Env::default();
        let (token, nodes) = setup(&env);

        for action in actions {
            match action {
                Action::Delegate { from, to } => {
                    if from == to {
                        continue;
                    }
                    let _ = token.try_delegate(&nodes[from], &nodes[to]);
                }
                Action::Undelegate { who } => {
                    let _ = token.try_undelegate(&nodes[who]);
                }
            }
            assert_no_direct_cycle(&token, &nodes);
        }
    }

    #[test]
    fn prop_rejects_immediate_direct_cycle(a_idx in 0..MAX_NODES, b_idx in 0..MAX_NODES) {
        if a_idx == b_idx {
            return Ok(());
        }
        let env = Env::default();
        let (token, nodes) = setup(&env);
        let a = &nodes[a_idx];
        let b = &nodes[b_idx];

        token.delegate(a, b);
        let attempt = token.try_delegate(b, a);
        prop_assert!(attempt.is_err(), "B->A after A->B must be rejected as a direct cycle");
        assert_no_direct_cycle(&token, &nodes);
    }
}
