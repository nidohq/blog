import { blog } from "@stellar-scaffold/app-lib/clients"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { MAX_BODY, MAX_TITLE, byteLength, demo, grants } from "../blog"
import { useBlogCall } from "../hooks/useBlogCall"
import { BlogAccess } from "./BlogAccess"
import { ByteCount } from "./ByteCount"
import { CallStatus } from "./CallStatus"
import { DemoClosed } from "./DemoBanner"
import { SessionGate } from "./SessionGate"

/** Write a post. For a Nido account it is one device passkey prompt under
 * the session the gate asks for, and no Nido page. */
export const WritePost = () => {
	const navigate = useNavigate()
	const { address, stage, error, hash, run } = useBlogCall()
	const [title, setTitle] = useState("")
	const [body, setBody] = useState("")
	const fits =
		title.trim() !== "" &&
		body.trim() !== "" &&
		byteLength(title) <= MAX_TITLE &&
		byteLength(body) <= MAX_BODY

	// A submit handler, not a form action: React holds a form action's state
	// updates until it ends, so the progress would never show.
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!address) return
		const done = await run((publicKey) =>
			blog.post({ author: address, title, body }, { publicKey }),
		)
		if (!done) return
		setTitle("")
		setBody("")
		void navigate(`/posts/${done.value}`, { state: { hash: done.hash } })
	}

	if (demo)
		return (
			<section className="card write-post">
				<h2>Write a post</h2>
				<BlogAccess />
				<DemoClosed action="post" />
			</section>
		)

	return (
		<section className="card write-post">
			<h2>Write a post</h2>
			<SessionGate grants={grants} explain={<BlogAccess />} actionsOnly>
				<form onSubmit={(event) => void submit(event)} aria-busy={!!stage}>
					<label>
						Title <ByteCount text={title} max={MAX_TITLE} />
						<input
							name="title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							readOnly={!!stage}
							required
						/>
					</label>
					<label>
						Post <ByteCount text={body} max={MAX_BODY} />
						<textarea
							name="body"
							rows={6}
							value={body}
							onChange={(e) => setBody(e.target.value)}
							readOnly={!!stage}
							required
						/>
					</label>
					<button type="submit" disabled={!address || !!stage || !fits}>
						{stage ? "Posting…" : "Post"}
					</button>
					{!address && <p className="session-note">Connect to post.</p>}
				</form>
				<CallStatus stage={stage} error={error} hash={hash} />
			</SessionGate>
		</section>
	)
}
