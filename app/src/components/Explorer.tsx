import { accountUrl, shortAddress, txUrl } from "@stellar-scaffold/app-lib"
import { type ReactNode } from "react"

/** A transaction on stellar.expert, for the network the app runs on; the
 * bare hash where stellar.expert can't show it (a local network). */
export const TxLink = ({
	hash,
	children = "View on Stellar Expert",
}: {
	hash: string
	children?: ReactNode
}) => {
	const url = txUrl(hash)
	return url ? (
		<a className="expert-link" href={url} target="_blank" rel="noreferrer">
			{children} ↗
		</a>
	) : (
		<code>{hash}</code>
	)
}

/** An account or contract on stellar.expert, shown short; plain text where
 * stellar.expert can't show it. */
export const AddressLink = ({
	address,
	children,
}: {
	address: string
	children?: ReactNode
}) => {
	const url = accountUrl(address)
	const label = children ?? shortAddress(address)
	return url ? (
		<a href={url} target="_blank" rel="noreferrer" title={address}>
			{label}
		</a>
	) : (
		<span title={address}>{label}</span>
	)
}
