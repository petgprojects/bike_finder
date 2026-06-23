const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp } = require("../src/app");

const locations = {
  work: [{ station_id: "station-1", name: "First station" }],
};

async function startServer(options = {}) {
  const server = createApp({
    locations,
    getStationStatus: async () => ({
      last_updated: 1234,
      data: {
        stations: [
          {
            station_id: "station-1",
            num_bikes_available: 2,
            num_docks_available: 3,
            is_installed: 1,
            is_renting: 1,
            is_returning: 1,
          },
        ],
      },
    }),
    getStationInformation: async () => ({
      last_updated: 1234,
      data: {
        stations: [
          {
            station_id: "station-3",
            name: "Park Ave & E 42 St",
            lat: 40.752,
            lon: -73.992,
          },
          {
            station_id: "station-1",
            name: "Park Ave & E 41 St",
            lat: 40.75,
            lon: -73.99,
          },
          {
            station_id: "station-2",
            name: "Broadway & W 40 St",
            lat: 40.751,
            lon: -73.991,
          },
        ],
      },
    }),
    logger: { error() {} },
    ...options,
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

test("returns only the requested predefined locations", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/api/availability?locations=work`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.requested_locations, ["work"]);
  assert.deepEqual(body.summary, { has_bike: true, has_dock: true });
  assert.equal(body.stations[0].station_id, "station-1");
});

test("rejects missing or unknown locations", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const missingResponse = await fetch(`${url}/api/availability`);
  const unknownResponse = await fetch(
    `${url}/api/availability?locations=unknown`,
  );

  assert.equal(missingResponse.status, 400);
  assert.equal(unknownResponse.status, 400);
  assert.deepEqual((await unknownResponse.json()).available_locations, ["work"]);
});

test("returns 502 when the upstream feed fails", async (t) => {
  const { server, url } = await startServer({
    getStationStatus: async () => {
      throw new Error("upstream unavailable");
    },
  });
  t.after(() => server.close());

  const response = await fetch(`${url}/api/availability?locations=work`);

  assert.equal(response.status, 502);
});

test("returns station ID and name pairs matching a partial name", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${url}/api/stations/search?query=park%20AVE`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.query, "park AVE");
  assert.equal(body.total_matches, 2);
  assert.deepEqual(body.stations, [
    { station_id: "station-1", name: "Park Ave & E 41 St" },
    { station_id: "station-3", name: "Park Ave & E 42 St" },
  ]);
});

test("rejects an absent or too-short station search query", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const absentResponse = await fetch(`${url}/api/stations/search`);
  const shortResponse = await fetch(`${url}/api/stations/search?query=a`);

  assert.equal(absentResponse.status, 400);
  assert.equal(shortResponse.status, 400);
});

test("returns 502 when station information cannot be loaded", async (t) => {
  const { server, url } = await startServer({
    getStationInformation: async () => {
      throw new Error("upstream unavailable");
    },
  });
  t.after(() => server.close());

  const response = await fetch(`${url}/api/stations/search?query=park`);

  assert.equal(response.status, 502);
});

test("returns the nearest station with enough open docks", async (t) => {
  const { server, url } = await startServer({
    getStationStatus: async () => ({
      last_updated: 5678,
      data: {
        stations: [
          {
            station_id: "station-1",
            num_bikes_available: 9,
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
          },
          {
            station_id: "station-3",
            num_bikes_available: 5,
            num_ebikes_available: 3,
            num_docks_available: 2,
            is_installed: 1,
            is_renting: 1,
            is_returning: 1,
            last_reported: 5600,
          },
        ],
      },
    }),
  });
  t.after(() => server.close());

  const response = await fetch(
    `${url}/api/stations/nearest?latitude=40.75&longitude=-73.99&min_docks=2`,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.query, {
    latitude: 40.75,
    longitude: -73.99,
    min_docks: 2,
  });
  assert.equal(body.feed_last_updated, 5678);
  assert.equal(body.station_information_last_updated, 1234);
  assert.equal(body.station.station_id, "station-3");
  assert.equal(body.station.docks_available, 2);
  assert.equal(body.station.bikes_available, 5);
  assert.equal(body.station.ebikes_available, 3);
  assert.equal(body.station.has_dock, true);
  assert.equal(body.station.last_reported, 5600);
});

test("rejects invalid nearest-station coordinates", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(
    `${url}/api/stations/nearest?latitude=91&longitude=-73.99`,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body.details, ["latitude must be a number from -90 to 90"]);
});

test("returns 404 when no station has enough open docks", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());

  const response = await fetch(
    `${url}/api/stations/nearest?latitude=40.75&longitude=-73.99&min_docks=10`,
  );

  assert.equal(response.status, 404);
});
