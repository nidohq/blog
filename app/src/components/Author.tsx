import { useWallet } from "../hooks/useWallet"
import { AddressLink } from "./Explorer"

/** An author's address on stellar.expert, short, or "you" for the connected
 * account. */
export const Author = ({ address }: { address: string }) => {
	const { address: me } = useWallet()
	return (
		<span className="author">
			<AddressLink address={address}>
				{address === me ? "you" : undefined}
			</AddressLink>
		</span>
	)
}
