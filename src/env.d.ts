type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

interface ImportMetaEnv {
	readonly PUBLIC_ANALYTICS_SRC?: string;
	readonly PUBLIC_ANALYTICS_SITE_ID?: string;
}

declare namespace App {
	interface Locals extends Runtime {}
}
