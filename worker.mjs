import astroWorker from "./dist/_worker.js/index.js";
import { runSync } from "./src/lib/sync.ts";
import { createDbContext } from "./src/lib/db/context.ts";
import { BASE_PATH, BASE_URL } from "./app-paths.mjs";

export default {
  fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === BASE_PATH) {
      url.pathname = BASE_URL;
      return Response.redirect(url.toString(), 301);
    }

    return astroWorker.fetch(request, env, context);
  },

  async scheduled(_event, env, context) {
    context.waitUntil(
      runSync(createDbContext(env))
        .then((sync) => console.log(`[sync] ${Object.keys(sync).map((key) => `${key}=${sync[key]}`).join(" ")}`))
        .catch((error) => {
          console.error("[sync] scheduled run failed", error);
          throw error;
        })
    );
  }
};
