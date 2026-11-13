import {
	activeSession,
	forgetSession,
	grantTransaction,
	isSmartAccount,
} from "@stellar-scaffold/app-lib"
import { useQuery } from "@tanstack/react-query"
import { useSessionClock } from "../hooks/useSessionStatus"
import { useWallet } from "../hooks/useWallet"
import { TxLink } from "./Explorer"

const time = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	hour: "numeric",
	minute: "2-digit",
})

/** One line, once per page, while this app's passkey holds an approved
 * session for the connected Nido account. */
export const SessionNote = () => {
	const { address } = useWallet()
	const now = useSessionClock()
	const session =
		address && isSmartAccount(address) ? activeSession(address, now) : undefined
	const until = Math.min(
		...(session?.grants ?? []).flatMap((g) =>
			g.expiresAt && g.expiresAt > now ? [g.expiresAt] : [],
		),
	)
	// The transaction that applied the approval: Nido's page doesn't say, so
	// read it from the account's `doc_applied` event. Asked again when the
	// approval changes (a renewal moves its expiry).
	const approval = useQuery({
		queryKey: ["grant-transaction", address, until],
		enabled: Boolean(address && session),
		queryFn: async () => (await grantTransaction(address!)) ?? null,
		staleTime: Infinity,
	})
	if (!address || !session) return null
	return (
		<p className="session-note">
			This app&apos;s passkey may act for your account
			{until < Number.MAX_SAFE_INTEGER &&
				`, approved until ${time.format(until)}`}
			, asking your device each time.{" "}
			{approval.data && (
				<>
					<TxLink hash={approval.data}>Approval on Stellar Expert</TxLink>{" "}
				</>
			)}
			<button
				type="button"
				title="This browser forgets the app's passkey; your device may still list it. The rules stay on your account until they expire; approving again with a new passkey replaces them."
				onClick={() => forgetSession(address)}
			>
				Forget it
			</button>
		</p>
	)
}
