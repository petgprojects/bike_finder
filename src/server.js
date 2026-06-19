const fs = require("node:fs");
const path = require("node:path");
const { createApp } = require("./app");
const {
  createFeedClient,
  DEFAULT_STATION_INFORMATION_URL,
} = require("./feed-client");

const locationsPath =
  process.env.LOCATIONS_FILE ||
  path.join(__dirname, "..", "config", "locations.json");
const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
const port = Number(process.env.PORT || 3000);

const server = createApp({
  locations,
  getStationStatus: createFeedClient(),
  getStationInformation: createFeedClient({
    feedUrl:
      process.env.CITI_BIKE_STATION_INFORMATION_URL ||
      DEFAULT_STATION_INFORMATION_URL,
    cacheMilliseconds: 300_000,
  }),
});

server.listen(port, () => {
  console.log(`Bike availability API listening on http://localhost:${port}`);
});
