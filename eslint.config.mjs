import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layering rules (spec section 4), enforced by lint:
 *
 *  1. Files marked "use client" may not import "server-only" or anything under "@/server/**"
 *     (local rule `zuvio/no-server-imports-in-client`; type-only imports are allowed because they
 *     are erased).
 *  2. "@/server/supabase/admin" (service-role client, bypasses RLS) may be imported only from
 *     ADMIN_CLIENT_ALLOWLIST.
 *  3. "@supabase/*" packages may be imported only inside the Supabase client modules and
 *     repository files (SUPABASE_PACKAGE_ALLOWLIST). Everything else receives a client through
 *     ServiceContext and imports the `AppSupabaseClient` type from "@/server/supabase/types".
 *
 * Tests are exempt from 2 and 3 (integration tests create users with the admin API).
 */

/** The only places that may use the service-role client. Extend only for the uses named in src/server/supabase/admin.ts. */
const ADMIN_CLIENT_ALLOWLIST = [
  "src/server/supabase/**",
  // Postgres rate limiter for traffic without a user session.
  "src/server/http/rate-limit.ts",
  // E-mail recipient lookup (address of a user who is not the caller).
  "src/server/email/recipients.ts",
  "src/features/notifications/email-recipients.ts",
  // Reference-data ingestion (places, nearby places): trusted server path only.
  "src/features/locations/ingestion.ts",
  "src/features/locations/ingestion/**",
  // Payment confirmation after the provider signature was verified (bookings, spec 14.2).
  "src/features/bookings/payment-repository.ts",
  // Local tooling.
  "scripts/**",
];

const SUPABASE_PACKAGE_ALLOWLIST = [
  "src/server/supabase/**",
  "src/lib/supabase/**",
  "src/features/*/repository.ts",
  "src/features/*/repository/**",
  "src/features/*/*.repository.ts",
  "src/server/**/*repository.ts",
  "scripts/**",
];

const TEST_FILES = ["**/*.test.ts", "**/*.test.tsx", "tests/**", "vitest.setup.ts"];

const adminClientPattern = {
  group: ["@/server/supabase/admin", "**/server/supabase/admin"],
  message:
    "The service-role client bypasses RLS. It may only be imported from the allowlist in eslint.config.mjs (rate limiter, e-mail recipient lookup, reference-data ingestion).",
};
const supabasePackagePattern = {
  group: ["@supabase/*"],
  allowTypeImports: true,
  message:
    "Import Supabase packages only in src/server/supabase, src/lib/supabase and repository files. Use the client from ServiceContext and the AppSupabaseClient type from '@/server/supabase/types'.",
};

/** Local plugin: forbids server modules in "use client" files. */
const zuvioPlugin = {
  rules: {
    "no-server-imports-in-client": {
      meta: {
        type: "problem",
        docs: { description: 'Disallow "server-only" and "@/server/**" imports in "use client" files.' },
        schema: [],
        messages: {
          forbidden:
            '"{{source}}" is server-only and cannot be imported from a "use client" file. Call the server through /api/v1 (apiFetch) or a Server Action instead.',
        },
      },
      create(context) {
        let isClient = false;
        const isServerModule = (source) =>
          source === "server-only" ||
          source === "@/server" ||
          source.startsWith("@/server/") ||
          /(^|\/)src\/server(\/|$)/.test(source) ||
          source === "next/headers";
        const check = (node, source, typeOnly) => {
          if (!isClient || typeOnly || typeof source !== "string" || !isServerModule(source)) return;
          context.report({ node, messageId: "forbidden", data: { source } });
        };
        return {
          Program(node) {
            isClient = node.body.some(
              (statement) =>
                statement.type === "ExpressionStatement" &&
                (statement.directive === "use client" ||
                  (statement.expression.type === "Literal" && statement.expression.value === "use client")),
            );
          },
          ImportDeclaration(node) {
            const typeOnly =
              node.importKind === "type" ||
              (node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === "type"));
            check(node, node.source.value, typeOnly);
          },
          ImportExpression(node) {
            if (node.source.type === "Literal") check(node, node.source.value, false);
          },
          ExportNamedDeclaration(node) {
            if (node.source) check(node, node.source.value, node.exportKind === "type");
          },
          ExportAllDeclaration(node) {
            check(node, node.source.value, node.exportKind === "type");
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / vendored paths:
    "supabase/**",
    "src/lib/database.types.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    ".cache/**",
  ]),

  // 1. Client files never import server modules.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { zuvio: zuvioPlugin },
    rules: { "zuvio/no-server-imports-in-client": "error" },
  },

  // 2 + 3. Default for all source: neither the admin client nor @supabase/* packages.
  // (A later block replaces the whole rule for its files, so each block states its full list.)
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,mts}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [adminClientPattern, supabasePackagePattern] }],
    },
  },
  // Supabase modules and repositories may import @supabase/*, but still not the admin client...
  {
    files: SUPABASE_PACKAGE_ALLOWLIST,
    rules: { "no-restricted-imports": ["error", { patterns: [adminClientPattern] }] },
  },
  // ...admin allowlist: may import the admin client, but @supabase/* only if also allowed above.
  {
    files: ADMIN_CLIENT_ALLOWLIST,
    ignores: SUPABASE_PACKAGE_ALLOWLIST,
    rules: { "no-restricted-imports": ["error", { patterns: [supabasePackagePattern] }] },
  },
  // In both lists: nothing restricted.
  {
    files: ["src/server/supabase/**", "scripts/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: TEST_FILES,
    rules: { "no-restricted-imports": "off" },
  },
]);

export default eslintConfig;
