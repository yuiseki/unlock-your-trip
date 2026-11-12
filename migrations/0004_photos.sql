-- Photos a writer took for an achievement, kept on Gyazo. Only the Gyazo
-- image ID is stored; the page builds the image and page URLs from it.
CREATE TABLE photos (
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id TEXT NOT NULL,
  gyazo_id TEXT NOT NULL CHECK (length(gyazo_id) = 32),
  taken_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id, gyazo_id)
);
