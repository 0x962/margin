/**
 * The local gateway: gives each local product a hostname. A hosts file maps
 * names to 127.0.0.1 but cannot carry a port, so this proxy listens on port
 * 80 and routes by Host header. `http://margin/...` and
 * `http://margin.localhost/...` reach the margin server; same for dots.
 * macOS lets an unprivileged process bind port 80, so this runs as a plain
 * launchd user agent.
 */
const ROUTES: Record<string, number> = {
	dots: Number(process.env.DOTS_PORT ?? 4517),
	margin: Number(process.env.MARGIN_PORT ?? 4519),
};

const PORT = Number(process.env.GATEWAY_PORT ?? 80);

function indexPage(): Response {
	const rows = Object.entries(ROUTES)
		.map(([name, port]) => `<li><a href="http://${name}/">${name}</a> <small>:${port}</small></li>`)
		.join("");
	return new Response(
		`<!doctype html><meta charset="utf-8"><title>local</title>
		<style>body{font:14px ui-monospace,monospace;padding:40px;color:#333}a{color:#35f}</style>
		<ul>${rows}</ul>`,
		{ headers: { "content-type": "text/html" } },
	);
}

const server = Bun.serve({
	port: PORT,
	idleTimeout: 120,
	async fetch(req) {
		const url = new URL(req.url);
		const name = url.hostname.replace(/\.localhost$/, "");
		const port = ROUTES[name];
		if (!port) return indexPage();
		url.protocol = "http:";
		url.hostname = "127.0.0.1";
		url.port = String(port);
		try {
			return await fetch(url, {
				method: req.method,
				headers: req.headers,
				body: req.body,
				redirect: "manual",
			});
		} catch {
			return new Response(`${name} is not running on :${port}`, { status: 502 });
		}
	},
});

console.log(`gateway on :${server.port} → ${Object.entries(ROUTES).map(([n, p]) => `${n}:${p}`).join(", ")}`);
