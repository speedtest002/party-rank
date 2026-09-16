import { verifyToken, createClerkClient } from "@clerk/backend";

// ----------------------------------------------------------------
// Shared auth for Functions.
// Frontend now uses Clerk (SWR fetcher sends `Authorization: Bearer <JWT>`).
// The render worker authenticates with BOT_SECRET.
//
// resolveAuthUser returns:
//   - "BOT" when the bearer token equals env.BOT_SECRET
//   - the user's linked Discord ID (oauth_discord external account) when a valid
//     Clerk JWT is presented, falling back to the Clerk user id
//   - null when unauthenticated
// ----------------------------------------------------------------

interface ClerkEnv {
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  BOT_SECRET?: string;
}

export async function resolveAuthUser(
  request: Request,
  env: ClerkEnv
): Promise<string | null> {
  const header = request.headers.get("Authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) return null;

  // 1. Bot / render worker secret
  if (env.BOT_SECRET && token === env.BOT_SECRET) {
    return "BOT";
  }

  // 2. Clerk session JWT
  if (!env.CLERK_SECRET_KEY) return null;

  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    const userId = payload.sub as string;

    const clerk = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
    });

    const user = await clerk.users.getUser(userId);
    const discord = user.externalAccounts.find(
      (a: any) => a.provider === "discord" || a.provider === "oauth_discord"
    );

    return discord?.externalId || userId;
  } catch (err) {
    console.error("[clerk] Token verification failed:", err);
    return null;
  }
}

// Convenience for endpoints that only need to trust the render worker.
export function isBotSecret(request: Request, env: ClerkEnv): boolean {
  const header = request.headers.get("Authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && !!env.BOT_SECRET && token === env.BOT_SECRET;
}