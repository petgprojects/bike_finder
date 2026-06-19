# Bike Spot Finder

A dependency-free Node.js API that checks the live Citi Bike GBFS feed for bike
and dock availability at predefined groups of stations.

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

## Run

Node.js 18 or newer is required.

```sh
npm start
```

Check one location:

```sh
curl "http://localhost:3000/api/availability?locations=home"
```

Check several locations with either comma-separated or repeated parameters:

```sh
curl "http://localhost:3000/api/availability?locations=home,work"
curl "http://localhost:3000/api/availability?locations=home&locations=work"
```

The top-level `summary.has_bike` and `summary.has_dock` fields answer whether any
requested station can currently rent or accept a bike. Each station also includes
its counts and operational status. Feed responses are cached for 30 seconds.

Look up station IDs by a case-insensitive partial station name:

```sh
curl "http://localhost:3000/api/stations/search?query=park%20ave"
```

The response contains matching `station_id` and `name` pairs, sorted by name.
Searches require at least two characters and return up to 50 results. Station
information is cached for five minutes.

## Test

```sh
npm test
```

Optional environment variables:

- `PORT`: listening port; defaults to `3000`
- `LOCATIONS_FILE`: path to the location configuration file
- `CITI_BIKE_STATUS_URL`: alternate GBFS status feed URL
- `CITI_BIKE_STATION_INFORMATION_URL`: alternate GBFS station information URL

## Docker deployment

Build and start the service in the background:

```sh
docker compose up -d --build
```

The API is available on port `3000` by default. Use a different host port if
that port is already occupied:

```sh
HOST_PORT=8080 docker compose up -d --build
```

Check its status and logs:

```sh
docker compose ps
docker compose logs -f api
```

The Compose service mounts `config/locations.json` read-only. After changing
that file, restart the container so the app loads the new configuration:

```sh
docker compose restart api
```

From another device, replace `localhost` with the server's IP address or domain:

```sh
curl "http://SERVER_IP:3000/api/availability?locations=home"
```

Stop and remove the container with:

```sh
docker compose down
```

The API does not include authentication or TLS. Keep the port on a trusted
network or place it behind an authenticated HTTPS reverse proxy before exposing
it to the public internet.
