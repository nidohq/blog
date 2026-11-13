import {
	CapReachedError,
	capReachedUntil,
	isOverCap,
} from "@stellar-scaffold/app-lib"
import { blog } from "@stellar-scaffold/app-lib/clients"
import { useState, type FormEvent } from "react"
import { DAILY_TIP_CAP, parseXlm, tipGrants } from "../blog"
import { useBlogCall } from "../hooks/useBlogCall"
import { useSessionClock } from "../hooks/useSessionStatus"
import { CallStatus } from "./CallStatus"

const time = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	hour: "numeric",
	minute: "2-digit",
})

/** What the cap refusals mean for a tip, in this blog's words. */
const overCap = (error: unknown) =>
	error instanceof CapReachedError
		? `That would go over the ${DAILY_TIP_CAP} XLM a day you let this blog tip, so the tip stopped before your device was asked or anything was sent. It cost nothing.`
		: isOverCap(error)
			? `That would go over the ${DAILY_TIP_CAP} XLM a day you let this blog tip, so your account stopped it before anything was sent. It cost nothing.`
			: undefined

/** Tip a post's author in XLM. The XLM goes from you to the blog and on to
 * the author in one call; render it inside the page's `SessionGate`. */
export const TipPost = ({
	postId,
	author,
}: {
	postId: number
	author: string
}) => {
	const { address, stage, error, hash, run } = useBlogCall()
	const [amount, setAmount] = useState("1")
	const [tipped, setTipped] = useState<string>()
	// When the account last refused a tip for the cap, until it frees up: say
	// so and keep the button off, rather than asking the device again
	const now = useSessionClock()
	const capUntil = address
		? capReachedUntil(address, tipGrants, now)
		: undefined
	const stroops = parseXlm(amount)
	const own = address === author

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		if (!address || !stroops) return
		setTipped(undefined)
		const sent = amount
		const done = await run(
			(publicKey) =>
				blog.tip(
					{ tipper: address, post_id: postId, amount: stroops },
					{ publicKey },
				),
			overCap,
		)
		if (done) setTipped(sent)
	}

	return (
		<div className="tip-post">
			<form onSubmit={(event) => void submit(event)} aria-busy={!!stage}>
				<label>
					Tip the author
					<span className="tip-amount">
						<input
							name="amount"
							type="number"
							inputMode="decimal"
							min="0.1"
							max={DAILY_TIP_CAP}
							step="0.1"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							readOnly={!!stage}
						/>
						XLM
					</span>
				</label>
				<button
					type="submit"
					disabled={!address || !!stage || !stroops || own || !!capUntil}
				>
					{stage ? "Tipping…" : "Tip"}
				</button>
			</form>
			{!address && <p className="session-note">Connect to tip.</p>}
			{own && <p className="session-note">This is your post.</p>}
			{capUntil && !stage && (
				<p className="session-note" role="status">
					Tip cap reached
					{capUntil < Number.MAX_SAFE_INTEGER &&
						` until ≈ ${time.format(capUntil)}`}
					: your account lets this blog tip {DAILY_TIP_CAP} XLM in any 24 hours.
				</p>
			)}
			{tipped && !stage && (
				<p className="tip-sent" role="status">
					You tipped the author {tipped} XLM.
				</p>
			)}
			<CallStatus stage={stage} error={error} hash={hash} />
		</div>
	)
}
