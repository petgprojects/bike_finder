const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_RESULTS, searchStations } = require("../src/station-search");

test("limits broad station searches while reporting the full match count", () => {
  const stations = Array.from({ length: MAX_RESULTS + 2 }, (_, index) => ({
    station_id: `station-${index}`,
    name: `Example station ${String(index).padStart(2, "0")}`,
  }));

  const result = searchStations({ data: { stations } }, "example");

  assert.equal(result.total_matches, MAX_RESULTS + 2);
  assert.equal(result.stations.length, MAX_RESULTS);
});
