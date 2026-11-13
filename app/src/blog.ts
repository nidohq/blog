import { xlmTokenId, type Grant } from "@stellar-scaffold/app-lib"
import { blog } from "@stellar-scaffold/app-lib/clients"

// What the blog contract accepts (contracts/blog/src/lib.rs), so the forms
// can say so before anything is signed. Lengths are UTF-8 bytes.
export const MAX_TITLE = 100
export const MAX_BODY = 2000
export const MAX_COMMENT = 280
/** Posts or comments per read; the contract returns at most 20. */
export const PAGE = 10

/** The most a session may tip in any 24 hours, in XLM. It matches the
 * session's 24-hour duration, so it is also the most one approval can ever
 * spend. */
export const DAILY_TIP_CAP = 5

/**
 * What the app asks a Nido account to approve, once, for 24 hours: one rule
 * per contract a call authorizes (see `env.auths()` in
 * contracts/blog/src/test.rs).
 *
 * - `post`, `comment` and `tip` on the blog. These calls move no XLM by
 *   themselves, so the rule has no cap.
 * - XLM `transfer`, paying only the blog, at most 5 XLM a day. A tip moves
 *   XLM from the tipper to the blog, which passes it on to the post's author
 *   in the same call; that is why the rule can name the one address it pays.
 *
 * Every screen asks for the same two rules, so one approval covers them all.
 */
export const grants: Grant[] = [
	{
		target: blog.options.contractId,
		functions: ["post", "comment", "tip"],
		duration: "24h",
		label: "blog",
	},
	{
		target: xlmTokenId,
		functions: ["transfer"],
		duration: "24h",
		limit: { amount: String(DAILY_TIP_CAP), period: "day" },
		to: blog.options.contractId,
		label: "blog-tips",
	},
]

/** The grant for tips alone, to ask whether its cap is spent. */
export const tipGrants = grants.filter((g) => g.label === "blog-tips")

/** The blog's refusals (contracts/blog/src/error.rs) as sentences, by
 * variant name, in code order from #1. */
const refusals: Record<string, string> = {
	TitleEmpty: "A post needs a title.",
	TitleTooLong: `The title is longer than ${MAX_TITLE} bytes.`,
	BodyEmpty: "A post needs a body.",
	BodyTooLong: `The post is longer than ${MAX_BODY} bytes.`,
	CommentEmpty: "A comment needs some text.",
	CommentTooLong: `The comment is longer than ${MAX_COMMENT} bytes.`,
	PostNotFound: "There is no post with that number.",
	TipNotPositive: "A tip must be more than zero.",
	OwnPost: "You can't tip your own post.",
}

/** The same sentences by error code, for `describe(error, blogErrors)`. */
export const blogErrors: Record<number, string> = Object.fromEntries(
	Object.values(refusals).map((text, i) => [i + 1, text]),
)

/** A refusal the generated client returned (its `Errors` table names the
 * variant), as a sentence. */
export const refusal = (name: string) => refusals[name] ?? name

const encoder = new TextEncoder()
/** How the contract measures text: UTF-8 bytes. */
export const byteLength = (text: string) => encoder.encode(text).length

const STROOPS = 10_000_000n

/** Whole XLM and up to 7 decimals, as stroops; undefined when it isn't an
 * amount. */
export function parseXlm(text: string): bigint | undefined {
	const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(text.trim())
	if (!match) return undefined
	return BigInt(match[1]!) * STROOPS + BigInt((match[2] ?? "").padEnd(7, "0"))
}

/** Stroops as XLM, without trailing zeros: 12_500_000n → "1.25". */
export function formatXlm(stroops: bigint): string {
	const whole = stroops / STROOPS
	const fraction = (stroops % STROOPS).toString().padStart(7, "0")
	const trimmed = fraction.replace(/0+$/, "")
	return trimmed ? `${whole}.${trimmed}` : String(whole)
}

const dateTime = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
})
/** A ledger close time (seconds since 1970) as a local date and time. */
export const formatTime = (seconds: bigint) =>
	dateTime.format(new Date(Number(seconds) * 1000))
