-- Bearer tokens carry this version. Logout and password resets increment it,
-- making previously issued tokens unusable without maintaining an in-memory
-- blacklist that would break across Railway replicas or restarts.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
