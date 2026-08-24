import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const hoterra = github("hn078/hoterra", { checkSuites: false });

  const Postgres = postgres("Postgres", { region: "europe-west4-drams3a" });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "europe-west4-drams3a", sizeMB: 50000 });
  const backendVolume = volume("backend-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "europe-west4-drams3a", sizeMB: 50000 });
  const backend = service("backend", {
    source: hoterra,
    build: "npm run build:backend",
    start: "npm run start:backend",
    preDeploy: "npm run db:migrate:deploy",
    healthcheck: "/api/ready",
    healthcheckTimeout: 120,
    replicas: { "europe-west4-drams3a": 1 },
    volumeMounts: {
      "/app/uploads": backendVolume,
    },
    env: {
      CORS_ORIGINS: preserve(),
      DATABASE_ADMIN_URL: preserve(),
      DATABASE_URL: preserve(),
      DEFAULT_TENANT_SLUG: preserve(),
      EMAIL_DELIVERY_ENABLED: preserve(),
      FRONTEND_URL: preserve(),
      HOST: preserve(),
      HOTERRA_UPLOADS_DIR: preserve(),
      JWT_SECRET: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
      TENANT_BASE_DOMAIN: preserve(),
      TENANT_DB_CONNECTION_LIMIT: preserve(),
    },
  });
  const frontend = service("frontend", {
    source: hoterra,
    build: "npm run build:frontend",
    start: "npm run start:frontend",
    healthcheck: "/",
    healthcheckTimeout: 120,
    replicas: { "europe-west4-drams3a": 1 },
    domains: ["*.hoterra.net", "hoterra.net"],
    env: {
      PORT: preserve(),
      VITE_API_URL: preserve(),
    },
  });

  return project("hoterra", {
    resources: [Postgres, backend, frontend, postgresVolume, backendVolume],
  });
});
