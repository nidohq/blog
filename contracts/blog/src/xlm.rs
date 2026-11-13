//! The native XLM token (its Stellar Asset Contract).
//!
//! Built through Scaffold, `import_asset!("xlm")` bakes the target network's
//! XLM contract ID in at compile time. Unit tests have no network, so there
//! the constructor registers a test token and keeps its ID in instance
//! storage instead.

#[cfg(test)]
mod xlm {
    const XLM_KEY: &soroban_sdk::Symbol = &soroban_sdk::symbol_short!("XLM");

    pub fn contract_id(env: &soroban_sdk::Env) -> soroban_sdk::Address {
        env.storage()
            .instance()
            .get::<_, soroban_sdk::Address>(XLM_KEY)
            .expect("the constructor registers the test XLM contract")
    }

    /// Register a test XLM contract for this contract to use.
    pub fn register(env: &soroban_sdk::Env) {
        use soroban_sdk::testutils::Address as _;
        let issuer = soroban_sdk::Address::generate(env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        env.storage().instance().set(XLM_KEY, &sac.address());
    }

    pub fn token_client<'a>(env: &soroban_sdk::Env) -> soroban_sdk::token::TokenClient<'a> {
        soroban_sdk::token::TokenClient::new(env, &contract_id(env))
    }
}

#[cfg(not(test))]
stellar_registry::import_asset!("xlm");

#[allow(unused)]
pub const SERIALIZED_ASSET: [u8; 4] = [0, 0, 0, 0];

pub use xlm::*;

#[cfg(not(test))]
mod register {
    /// Deploy the native asset's contract if this network doesn't have it
    /// yet, as on a fresh local network. Testnet always has it.
    pub fn register(env: &soroban_sdk::Env) {
        let balance = super::token_client(env).try_balance(&env.current_contract_address());
        if balance.is_err() {
            env.deployer()
                .with_stellar_asset(super::SERIALIZED_ASSET)
                .deploy();
        }
    }
}

#[cfg(not(test))]
pub use register::*;
