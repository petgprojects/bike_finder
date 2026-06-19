const MAX_RESULTS = 50;

function searchStations(feed, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const matches = feed.data.stations
    .filter((station) =>
      station.name.toLocaleLowerCase("en-US").includes(normalizedQuery),
    )
    .sort((left, right) => left.name.localeCompare(right.name, "en-US"));

  return {
    query: query.trim(),
    total_matches: matches.length,
    stations: matches.slice(0, MAX_RESULTS).map((station) => ({
      station_id: station.station_id,
      name: station.name,
    })),
  };
}

module.exports = { MAX_RESULTS, searchStations };
