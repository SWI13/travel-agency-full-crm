import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

// `react-router dev` loads .env for us; `react-router-serve` does not.
try {
  if (existsSync(".env")) process.loadEnvFile?.(".env");
} catch {
  /* optional */
}

const read = (key: string): string => (process.env[key] ?? "").trim();
const isProd = process.env.NODE_ENV === "production";

export const DATA_DIR = path.resolve(read("DATA_DIR") || ".data");

function devSessionSecret(): string {
  // Development convenience only: a random secret persisted next to the demo datastore.
  const file = path.join(DATA_DIR, "session-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(DATA_DIR, { recursive: true });
  const secret = randomBytes(48).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const env = {
  isProd,
  appwrite: {
    endpoint: read("APPWRITE_ENDPOINT"),
    projectId: read("APPWRITE_PROJECT_ID"),
    apiKey: read("APPWRITE_API_KEY"),
    databaseId: read("APPWRITE_DATABASE_ID") || "umrah_crm",
  },
  whatsapp: {
    verifyToken: read("WHATSAPP_VERIFY_TOKEN"),
    appSecret: read("WHATSAPP_APP_SECRET"),
    accessToken: read("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: read("WHATSAPP_PHONE_NUMBER_ID"),
    businessAccountId: read("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    graphVersion: read("META_GRAPH_VERSION") || "v27.0",
  },
  bootstrapAdmin: {
    email: read("ADMIN_EMAIL").toLowerCase(),
    password: read("ADMIN_PASSWORD"),
    name: read("ADMIN_NAME") || "Administrator",
  },
  publicBaseUrl: read("PUBLIC_BASE_URL").replace(/\/+$/, ""),
  /** Simulated webhook events and sample data. On in development, opt-in for production. */
  demoTools: read("DEMO_TOOLS") ? read("DEMO_TOOLS") === "true" : !isProd,
  get sessionSecret(): string {
    const configured = read("SESSION_SECRET");
    if (configured.length >= 32) return configured;
    if (isProd) {
      throw new Error("SESSION_SECRET (32+ characters) is required in production.");
    }
    return devSessionSecret();
  },
};

export const appwriteConfigured = () =>
  Boolean(env.appwrite.endpoint && env.appwrite.projectId && env.appwrite.apiKey);

/** Which WhatsApp variables are present. Values are never exposed. */
export function whatsappConfig() {
  const w = env.whatsapp;
  const present = {
    WHATSAPP_VERIFY_TOKEN: Boolean(w.verifyToken),
    WHATSAPP_APP_SECRET: Boolean(w.appSecret),
    WHATSAPP_ACCESS_TOKEN: Boolean(w.accessToken),
    WHATSAPP_PHONE_NUMBER_ID: Boolean(w.phoneNumberId),
    WHATSAPP_BUSINESS_ACCOUNT_ID: Boolean(w.businessAccountId),
  };
  const missing = Object.entries(present)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  return {
    present,
    missing,
    /** Enough to receive and authenticate webhooks. */
    canReceive: present.WHATSAPP_VERIFY_TOKEN && present.WHATSAPP_APP_SECRET,
    /** Enough to call the Graph API (connection test). */
    canCallApi: present.WHATSAPP_ACCESS_TOKEN && present.WHATSAPP_PHONE_NUMBER_ID,
  };
}
