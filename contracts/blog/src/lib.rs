#![no_std]
//! A blog: anyone posts, anyone comments on a post, and anyone tips a post's
//! author in XLM.
//!
//! Storage stays bounded. Titles, bodies and comments have length caps, each
//! post and each comment is its own entry (a comment never rewrites its
//! post), and reads come a page at a time, at most [`MAX_PAGE`] items.
//!
//! A tip goes through this contract: the tipper pays the blog, and the blog
//! pays the author in the same call. A Nido account's XLM grant can then
//! name one address it may pay, this contract, however many authors there
//! are.
use soroban_sdk::{Address, Env, String, Vec, contract, contractevent, contractimpl, contracttype};

mod error;
mod xlm;

pub use error::Error;

/// The longest title, in bytes (UTF-8).
pub const MAX_TITLE: u32 = 100;
/// The longest post body, in bytes (UTF-8).
pub const MAX_BODY: u32 = 2000;
/// The longest comment, in bytes (UTF-8).
pub const MAX_COMMENT: u32 = 280;
/// The most posts or comments one read returns.
pub const MAX_PAGE: u32 = 20;

/// A post as the blog returns it, with its comment count and tips so far.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Post {
    /// Its number: posts count up from 1.
    pub id: u32,
    pub author: Address,
    pub title: String,
    pub body: String,
    /// When it was posted: the ledger's close time, in seconds since 1970.
    pub timestamp: u64,
    pub comment_count: u32,
    /// XLM tipped to its author so far, in stroops (10^-7 XLM).
    pub tipped: i128,
}

/// A comment on a post.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Comment {
    pub author: Address,
    pub text: String,
    /// When it was written: the ledger's close time, in seconds since 1970.
    pub timestamp: u64,
}

/// A post as stored: written once, never rewritten.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Entry {
    pub author: Address,
    pub title: String,
    pub body: String,
    pub timestamp: u64,
}

/// What changes on a post after it is written, kept apart from its text so a
/// comment or a tip rewrites a few bytes rather than the whole post.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Stats {
    pub comment_count: u32,
    pub tipped: i128,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    /// How many posts there are (instance storage).
    PostCount,
    /// A post's text.
    Entry(u32),
    /// A post's comment count and tips.
    Stats(u32),
    /// Comment `index` (from 0) on post `id`.
    Comment(u32, u32),
}

/// Published when a post is written.
#[contractevent]
pub struct Posted {
    #[topic]
    pub id: u32,
    #[topic]
    pub author: Address,
}

/// Published when a comment is written.
#[contractevent]
pub struct Commented {
    #[topic]
    pub post_id: u32,
    #[topic]
    pub author: Address,
    pub index: u32,
}

/// Published when a post's author is tipped.
#[contractevent]
pub struct Tipped {
    #[topic]
    pub post_id: u32,
    #[topic]
    pub tipper: Address,
    pub author: Address,
    pub amount: i128,
}

#[contract]
pub struct Blog;

#[contractimpl]
impl Blog {
    pub fn __constructor(env: &Env) {
        // Unit tests and a fresh local network need the XLM contract set up
        xlm::register(env);
    }

    /// Write a post as `author`, and return its number.
    pub fn post(env: &Env, author: Address, title: String, body: String) -> Result<u32, Error> {
        author.require_auth();
        check_len(&title, MAX_TITLE, Error::TitleEmpty, Error::TitleTooLong)?;
        check_len(&body, MAX_BODY, Error::BodyEmpty, Error::BodyTooLong)?;
        let id = Self::post_count(env) + 1;
        let entry = Entry {
            author: author.clone(),
            title,
            body,
            timestamp: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&Key::Entry(id), &entry);
        env.storage().instance().set(&Key::PostCount, &id);
        Posted { id, author }.publish(env);
        Ok(id)
    }

    /// Comment on post `post_id` as `author`, and return the comment's index
    /// on that post (from 0).
    pub fn comment(env: &Env, author: Address, post_id: u32, text: String) -> Result<u32, Error> {
        author.require_auth();
        check_len(
            &text,
            MAX_COMMENT,
            Error::CommentEmpty,
            Error::CommentTooLong,
        )?;
        let mut stats = stats(env, post_id)?;
        let index = stats.comment_count;
        let comment = Comment {
            author: author.clone(),
            text,
            timestamp: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&Key::Comment(post_id, index), &comment);
        stats.comment_count += 1;
        env.storage().persistent().set(&Key::Stats(post_id), &stats);
        Commented {
            post_id,
            author,
            index,
        }
        .publish(env);
        Ok(index)
    }

    /// Tip the author of post `post_id` `amount` stroops of XLM from
    /// `tipper`. The XLM goes from the tipper to this contract and on to the
    /// author in the same call, so the tipper's authorization names only
    /// this contract as the recipient.
    pub fn tip(env: &Env, tipper: Address, post_id: u32, amount: i128) -> Result<(), Error> {
        tipper.require_auth();
        if amount <= 0 {
            return Err(Error::TipNotPositive);
        }
        let entry = entry(env, post_id)?;
        if entry.author == tipper {
            return Err(Error::OwnPost);
        }
        let xlm = xlm::token_client(env);
        let blog = env.current_contract_address();
        xlm.transfer(&tipper, &blog, &amount);
        xlm.transfer(&blog, &entry.author, &amount);
        let mut stats = stats(env, post_id)?;
        stats.tipped += amount;
        env.storage().persistent().set(&Key::Stats(post_id), &stats);
        Tipped {
            post_id,
            tipper,
            author: entry.author,
            amount,
        }
        .publish(env);
        Ok(())
    }

    /// How many posts there are; the newest is number `post_count()`.
    pub fn post_count(env: &Env) -> u32 {
        env.storage().instance().get(&Key::PostCount).unwrap_or(0)
    }

    /// Post `id`.
    pub fn get_post(env: &Env, id: u32) -> Result<Post, Error> {
        let entry = entry(env, id)?;
        let stats = stats(env, id)?;
        Ok(Post {
            id,
            author: entry.author,
            title: entry.title,
            body: entry.body,
            timestamp: entry.timestamp,
            comment_count: stats.comment_count,
            tipped: stats.tipped,
        })
    }

    /// Up to `limit` posts (at most [`MAX_PAGE`]) from number `first` on, in
    /// the order they were written. Post numbers start at 1.
    pub fn posts(env: &Env, first: u32, limit: u32) -> Vec<Post> {
        let first = first.max(1);
        let end = page_end(first, limit, Self::post_count(env) + 1);
        let mut page = Vec::new(env);
        for id in first..end {
            // Every number up to post_count is a post
            if let Ok(post) = Self::get_post(env, id) {
                page.push_back(post);
            }
        }
        page
    }

    /// Up to `limit` comments (at most [`MAX_PAGE`]) on post `post_id`,
    /// from index `first` (from 0) on, oldest first.
    pub fn comments(
        env: &Env,
        post_id: u32,
        first: u32,
        limit: u32,
    ) -> Result<Vec<Comment>, Error> {
        let count = stats(env, post_id)?.comment_count;
        let mut page = Vec::new(env);
        for index in first..page_end(first, limit, count) {
            if let Some(comment) = env
                .storage()
                .persistent()
                .get(&Key::Comment(post_id, index))
            {
                page.push_back(comment);
            }
        }
        Ok(page)
    }
}

/// `text` must be non-empty and at most `max` bytes.
fn check_len(text: &String, max: u32, empty: Error, too_long: Error) -> Result<(), Error> {
    match text.len() {
        0 => Err(empty),
        n if n > max => Err(too_long),
        _ => Ok(()),
    }
}

fn entry(env: &Env, id: u32) -> Result<Entry, Error> {
    env.storage()
        .persistent()
        .get(&Key::Entry(id))
        .ok_or(Error::PostNotFound)
}

/// A post's comment count and tips; zero for a post nobody has touched yet.
fn stats(env: &Env, id: u32) -> Result<Stats, Error> {
    if !env.storage().persistent().has(&Key::Entry(id)) {
        return Err(Error::PostNotFound);
    }
    Ok(env
        .storage()
        .persistent()
        .get(&Key::Stats(id))
        .unwrap_or_default())
}

/// Where a page that starts at `first` stops (exclusive): at most
/// [`MAX_PAGE`] and `limit` items, and never past `end`.
fn page_end(first: u32, limit: u32, end: u32) -> u32 {
    first.saturating_add(limit.min(MAX_PAGE)).min(end)
}

#[cfg(test)]
mod test;
