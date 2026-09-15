import { Hyperdrive } from "@cloudflare/workers-types";

declare module "cloudflare:workers" {
  interface Env {
    DB: Hyperdrive;
    ANISONG_DB: Hyperdrive;
    MASTER_SECRET: string;
    APP_ENV: string;
    APP_URL: string;
  }
}
