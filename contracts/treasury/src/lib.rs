//! CosmosVote Treasury Contract
//!
//! Holds XLM and tokens on behalf of the DAO. The governance contract
//! calls `disburse` to execute a TreasuryAction from a passed proposal.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Asset identifier — XLM (native) or a SEP-41 token address.
#[contracttype]
#[derive(Clone, Debug)]
pub enum Asset {
    Native,
    Token(Address),
}

/// Payload embedded in a proposal describing a treasury disbursement.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TreasuryAction {
    pub recipient: Address,
    pub amount: i128,
    pub asset: Asset,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Governance,
}

// ---------------------------------------------------------------------------
// Token interface for SEP-41 transfers
// ---------------------------------------------------------------------------

mod token_interface {
    use soroban_sdk::{contractclient, Address, Env};

    #[contractclient(name = "TokenClient")]
    pub trait TokenInterface {
        fn transfer(env: Env, from: Address, to: Address, amount: i128);
    }
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    /// One-time initializer. `governance` is the only address allowed to call `disburse`.
    pub fn initialize(env: Env, governance: Address) {
        if env.storage().instance().has(&DataKey::Governance) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Governance, &governance);
    }

    /// Disburse funds according to a TreasuryAction. Only callable by governance.
    pub fn disburse(env: Env, action: TreasuryAction) {
        let governance: Address = env.storage().instance().get(&DataKey::Governance).unwrap();
        governance.require_auth();

        match action.asset {
            Asset::Native => {
                let client = token::StellarAssetClient::new(&env, &env.current_contract_address());
                client.transfer(&env.current_contract_address(), &action.recipient, &action.amount);
            }
            Asset::Token(token_addr) => {
                let client = token_interface::TokenClient::new(&env, &token_addr);
                client.transfer(&env.current_contract_address(), &action.recipient, &action.amount);
            }
        }


        env.events().publish(
            (soroban_sdk::symbol_short!("disburse"),),
            (action.recipient, action.amount),
        );
    }

    /// Return the governance address.
    pub fn governance(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Governance).unwrap()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_initialize_and_governance() {
        let env = Env::default();
        let contract_id = env.register(TreasuryContract, ());
        let client = TreasuryContractClient::new(&env, &contract_id);

        let governance = Address::generate(&env);
        client.initialize(&governance);
        assert_eq!(client.governance(), governance);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_panics() {
        let env = Env::default();
        let contract_id = env.register(TreasuryContract, ());
        let client = TreasuryContractClient::new(&env, &contract_id);

        let governance = Address::generate(&env);
        client.initialize(&governance);
        client.initialize(&governance);
    }

    #[test]
    fn test_governance_triggers_treasury_disbursement() {
        use cosmosvote_governance::{GovernanceContract, GovernanceContractClient};
        use cosmosvote_governance::types::{TreasuryAction as GovTreasuryAction, TreasuryAsset as GovTreasuryAsset};
        use cosmosvote_token::{TokenContract, TokenContractClient};

        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let proposer = Address::generate(&env);
        let recipient = Address::generate(&env);

        // Deploy token contract and mint funds to the treasury later
        let token_id = env.register(TokenContract, ());
        let token = TokenContractClient::new(&env, &token_id);
        token.initialize(
            &admin,
            &1_000_000_000i128,
            &soroban_sdk::String::from_str(&env, "CosmosVote"),
            &soroban_sdk::String::from_str(&env, "VOTE"),
            &7u32,
        );

        // Register governance and treasury contracts
        let gov_id = env.register(GovernanceContract, ());
        let treasury_id = env.register(TreasuryContract, ());

        // Initialize treasury with governance address
        let treasury_client = TreasuryContractClient::new(&env, &treasury_id);
        treasury_client.initialize(&gov_id);

        // Mint some tokens to the treasury so it can disburse
        token.mint(&admin, &treasury_client.address, &1_000i128);

        // Initialize governance with treasury address and token
        let gov = GovernanceContractClient::new(&env, &gov_id);
        gov.initialize(&admin, &token_id, &0i128, &0u64, &0u32, &false, &Some(treasury_id), &0u32);

        // Create a proposal that disburses 500 tokens to `recipient`
        let action = GovTreasuryAction {
            recipient: recipient.clone(),
            amount: 500i128,
            asset: GovTreasuryAsset::Token(token_id.clone()),
        };

        let id = gov.create_proposal(
            &proposer,
            &soroban_sdk::String::from_str(&env, "Treasury Disburse"),
            &soroban_sdk::String::from_str(&env, "Disburse tokens to recipient"),
            &1i128,
            &3600u64,
            &Some(action),
        );

        // Give proposer a small balance and vote yes
        token.mint(&admin, &proposer, &1i128);
        gov.cast_vote(&proposer, &id, &cosmosvote_governance::types::Vote::Yes);

        // Fast-forward time and finalize
        let proposal = gov.get_proposal(&id);
        env.ledger().set_timestamp(proposal.end_time + 1);
        gov.finalise(&id);

        // Execute as admin (admin has auth via mock_all_auths)
        gov.execute(&admin, &id);

        // Verify recipient received tokens and treasury balance decreased
        let recipient_bal = token.balance(&recipient);
        assert_eq!(recipient_bal, 500i128);
        let treasury_bal = token.balance(&treasury_client.address);
        assert_eq!(treasury_bal, 500i128);
    }
}
