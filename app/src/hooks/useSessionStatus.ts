import {
	isSmartAccount,
	onSessionChange,
	sessionStatus,
	type Grant,
	type SessionStatus,
} from "@stellar-scaffold/app-lib"
import { useEffect, useState, useSyncExternalStore } from "react"

let changes = 0
const subscribe = (listener: () => void) =>
	onSessionChange(() => {
		changes++
		listener()
	})

/** Re-render when this tab or another one changes a stored session, and
 * every half minute so expiries show up; returns the current time. */
export function useSessionClock(): number {
	useSyncExternalStore(subscribe, () => changes)
	const [now, setNow] = useState(Date.now)
	useEffect(() => {
		const tick = setInterval(() => setNow(Date.now()), 30_000)
		return () => clearInterval(tick)
	}, [])
	return now
}

/**
 * The session state for `grants` on the connected account, kept current
 * across approvals, "Forget", other tabs, and expiry. `undefined` for classic
 * accounts and when nothing is connected: they need no session.
 */
export function useSessionStatus(
	address: string | undefined,
	grants: Grant[],
): SessionStatus | undefined {
	const now = useSessionClock()
	return address && isSmartAccount(address)
		? sessionStatus(address, grants, now)
		: undefined
}
