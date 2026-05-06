/**
 * HTTP tool executor for `kind: 'http'` registry tools.
 *
 * Config shape:
 *   {
 *     url: string,                  // supports {{argName}} interpolation
 *     method: "GET"|"POST"|"PUT"|"DELETE",
 *     headers?: Record<string,string>, // static headers (auth tokens, etc.)
 *     bodyTemplate?: string         // JSON string with {{argName}} placeholders (POST/PUT)
 *   }
 *
 * Security: outbound URL must match the workspace's allowlist
 * (stored at workspaces.settings.httpToolAllowlist as string[] of host prefixes).
 * This blocks SSRF (e.g. internal metadata endpoints, localhost, etc.).
 */

export type HttpToolConfig = {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  bodyTemplate?: string;
};

export type HttpExecutorContext = {
  /** Allowlist of URL prefixes (e.g. "https://api.example.com/"). Empty = block everything. */
  allowlist: string[];
  /** Optional fetch override for testing. */
  fetchImpl?: typeof fetch;
};

/** Replace `{{name}}` placeholders with stringified arg values. */
function interpolate(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = args[key];
    if (v === undefined || v === null) return "";
    return typeof v === "string" ? v : String(v);
  });
}

function isUrlAllowed(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.some((prefix) => url.startsWith(prefix));
}

export function buildHttpExecute(
  config: HttpToolConfig,
  ctx: HttpExecutorContext,
) {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  return async (
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }> => {
    const url = interpolate(config.url, args);

    if (!isUrlAllowed(url, ctx.allowlist)) {
      return {
        ok: false,
        error: `URL not in workspace allowlist: ${url}`,
      };
    }

    const init: RequestInit = {
      method: config.method,
      headers: {
        "content-type": "application/json",
        ...(config.headers ?? {}),
      },
    };

    if (
      (config.method === "POST" || config.method === "PUT") &&
      config.bodyTemplate
    ) {
      init.body = interpolate(config.bodyTemplate, args);
    }

    try {
      const res = await fetchImpl(url, init);
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // not JSON, keep as text
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
