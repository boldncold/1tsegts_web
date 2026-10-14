import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// Latency probe used to choose the deployment region
// (scripts/convex-latency.mjs). Touches no data.
http.route({
  path: "/ping",
  method: "GET",
  handler: httpAction(
    async () =>
      new Response("ok", { headers: { "cache-control": "no-store" } }),
  ),
});

export default http;
