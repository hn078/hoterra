import { config } from 'dotenv';

config({ quiet: true });

// Local Docker starts with an owner/admin URL. When local app-role credentials
// are configured, keep that URL for migrations and make every runtime import
// use the restricted role automatically. Production must provide both URLs
// explicitly and is never rewritten here.
if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL && process.env.APP_DATABASE_USER && process.env.APP_DATABASE_PASSWORD) {
  process.env.DATABASE_ADMIN_URL ||= process.env.DATABASE_URL;
  const runtimeUrl = new URL(process.env.DATABASE_URL);
  runtimeUrl.username = process.env.APP_DATABASE_USER;
  runtimeUrl.password = process.env.APP_DATABASE_PASSWORD;
  process.env.DATABASE_URL = runtimeUrl.toString();
}
