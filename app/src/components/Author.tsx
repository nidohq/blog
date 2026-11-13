import { shortAddress } from "@stellar-scaffold/app-lib"
import { useWallet } from "../hooks/useWallet"

/** An author's address, short, or "you" for the connected account. */
export const Author = ({ address }: { address: string }) => {
	const { address: me } = useWallet()
	return (
		<span className="author" title={address}>
			{address === me ? "you" : shortAddress(address)}
		</span>
	)
}
