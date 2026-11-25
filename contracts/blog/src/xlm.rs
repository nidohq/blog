//! The native XLM token (its Stellar Asset Contract).
//!
//! The XLM contract's address follows from the network it runs on, so the
//! blog works it out at run time ([`native_address`]) rather than baking one
//! network's address in at build time: the same wasm, with the same hash,
//! pays in XLM on testnet and on mainnet, and can't pay through another
//! network's contract. Unit tests have no native XLM to mint, so there the
//! constructor registers a test token and keeps its ID in instance storage
//! instead.
use soroban_sdk::{Address, Env, token::TokenClient};

/// The native asset, as an XDR `Asset` (the `Native` variant).
const NATIVE: [u8; 4] = [0, 0, 0, 0];

/// The address of the XLM contract on the network this runs on.
pub fn native_address(env: &Env) -> Address {
    env.deployer().with_stellar_asset(NATIVE).deployed_address()
}

#[cfg(not(test))]
pub fn contract_id(env: &Env) -> Address {
    native_address(env)
}

/// Deploy the XLM contract if this network doesn't have it yet, as on a
/// fresh local network. Testnet and mainnet always have it.
#[cfg(not(test))]
pub fn register(env: &Env) {
    if token_client(env)
        .try_balance(&env.current_contract_address())
        .is_err()
    {
        env.deployer().with_stellar_asset(NATIVE).deploy();
    }
}

#[cfg(test)]
const TEST_XLM: &soroban_sdk::Symbol = &soroban_sdk::symbol_short!("XLM");

#[cfg(test)]
pub fn contract_id(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(TEST_XLM)
        .expect("the constructor registers the test XLM contract")
}

/// Register a test XLM contract for this contract to use.
#[cfg(test)]
pub fn register(env: &Env) {
    use soroban_sdk::testutils::Address as _;
    let sac = env.register_stellar_asset_contract_v2(Address::generate(env));
    env.storage().instance().set(TEST_XLM, &sac.address());
}

pub fn token_client<'a>(env: &Env) -> TokenClient<'a> {
    TokenClient::new(env, &contract_id(env))
}
