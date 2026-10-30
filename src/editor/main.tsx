import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SiProvider } from "sityle";
import "sityle/style.css";
import "sityle/base.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<SiProvider>
			<App />
		</SiProvider>
	</StrictMode>,
);
