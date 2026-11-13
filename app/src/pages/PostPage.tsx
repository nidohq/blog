import React from "react"
import { Link, useParams } from "react-router-dom"
import { formatTime, formatXlm, grants } from "../blog"
import { Author } from "../components/Author"
import { BlogAccess } from "../components/BlogAccess"
import { CommentForm, CommentList } from "../components/Comments"
import { SessionGate } from "../components/SessionGate"
import { TipPost } from "../components/TipPost"
import { usePost } from "../hooks/useBlog"
import styles from "./Blog.module.css"

/** One post, its comments, and the forms to tip its author and comment. */
const PostPage: React.FC = () => {
	const id = Number(useParams().id)
	const post = usePost(id)

	if (post.isPending) return <p className={styles.Blog}>Reading the post…</p>
	if (post.isError)
		return (
			<p className={styles.Blog} role="alert">
				Couldn&apos;t read the post: {String(post.error)}
			</p>
		)
	if (!post.data)
		return (
			<div className={styles.Blog}>
				<p>There is no post #{id}.</p>
				<Link to="/">All posts</Link>
			</div>
		)

	const { title, body, author, timestamp, tipped, comment_count } = post.data
	return (
		<div className={styles.Blog}>
			<p>
				<Link to="/">← All posts</Link>
			</p>
			<article className={styles.post}>
				<h1>{title}</h1>
				<p className="post-meta">
					#{id} by <Author address={author} /> · {formatTime(timestamp)}
				</p>
				<div className={styles.body}>{body}</div>
				<p className="post-meta" data-testid="tipped">
					{tipped > 0n
						? `${formatXlm(tipped)} XLM tipped to the author`
						: "No tips yet"}
				</p>
			</article>

			<CommentList postId={id} count={comment_count} />

			{/* One gate for both forms: one approval covers posting,
			    commenting and tipping */}
			<section className="card" aria-label="Tip and comment">
				<SessionGate grants={grants} explain={<BlogAccess />} actionsOnly>
					<TipPost postId={id} author={author} />
					<CommentForm postId={id} />
				</SessionGate>
			</section>
		</div>
	)
}

export default PostPage
