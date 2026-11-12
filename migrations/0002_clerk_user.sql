-- A writer can also sign in with Clerk (Google). The administrator puts the
-- person's Clerk user ID (user_...) on their row; the setup-link token stays
-- valid alongside it.
ALTER TABLE users ADD COLUMN clerk_user_id TEXT;
CREATE UNIQUE INDEX users_clerk_user_id ON users (clerk_user_id);
