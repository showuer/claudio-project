CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  role       TEXT NOT NULL CHECK(role IN ('user','dj','system')),
  content    TEXT NOT NULL,
  tts_url    TEXT,
  played     INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playlists (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  cover_url  TEXT,
  song_count INTEGER DEFAULT 0,
  source     TEXT DEFAULT 'ncm',
  synced_at  TEXT
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id TEXT NOT NULL,
  song_id     TEXT NOT NULL,
  song_name   TEXT NOT NULL,
  artist      TEXT,
  album       TEXT,
  duration_ms INTEGER,
  position    INTEGER,
  PRIMARY KEY (playlist_id, song_id)
);

CREATE TABLE IF NOT EXISTS plays (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id   TEXT NOT NULL,
  song_name TEXT NOT NULL,
  artist    TEXT,
  played_at TEXT DEFAULT (datetime('now')),
  skipped   INTEGER DEFAULT 0,
  source    TEXT
);

CREATE TABLE IF NOT EXISTS favorites (
  song_id   TEXT PRIMARY KEY,
  song_name TEXT NOT NULL,
  artist    TEXT,
  added_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queue (
  position    INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id     TEXT NOT NULL,
  song_name   TEXT NOT NULL,
  artist      TEXT,
  url         TEXT,
  duration_ms INTEGER
);
