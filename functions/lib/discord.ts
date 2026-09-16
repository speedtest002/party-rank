// ----------------------------------------------------------------
// Discord Bot API helpers for avatar resolution.
// Only used server-side in Cloudflare Functions (env vars).
// ----------------------------------------------------------------

interface DiscordUser {
  id: string;
  avatar: string | null;
}

interface DiscordMember {
  user?: DiscordUser;
  avatar?: string | null;
}

const DISCORD_API = "https://discord.com/api/v10";

// ----------------------------------------------------------------
// Rate-limit-aware fetch wrapper for Discord REST API.
// Retries once on 429 with the server-suggested Retry-After.
// ----------------------------------------------------------------
async function discordFetch(path: string, botToken: string): Promise<Response | null> {
  const url = `${DISCORD_API}${path}`;
  const headers = { Authorization: `Bot ${botToken}` };

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "1") || 1;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    // 403 / 404 / other → give up
    return null;
  }
  return null;
}

// ----------------------------------------------------------------
// Resolve the *current* Discord avatar URL for a set of Discord IDs
// using the Discord Bot API.
//
// Strategy (per user):
//   1. GET /guilds/{guildId}/members/{userId}  (most reliable — bot is in the guild)
//   2. Fallback GET /users/{userId}             (works when bot shares a mutual guild)
//
// Returns Map<discordId, avatarUrl>.
// IDs that fail both lookups are omitted — callers keep the DB-cached URL.
// ----------------------------------------------------------------
export async function resolveDiscordAvatars(
  botToken: string,
  guildId: string | undefined | null,
  discordIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const wanted = new Set(discordIds.filter((id) => id));
  if (wanted.size === 0) return result;

  for (const id of wanted) {
    let user: DiscordUser | null = null;

    // 1. Try guild member lookup (most reliable for bots in guild)
    if (guildId) {
      const res = await discordFetch(`/guilds/${guildId}/members/${id}`, botToken);
      if (res?.ok) {
        const member: DiscordMember = await res.json();
        user = member.user ?? null;
      }
    }

    // 2. Fallback: direct user lookup
    if (!user) {
      const res = await discordFetch(`/users/${id}`, botToken);
      if (res?.ok) {
        user = (await res.json()) as DiscordUser;
      }
    }

    if (!user) continue;

    // Build avatar URL
    if (user.avatar) {
      result.set(id, `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.png?size=256`);
    } else {
      // Default avatar: (userId >> 22) % 6 for modern defaults
      const index = Math.floor(Number(BigInt(id) >> 22n)) % 6;
      result.set(id, `https://cdn.discordapp.com/embed/avatars/${index}.png`);
    }
  }

  return result;
}

// ----------------------------------------------------------------
// Resolve default avatar URL for a Discord user (no API call).
// Used as last-resort fallback when both Discord + Clerk fail.
// ----------------------------------------------------------------
export function defaultAvatarUrl(discordId: string): string {
  const index = Math.floor(Number(BigInt(discordId) >> 22n)) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
