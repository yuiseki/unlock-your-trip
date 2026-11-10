-- One row per person who can write. The token itself is never stored.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  token_sha256 TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- One row per achievement a person has unlocked. The primary key is what
-- stops the same unlock from being counted twice.
CREATE TABLE unlocks (
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);
