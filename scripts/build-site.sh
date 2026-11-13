#!/usr/bin/env bash
# Build the site into app/dist for GitHub Pages, under $BASE_PATH (the
# Pages and PR preview workflows set it).
#
# With the blog pinned under `testnet:` in scaffold.yml, the site calls that
# deployment. Without a pin there is no contract to call, so the build is a
# read-only demo: prototype clients with a placeholder ID, and
# PUBLIC_BLOG_DEMO=true for the seeded posts and the banner (app/src/demo).
# Nothing here deploys, signs or sends a transaction, except that
# `clients:testnet` has Friendbot fund the throwaway key it creates.
set -euo pipefail
cd "$(dirname "$0")/.."

pinned=$(node -e '
	const { parse } = require("yaml")
	const yml = parse(require("fs").readFileSync("scaffold.yml", "utf8"))
	console.log(yml.contracts.blog.networks.testnet?.source ? "yes" : "no")
')

if [ "$pinned" = yes ]; then
	npm run clients:testnet
	PUBLIC_BLOG_DEMO=false npm run build
	# The demo is for builds without a contract; keep it out of this one
	if grep -rq "Demo data: the contract" app/dist; then
		echo "::error::A build against the pinned contract carries the demo." >&2
		exit 1
	fi
else
	echo "::notice::scaffold.yml pins no testnet deployment of the blog, so this build is a read-only demo. npm run deploy:testnet pins one (README)."
	npm run prepare:prototype
	PUBLIC_BLOG_DEMO=true npm run build
fi

# Serve files as they are: no Jekyll on the gh-pages branch
touch app/dist/.nojekyll
