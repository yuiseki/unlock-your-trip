-- One row per achievement a writer has rated, so the ratings follow the
-- writer to every device. The newest rating (updated_at) wins.
CREATE TABLE stars (
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);
