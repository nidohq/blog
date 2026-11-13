import { byteLength } from "../blog"

/** How much of a length cap `text` uses, in the bytes the contract counts. */
export const ByteCount = ({ text, max }: { text: string; max: number }) => {
	const used = byteLength(text)
	return (
		<span className={used > max ? "byte-count byte-count--over" : "byte-count"}>
			{used}/{max} bytes
		</span>
	)
}
