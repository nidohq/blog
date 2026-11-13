import {
	connectWallet,
	profileModal,
	shortAddress,
} from "@stellar-scaffold/app-lib"
import { useNotification } from "../hooks/useNotification"
import { useWallet } from "../hooks/useWallet"

export const WalletButton = () => {
	const { address, isPending, balances } = useWallet()
	const { addNotification } = useNotification()
	const connect = () =>
		void connectWallet().catch((error: unknown) => {
			addNotification(
				error instanceof Error
					? error.message
					: "Wallet connection was cancelled or failed.",
				"error",
			)
		})

	if (!address) {
		return (
			<button onClick={connect} disabled={isPending}>
				{isPending ? "Loading..." : "Connect"}
			</button>
		)
	}

	return (
		<div className="wallet-connected" style={{ opacity: isPending ? 0.6 : 1 }}>
			<span className="wallet-balance">
				{balances?.xlm?.balance ?? "-"} XLM
			</span>

			<button className="wallet-profile" onClick={() => void profileModal()}>
				{shortAddress(address)}
			</button>
		</div>
	)
}
