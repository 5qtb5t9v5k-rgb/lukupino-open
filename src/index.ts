// Lukupino — oma lukuvarasto. Yksi Worker:
//   /asennus      asennuksen itsetarkistus (+ .json)  (julkinen osa / istunto / Bearer CAPTURE_TOKEN)
//   /api/*        iOS Shortcut, migraatio, export      (Bearer CAPTURE_TOKEN)
//   /mcp          MCP Claude Codelle ja claude.ai:lle  (Bearer MCP_TOKEN  TAI  OAuth+GitHub)
//   /             selaus-UI                             (GitHub-kirjautuminen, cookie)
//   /authorize /token /register /callback  OAuth-palvelin claude.ai:n custom connectorille

import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Hono } from "hono";
import { api } from "./api";
import { asennus } from "./asennus";
import { GitHubHandler } from "./github-handler";
import { ICON_SVG, iconPng } from "./icon";
import { registerTools } from "./mcp";
import { ui } from "./ui";
import type { Props } from "./utils";

export class LukupinoMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({ name: "Lukupino", version: "1.0.0" });

	async init() {
		const login = this.props?.login ?? "?";
		// Vain sallittu käyttäjä saa työkalut — muille tyhjä palvelin.
		if (login !== this.env.ALLOWED_GITHUB_LOGIN) return;
		registerTools(this.server, this.env, undefined, login, this.props?.host ?? "");
	}
}

// Oletuskäsittelijä: UI, API ja GitHub-OAuth-sivut. OAuthProvider ohjaa tänne kaiken
// mikä ei ole /mcp tai OAuth-päätepiste.
const app = new Hono<{ Bindings: Env }>();
app.route("/", asennus);
app.route("/", api);
app.route("/", ui);
app.route("/", GitHubHandler);
app.get("/healthz", (c) => c.text("ok"));
// Logo kotivalikkoon ja selainvälilehteen. Julkisia, koska iOS hakee
// kuvakkeen myös kirjautumissivulta.
const IKONI_CACHE = "public, max-age=604800";
app.get("/apple-touch-icon.png", (c) => new Response(iconPng(), { headers: { "Content-Type": "image/png", "Cache-Control": IKONI_CACHE } }));
app.get("/apple-touch-icon-precomposed.png", (c) => new Response(iconPng(), { headers: { "Content-Type": "image/png", "Cache-Control": IKONI_CACHE } }));
app.get("/favicon.svg", (c) => new Response(ICON_SVG, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": IKONI_CACHE } }));
app.get("/favicon.ico", (c) => new Response(iconPng(), { headers: { "Content-Type": "image/png", "Cache-Control": IKONI_CACHE } }));

// MCP-käsittelijä. Asennuksen osoite viedään propsiin joka pyynnöllä, jotta
// työkalujen palauttamat linkit osoittavat tähän lukupinoon eikä mihinkään
// kovakoodattuun osoitteeseen. Toimii myös vanhoille OAuth-tokeneille, joiden
// propsissa osoitetta ei ole.
const mcpServe = LukupinoMCP.serve("/mcp");
const mcpHandler = {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const c = ctx as ExecutionContext & { props?: Props };
		if (c.props && !c.props.host) c.props = { ...c.props, host: new URL(request.url).origin };
		return mcpServe.fetch(request, env, ctx);
	},
};

const provider = new OAuthProvider({
	apiRoute: "/mcp",
	apiHandler: mcpHandler as any,
	defaultHandler: app as any,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});

function constantEq(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		// Claude Code -polku: staattinen bearer ohittaa OAuthin. McpAgent lukee ctx.props:n.
		if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
			const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
			if (m && env.MCP_TOKEN && constantEq(m[1].trim(), env.MCP_TOKEN)) {
				(ctx as ExecutionContext & { props: Props }).props = {
					login: env.ALLOWED_GITHUB_LOGIN,
					name: "Claude Code (bearer)",
					email: "",
					accessToken: "",
					host: url.origin,
				};
				return mcpServe.fetch(request, env, ctx);
			}
		}
		return provider.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
