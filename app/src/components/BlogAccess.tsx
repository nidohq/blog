import { shortAddress, xlmTokenId } from "@stellar-scaffold/app-lib"
import { blog } from "@stellar-scaffold/app-lib/clients"
import { DAILY_TIP_CAP, demo } from "../blog"
import { AddressLink } from "./Explorer"

/** A contract named in a rule, linked on stellar.expert (not in a demo,
 * whose contract isn't deployed). */
const Contract = ({ id }: { id: string }) => (
	<code>
		{demo ? (
			<span title={id}>{shortAddress(id)}</span>
		) : (
			<AddressLink address={id} />
		)}
	</code>
)

/**
 * What approving the blog lets its passkey do, in plain words: the two rules
 * in `grants` (src/blog.ts), named for people, with the contracts' addresses
 * beside them for anyone who wants to check Nido's page against them.
 */
export const BlogAccess = () => (
	<div className="blog-access">
		<p>
			Approve this blog once and, for 24 hours, its own passkey can act for your
			account here. Nido shows you two rules and you confirm them once:
		</p>
		<ul>
			<li>
				<strong>Post, comment and tip on this blog</strong> (<code>post</code>,{" "}
				<code>comment</code> and <code>tip</code> on the Blog contract{" "}
				<Contract id={blog.options.contractId} />
				). These calls move no XLM by themselves, so this rule has no limit.
			</li>
			<li>
				<strong>Send XLM to the blog, up to {DAILY_TIP_CAP} XLM a day</strong> (
				<code>transfer</code> on the XLM contract <Contract id={xlmTokenId} />,
				paying only the Blog contract). This is where tips come from: the blog
				passes each tip straight on to the post&apos;s author. After{" "}
				{DAILY_TIP_CAP} XLM in a day your account refuses the next tip before
				anything is sent.
			</li>
		</ul>
		<p>
			Your device asks for the app&apos;s passkey on every post, comment and
			tip; no Nido page opens. The app can&apos;t pay anyone but the blog, and
			never more than {DAILY_TIP_CAP} XLM for one approval.
		</p>
	</div>
)
