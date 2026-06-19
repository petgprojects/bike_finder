const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAvailability,
  parseRequestedLocations,
  validateLocations,
} = require("../src/availability");

const locations = {
  work: [
    { station_id: "station-1", name: "First station" },
    { station_id: "station-2", name: "Second station" },
  ],
  home: [{ station_id: "station-2", name: "Second station" }],
};

test("parses comma-separated and repeated location parameters", () => {
  const params = new URLSearchParams(
    "locations=work,home&locations=work&locations=",
  );

  assert.deepEqual(parseRequestedLocations(params), ["work", "home", "work"]);
});

test("reports unique and unknown location names", () => {
  assert.deepEqual(validateLocations(["work", "work", "other"], locations), {
    uniqueLocations: ["work", "other"],
    unknownLocations: ["other"],
  });
});

test("filters stations and calculates bike and dock availability", () => {
  const feed = {
    last_updated: 1234,
    data: {
      stations: [
        {
          station_id: "station-1",
          num_bikes_available: 2,
          num_ebikes_available: 1,
          num_docks_available: 0,
          is_installed: 1,
          is_renting: 1,
          is_returning: 1,
          last_reported: 1200,
        },
        {
          station_id: "station-2",
          num_bikes_available: 0,
          num_docks_available: 3,
          is_installed: 1,
          is_renting: 1,
          is_returning: 1,
          last_reported: 1201,
        },
        {
          station_id: "unrequested",
          num_bikes_available: 99,
          num_docks_available: 99,
          is_installed: 1,
          is_renting: 1,
          is_returning: 1,
        },
      ],
    },
  };

  const result = buildAvailability(feed, locations, ["work", "home"]);

  assert.deepEqual(result.summary, { has_bike: true, has_dock: true });
  assert.equal(result.stations.length, 2);
  assert.deepEqual(result.stations[1].locations, ["work", "home"]);
  assert.equal(result.stations[0].has_bike, true);
  assert.equal(result.stations[0].has_dock, false);
  assert.equal(result.stations[1].has_bike, false);
  assert.equal(result.stations[1].has_dock, true);
});

test("does not offer bikes or docks at an unavailable station", () => {
  const result = buildAvailability(
    {
      last_updated: 1234,
      data: {
        stations: [
          {
            station_id: "station-1",
            num_bikes_available: 4,
            num_docks_available: 4,
            is_installed: 0,
            is_renting: 1,
            is_returning: 1,
          },
        ],
      },
    },
    locations,
    ["work"],
  );

  assert.equal(result.stations[0].has_bike, false);
  assert.equal(result.stations[0].has_dock, false);
  assert.equal(result.stations[1].found, false);
});
