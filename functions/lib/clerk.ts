import { verifyToken, createClerkClient } from "@clerk/backend";
import { resolveDiscordAvatars } from "./discord";

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
// Priority:
//   1. Discord Bot API (real-time, always current if bot shares a guild)
//   2. Clerk externalAccount.imageUrl (current only if user logged in recently)
//   3. omit → caller keeps the DB-cached URL + composition onError fallback
//
// Returns Map<discordId, currentAvatarUrl>.
// ----------------------------------------------------------------
export async function resolveCurrentAvatars(
  clerkSecretKey: string,
  clerkPublishableKey: string | undefined,
  discordIds: string[],
  opts?: { botToken?: string | undefined; guildId?: string | undefined | null }
): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(discordIds.filter((id) => id)));
  if (wanted.length === 0) return new Map();

  // ---- Layer 1: Discord Bot API (always freshest) ----
  const result = new Map<string, string>();
  if (opts?.botToken) {
    const fromDiscord = await resolveDiscordAvatars(opts.botToken, opts.guildId, wanted);
    for (const [id, url] of fromDiscord) result.set(id, url);
    if (result.size === wanted.length) return result; // all resolved — skip Clerk
  }

  // ---- Layer 2: Clerk (for IDs Discord couldn't resolve) ----
  const stillWanted = wanted.filter((id) => !result.has(id));
  if (stillWanted.length > 0 && clerkSecretKey) {
    const clerk = createClerkClient({
      secretKey: clerkSecretKey,
      publishableKey: clerkPublishableKey,
    });
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
          if (
            discordAccount?.imageUrl &&
            stillWanted.includes(discordAccount.externalId)
          ) {
            result.set(discordAccount.externalId, discordAccount.imageUrl);
          }
        }
        if (page.data.length < 100) break;
        offset += page.data.length;
      }
    } catch (err) {
      console.error("[clerk] resolveCurrentAvatars fallback failed:", err);
    }
  }

  return result;
}