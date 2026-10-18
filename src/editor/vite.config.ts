import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { screenplayEditorApi } from "./editor-api-plugin";

// Local-only data editor: the API lives in dev-server middleware, so this config is only meant for `npm run editor`.
export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	plugins: [react(), screenplayEditorApi()],
});
