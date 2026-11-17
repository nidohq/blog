import { labPrefix } from "@stellar-scaffold/app-lib"
import { blog } from "@stellar-scaffold/app-lib/clients"
import { Link, NavLink, Outlet, Route, Routes } from "react-router-dom"
import styles from "./App.module.css"
import { demo } from "./blog"
import ConnectAccount from "./components/ConnectAccount"
import { DemoBanner } from "./components/DemoBanner"
import { AddressLink } from "./components/Explorer"
import { SessionNote } from "./components/SessionNote"
import Debug from "./pages/Debug"
import Home from "./pages/Home"
import PostPage from "./pages/PostPage"

function App() {
	return (
		<Routes>
			<Route element={<AppLayout />}>
				<Route path="/" element={<Home />} />
				<Route path="/posts/:id" element={<PostPage />} />
				<Route path="/debug" element={<Debug />} />
				<Route path="/debug/:contractName" element={<Debug />} />
			</Route>
		</Routes>
	)
}

const AppLayout = () => (
	<div className={styles.AppLayout}>
		<header className={styles.header}>
			<Link to="/" className={styles.logo}>
				Blog
			</Link>
			<nav className={styles.headerNav}>
				<NavLink
					to="/debug"
					className={({ isActive }) => (isActive ? styles.active : "")}
				>
					Contract Explorer
				</NavLink>
				<a href={labPrefix()} target="_blank" rel="noreferrer">
					Transaction Explorer
				</a>
			</nav>
			<ConnectAccount />
		</header>

		<main className={styles.main}>
			<DemoBanner />
			<SessionNote />
			<Outlet />
		</main>

		<footer className={styles.footer}>
			<nav className={styles.footerNav}>
				{!demo && (
					<AddressLink address={blog.options.contractId}>
						Blog contract
					</AddressLink>
				)}
				<a
					href="https://github.com/nidohq/blog"
					target="_blank"
					rel="noreferrer"
				>
					Source
				</a>
				<a href="https://test.nido.fyi" target="_blank" rel="noreferrer">
					Nido wallet
				</a>
				<a href="https://scaffoldstellar.org" target="_blank" rel="noreferrer">
					Scaffold Stellar
				</a>
			</nav>
		</footer>
	</div>
)

export default App
