const http = require("node:http");
const {
  buildAvailability,
  parseRequestedLocations,
  validateLocations,
} = require("./availability");
const { searchStations } = require("./station-search");

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function createApp({
  locations,
  getStationStatus,
  getStationInformation,
  logger = console,
}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

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
