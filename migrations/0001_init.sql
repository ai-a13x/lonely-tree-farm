CREATE TABLE listings (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  blurb      TEXT NOT NULL DEFAULT '',
  ready      TEXT NOT NULL DEFAULT '',
  price      TEXT NOT NULL DEFAULT '',
  total      INTEGER NOT NULL CHECK (total >= 0),
  remaining  INTEGER NOT NULL CHECK (remaining >= 0 AND remaining <= total),
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE reservations (
  id         INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings (id),
  kind       TEXT NOT NULL CHECK (kind IN ('reservation', 'waitlist')),
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'collected', 'cancelled')),
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX reservations_listing ON reservations (listing_id);
