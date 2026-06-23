const EARTH_RADIUS_METERS = 6_371_000;

function parseCoordinate(rawValue, name, minimum, maximum) {
  if (rawValue === null || rawValue === undefined || rawValue.trim() === "") {
    return { error: `Supply ${name}` };
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    return {
      error: `${name} must be a number from ${minimum} to ${maximum}`,
    };
  }

  return { value };
}

function parsePositiveInteger(rawValue, name, defaultValue) {
  if (rawValue === null || rawValue === undefined || rawValue.trim() === "") {
    return { value: defaultValue };
  }

  const value = Number(rawValue);

  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    String(value) !== rawValue.trim()
  ) {
    return { error: `${name} must be a positive integer` };
  }

  return { value };
}

function parseNearestDockQuery(searchParams) {
  const latitudeResult = parseCoordinate(
    searchParams.get("latitude") ?? searchParams.get("lat"),
    "latitude",
    -90,
    90,
  );
  const longitudeResult = parseCoordinate(
    searchParams.get("longitude") ??
      searchParams.get("lon") ??
      searchParams.get("lng"),
    "longitude",
    -180,
    180,
  );
  const minDocksResult = parsePositiveInteger(
    searchParams.get("min_docks"),
    "min_docks",
    1,
  );

  const errors = [
    latitudeResult.error,
    longitudeResult.error,
    minDocksResult.error,
  ].filter(Boolean);

  return {
    latitude: latitudeResult.value,
    longitude: longitudeResult.value,
    minDocks: minDocksResult.value,
    errors,
  };
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function calculateDistanceMeters(origin, destination) {
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
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

function formatStation(stationInformation, stationStatus, distanceMeters) {
  const operational = stationStatus.is_installed === 1;

  return {
    station_id: stationInformation.station_id,
    name: stationInformation.name,
    latitude: Number(stationInformation.lat),
    longitude: Number(stationInformation.lon),
    distance_meters: Math.round(distanceMeters),
    bikes_available: stationStatus.num_bikes_available ?? 0,
    ebikes_available: stationStatus.num_ebikes_available ?? 0,
    docks_available: stationStatus.num_docks_available ?? 0,
    has_bike:
      operational &&
      stationStatus.is_renting === 1 &&
      (stationStatus.num_bikes_available ?? 0) > 0,
    has_dock:
      operational &&
      stationStatus.is_returning === 1 &&
      (stationStatus.num_docks_available ?? 0) > 0,
    is_renting: stationStatus.is_renting === 1,
    is_returning: stationStatus.is_returning === 1,
    last_reported: stationStatus.last_reported,
  };
}

function findNearestAvailableDock(
  stationInformationFeed,
  stationStatusFeed,
  { latitude, longitude, minDocks = 1 },
) {
  const stationStatuses = new Map(
    stationStatusFeed.data.stations.map((station) => [
      station.station_id,
      station,
    ]),
  );
  const origin = { latitude, longitude };
  let nearestStation = null;

  for (const stationInformation of stationInformationFeed.data.stations) {
    const stationStatus = stationStatuses.get(stationInformation.station_id);
    const stationLatitude = Number(stationInformation.lat);
    const stationLongitude = Number(stationInformation.lon);

    if (
      !stationStatus ||
      !isValidCoordinate(stationLatitude, stationLongitude) ||
      stationStatus.is_installed !== 1 ||
      stationStatus.is_returning !== 1 ||
      (stationStatus.num_docks_available ?? 0) < minDocks
    ) {
      continue;
    }

    const distanceMeters = calculateDistanceMeters(origin, {
      latitude: stationLatitude,
      longitude: stationLongitude,
    });

    if (!nearestStation || distanceMeters < nearestStation.distanceMeters) {
      nearestStation = {
        distanceMeters,
        station: formatStation(
          stationInformation,
          stationStatus,
          distanceMeters,
        ),
      };
    }
  }

  return nearestStation?.station ?? null;
}

module.exports = {
  calculateDistanceMeters,
  findNearestAvailableDock,
  parseNearestDockQuery,
};
