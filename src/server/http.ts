import { Agent, setGlobalDispatcher } from "undici";

const TRANSIENT_SOCKET_CODES = new Set([
	"UND_ERR_SOCKET",
	"UND_ERR_INFO",
	"ECONNRESET",
	"EPIPE",
	"ECONNABORTED",
	"ERR_HTTP2_STREAM_ERROR",
	"ERR_HTTP2_SESSION_ERROR",
]);

export function isTransientSocketError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;

	const code = "code" in error ? error.code : undefined;
	if (typeof code === "string" && TRANSIENT_SOCKET_CODES.has(code)) {
		return true;
	}

	const message =
		"message" in error && typeof error.message === "string"
			? error.message
			: "";
	return /other side closed|socket idle timeout|ECONNRESET|socket hang up/i.test(
		message,
	);
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export function installOutboundHttp(): void {
	setGlobalDispatcher(
		new Agent({
			allowH2: false,
			keepAliveTimeout: 10_000,
			keepAliveMaxTimeout: 15_000,
		}),
	);

	process.on("uncaughtException", (error) => {
		if (isTransientSocketError(error)) {
			console.warn(`Ignored transient socket error: ${formatError(error)}`);
			return;
		}
		console.error(error);
		process.exit(1);
	});

	process.on("unhandledRejection", (reason) => {
		if (isTransientSocketError(reason)) {
			console.warn(
				`Ignored transient socket rejection: ${formatError(reason)}`,
			);
			return;
		}
		console.error(reason);
		process.exit(1);
	});
}
