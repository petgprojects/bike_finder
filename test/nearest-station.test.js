const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findNearestAvailableDock,
  parseNearestDockQuery,
} = require("../src/nearest-station");

const stationInformationFeed = {
  last_updated: 1234,
  data: {
    stations: [
      {
        station_id: "station-1",
        name: "Closest but full",
        lat: 40.7501,
        lon: -73.9901,
      },
      {
        station_id: "station-2",
        name: "Nearest open dock",
        lat: 40.751,
        lon: -73.991,
      },
      {
        station_id: "station-3",
        name: "Enough docks farther away",
        lat: 40.752,
        lon: -73.992,
      },
    ],
  },
};

const stationStatusFeed = {
  last_updated: 5678,
  data: {
    stations: [
      {
        station_id: "station-1",
        num_bikes_available: 8,
        num_docks_available: 0,
        is_installed: 1,
        is_renting: 1,
        is_returning: 1,
      },
      {
        station_id: "station-2",
        num_bikes_available: 2,
        num_ebikes_available: 1,
        num_docks_available: 1,
        is_installed: 1,
        is_renting: 1,
        is_returning: 1,
        last_reported: 5600,
      },
      {
        station_id: "station-3",
        num_bikes_available: 0,
        num_ebikes_available: 0,
        num_docks_available: 3,
        is_installed: 1,
        is_renting: 1,
        is_returning: 1,
        last_reported: 5601,
      },
    ],
  },
};

test("finds the nearest station with an available dock", () => {
  const station = findNearestAvailableDock(
    stationInformationFeed,
    stationStatusFeed,
    {
      latitude: 40.75,
      longitude: -73.99,
    },
  );

  assert.equal(station.station_id, "station-2");
  assert.equal(station.bikes_available, 2);
  assert.equal(station.ebikes_available, 1);
  assert.equal(station.docks_available, 1);
  assert.equal(station.has_bike, true);
  assert.equal(station.has_dock, true);
  assert.equal(station.last_reported, 5600);
  assert.equal(typeof station.distance_meters, "number");
});

test("honors a minimum open dock count", () => {
  const station = findNearestAvailableDock(
    stationInformationFeed,
    stationStatusFeed,
    {
      latitude: 40.75,
      longitude: -73.99,
      minDocks: 2,
    },
  );

  assert.equal(station.station_id, "station-3");
  assert.equal(station.docks_available, 3);
});

test("ignores stations that are not currently accepting returns", () => {
  const station = findNearestAvailableDock(
    {
      data: {
        stations: [
          {
            station_id: "station-1",
            name: "Not returning",
            lat: 40.75,
            lon: -73.99,
          },
        ],
      },
    },
    {
      data: {
        stations: [
          {
            station_id: "station-1",
            num_bikes_available: 4,
            num_docks_available: 4,
            is_installed: 1,
            is_renting: 1,
            is_returning: 0,
          },
        ],
      },
    },
    {
      latitude: 40.75,
      longitude: -73.99,
    },
  );

  assert.equal(station, null);
});

test("parses nearest-dock coordinates and aliases", () => {
  const result = parseNearestDockQuery(
    new URLSearchParams("lat=40.75&lng=-73.99&min_docks=2"),
  );

  assert.deepEqual(result, {
    latitude: 40.75,
    longitude: -73.99,
    minDocks: 2,
    errors: [],
  });
});

test("reports invalid nearest-dock query parameters", () => {
  const result = parseNearestDockQuery(
    new URLSearchParams("latitude=100&longitude=-73.99&min_docks=0"),
  );

  assert.deepEqual(result.errors, [
    "latitude must be a number from -90 to 90",
    "min_docks must be a positive integer",
  ]);
});
