extern crate std;

use super::*;
use soroban_sdk::testutils::{
    Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, Ledger as _,
};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Event as _, IntoVal, Symbol, vec};
use std::string::{String as StdString, ToString as _};

struct Setup<'a> {
    env: Env,
    blog: BlogClient<'a>,
    xlm: TokenClient<'a>,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.ledger().set_timestamp(1_700_000_000);
    let id = env.register(Blog, ());
    let blog = BlogClient::new(&env, &id);
    let xlm = TokenClient::new(&env, &env.as_contract(&id, || xlm::contract_id(&env)));
    Setup { env, blog, xlm }
}

impl Setup<'_> {
    fn s(&self, text: &str) -> String {
        String::from_str(&self.env, text)
    }

    /// A new account holding `xlm` XLM.
    fn funded(&self, xlm: i128) -> Address {
        let who = Address::generate(&self.env);
        self.env.mock_all_auths();
        StellarAssetClient::new(&self.env, &self.xlm.address).mint(&who, &(xlm * 10_000_000));
        who
    }

    /// A post by `author`, with every auth mocked.
    fn post_by(&self, author: &Address, title: &str) -> u32 {
        self.env.mock_all_auths();
        self.blog.post(author, &self.s(title), &self.s("Body"))
    }
}

/// `n` bytes of text.
fn bytes(n: u32) -> StdString {
    "a".repeat(n as usize)
}

// --- post ---------------------------------------------------------------

#[test]
fn post_stores_author_title_body_and_time() {
    let t = setup();
    let alice = Address::generate(&t.env);
    assert_eq!(t.blog.post_count(), 0);
    assert_eq!(t.post_by(&alice, "Hello"), 1);
    t.env.ledger().set_timestamp(1_700_000_060);
    assert_eq!(t.post_by(&alice, "Again"), 2);
    assert_eq!(t.blog.post_count(), 2);
    assert_eq!(
        t.blog.get_post(&1),
        Post {
            id: 1,
            author: alice.clone(),
            title: t.s("Hello"),
            body: t.s("Body"),
            timestamp: 1_700_000_000,
            comment_count: 0,
            tipped: 0,
        }
    );
    assert_eq!(t.blog.get_post(&2).timestamp, 1_700_000_060);
}

#[test]
fn post_publishes_an_event() {
    let t = setup();
    let alice = Address::generate(&t.env);
    t.post_by(&alice, "Hello");
    assert_eq!(
        t.env.events().all().filter_by_contract(&t.blog.address),
        [Posted {
            id: 1,
            author: alice
        }
        .to_xdr(&t.env, &t.blog.address)]
    );
}

#[test]
fn post_caps_title_and_body() {
    let t = setup();
    t.env.mock_all_auths();
    let alice = Address::generate(&t.env);
    let post = |title: &str, body: &str| t.blog.try_post(&alice, &t.s(title), &t.s(body));
    assert_eq!(post("", "Body"), Err(Ok(Error::TitleEmpty)));
    assert_eq!(post("Title", ""), Err(Ok(Error::BodyEmpty)));
    assert_eq!(
        post(&bytes(MAX_TITLE + 1), "Body"),
        Err(Ok(Error::TitleTooLong))
    );
    assert_eq!(
        post("Title", &bytes(MAX_BODY + 1)),
        Err(Ok(Error::BodyTooLong))
    );
    // Exactly at the caps is fine
    assert_eq!(post(&bytes(MAX_TITLE), &bytes(MAX_BODY)), Ok(Ok(1)));
    // Nothing refused was stored
    assert_eq!(t.blog.post_count(), 1);
}

#[test]
fn caps_count_bytes_not_characters() {
    let t = setup();
    t.env.mock_all_auths();
    let alice = Address::generate(&t.env);
    // "é" is two bytes in UTF-8
    let title = |chars: u32| "é".repeat(chars as usize);
    assert!(
        t.blog
            .try_post(&alice, &t.s(&title(MAX_TITLE / 2)), &t.s("Body"))
            .is_ok()
    );
    assert_eq!(
        t.blog
            .try_post(&alice, &t.s(&title(MAX_TITLE / 2 + 1)), &t.s("Body")),
        Err(Ok(Error::TitleTooLong))
    );
}

/// `env.auths()` is the call's authorization tree, and so the grants a Nido
/// account needs: posting authorizes `post` on the blog and nothing else.
#[test]
fn post_needs_only_the_blog_grant() {
    let t = setup();
    t.env.mock_all_auths();
    let alice = Address::generate(&t.env);
    t.blog.post(&alice, &t.s("Hello"), &t.s("Body"));
    assert_eq!(
        t.env.auths(),
        std::vec![(
            alice.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    t.blog.address.clone(),
                    Symbol::new(&t.env, "post"),
                    (alice, t.s("Hello"), t.s("Body")).into_val(&t.env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

#[test]
fn post_refuses_without_the_authors_authorization() {
    let t = setup();
    let alice = Address::generate(&t.env);
    assert!(
        t.blog
            .try_post(&alice, &t.s("Hello"), &t.s("Body"))
            .is_err()
    );
    assert_eq!(t.blog.post_count(), 0);
}

// --- comment ------------------------------------------------------------

#[test]
fn comment_stores_author_text_and_time() {
    let t = setup();
    let (alice, bob) = (Address::generate(&t.env), Address::generate(&t.env));
    let id = t.post_by(&alice, "Hello");
    t.env.ledger().set_timestamp(1_700_000_030);
    assert_eq!(t.blog.comment(&bob, &id, &t.s("Nice")), 0);
    assert_eq!(t.blog.comment(&alice, &id, &t.s("Thanks")), 1);
    // Events are those of the last call
    let events = t.env.events().all().filter_by_contract(&t.blog.address);
    assert_eq!(t.blog.get_post(&id).comment_count, 2);
    assert_eq!(
        t.blog.comments(&id, &0, &10),
        vec![
            &t.env,
            Comment {
                author: bob.clone(),
                text: t.s("Nice"),
                timestamp: 1_700_000_030,
            },
            Comment {
                author: alice.clone(),
                text: t.s("Thanks"),
                timestamp: 1_700_000_030,
            },
        ]
    );
    assert_eq!(
        events,
        [Commented {
            post_id: id,
            author: alice,
            index: 1,
        }
        .to_xdr(&t.env, &t.blog.address)]
    );
}

#[test]
fn comment_caps_text_and_needs_a_post() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    let comment = |post: u32, text: &str| t.blog.try_comment(&alice, &post, &t.s(text));
    assert_eq!(comment(id, ""), Err(Ok(Error::CommentEmpty)));
    assert_eq!(
        comment(id, &bytes(MAX_COMMENT + 1)),
        Err(Ok(Error::CommentTooLong))
    );
    assert_eq!(comment(id + 1, "Hi"), Err(Ok(Error::PostNotFound)));
    assert_eq!(comment(0, "Hi"), Err(Ok(Error::PostNotFound)));
    assert_eq!(comment(id, &bytes(MAX_COMMENT)), Ok(Ok(0)));
    assert_eq!(t.blog.get_post(&id).comment_count, 1);
}

#[test]
fn comment_needs_only_the_blog_grant() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    t.blog.comment(&alice, &id, &t.s("Hi"));
    assert_eq!(
        t.env.auths(),
        std::vec![(
            alice.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    t.blog.address.clone(),
                    Symbol::new(&t.env, "comment"),
                    (alice, id, t.s("Hi")).into_val(&t.env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

#[test]
fn comment_refuses_without_the_authors_authorization() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    t.env.set_auths(&[]);
    assert!(t.blog.try_comment(&alice, &id, &t.s("Hi")).is_err());
    assert_eq!(t.blog.get_post(&id).comment_count, 0);
}

// --- tip ----------------------------------------------------------------

#[test]
fn tip_pays_the_author_through_the_blog() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    let bob = t.funded(10);
    t.blog.tip(&bob, &id, &20_000_000);
    t.blog.tip(&bob, &id, &5_000_000);
    let events = t.env.events().all().filter_by_contract(&t.blog.address);
    assert_eq!(t.xlm.balance(&bob), 75_000_000);
    assert_eq!(t.xlm.balance(&alice), 25_000_000);
    // The blog keeps nothing
    assert_eq!(t.xlm.balance(&t.blog.address), 0);
    assert_eq!(t.blog.get_post(&id).tipped, 25_000_000);
    assert_eq!(
        events,
        [Tipped {
            post_id: id,
            tipper: bob,
            author: alice,
            amount: 5_000_000,
        }
        .to_xdr(&t.env, &t.blog.address)]
    );
}

/// A tip authorizes `tip` on the blog and, under it, an XLM `transfer` from
/// the tipper to the blog: two grants. The blog's payment to the author is
/// the blog's own, so the tipper's XLM grant can name the blog as the only
/// address it pays.
#[test]
fn tip_needs_the_blog_grant_and_an_xlm_grant_that_pays_only_the_blog() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    let bob = t.funded(10);
    t.blog.tip(&bob, &id, &10_000_000);
    assert_eq!(
        t.env.auths(),
        std::vec![(
            bob.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    t.blog.address.clone(),
                    Symbol::new(&t.env, "tip"),
                    (bob.clone(), id, 10_000_000i128).into_val(&t.env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        t.xlm.address.clone(),
                        Symbol::new(&t.env, "transfer"),
                        (bob, t.blog.address.clone(), 10_000_000i128).into_val(&t.env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );
}

#[test]
fn tip_refuses_nothing_its_own_author_and_missing_posts() {
    let t = setup();
    let alice = t.funded(10);
    let id = t.post_by(&alice, "Hello");
    let bob = t.funded(10);
    assert_eq!(
        t.blog.try_tip(&bob, &id, &0),
        Err(Ok(Error::TipNotPositive))
    );
    assert_eq!(
        t.blog.try_tip(&bob, &id, &-1),
        Err(Ok(Error::TipNotPositive))
    );
    assert_eq!(t.blog.try_tip(&alice, &id, &1), Err(Ok(Error::OwnPost)));
    assert_eq!(
        t.blog.try_tip(&bob, &(id + 1), &1),
        Err(Ok(Error::PostNotFound))
    );
    assert_eq!(t.xlm.balance(&bob), 100_000_000);
    assert_eq!(t.blog.get_post(&id).tipped, 0);
}

#[test]
fn tip_fails_without_the_funds() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    let bob = t.funded(1);
    assert!(t.blog.try_tip(&bob, &id, &20_000_000).is_err());
    assert_eq!(t.xlm.balance(&bob), 10_000_000);
    assert_eq!(t.blog.get_post(&id).tipped, 0);
}

#[test]
fn tip_refuses_without_the_tippers_authorization() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    let bob = t.funded(10);
    t.env.set_auths(&[]);
    assert!(t.blog.try_tip(&bob, &id, &10_000_000).is_err());
    assert_eq!(t.xlm.balance(&bob), 100_000_000);
}

// --- reads --------------------------------------------------------------

#[test]
fn get_post_refuses_a_missing_post() {
    let t = setup();
    assert_eq!(t.blog.try_get_post(&0), Err(Ok(Error::PostNotFound)));
    assert_eq!(t.blog.try_get_post(&1), Err(Ok(Error::PostNotFound)));
}

#[test]
fn posts_come_a_page_at_a_time() {
    let t = setup();
    let alice = Address::generate(&t.env);
    for n in 0..25 {
        t.post_by(&alice, &std::format!("Post {n}"));
    }
    let ids = |first: u32, limit: u32| -> std::vec::Vec<u32> {
        t.blog.posts(&first, &limit).iter().map(|p| p.id).collect()
    };
    assert_eq!(ids(1, 3), [1, 2, 3]);
    assert_eq!(ids(24, 10), [24, 25]);
    // A page never holds more than MAX_PAGE
    assert_eq!(ids(1, 100).len(), MAX_PAGE as usize);
    assert_eq!(ids(1, u32::MAX).len(), MAX_PAGE as usize);
    // Numbers start at 1; 0 means the first
    assert_eq!(ids(0, 2), [1, 2]);
    assert!(ids(26, 5).is_empty());
    assert!(ids(u32::MAX, 5).is_empty());
    assert!(ids(1, 0).is_empty());
    assert_eq!(t.blog.posts(&1, &1).get_unchecked(0).title, t.s("Post 0"));
}

#[test]
fn comments_come_a_page_at_a_time() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    for n in 0..25 {
        t.blog
            .comment(&alice, &id, &t.s(&std::format!("Comment {n}")));
    }
    let texts = |first: u32, limit: u32| -> std::vec::Vec<StdString> {
        t.blog
            .comments(&id, &first, &limit)
            .iter()
            .map(|c| c.text.to_string())
            .collect()
    };
    assert_eq!(texts(0, 2), ["Comment 0", "Comment 1"]);
    assert_eq!(texts(23, 10), ["Comment 23", "Comment 24"]);
    assert_eq!(texts(0, 100).len(), MAX_PAGE as usize);
    assert!(texts(25, 5).is_empty());
    assert!(texts(u32::MAX, 5).is_empty());
    assert_eq!(
        t.blog.try_comments(&2, &0, &5),
        Err(Ok(Error::PostNotFound))
    );
}

#[test]
fn a_post_with_no_comments_has_an_empty_page() {
    let t = setup();
    let alice = Address::generate(&t.env);
    let id = t.post_by(&alice, "Hello");
    assert!(t.blog.comments(&id, &0, &MAX_PAGE).is_empty());
}
