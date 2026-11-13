import {
	describe,
	submitCall,
	type SubmitStage,
} from "@stellar-scaffold/app-lib"
import { useState } from "react"
import { blogErrors, refusal } from "../blog"
import { useRefreshBlog } from "./useBlog"
import { useWallet } from "./useWallet"

/** What a generated client's call returns for a function that returns
 * `Result<T, Error>`: the value, or the contract's refusal by name. */
interface Outcome<T> {
	isErr(): boolean
	unwrap(): T
	unwrapErr(): { message: string }
}

/**
 * One blog call at a time from a form: what it waits for (`stage`), what went
 * wrong (`error`) and the confirmed transaction (`hash`). `run` resolves with
 * `{ value }`, the call's value, or undefined when it failed; on success it reads the blog
 * and the balance again.
 */
export function useBlogCall() {
	const { address, updateBalances } = useWallet()
	const refresh = useRefreshBlog()
	const [stage, setStage] = useState<SubmitStage>()
	const [error, setError] = useState<string>()
	const [hash, setHash] = useState<string>()

	const run = async <T>(
		build: Parameters<typeof submitCall<Outcome<T>>>[1],
		/** A sentence for a refusal this form explains itself, such as a cap. */
		explain?: (error: unknown) => string | undefined,
	): Promise<{ value: T } | undefined> => {
		if (!address) {
			setError("Connect a wallet first.")
			return undefined
		}
		setError(undefined)
		setHash(undefined)
		try {
			// No await before submitCall: Nido's popup needs the click's gesture
			const { result, hash } = await submitCall(address, build, {
				onStage: setStage,
			})
			setHash(hash)
			if (result.isErr()) {
				setError(`The contract refused: ${refusal(result.unwrapErr().message)}`)
				return undefined
			}
			void refresh()
			void updateBalances()
			return { value: result.unwrap() }
		} catch (e) {
			console.error(e)
			setError(explain?.(e) ?? describe(e, blogErrors))
			return undefined
		} finally {
			setStage(undefined)
		}
	}

	return { address, stage, error, hash, run }
}
