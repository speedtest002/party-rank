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

// ----------------------------------------------------------------
// Resolve the *current* Discord avatar URL for a set of Discord IDs.
//
// Clerk keeps an up-to-date snapshot of each user's Discord external
// account (including the avatar hash), refreshed whenever the user logs in.
// We use that instead of the possibly-stale URL cached in our DB.
//
// Returns Map<discordId, currentAvatarUrl>. IDs with no Clerk match (or
// with no Discord external account) are omitted — callers should keep the
// cached URL and rely on the composition's onError fallback.
// ----------------------------------------------------------------
export async function resolveCurrentAvatars(
  clerkSecretKey: string,
  clerkPublishableKey: string | undefined,
  discordIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const wanted = new Set(discordIds);
  if (wanted.size === 0) return result;

  const clerk = createClerkClient({
    secretKey: clerkSecretKey,
    publishableKey: clerkPublishableKey,
  });

  // Clerk's getUserList() `externalId` filter does not match external-account
  // IDs, so paginate all users and match client-side. PartyRank's user base
  // is small (a party of friends), so this stays a single call in practice.
  try {
    let offset = 0;
    for (;;) {
      const page = await clerk.users.getUserList({
        limit: 100,
        offset,
      });
      for (const user of page.data) {
        const discordAccount = user.externalAccounts?.find(
          (a) => a.provider === "discord" || a.provider === "oauth_discord"
        );
        if (discordAccount?.imageUrl && wanted.has(discordAccount.externalId)) {
          result.set(discordAccount.externalId, discordAccount.imageUrl);
          wanted.delete(discordAccount.externalId);
        }
      }
      if (page.data.length < 100 || wanted.size === 0) break;
      offset += page.data.length;
    }
  } catch (err) {
    console.error("[clerk] resolveCurrentAvatars failed:", err);
  }

  return result;
}
