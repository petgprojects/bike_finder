const { calculateDistanceMeters } = require("./nearest-station");

const API_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAVOURITE_RADIUS_METERS = 1_000;
const MAX_LABEL_LENGTH = 80;

function parseBearerApiKey(request) {
  const authorization = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());

  if (!match) {
    return { error: "Supply an API key as a bearer token" };
  }

  const apiKey = match[1].trim();

  if (!API_KEY_PATTERN.test(apiKey)) {
    return { error: "Supply a valid UUID API key as a bearer token" };
  }

  return { apiKey: apiKey.toLowerCase() };
}

function validateFavouritePayload(body) {
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const stationId =
    typeof body?.station_id === "string" ? body.station_id.trim() : "";
  const errors = [];

  if (!label) {
    errors.push("label is required");
  } else if (label.length > MAX_LABEL_LENGTH) {
    errors.push("label must be 80 characters or fewer");
  }

  if (!stationId) {
    errors.push("station_id is required");
  }

  return { label, stationId, errors };
}

function isValidCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function buildNearbyFavouriteLocations(
  favourites,
  stationInformationFeed,
  origin,
  radiusMeters = FAVOURITE_RADIUS_METERS,
) {
  const stationInformationById = new Map(
    stationInformationFeed.data.stations.map((station) => [
      station.station_id,
      station,
    ]),
  );
  const locations = Object.create(null);
  const requestedLocations = [];

  for (const favourite of favourites) {
    const stationInformation = stationInformationById.get(favourite.station_id);
    const latitude = Number(stationInformation?.lat);
    const longitude = Number(stationInformation?.lon);

    if (!stationInformation || !isValidCoordinate(latitude, longitude)) {
      continue;
    }

    const distanceMeters = calculateDistanceMeters(origin, {
      latitude,
      longitude,
    });

    if (distanceMeters > radiusMeters) {
      continue;
    }

    locations[favourite.label] = [
      {
        station_id: favourite.station_id,
        name: favourite.label,
      },
    ];
    requestedLocations.push(favourite.label);
  }

  return { locations, requestedLocations };
}

module.exports = {
  FAVOURITE_RADIUS_METERS,
  buildNearbyFavouriteLocations,
  parseBearerApiKey,
  validateFavouritePayload,
};

