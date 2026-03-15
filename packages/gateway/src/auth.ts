// Gateway authentication module
// Supports token-based and password-based auth

const AUTH_SECRET = process.env.AUTH_SECRET ?? "change-me-to-a-random-secret";

export type AuthParams = {
  token?: string;
  password?: string;
};

export type AuthResult = {
  ok: boolean;
  userId?: string;
};

export async function authenticate(params: AuthParams): Promise<AuthResult> {
  // Token-based auth (for production — validate JWT or session token)
  if (params.token) {
    // TODO: Validate against auth sessions table or JWT verification
    // For now, accept any non-empty token in development
    if (process.env.NODE_ENV === "production") {
      // In production, validate token against database
      return { ok: false };
    }
    return { ok: true, userId: "dev-user" };
  }

  // Password-based auth (for gateway-to-gateway or service auth)
  if (params.password) {
    return { ok: params.password === AUTH_SECRET };
  }

  // In development, allow unauthenticated connections
  if (process.env.NODE_ENV !== "production") {
    return { ok: true, userId: "dev-user" };
  }

  return { ok: false };
}
