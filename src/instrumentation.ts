import type { Instrumentation } from "next";

/**
 * Next.js request-error hook: every error the server captures while rendering, in a route
 * handler, in a server action or in the proxy is written as one structured JSON line.
 *
 * Only the path without its query string is logged, and no headers (they carry cookies and
 * tokens). The message goes through the logger's redaction. `digest` is the id Next.js shows to
 * the user in production error pages, so a report can be matched to its log line.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logger, serializeError } = await import("@/server/logger");
  logger.error("request.unhandled_error", {
    method: request.method,
    path: request.path.split("?")[0],
    router: context.routerKind,
    route: context.routePath,
    route_type: context.routeType,
    render_source: "renderSource" in context ? context.renderSource : undefined,
    revalidate_reason: "revalidateReason" in context ? context.revalidateReason : undefined,
    error: serializeError(error),
  });
};
