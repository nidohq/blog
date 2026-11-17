import { demo } from "../blog"

/** In a demo build, say on every page that the posts are made up. */
export const DemoBanner = () =>
	demo ? (
		<p className="demo-banner" role="note">
			<strong>Demo data: the contract is not deployed yet.</strong> These posts
			live in your browser. Reading works; posting, commenting and tipping open
			once the blog is deployed to testnet.
		</p>
	) : null

/** Where a form would be, in a demo build. */
export const DemoClosed = ({ action }: { action: string }) => (
	<p className="session-note">
		You can {action} once the blog is deployed to testnet. Until then this is a
		read-only demo, and nothing here asks your account for anything.
	</p>
)
