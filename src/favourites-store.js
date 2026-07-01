const { Pool } = require("pg");

function normalizeFavourite(row) {
  return {
    label: row.label,
    station_id: row.station_id,
    station_name: row.station_name,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

async function ensureSchema(pool) {
  await pool.query(
    [
      "CREATE TABLE IF NOT EXISTS favourites (",
      "  id bigserial PRIMARY KEY,",
      "  api_key uuid NOT NULL,",
      "  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),",
      "  station_id text NOT NULL,",
      "  station_name text NOT NULL,",
      "  created_at timestamptz NOT NULL DEFAULT now(),",
      "  updated_at timestamptz NOT NULL DEFAULT now()",
      ");",
      "CREATE UNIQUE INDEX IF NOT EXISTS favourites_api_key_label_idx",
      "  ON favourites (api_key, label);",
      "CREATE INDEX IF NOT EXISTS favourites_api_key_idx",
      "  ON favourites (api_key);",
    ].join("\n"),
  );
}

function createPostgresFavouritesStore({ connectionString, pool } = {}) {
  const postgresPool =
    pool ||
    new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
    });
  const ready = ensureSchema(postgresPool);

  return {
    ready,

    async saveFavourite(apiKey, favourite) {
      await ready;

      const result = await postgresPool.query(
        [
          "INSERT INTO favourites (api_key, label, station_id, station_name)",
          "VALUES ($1, $2, $3, $4)",
          "ON CONFLICT (api_key, label) DO UPDATE SET",
          "  station_id = EXCLUDED.station_id,",
          "  station_name = EXCLUDED.station_name,",
          "  updated_at = now()",
          "RETURNING label, station_id, station_name, created_at, updated_at",
        ].join("\n"),
        [
          apiKey,
          favourite.label,
          favourite.stationId,
          favourite.stationName,
        ],
      );

      return normalizeFavourite(result.rows[0]);
    },

    async listFavourites(apiKey) {
      await ready;

      const result = await postgresPool.query(
        [
          "SELECT label, station_id, station_name, created_at, updated_at",
          "FROM favourites",
          "WHERE api_key = $1",
          "ORDER BY label ASC",
        ].join("\n"),
        [apiKey],
      );

      return result.rows.map(normalizeFavourite);
    },

    async close() {
      await postgresPool.end();
    },
  };
}

module.exports = { createPostgresFavouritesStore };

