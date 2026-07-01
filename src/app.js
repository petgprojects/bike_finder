const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const {
  buildAvailability,
  parseRequestedLocations,
  validateLocations,
} = require("./availability");
const {
  findNearestAvailableDock,
  parseCoordinateQuery,
  parseNearestDockQuery,
} = require("./nearest-station");
const { searchStations } = require("./station-search");
const {
  buildNearbyFavouriteLocations,
  parseBearerApiKey,
  validateFavouritePayload,
} = require("./favourites");

const DEFAULT_PUBLIC_ROOT = path.join(__dirname, "public");
const PUBLIC_FILES = new Map([
  ["/", { filename: "index.html", contentType: "text/html; charset=utf-8" }],
  [
    "/styles.css",
    { filename: "styles.css", contentType: "text/css; charset=utf-8" },
  ],
  [
    "/main.js",
    {
      filename: "main.js",
      contentType: "application/javascript; charset=utf-8",
    },
  ],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body) + "\n");
}

async function sendPublicFile(pathname, response, publicRoot, logger) {
  const file = PUBLIC_FILES.get(pathname);

  if (!file) {
    return false;
  }

  try {
    const body = await fs.readFile(path.join(publicRoot, file.filename));
    response.writeHead(200, {
      "content-type": file.contentType,
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    logger.error("Could not read static asset " + file.filename, error);
    sendJson(response, 500, { error: "Static asset is temporarily unavailable" });
  }

  return true;
}

async function readJsonBody(request) {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;

    if (rawBody.length > 100_000) {
      return { error: "Request body is too large" };
    }
  }

  if (!rawBody.trim()) {
    return { error: "Supply a JSON request body" };
  }

  try {
    return { body: JSON.parse(rawBody) };
  } catch {
    return { error: "Request body must be valid JSON" };
  }
}

function findStationById(stationInformationFeed, stationId) {
  return stationInformationFeed.data.stations.find(
    (station) => station.station_id === stationId,
  );
}

function rejectMissingFavouriteStore(response) {
  return sendJson(response, 503, {
    error: "Favourite storage is not configured",
  });
}

function authenticateFavouriteRequest(request, response) {
  const auth = parseBearerApiKey(request);

  if (auth.error) {
    sendJson(response, 401, { error: auth.error });
    return null;
  }

  return auth.apiKey;
}

function createApp({
  locations,
  getStationStatus,
  getStationInformation,
  favouritesStore,
  publicRoot = DEFAULT_PUBLIC_ROOT,
  logger = console,
}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET") {
      const served = await sendPublicFile(
        url.pathname,
        response,
        publicRoot,
        logger,
      );

      if (served) {
        return;
      }
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok" });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/stations/search"
    ) {
      const query = url.searchParams.get("query")?.trim() || "";

      if (query.length < 2) {
        return sendJson(response, 400, {
          error: "Supply a query of at least 2 characters using ?query=name",
        });
      }

      try {
        const feed = await getStationInformation();
        return sendJson(response, 200, searchStations(feed, query));
      } catch (error) {
        logger.error("Could not load Citi Bike station information", error);
        return sendJson(response, 502, {
          error: "Citi Bike station information is temporarily unavailable",
        });
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/stations/nearest"
    ) {
      const { latitude, longitude, minDocks, errors } =
        parseNearestDockQuery(url.searchParams);

      if (errors.length > 0) {
        return sendJson(response, 400, {
          error:
            "Supply valid latitude, longitude, and optional min_docks parameters",
          details: errors,
        });
      }

      try {
        const [stationInformationFeed, stationStatusFeed] = await Promise.all([
          getStationInformation(),
          getStationStatus(),
        ]);
        const station = findNearestAvailableDock(
          stationInformationFeed,
          stationStatusFeed,
          { latitude, longitude, minDocks },
        );

        if (!station) {
          return sendJson(response, 404, {
            error: "No stations currently have at least " + minDocks + " open docks",
          });
        }

        return sendJson(response, 200, {
          query: {
            latitude,
            longitude,
            min_docks: minDocks,
          },
          feed_last_updated: stationStatusFeed.last_updated,
          station_information_last_updated: stationInformationFeed.last_updated,
          station,
        });
      } catch (error) {
        logger.error("Could not load Citi Bike station feeds", error);
        return sendJson(response, 502, {
          error: "Citi Bike station feeds are temporarily unavailable",
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/favourites") {
      if (!favouritesStore) {
        return rejectMissingFavouriteStore(response);
      }

      const apiKey = authenticateFavouriteRequest(request, response);

      if (!apiKey) {
        return;
      }

      try {
        const favourites = await favouritesStore.listFavourites(apiKey);
        return sendJson(response, 200, { favourites });
      } catch (error) {
        logger.error("Could not load favourites", error);
        return sendJson(response, 500, {
          error: "Favourite storage is temporarily unavailable",
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/favourites") {
      if (!favouritesStore) {
        return rejectMissingFavouriteStore(response);
      }

      const apiKey = authenticateFavouriteRequest(request, response);

      if (!apiKey) {
        return;
      }

      const parsedBody = await readJsonBody(request);

      if (parsedBody.error) {
        return sendJson(response, 400, { error: parsedBody.error });
      }

      const { label, stationId, errors } = validateFavouritePayload(
        parsedBody.body,
      );

      if (errors.length > 0) {
        return sendJson(response, 400, {
          error: "Favourite could not be saved",
          details: errors,
        });
      }

      let stationInformationFeed;

      try {
        stationInformationFeed = await getStationInformation();
      } catch (error) {
        logger.error("Could not load Citi Bike station information", error);
        return sendJson(response, 502, {
          error: "Citi Bike station information is temporarily unavailable",
        });
      }

      const station = findStationById(stationInformationFeed, stationId);

      if (!station) {
        return sendJson(response, 404, {
          error: "Station was not found in the Citi Bike station feed",
        });
      }

      try {
        const favourite = await favouritesStore.saveFavourite(apiKey, {
          label,
          stationId,
          stationName: station.name,
        });

        return sendJson(response, 201, { favourite });
      } catch (error) {
        logger.error("Could not save favourite", error);
        return sendJson(response, 500, {
          error: "Favourite storage is temporarily unavailable",
        });
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/favourites/availability"
    ) {
      if (!favouritesStore) {
        return rejectMissingFavouriteStore(response);
      }

      const apiKey = authenticateFavouriteRequest(request, response);

      if (!apiKey) {
        return;
      }

      const { latitude, longitude, errors } = parseCoordinateQuery(
        url.searchParams,
      );

      if (errors.length > 0) {
        return sendJson(response, 400, {
          error: "Supply valid latitude and longitude parameters",
          details: errors,
        });
      }

      let favourites;

      try {
        favourites = await favouritesStore.listFavourites(apiKey);
      } catch (error) {
        logger.error("Could not load favourites", error);
        return sendJson(response, 500, {
          error: "Favourite storage is temporarily unavailable",
        });
      }

      try {
        const [stationInformationFeed, stationStatusFeed] = await Promise.all([
          getStationInformation(),
          getStationStatus(),
        ]);
        const nearby = buildNearbyFavouriteLocations(
          favourites,
          stationInformationFeed,
          { latitude, longitude },
        );

        return sendJson(
          response,
          200,
          buildAvailability(
            stationStatusFeed,
            nearby.locations,
            nearby.requestedLocations,
          ),
        );
      } catch (error) {
        logger.error("Could not load Citi Bike station feeds", error);
        return sendJson(response, 502, {
          error: "Citi Bike station feeds are temporarily unavailable",
        });
      }
    }

    if (request.method !== "GET" || url.pathname !== "/api/availability") {
      return sendJson(response, 404, { error: "Not found" });
    }

    const requestedLocations = parseRequestedLocations(url.searchParams);
    const availableLocations = Object.keys(locations);

    if (requestedLocations.length === 0) {
      return sendJson(response, 400, {
        error: "Supply at least one location using ?locations=name",
        available_locations: availableLocations,
      });
    }

    const { uniqueLocations, unknownLocations } = validateLocations(
      requestedLocations,
      locations,
    );

    if (unknownLocations.length > 0) {
      return sendJson(response, 400, {
        error: "One or more locations are not configured",
        unknown_locations: unknownLocations,
        available_locations: availableLocations,
      });
    }

    try {
      const feed = await getStationStatus();
      return sendJson(
        response,
        200,
        buildAvailability(feed, locations, uniqueLocations),
      );
    } catch (error) {
      logger.error("Could not load Citi Bike station status", error);
      return sendJson(response, 502, {
        error: "Citi Bike status is temporarily unavailable",
      });
    }
  });
}

module.exports = { createApp };

