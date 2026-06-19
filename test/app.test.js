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
          { station_id: "station-3", name: "Park Ave & E 42 St" },
          { station_id: "station-1", name: "Park Ave & E 41 St" },
          { station_id: "station-2", name: "Broadway & W 40 St" },
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
