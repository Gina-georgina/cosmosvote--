# Treasury Contract API Reference

Full reference for every public function in the CosmosVote treasury contract.

The treasury contract holds XLM and SEP-41 tokens on behalf of the DAO. Only
the governance contract may call `disburse`; individual users cannot move funds
directly. Disbursements are triggered by passing a proposal whose `payload`
contains a `TreasuryAction`.

---

## Types

### `Asset`

Identifies the asset to be disbursed — either native XLM or a SEP-41 token.

```rust
#[contracttype]
pub enum Asset {
    /// Native XLM (Stellar Lumens).
    Native,
    /// Any SEP-41-compatible token contract.
    Token(Address),
}
```

| Variant | Description |
|---------|-------------|
| `Native` | Native XLM via the Stellar asset contract |
| `Token(Address)` | SEP-41 token at the given contract address |

---

### `TreasuryAction`

Payload embedded in a governance proposal describing a single disbursement.

```rust
#[contracttype]
pub struct TreasuryAction {
    pub recipient: Address,
    pub amount:    i128,
    pub asset:     Asset,
}
```

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | `Address` | Address that will receive the funds |
| `amount` | `i128` | Amount to transfer, in the asset's smallest unit (stroops for XLM, raw units for SEP-41 tokens). Must be > 0. |
| `asset` | `Asset` | Which asset to disburse (`Asset::Native` or `Asset::Token(addr)`) |

**Example — disburse 500 VOTE tokens:**

```rust
let action = TreasuryAction {
    recipient: recipient_address,
    amount:    500_000_000i128, // 500 VOTE (7 decimals)
    asset:     Asset::Token(vote_token_contract_id),
};
```

**Example — disburse 10 XLM:**

```rust
let action = TreasuryAction {
    recipient: recipient_address,
    amount:    100_000_000i128, // 10 XLM (7 decimal places = 1e7 per XLM)
    asset:     Asset::Native,
};
```

---

## Functions

### `initialize`

```rust
pub fn initialize(env: Env, governance: Address)
```

One-time initializer. Stores the governance contract address as the sole
authorized caller of `disburse`. Must be called exactly once after deployment.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `env` | `Env` | Soroban environment (injected by the runtime) |
| `governance` | `Address` | The governance contract address — the only address that may call `disburse` |

**Returns:** `()` (no return value).

**Errors / Panics**

| Condition | Behaviour |
|-----------|-----------|
| Called more than once | Panics with `"already initialized"` |

**Example**

```rust
// Typically called by the deploy script immediately after contract deployment.
treasury.initialize(&governance_contract_id);
```

> **Note:** There is no admin override for `initialize`. If the wrong governance
> address is set, you must redeploy the treasury contract.

---

### `disburse`

```rust
pub fn disburse(env: Env, action: TreasuryAction)
```

Transfers funds from the treasury to a recipient according to `action`. Only the
governance contract (set at initialization) may call this function. It is invoked
automatically when the governance contract executes a passed proposal whose
`payload` includes a `TreasuryAction`.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `env` | `Env` | Soroban environment (injected by the runtime) |
| `action` | `TreasuryAction` | Disbursement details — recipient, amount, and asset |

**Returns:** `()` (no return value).

**Authorization**

`disburse` calls `governance.require_auth()`, meaning the **governance contract
must be the transaction's invoker or must appear in the auth chain**. Any direct
call that does not include valid governance authorization is rejected by the
Soroban runtime.

**Asset handling**

| `action.asset` | Transfer mechanism |
|----------------|--------------------|
| `Asset::Native` | Uses `token::StellarAssetClient` against the native XLM contract |
| `Asset::Token(addr)` | Calls `transfer(treasury, recipient, amount)` on the SEP-41 token at `addr` |

**Events**

On success, emits one `Disbursed` event per disbursement:

| Topic | Data | Description |
|-------|------|-------------|
| `("treasury", "disbursed")` | `(recipient: Address, amount: i128, asset: Asset, proposal_id: u64)` | Funds have been sent |

The event is defined following the existing event naming conventions and lets
governance participants verify disbursements from event logs alone.

**Errors / Panics**

| Condition | Behaviour |
|-----------|-----------|
| Caller is not the stored governance address | Runtime auth failure (transaction rejected) |
| `action.recipient` is the zero address | Panics with `InvalidRecipient` |
| Treasury has insufficient balance | Token contract panics / returns an error |
| `amount` ≤ 0 | Token contract may reject the transfer (depends on implementation) |

**Example**

```rust
// The governance contract calls disburse when executing a passed proposal.
treasury.disburse(&TreasuryAction {
    recipient: grant_recipient,
    amount:    1_000_000i128,           // 100 VOTE (7 decimals)
    asset:     Asset::Token(vote_token_id),
});
```

---

### `balance`

```rust
pub fn balance(env: Env, asset: Asset) -> i128
```

Returns the treasury's current balance for the given asset. Use this instead of
simulating a raw storage read to display the DAO treasury balance.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `env` | `Env` | Soroban environment (injected by the runtime) |
| `asset` | `Asset` | Which asset to query (`Asset::Native` or `Asset::Token(addr)`) |

**Returns:** The balance as `i128`, in the asset's smallest unit (stroops for
XLM, raw units for SEP-41 tokens).

**Asset handling**

| `asset` | Behaviour |
|---------|-----------|
| `Asset::Native` | Returns the native XLM balance of the treasury via the Stellar asset contract |
| `Asset::Token(addr)` | Returns the SEP-41 token balance of the treasury at `addr` |

**Example**

```rust
let xlm_balance = treasury.balance(&Asset::Native);
let vote_balance = treasury.balance(&Asset::Token(vote_token_id));
```

---

### `governance`

```rust
pub fn governance(env: Env) -> Address
```

Returns the governance contract address stored at initialization. Useful for
verifying the treasury is connected to the correct governance deployment.

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| `env` | `Env` | Soroban environment (injected by the runtime) |

**Returns:** The `Address` of the governance contract.

**Errors / Panics**

| Condition | Behaviour |
|-----------|-----------|
| Called before `initialize` | Panics (storage key absent, `unwrap()` fails) |

**Example**

```rust
let gov_addr = treasury.governance();
assert_eq!(gov_addr, governance_contract_id);
```

---

## Error / Panic Reference

The treasury contract uses `panic!` rather than typed `ContractError` variants.
The table below lists all observable failure conditions.

| Condition | Source function | Message / Behaviour |
|-----------|-----------------|---------------------|
| Double initialization | `initialize` | `panic!("already initialized")` |
| Unauthorized `disburse` caller | `disburse` | Soroban auth failure (no explicit message) |
| Zero-address recipient | `disburse` | `InvalidRecipient` |
| Zero-address recipient in treasury action | `create_proposal` (governance) | `InvalidRecipient` |
| Insufficient treasury balance | `disburse` | Propagated from token contract |
| `governance()` before `initialize` | `governance` | Soroban `unwrap()` panic |

---

## Integration with Governance

The typical end-to-end flow for a treasury disbursement:

1. A proposer calls `governance.create_proposal(...)` with a `payload` that
   contains a `TreasuryAction`.
2. Token holders vote; the proposal reaches quorum and passes.
3. The admin (or anyone, if permissionless execute is enabled) calls
   `governance.execute(proposal_id)`.
4. The governance contract internally calls `treasury.disburse(action)` with
   its own auth, sending funds to the recipient.
5. A `("treasury", "disbursed")` event is emitted and can be indexed by
   off-chain services.

See [docs/api/governance.md](./governance.md) for the `execute` and
`create_proposal` function signatures, and the `ExecutionPayload` type that
wraps `TreasuryAction`.

---

## See Also

- [docs/api/governance.md](./governance.md) — Governance contract API
- [docs/api/token.md](./token.md) — Token contract API
- [docs/security/threat-model.md](../security/threat-model.md) — Security model
- [SECURITY.md](../../SECURITY.md) — Vulnerability disclosure policy
