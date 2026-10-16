//! Token contract — type definitions and error codes.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized   = 1,
    NotInitialized       = 2,
    NotAdmin             = 10,
    InvalidNewAdmin      = 11,
    InvalidAmount        = 20,
    InsufficientBalance  = 21,
    AllowanceExceeded    = 22,
    CannotDelegateSelf   = 30,
    AlreadyDelegating    = 31,
    NotDelegating        = 32,
    DelegationCycle      = 33,
    InvalidExpiry        = 40,
    NoPendingAdmin       = 50,
    NotPendingAdmin      = 51,
    ContractPaused       = 60,
    NotPaused            = 61,
}
