#![no_std]
//! A starter contract from `npm run new-app -- --blank`: any account checks
//! in, and the account itself has to authorize it. Rename it and grow it into
//! your app; NIDO.md has the steps.
use soroban_sdk::{contract, contractevent, contractimpl, Address, Env};

#[contract]
pub struct CheckIn;

/// Published on every check-in.
#[contractevent]
pub struct CheckedIn {
    #[topic]
    pub who: Address,
    pub count: u32,
}

#[contractimpl]
impl CheckIn {
    /// Record a check-in by `who` and return how many they have made.
    ///
    /// `who.require_auth()` comes first: the account authorizes the root
    /// call. Nothing else in the call needs `who`'s authorization, so a Nido
    /// account needs one session grant, on this contract, with no spending
    /// cap (it moves no money).
    pub fn check_in(env: Env, who: Address) -> u32 {
        who.require_auth();
        let count = Self::count(env.clone(), who.clone()) + 1;
        env.storage().persistent().set(&who, &count);
        CheckedIn { who, count }.publish(&env);
        count
    }

    /// How many times `who` has checked in.
    pub fn count(env: Env, who: Address) -> u32 {
        env.storage().persistent().get(&who).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
