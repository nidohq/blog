import { expect, test, type Page } from "@playwright/test"
import {
	Address,
	Asset,
	Networks,
	scValToNative,
	xdr,
} from "@stellar/stellar-sdk"
import { BlogChain, someoneElse } from "./blog-chain"
import {
	account,
	accountAuth,
	connect,
	invocation,
	mockServices,
	recordStatuses,
	statuses,
	virtualAuthenticator,
} from "./mocks"

// The blog: a Nido account approves the blog's own passkey once, then each
// post, comment and tip asks the device and nothing else, and tips stop at
// 5 XLM a day. Nido's pages, its relayer and the RPC are mocked; the blog's
// storage lives in BlogChain.

const sac = Asset.native().contractId(Networks.TESTNET)
const makePasskey = "Make a passkey for this app"
const approve = "Approve with Nido (2 rules, one confirmation)"

/** What the account authorizes for each blog call: the call itself, and
 * for a tip the XLM it sends the blog. */
const blogAuth = (method: string, blog: string, args: xdr.ScVal[]) => {
	if (method === "post" || method === "comment")
		return [accountAuth(invocation(blog, method, args))]
	if (method === "tip")
		return [
			accountAuth(
				invocation(blog, "tip", args, [
					invocation(sac, "transfer", [
						new Address(account).toScVal(),
						new Address(blog).toScVal(),
						args[2]!,
					]),
				]),
			),
		]
	return []
}

/** Count the app's requests for a passkey signature. */
const countPrompts = (page: Page) =>
	page.addInitScript(() => {
		const w = window as unknown as { prompts: number }
		w.prompts = 0
		const get = navigator.credentials.get.bind(navigator.credentials)
		navigator.credentials.get = (options) => {
			w.prompts++
			return get(options)
		}
	})
const prompts = (page: Page) =>
	page.evaluate(() => (window as unknown as { prompts: number }).prompts)

/** The rule ids a relayed call's account signature names, in tree order. */
const ruleIds = (auth: string[]) => {
	const entry = xdr.SorobanAuthorizationEntry.fromXDR(auth[0]!, "base64")
	const [ids] = entry.credentials().address().signature().map()!
	return ids!
		.val()
		.vec()!
		.map((id) => id.u32())
}

async function setup(page: Page, context: Parameters<typeof mockServices>[0]) {
	const chain = new BlogChain()
	chain.seed(
		"Why passkeys",
		"A passkey lives on your device.\nNothing to copy, nothing to leak.",
		someoneElse,
	)
	const services = await mockServices(context, {
		auth: blogAuth,
		...chain.services,
	})
	await virtualAuthenticator(page)
	await countPrompts(page)
	return { chain, ...services }
}

/** Make the blog's passkey and approve it in Nido's popup. */
async function approveOnce(page: Page) {
	await page.getByRole("button", { name: makePasskey }).click()
	const popup = page.waitForEvent("popup")
	await page.getByRole("button", { name: approve }).click()
	await popup
	await expect(page.getByText("This app's passkey may act")).toBeVisible()
}

async function tip(page: Page, xlm: string) {
	await page.getByRole("spinbutton").fill(xlm)
	await page.getByRole("button", { name: "Tip", exact: true }).click()
}

test("anyone reads the posts and a post's comments without connecting", async ({
	page,
	context,
}) => {
	const chain = new BlogChain()
	chain.seed("First", "The first post.", someoneElse)
	chain.seed("Second", "The second post.", someoneElse)
	chain.posts[0]!.comments.push({
		author: account,
		text: "Hello from a Nido account",
		timestamp: chain.now,
	})
	await mockServices(context, chain.services)
	await page.goto("/")
	// Newest first
	await expect(page.getByRole("heading", { level: 3 })).toHaveText([
		"Second",
		"First",
	])
	await expect(page.getByText("#1 by")).toContainText("1 comment")
	await page.getByRole("link", { name: "First" }).click()
	await expect(page).toHaveURL(/\/posts\/1$/)
	await expect(page.getByText("The first post.")).toBeVisible()
	await expect(page.getByText("Hello from a Nido account")).toBeVisible()
	await expect(page.getByRole("button", { name: "Comment" })).toBeDisabled()
	await expect(page.getByText("Connect to comment.")).toBeVisible()
})

test("a Nido account approves the blog once, then posts, comments and tips with one device prompt each", async ({
	page,
	context,
}) => {
	const { chain, requests, relayed, sent } = await setup(page, context)
	await recordStatuses(page)
	await connect(page)

	// Before approving: what the blog may do, in plain words, and the form
	// waits
	const access = page.locator(".blog-access").first()
	await expect(access).toContainText("Post, comment and tip on this blog")
	await expect(access).toContainText("Send XLM to the blog, up to 5 XLM a day")
	await expect(access).toContainText("paying only the Blog contract")
	await expect(
		page.getByRole("button", { name: "Post", exact: true }),
	).toBeDisabled()
	await page.screenshot({
		path: "../screenshots/blog-approve.png",
		fullPage: true,
	})
	await approveOnce(page)

	// One request: the blog rule, uncapped, and the XLM rule that pays only
	// the blog, at most 5 XLM a day
	expect(requests).toHaveLength(1)
	const [blogRule, xlmRule] = requests[0]!
	expect(blogRule).toMatchObject({
		duration: "24h",
		label: "blog",
		target: expect.stringMatching(/^C/),
		functions: "post,comment,tip",
		limit: "none",
	})
	expect(xlmRule).toMatchObject({
		duration: "24h",
		label: "blog-tips",
		target: sac,
		functions: "transfer",
		limit: "5",
		limit_period: "day",
		to: blogRule!.target,
	})

	let popups = 0
	page.on("popup", () => popups++)

	// Post: the page shows what it waits for, then opens the new post
	await page.locator('input[name="title"]').fill("Hello, Stellar")
	await page
		.locator('textarea[name="body"]')
		.fill("My first post from a passkey.")
	await page.getByRole("button", { name: "Post", exact: true }).click()
	await expect(page).toHaveURL(/\/posts\/2$/)
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Hello, Stellar",
	)
	await expect(page.getByText("#2 by you")).toBeVisible()
	const seen = await statuses(page)
	expect(seen).toEqual(
		expect.arrayContaining([
			"Preparing…",
			"Waiting for your passkey…",
			"Sending…",
			"Confirming on Stellar…",
		]),
	)
	expect(chain.posts[1]).toMatchObject({
		author: account,
		title: "Hello, Stellar",
		body: "My first post from a passkey.",
	})
	// The author can't tip their own post
	await expect(page.getByText("This is your post.")).toBeVisible()
	await expect(
		page.getByRole("button", { name: "Tip", exact: true }),
	).toBeDisabled()

	// Comment on someone else's post, then tip its author (through the
	// app's links: a reload would reset the prompt count)
	await page.getByRole("link", { name: "← All posts" }).click()
	await page.getByRole("link", { name: "Why passkeys" }).click()
	await page.getByLabel(/^Your comment/).fill("Great read, thanks!")
	await page.getByRole("button", { name: "Comment", exact: true }).click()
	await expect(page.locator(".comment-text")).toHaveText([
		"Great read, thanks!",
	])
	await expect(page.getByRole("heading", { name: "1 comment" })).toBeVisible()

	await tip(page, "2")
	await expect(page.getByText("You tipped the author 2 XLM.")).toBeVisible()
	await expect(page.getByTestId("tipped")).toHaveText(
		"2 XLM tipped to the author",
	)
	expect(chain.posts[0]!.tipped).toBe(20_000_000n)

	// Three calls, three device prompts, no Nido page; the relayer sent them
	expect(await prompts(page)).toBe(3)
	expect(popups).toBe(0)
	expect(sent).toHaveLength(0)
	expect(relayed).toHaveLength(3)
	// Post and comment sign under the blog rule; the tip under the blog rule
	// and, for its XLM, the capped rule
	expect(relayed.map((call) => ruleIds(call.auth))).toEqual([[2], [2], [2, 3]])
	const tipCall = xdr.HostFunction.fromXDR(relayed[2]!.func, "base64")
		.invokeContract()
		.args()
		.map((v) => scValToNative(v) as unknown)
	expect(tipCall).toEqual([account, 1, 20_000_000n])

	await page.screenshot({
		path: "../screenshots/blog-post.png",
		fullPage: true,
	})
})

test("tips stop at 5 XLM a day before the device is asked; posting and commenting go on", async ({
	page,
	context,
}) => {
	const { chain, relayed } = await setup(page, context)
	await connect(page)
	await page.goto("/posts/1")
	await approveOnce(page)

	await tip(page, "2")
	await expect(page.getByText("You tipped the author 2 XLM.")).toBeVisible()
	await tip(page, "3")
	await expect(page.getByText("You tipped the author 3 XLM.")).toBeVisible()
	expect(relayed).toHaveLength(2)

	// 5 XLM went out today: the next tip stops before the passkey prompt
	await tip(page, "0.5")
	await expect(page.getByRole("alert")).toContainText(
		"go over the 5 XLM a day you let this blog tip",
	)
	await expect(page.getByRole("alert")).toContainText(
		"before your device was asked",
	)
	expect(await prompts(page)).toBe(2)
	expect(relayed).toHaveLength(2)
	expect(chain.posts[0]!.tipped).toBe(50_000_000n)
	// It says when tipping works again and keeps the button off, even after
	// a reload
	const capped = page.getByText(/^Tip cap reached until ≈ /)
	await expect(capped).toBeVisible()
	await expect(
		page.getByRole("button", { name: "Tip", exact: true }),
	).toBeDisabled()
	await page.reload()
	await expect(capped).toBeVisible()
	await expect(
		page.getByRole("button", { name: "Tip", exact: true }),
	).toBeDisabled()

	// The cap is on tips only: commenting still goes through
	await page.getByLabel(/^Your comment/).fill("Still here")
	await page.getByRole("button", { name: "Comment", exact: true }).click()
	await expect(page.locator(".comment-text")).toHaveText(["Still here"])
	// The reload reset the count: one prompt, for the comment
	expect(await prompts(page)).toBe(1)
	expect(relayed).toHaveLength(3)
})

test("the forms hold text to the contract's caps, counted in bytes", async ({
	page,
	context,
}) => {
	await setup(page, context)
	await connect(page)
	await approveOnce(page)
	const post = page.getByRole("button", { name: "Post", exact: true })
	await page.locator('input[name="title"]').fill("é".repeat(50))
	await page.locator('textarea[name="body"]').fill("Body")
	await expect(page.getByText("100/100 bytes")).toBeVisible()
	await expect(post).toBeEnabled()
	await page.locator('input[name="title"]').fill("é".repeat(51))
	await expect(page.getByText("102/100 bytes")).toBeVisible()
	await expect(post).toBeDisabled()
})
