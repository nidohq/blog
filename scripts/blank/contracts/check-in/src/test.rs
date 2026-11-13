extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation};
use soroban_sdk::{IntoVal, Symbol};

fn setup(env: &Env) -> (Address, CheckInClient<'_>) {
    let id = env.register(CheckIn, ());
    (id.clone(), CheckInClient::new(env, &id))
}

#[test]
fn counts_each_accounts_check_ins() {
    let env = Env::default();
    env.mock_all_auths();
    let (_, client) = setup(&env);
    let (alice, bob) = (Address::generate(&env), Address::generate(&env));
    assert_eq!(client.check_in(&alice), 1);
    assert_eq!(client.check_in(&alice), 2);
    assert_eq!(client.check_in(&bob), 1);
    assert_eq!(client.count(&alice), 2);
}

/// `env.auths()` is the call's authorization tree, and so the list of grants
/// a Nido account needs: one `Grant` per contract in it. Here that is
/// `check_in` on this contract, and nothing else.
#[test]
fn check_in_needs_one_grant() {
    let env = Env::default();
    env.mock_all_auths();
    let (id, client) = setup(&env);
    let who = Address::generate(&env);
    client.check_in(&who);
    assert_eq!(
        env.auths(),
        std::vec![(
            who.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    id,
                    Symbol::new(&env, "check_in"),
                    (who,).into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

#[test]
fn refuses_a_check_in_the_account_did_not_authorize() {
    let env = Env::default();
    let (_, client) = setup(&env);
    assert!(client.try_check_in(&Address::generate(&env)).is_err());
}
