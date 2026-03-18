import { betterAuth } from "better-auth";
import { pgAdapter } from "better-auth/adapters/pg";
import { anonymous } from "better-auth/plugins";
import { Client } from "pg";

export const getAuth = (env: any) => {
  const db = new Client({ connectionString: env.DB.connectionString });
  
  return betterAuth({
    database: pgAdapter(db, {
      type: "postgres",
    }),
    plugins: [
        anonymous()
    ],
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: ".pages.dev",
      },
    },
    // Better Auth will use context.request.url by default, 
    // but on Cloudflare we might need to be explicit or use environment variables.
    baseURL: env.APP_URL || "http://localhost:8788",
    secret: env.BETTER_AUTH_SECRET || "a-very-secret-key", // The user should set this in wrangler
  });
};
