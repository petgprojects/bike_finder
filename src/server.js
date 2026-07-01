const fs = require("node:fs");
const path = require("node:path");
const { createApp } = require("./app");
const {
  createFeedClient,
  DEFAULT_STATION_INFORMATION_URL,
} = require("./feed-client");
const { createPostgresFavouritesStore } = require("./favourites-store");

const locationsPath =
  process.env.LOCATIONS_FILE ||
  path.join(__dirname, "..", "config", "locations.json");
const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
const port = Number(process.env.PORT || 3000);
const favouritesStore = createPostgresFavouritesStore();

favouritesStore.ready.catch((error) => {
  console.error("Could not initialize favourites database", error);
});

const server = createApp({
  locations,
  favouritesStore,
  getStationStatus: createFeedClient(),
  getStationInformation: createFeedClient({
    feedUrl:
      process.env.CITI_BIKE_STATION_INFORMATION_URL ||
      DEFAULT_STATION_INFORMATION_URL,
    cacheMilliseconds: 300_000,
  }),
});

server.listen(port, () => {
  console.log("Bike availability API listening on http://localhost:" + port);
});

async function shutdown(signal) {
  console.log("Received " + signal + ", shutting down");
  server.close(async () => {
    await favouritesStore.close();
    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

