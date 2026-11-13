/// Why the blog refused a call. The app shows the same sentences
/// (`app/src/blog.ts`), by code and by name.
#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// A post needs a title.
    TitleEmpty = 1,
    /// The title is longer than 100 bytes.
    TitleTooLong = 2,
    /// A post needs a body.
    BodyEmpty = 3,
    /// The post is longer than 2000 bytes.
    BodyTooLong = 4,
    /// A comment needs some text.
    CommentEmpty = 5,
    /// The comment is longer than 280 bytes.
    CommentTooLong = 6,
    /// There is no post with that number.
    PostNotFound = 7,
    /// A tip must be more than zero.
    TipNotPositive = 8,
    /// You can't tip your own post.
    OwnPost = 9,
}
