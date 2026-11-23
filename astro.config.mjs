import { defineConfig } from "astro/config";
import shirones from "./src/integration/index.ts";
import localAdmin from "./src/integration/local-admin.ts";

// The integration drives every mode, this repository included: integrations,
// fonts, markdown, vite aliases/plugins, trailingSlash and the image endpoint
// all come from `src/integration/` and `src/config/integrationsConfig.ts`.
// Do not re-add per-mode config here 鈥?update `src/config/` so both modes
// stay in lockstep (see `src/config/README.md`).
//
// localAdmin 是给本地写作后台用的 Vite 中间件，`apply: "serve"` 保证它
// 只在 `pnpm dev` 时挂载，生产构建不会包含这段代码。
export default defineConfig({
	integrations: [shirones()],
	vite: {
		plugins: [localAdmin()],
	},
});
