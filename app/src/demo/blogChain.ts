import {
	Address,
	nativeToScVal,
	scValToNative,
	xdr,
} from "@stellar/stellar-sdk"

// The blog contract in memory: a copy of its storage, encoded as the contract
// encodes it, so the generated client parses its answers for real. The
// browser tests run the mocked network on it (reads, and the calls Nido's
// relayer submits); a demo build (./index.ts) reads from it.

type Comment = { author: string; text: string; timestamp: bigint }
type Post = {
	author: string
	title: string
	body: string
	timestamp: bigint
	comments: Comment[]
	tipped: bigint
}

/** A contract struct: a map keyed by field name, in name order. */
const struct = (fields: Record<string, xdr.ScVal>) =>
	xdr.ScVal.scvMap(
		Object.keys(fields)
			.sort()
			.map(
				(key) =>
					new xdr.ScMapEntry({
						key: xdr.ScVal.scvSymbol(key),
						val: fields[key]!,
					}),
			),
	)
const u32 = (n: number) => nativeToScVal(n, { type: "u32" })
const address = (a: string) => new Address(a).toScVal()

export class BlogChain {
	posts: Post[] = []
	/** The ledger's close time, in seconds: an hour ago, to start. */
	now = BigInt(Math.floor(Date.now() / 1000) - 3600)

	/** Seed a post by someone else, as if it was already on chain. */
	seed(title: string, body: string, author: string) {
		this.posts.push({
			author,
			title,
			body,
			timestamp: this.now,
			comments: [],
			tipped: 0n,
		})
	}

	private post(id: number) {
		const post = this.posts[id - 1]!
		return struct({
			author: address(post.author),
			body: nativeToScVal(post.body),
			comment_count: u32(post.comments.length),
			id: u32(id),
			timestamp: nativeToScVal(post.timestamp, { type: "u64" }),
			tipped: nativeToScVal(post.tipped, { type: "i128" }),
			title: nativeToScVal(post.title),
		})
	}

	/** The options for `mockServices` that make the network run this blog. */
	services = {
		read: (method: string, args: xdr.ScVal[]) => {
			const [a, b, c] = args.map((v) => Number(scValToNative(v)))
			if (method === "post_count") return u32(this.posts.length)
			if (method === "get_post")
				return this.posts[a! - 1]
					? this.post(a!)
					: // Error::PostNotFound, as the contract answers
						xdr.ScVal.scvError(xdr.ScError.sceContract(7))
			if (method === "posts") {
				const first = Math.max(1, a!)
				const end = Math.min(first + Math.min(b!, 20), this.posts.length + 1)
				const ids = Array.from(
					{ length: Math.max(0, end - first) },
					(_, i) => first + i,
				)
				return xdr.ScVal.scvVec(ids.map((id) => this.post(id)))
			}
			if (method === "comments")
				return xdr.ScVal.scvVec(
					this.posts[a! - 1]!.comments.slice(b!, b! + Math.min(c!, 20)).map(
						(comment) =>
							struct({
								author: address(comment.author),
								text: nativeToScVal(comment.text),
								timestamp: nativeToScVal(comment.timestamp, { type: "u64" }),
							}),
					),
				)
			return undefined
		},
		relay: (method: string, args: xdr.ScVal[]) => {
			const values = args.map((v) => scValToNative(v) as unknown)
			this.now += 60n
			if (method === "post") {
				const [author, title, body] = values as [string, string, string]
				this.posts.push({
					author,
					title,
					body,
					timestamp: this.now,
					comments: [],
					tipped: 0n,
				})
				return u32(this.posts.length)
			}
			if (method === "comment") {
				const [author, id, text] = values as [string, number, string]
				const { comments } = this.posts[id - 1]!
				comments.push({ author, text, timestamp: this.now })
				return u32(comments.length - 1)
			}
			if (method === "tip") {
				const [, id, amount] = values as [string, number, bigint]
				this.posts[id - 1]!.tipped += amount
				return xdr.ScVal.scvVoid()
			}
			throw new Error(`The blog has no ${method}`)
		},
		/** Only a tip moves XLM, so only a tip counts against the cap. */
		spend: (method: string, args: xdr.ScVal[]) =>
			method === "tip" ? BigInt(scValToNative(args[2]!) as bigint) : 0n,
	}
}

/** Someone other than the connected account, to write posts to tip. */
export const someoneElse =
	"GABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQHGPC"
