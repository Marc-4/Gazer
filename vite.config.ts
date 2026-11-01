import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { buildSecurityHeaders } from "./src/lib/security-headers.ts";

/**
 * Nitro route rules cover production responses. This plugin adds the same
 * headers to the Vite dev and preview servers, which bypass Nitro.
 */
function securityHeadersPlugin(headers: Record<string, string>): Plugin {
	const apply = (
		_server: unknown,
		middleware: {
			use: (
				handler: (
					request: unknown,
					response: {
						setHeader: (name: string, value: string) => void;
					},
					next: () => void,
				) => void,
			) => void;
		},
	) => {
		middleware.use((_request, response, next) => {
			for (const [name, value] of Object.entries(headers)) {
				response.setHeader(name, value);
			}
			next();
		});
	};

	return {
		name: "security-headers",
		configureServer(server) {
			apply(server, server.middlewares);
		},
		configurePreviewServer(server) {
			apply(server, server.middlewares);
		},
	};
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const isDev = mode === "development";
	const securityHeaders = buildSecurityHeaders({
		supabaseUrl: env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
		isDev,
	});

	return {
		resolve: { tsconfigPaths: true },
		plugins: [
			devtools(),
			securityHeadersPlugin(securityHeaders),
			nitro({
				rollupConfig: { external: [/^@sentry\//] },
				experimental: { tasks: true },
				routeRules: {
					"/**": { headers: securityHeaders },
				},
				tasks: {
					"notifications:auto-dispatch": {
						handler: fileURLToPath(
							new URL(
								"./src/tasks/notifications-auto-dispatch.ts",
								import.meta.url,
							),
						),
						description:
							"Send queued notification emails when automatic delivery is enabled.",
					},
				},
				...(process.env.VERCEL
					? {}
					: {
							scheduledTasks: {
								"* * * * *": ["notifications:auto-dispatch"],
							},
						}),
			}),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
		],
	};
});
