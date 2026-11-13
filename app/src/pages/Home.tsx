import { labPrefix } from "@stellar-scaffold/app-lib"
import React from "react"
import { Link } from "react-router-dom"
import { GuessTheNumber } from "../components/GuessTheNumber"
import styles from "./Home.module.css"

const Home: React.FC = () => (
	<div className={styles.Home}>
		<div>
			<h1>Yay! You&apos;re on Stellar!</h1>
			<p>
				A local development template designed to help you build dApps on the
				Stellar network. This environment lets you easily test wallet
				connections, smart contract interactions, transaction verifications,
				etc.{" "}
				<Link to="https://scaffoldstellar.org/docs/intro" target="_blank">
					View docs
				</Link>
			</p>
		</div>

		<div className="card">
			<h2>Sample Contracts</h2>
			<p>
				<strong>Guess The Number:</strong> Interact with the sample contract
				from the{" "}
				<Link
					to="https://scaffoldstellar.org/docs/tutorial/overview"
					target="_blank"
				>
					Scaffold Tutorial
				</Link>{" "}
				using an automatically generated contract client.
			</p>
			<GuessTheNumber />
			<p>Or take a look at other sample contracts to get you started:</p>
			<nav className={styles.contractNav}>
				<a
					href="https://github.com/OpenZeppelin/stellar-contracts/tree/main/examples"
					target="_blank"
					rel="noreferrer"
				>
					OpenZeppelin sample contracts
				</a>
				<a
					href="https://github.com/stellar/soroban-examples"
					target="_blank"
					rel="noreferrer"
				>
					Soroban sample contracts
				</a>
			</nav>
		</div>

		<div className="card">
			<h2>Start Building</h2>
			<ol>
				<li>
					Add your contract under <code>contracts/</code> and list it in{" "}
					<code>scaffold.yml</code> for <code>testnet-dev</code>
				</li>
				<li>
					<code>npm run deploy:testnet</code> deploys it, pins its ID and writes
					its client
				</li>
				<li>
					Call it with <code>submitCall</code>; Nido accounts approve the app
					once through a <code>SessionGate</code>
				</li>
				<li>
					Try it in the <Link to="/debug">Contract Explorer</Link>
				</li>
			</ol>
			<p>
				<code>NIDO.md</code> in this project has each step, the rules a Nido
				account follows, and what to do when Nido&apos;s relayer says no.
			</p>
		</div>

		<section className={styles.cards}>
			<div className="card">
				<p>
					Invoke your smart contract using the{" "}
					<Link to="/debug">Contract Explorer</Link>
				</p>
			</div>
			<div className="card">
				<p>
					Browse your local transactions with the{" "}
					<Link to={labPrefix()}>Transaction Explorer</Link>
				</p>
			</div>
		</section>
	</div>
)

export default Home
