import { blog } from "@stellar-scaffold/app-lib/clients"
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { PAGE } from "../blog"

// Reads are simulations: no wallet, no signature, no fee.

/** How many posts there are; the newest is number `count`. */
export const usePostCount = () =>
	useQuery({
		queryKey: ["blog", "count"],
		queryFn: async () => (await blog.post_count()).result,
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
			const { result } = await blog.posts({
				first,
				limit: last - first + 1,
			})
			return [...result].reverse()
		},
	})

/** Post `id`, or null when there is none. */
export const usePost = (id: number) =>
	useQuery({
		queryKey: ["blog", "post", id],
		queryFn: async () => {
			const { result } = await blog.get_post({ id })
			return result.isOk() ? result.unwrap() : null
		},
	})

/** The comments on post `postId`, oldest first, a page at a time. */
export const useComments = (postId: number, count: number) =>
	useInfiniteQuery({
		queryKey: ["blog", "comments", postId, count],
		initialPageParam: 0,
		queryFn: async ({ pageParam }) => {
			const { result } = await blog.comments({
				post_id: postId,
				first: pageParam,
				limit: PAGE,
			})
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
