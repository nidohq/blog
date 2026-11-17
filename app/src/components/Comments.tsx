import { blog } from "@stellar-scaffold/app-lib/clients"
import { useState, type FormEvent } from "react"
import { MAX_COMMENT, byteLength, formatTime } from "../blog"
import { useComments } from "../hooks/useBlog"
import { useBlogCall } from "../hooks/useBlogCall"
import { Author } from "./Author"
import { ByteCount } from "./ByteCount"
import { CallStatus } from "./CallStatus"

/** A post's comments, oldest first, a page at a time. */
export const CommentList = ({
	postId,
	count,
}: {
	postId: number
	count: number
}) => {
	const comments = useComments(postId, count)
	const all = comments.data?.pages.flat() ?? []
	return (
		<section className="comments" aria-label="Comments">
			<h2>
				{count} {count === 1 ? "comment" : "comments"}
			</h2>
			{comments.isError && (
				<p role="alert">
					Couldn&apos;t read the comments: {String(comments.error)}
				</p>
			)}
			<ol className="comment-list">
				{all.map((comment, i) => (
					<li key={i} className="comment">
						<p className="post-meta">
							<Author address={comment.author} /> ·{" "}
							{formatTime(comment.timestamp)}
						</p>
						<p className="comment-text">{comment.text}</p>
					</li>
				))}
			</ol>
			{comments.hasNextPage && (
				<button
					type="button"
					onClick={() => void comments.fetchNextPage()}
					disabled={comments.isFetchingNextPage}
				>
					More comments
				</button>
			)}
		</section>
	)
}

/** Comment on post `postId`: one device passkey prompt for a Nido account
 * with the blog approved. Render it inside the page's `SessionGate`. */
export const CommentForm = ({ postId }: { postId: number }) => {
	const { address, stage, error, hash, run } = useBlogCall()
	const [text, setText] = useState("")
	const fits = text.trim() !== "" && byteLength(text) <= MAX_COMMENT

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!address) return
		const done = await run((publicKey) =>
			blog.comment({ author: address, post_id: postId, text }, { publicKey }),
		)
		if (done) setText("")
	}

	return (
		<>
			<form
				className="comment-form"
				onSubmit={(event) => void submit(event)}
				aria-busy={!!stage}
			>
				<label>
					Your comment <ByteCount text={text} max={MAX_COMMENT} />
					<textarea
						name="comment"
						rows={3}
						value={text}
						onChange={(e) => setText(e.target.value)}
						readOnly={!!stage}
						required
					/>
				</label>
				<button type="submit" disabled={!address || !!stage || !fits}>
					{stage ? "Commenting…" : "Comment"}
				</button>
				{!address && <p className="session-note">Connect to comment.</p>}
			</form>
			<CallStatus stage={stage} error={error} hash={hash} />
		</>
	)
}
