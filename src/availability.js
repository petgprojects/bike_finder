function parseRequestedLocations(searchParams) {
  return searchParams
    .getAll("locations")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function validateLocations(requestedLocations, configuredLocations) {
  const uniqueLocations = [...new Set(requestedLocations)];
  const unknownLocations = uniqueLocations.filter(
    (location) => !Object.hasOwn(configuredLocations, location),
  );

  return { uniqueLocations, unknownLocations };
}

function buildAvailability(feed, configuredLocations, requestedLocations) {
  const requestedStations = new Map();

  for (const location of requestedLocations) {
    for (const station of configuredLocations[location]) {
      const existing = requestedStations.get(station.station_id);

      if (existing) {
        existing.locations.push(location);
      } else {
        requestedStations.set(station.station_id, {
          name: station.name,
          locations: [location],
        });
      }
    }
  }

  const feedStations = new Map(
    feed.data.stations.map((station) => [station.station_id, station]),
  );

  const stations = [...requestedStations].map(([stationId, configured]) => {
    const station = feedStations.get(stationId);

    if (!station) {
      return {
        station_id: stationId,
        name: configured.name,
        locations: configured.locations,
        found: false,
        has_bike: false,
        has_dock: false,
      };
    }

    const operational = station.is_installed === 1;

    return {
      station_id: stationId,
      name: configured.name,
      locations: configured.locations,
      found: true,
      bikes_available: station.num_bikes_available,
      ebikes_available: station.num_ebikes_available ?? 0,
      docks_available: station.num_docks_available,
      has_bike:
        operational &&
        station.is_renting === 1 &&
        station.num_bikes_available > 0,
      has_dock:
        operational &&
        station.is_returning === 1 &&
        station.num_docks_available > 0,
      is_renting: station.is_renting === 1,
      is_returning: station.is_returning === 1,
      last_reported: station.last_reported,
    };
  });

  return {
    requested_locations: requestedLocations,
    feed_last_updated: feed.last_updated,
    summary: {
      has_bike: stations.some((station) => station.has_bike),
      has_dock: stations.some((station) => station.has_dock),
    },
    stations,
  };
}

module.exports = {
  buildAvailability,
  parseRequestedLocations,
  validateLocations,
};
