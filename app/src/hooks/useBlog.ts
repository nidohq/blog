import { blog } from "@stellar-scaffold/app-lib/clients"
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { PAGE, demo } from "../blog"

// Reads are simulations: no wallet, no signature, no fee. A demo build reads
// the seeded blog in src/demo instead, which only it bundles.
const demoBlog =
	import.meta.env.PUBLIC_BLOG_DEMO === "true" && demo
		? import("../demo")
		: undefined

/** `live()`'s result, or in a demo the same call on the demo data. */
async function read<T>(
	method: string,
	args: object,
	live: () => Promise<{ result: T }>,
): Promise<T> {
	if (demoBlog) return (await demoBlog).read(method, args) as T
	return (await live()).result
}

/** How many posts there are; the newest is number `count`. */
export const usePostCount = () =>
	useQuery({
		queryKey: ["blog", "count"],
		queryFn: () => read("post_count", {}, () => blog.post_count()),
	})

/** Page `page` (from 0) of the posts, newest first. */
export const usePostPage = (page: number, count: number | undefined) =>
	useQuery({
		queryKey: ["blog", "posts", count, page],
		enabled: count !== undefined,
		queryFn: async () => {
			const last = (count ?? 0) - page * PAGE
			if (last < 1) return []
			const first = Math.max(1, last - PAGE + 1)
			const args = { first, limit: last - first + 1 }
			const posts = await read("posts", args, () => blog.posts(args))
			return [...posts].reverse()
		},
	})

/** Post `id`, or null when there is none. */
export const usePost = (id: number) =>
	useQuery({
		queryKey: ["blog", "post", id],
		queryFn: async () => {
			const result = await read("get_post", { id }, () => blog.get_post({ id }))
			return result.isOk() ? result.unwrap() : null
		},
	})

/** The comments on post `postId`, oldest first, a page at a time. */
export const useComments = (postId: number, count: number) =>
	useInfiniteQuery({
		queryKey: ["blog", "comments", postId, count],
		initialPageParam: 0,
		queryFn: async ({ pageParam }) => {
			const args = { post_id: postId, first: pageParam, limit: PAGE }
			const result = await read("comments", args, () => blog.comments(args))
			return result.unwrap()
		},
		getNextPageParam: (_last, pages) => {
			const loaded = pages.length * PAGE
			return loaded < count ? loaded : undefined
		},
	})

/** Read everything again after a post, comment or tip lands. */
export const useRefreshBlog = () => {
	const client = useQueryClient()
	return () => client.invalidateQueries({ queryKey: ["blog"] })
}
