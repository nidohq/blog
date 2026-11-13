import React from "react"
import { CheckIn } from "../components/CheckIn"
import styles from "./Home.module.css"

const Home: React.FC = () => (
	<div className={styles.Home}>
		<div>
			<h1>__APP_NAME__</h1>
			<p>
				Your app starts here. Grow <code>contracts/check-in</code> and{" "}
				<code>app/src/components/CheckIn.tsx</code> into it, or replace them:
				NIDO.md has the steps.
			</p>
		</div>
		<CheckIn />
	</div>
)

export default Home
