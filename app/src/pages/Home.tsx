import React, { useState } from "react"
import { Link } from "react-router-dom"
import { formatTime, formatXlm, PAGE } from "../blog"
import { Author } from "../components/Author"
import { WritePost } from "../components/WritePost"
import { usePostCount, usePostPage } from "../hooks/useBlog"
import styles from "./Blog.module.css"

/** The newest posts, a page at a time, and a form to write one. */
const Home: React.FC = () => {
	const count = usePostCount()
	const [page, setPage] = useState(0)
	const posts = usePostPage(page, count.data)
	const pages = Math.max(1, Math.ceil((count.data ?? 0) / PAGE))

	return (
		<div className={styles.Blog}>
			<header className={styles.intro}>
				<h1>Blog</h1>
				<p>
					An example Stellar app: write posts, comment on them, and tip their
					authors in XLM, from a Nido passkey account. Approve the blog once and
					each post, comment and tip after that asks your device for the
					app&apos;s passkey and nothing else, with tips capped at a few XLM a
					day. Testnet only.
				</p>
			</header>

			<WritePost />

			<section aria-label="Posts">
				<h2>Posts</h2>
				{(count.isError || posts.isError) && (
					<p role="alert">
						Couldn&apos;t read the blog: {String(count.error ?? posts.error)}
					</p>
				)}
				{count.data === 0 && <p>No posts yet. Write the first one.</p>}
				<ol className={styles.postList}>
					{posts.data?.map((post) => (
						<li key={post.id} className="card">
							<h3>
								<Link to={`/posts/${post.id}`}>{post.title}</Link>
							</h3>
							<p className="post-meta">
								#{post.id} by <Author address={post.author} /> ·{" "}
								{formatTime(post.timestamp)} · {post.comment_count}{" "}
								{post.comment_count === 1 ? "comment" : "comments"}
								{post.tipped > 0n && ` · ${formatXlm(post.tipped)} XLM tipped`}
							</p>
						</li>
					))}
				</ol>
				{pages > 1 && (
					<nav className={styles.pager} aria-label="Pages">
						<button
							type="button"
							onClick={() => setPage(page - 1)}
							disabled={page === 0}
						>
							Newer
						</button>
						<span>
							Page {page + 1} of {pages}
						</span>
						<button
							type="button"
							onClick={() => setPage(page + 1)}
							disabled={page + 1 >= pages}
						>
							Older
						</button>
					</nav>
				)}
			</section>
		</div>
	)
}

export default Home
