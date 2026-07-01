# Bike Spot Finder

A Node.js service for checking live Citi Bike GBFS bike and dock availability.
It supports predefined station groups from `config/locations.json`, station
search, nearest-dock lookup, and API-key-scoped favourites stored in Postgres.

The root path (`/`) serves a small favourites UI with two panes: generate a UUID
API key, then search for stations and save favourites under that key.

## Configure locations

Edit `config/locations.json`. Each key is a location name accepted by the API,
and each value is a list of nearby Citi Bike stations:

```json
{
  "work": [
    {
      "station_id": "your-station-id",
      "name": "A useful display name"
    }
  ]
}
```

The location names are the top-level keys in this file, such as `home` and
`work`. Station IDs and names are available in Citi Bike's
[`station_information.json`](https://gbfs.citibikenyc.com/gbfs/en/station_information.json)
feed.

Set `LOCATIONS_FILE` to use a different JSON file without changing the repository.

## Run locally

Node.js 18 or newer is required.

```sh
npm install
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DB" npm start
```

The legacy location endpoints still work without using the favourites UI, but
the favourites endpoints require `DATABASE_URL` to point at a Postgres database.

Open the UI:

```text
http://localhost:3000/
```

Check one configured location:

```sh
curl "http://localhost:3000/api/availability?locations=home"
```

Check several locations with either comma-separated or repeated parameters:

```sh
curl "http://localhost:3000/api/availability?locations=home,work"
curl "http://localhost:3000/api/availability?locations=home&locations=work"
```

The top-level `summary.has_bike` and `summary.has_dock` fields answer whether
any requested station can currently rent or accept a bike. Each station also
includes its counts and operational status. Feed responses are cached for 30
seconds.

Look up station IDs by a case-insensitive partial station name:

```sh
curl "http://localhost:3000/api/stations/search?query=park%20ave"
```

The response contains matching `station_id` and `name` pairs, sorted by name.
Searches require at least two characters and return up to 50 results. Station
information is cached for five minutes.

Find the nearest station with at least one open dock:

```sh
curl "http://localhost:3000/api/stations/nearest?latitude=40.75&longitude=-73.99"
```

Require a minimum number of open docks:

```sh
curl "http://localhost:3000/api/stations/nearest?latitude=40.75&longitude=-73.99&min_docks=2"
```

The nearest-station response includes the station ID, name, latitude, longitude,
distance in meters, open docks, available bikes, available e-bikes, operational
status, and feed timestamps. You can also use `lat` for `latitude` and `lon` or
`lng` for `longitude`.

## Favourites API

Favourites use a UUID API key supplied as a bearer token. The root UI can
generate a key in the browser, or you can use any UUID generated elsewhere.

Save or update a favourite station label:

```sh
curl -X POST "http://localhost:3000/api/favourites" -H "authorization: Bearer $API_KEY" -H "content-type: application/json" -d '{"label":"work primary","station_id":"2170352212111402482"}'
```

List favourites for a key:

```sh
curl "http://localhost:3000/api/favourites" -H "authorization: Bearer $API_KEY"
```

Check availability for favourites within 1 km of a coordinate pair:

```sh
curl "http://localhost:3000/api/favourites/availability?latitude=40.75&longitude=-73.99" -H "authorization: Bearer $API_KEY"
```

This returns the same response shape as `/api/availability`, with
`requested_locations` set to the matching favourite labels. Favourites outside
the 1 km radius are ignored. You can also use `lat` for `latitude` and `lon` or
`lng` for `longitude`.

## Test

```sh
npm test
```

Optional environment variables:

- `PORT`: listening port; defaults to `3000`
- `LOCATIONS_FILE`: path to the location configuration file
- `DATABASE_URL`: Postgres connection string for favourites
- `CITI_BIKE_STATUS_URL`: alternate GBFS status feed URL
- `CITI_BIKE_STATION_INFORMATION_URL`: alternate GBFS station information URL

## Docker deployment

Compose includes a local Postgres password for this private deployment, so no
`.env` file is required for the default setup.

Build and start the service in the background:

```sh
docker --context default compose up -d --build
```

The API is published on host port `3030` by default. Use a different host port
if that port is already occupied:

```sh
HOST_PORT=8080 docker --context default compose up -d --build
```

Check status and logs:

```sh
docker --context default compose ps
docker --context default logs --tail 200 bike-finder
```

The Compose service mounts `config/locations.json` read-only. After changing
that file, restart the API container so the app loads the new configuration:

```sh
docker --context default compose restart api
```

From another device, replace `localhost` with the server's IP address or domain:

```sh
curl "http://SERVER_IP:3030/api/availability?locations=home"
```

Stop and remove the containers with:

```sh
docker --context default compose down
```

The public favourites endpoints authenticate by bearer UUID, but the generated
keys are equivalent to passwords. Serve the site over HTTPS and keep keys
private.
