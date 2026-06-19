const DEFAULT_FEED_URL =
  "https://gbfs.citibikenyc.com/gbfs/en/station_status.json";
const DEFAULT_STATION_INFORMATION_URL =
  "https://gbfs.citibikenyc.com/gbfs/en/station_information.json";

function createFeedClient({
  feedUrl = process.env.CITI_BIKE_STATUS_URL || DEFAULT_FEED_URL,
  cacheMilliseconds = 30_000,
  timeoutMilliseconds = 5_000,
  fetchImpl = fetch,
} = {}) {
  let cachedFeed;
  let cacheExpiresAt = 0;

  return async function getStationStatus() {
    if (cachedFeed && Date.now() < cacheExpiresAt) {
      return cachedFeed;
    }

    const response = await fetchImpl(feedUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });

    if (!response.ok) {
      throw new Error(`Citi Bike feed returned HTTP ${response.status}`);
    }

    const feed = await response.json();

    if (!Array.isArray(feed?.data?.stations)) {
      throw new Error("Citi Bike feed response did not contain station data");
    }

    cachedFeed = feed;
    cacheExpiresAt = Date.now() + cacheMilliseconds;
    return feed;
  };
}

module.exports = {
  createFeedClient,
  DEFAULT_FEED_URL,
  DEFAULT_STATION_INFORMATION_URL,
};
