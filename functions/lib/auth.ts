import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { Pool } from "pg";

let authInstance: any;

export const getAuth = (env: any) => {
  // We avoid global caching here because Miniflare/Workers can have issues 
  // with stale database connections in persistent global variables.
  // Creating a new instance per request is safer in this serverless context.

  const db = new Pool({ 
    connectionString: env.DB.connectionString,
    max: 2, // Keep pool small for serverless environment
    connectionTimeoutMillis: 5000,
  });
  
  const baseURL = env.APP_URL ? env.APP_URL + "/api/auth" : "http://localhost:8788/api/auth";

  return betterAuth({
    database: db,
    user: {
      additionalFields: {
        discord_id: {
          type: "string",
          required: false,
          defaultValue: ""
        }
      }
    },
    plugins: [
        anonymous()
    ],
    socialProviders: {
      discord: {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        mapProfileToUser: (profile) => {
          return {
            discord_id: profile.id,
          };
        },
      },
    },
    advanced: {
      crossSubDomainCookies: {
        enabled: false,
      },
    },
    baseURL: baseURL,
    trustedOrigins: ["http://localhost:5173", "http://localhost:8788", "https://mypartyrank.pages.dev"],
    secret: env.BETTER_AUTH_SECRET || "a-very-secret-key-that-is-at-least-32-chars-long",
  });
};
