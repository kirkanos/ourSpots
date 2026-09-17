import { z } from 'zod';

/**
 * Die Konfiguration wird beim Start einmal validiert. Ein fehlender Wert soll
 * den Container sofort scheitern lassen statt erst beim ersten Login.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  OIDC_ISSUER: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),
  OIDC_REDIRECT_URI: z.string().url(),
  OIDC_SCOPES: z.string().default('openid profile email'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET muss mindestens 32 Zeichen haben'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  ORS_API_KEY: z.string().default(''),
  ORS_BASE_URL: z.string().url().default('https://api.openrouteservice.org'),

  NOMINATIM_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().min(5),

  PHOTO_DIR: z.string().default('/data/photos'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(200).default(25),

  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

export type AppConfig = z.infer<typeof envSchema> & {
  isProduction: boolean;
  cookieSecure: boolean;
};

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Ungültige Konfiguration:\n${details}`);
  }

  const env = parsed.data;
  cached = {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    // Hinter dem Reverse Proxy laeuft die App per HTTPS; nur lokal ohne.
    cookieSecure: env.APP_URL.startsWith('https://'),
  };
  return cached;
}

export const CONFIG = Symbol('APP_CONFIG');
