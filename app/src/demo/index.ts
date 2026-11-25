import { blog } from "@stellar-scaffold/app-lib/clients"
import { BlogChain } from "./blogChain"

// Demo data for a build with no deployed contract (see `demo` in
// ../blog.ts): the in-memory blog the browser tests use, seeded with a few
// posts. Reads go through the generated client's own spec, so the app sees
// exactly the values a real contract would return. Nothing here signs or
// sends anything; the app keeps its forms closed in a demo.

// Three made-up authors
const ada = "GAFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWCYLBMFQWYPX"
const bo = "GAGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYXH2"
const cy = "GAGQ2DINBUGQ2DINBUGQ2DINBUGQ2DINBUGQ2DINBUGQ2DINBUGQ3Y7Y"

const chain = new BlogChain()
chain.seed(
	"Why this blog asks once",
	"Every post, comment and tip here is a contract call from your Nido account. Rather than open Nido for each one, the blog asks you once to approve two rules: one that lets its own passkey post, comment and tip, and one that lets it send XLM to the blog, at most 5 XLM a day.\n\nAfter that, each call asks your device for the blog's passkey and nothing else.",
	ada,
)
chain.seed(
	"Tips go through the blog",
	"A Perch rule can name one address it may pay. So a tip goes from you to the blog, and the blog passes it on to the author in the same call. The blog keeps nothing, and the rule never pays anyone but the blog.",
	bo,
)
chain.seed(
	"Small, bounded storage",
	"Titles stop at 100 bytes, posts at 2000 and comments at 280. Each comment is its own entry, so a busy post never grows.",
	ada,
)
const comment = (post: number, author: string, text: string) =>
	chain.posts[post - 1]!.comments.push({
		author,
		text,
		timestamp: (chain.now += 90n),
	})
comment(1, bo, "One approval, then just my device. Nice.")
comment(1, cy, "What happens after 5 XLM?")
comment(1, ada, "Your account refuses the next tip before anything is sent.")
comment(2, cy, "So the XLM rule's 'Pays to' is the blog itself.")
chain.posts[0]!.tipped = 30_000_000n
chain.posts[1]!.tipped = 5_000_000n

/** Call a read-only blog function against the demo data, and decode its
 * answer as the generated client decodes the contract's. */
export function read(method: string, args: object = {}): unknown {
	const value = chain.services.read(
		method,
		blog.spec.funcArgsToScVals(method, args),
	)
	if (!value) throw new Error(`The demo has no ${method}`)
	return blog.spec.funcResToNative(method, value) as unknown
}
