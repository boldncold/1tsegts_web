import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { CALLBACK_PATH_PREFIX, qpayCallback } from "./qpay";

const http = httpRouter();

// Convex Auth: OAuth redirects/callbacks and the JWKS endpoint.
auth.addHttpRoutes(http);

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

// QPay payment callbacks: <site>/qpay/callback/<token>/<orderId>. QPay's docs
// don't pin the method, so both are accepted.
for (const method of ["GET", "POST"] as const) {
  http.route({ pathPrefix: CALLBACK_PATH_PREFIX, method, handler: qpayCallback });
}

export default http;
