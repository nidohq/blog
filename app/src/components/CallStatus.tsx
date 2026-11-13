import { type SubmitStage } from "@stellar-scaffold/app-lib"
import { TxLink } from "./Explorer"
import { Pending, stageText } from "./Pending"

/** What a blog call waits for, why it failed, or the transaction it made. */
export const CallStatus = ({
	stage,
	error,
	hash,
}: {
	stage?: SubmitStage
	error?: string
	hash?: string
}) => (
	<>
		{stage && <Pending>{stageText[stage]}</Pending>}
		{error && !stage && (
			<p className="call-error" role="alert">
				{error}
			</p>
		)}
		{hash && !stage && !error && (
			<p className="session-note">
				Transaction <code>{hash.slice(0, 12)}…</code> <TxLink hash={hash} />
			</p>
		)}
	</>
)
