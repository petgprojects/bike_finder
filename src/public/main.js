const generateKeyButton = document.querySelector("#generateKey");
const generatedKeyInput = document.querySelector("#generatedKey");
const apiKeyInput = document.querySelector("#apiKey");
const favouriteForm = document.querySelector("#favouriteForm");
const labelInput = document.querySelector("#label");
const stationQueryInput = document.querySelector("#stationQuery");
const stationResults = document.querySelector("#stationResults");
const selectedStation = document.querySelector("#selectedStation");
const statusMessage = document.querySelector("#status");
const savedList = document.querySelector("#savedList");
const loadFavouritesButton = document.querySelector("#loadFavourites");

let selectedStationRecord = null;
let searchTimeout = null;
let searchAbortController = null;

function setStatus(message, kind) {
  statusMessage.textContent = message;
  statusMessage.className = "status" + (kind ? " " + kind : "");
}

function getApiKey() {
  return apiKeyInput.value.trim();
}

function renderStationResults(stations) {
  stationResults.replaceChildren();

  for (const station of stations) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-button";
    button.textContent = station.name;
    button.addEventListener("click", () => {
      selectedStationRecord = station;
      selectedStation.textContent = station.name;
      stationResults.replaceChildren();
      stationQueryInput.value = station.name;
    });
    item.append(button);
    stationResults.append(item);
  }
}

async function searchStations() {
  const query = stationQueryInput.value.trim();
  selectedStationRecord = null;
  selectedStation.textContent = "No station selected";

  if (searchAbortController) {
    searchAbortController.abort();
  }

  if (query.length < 2) {
    stationResults.replaceChildren();
    return;
  }

  searchAbortController = new AbortController();

  try {
    const response = await fetch(
      "/api/stations/search?query=" + encodeURIComponent(query),
      { signal: searchAbortController.signal },
    );
    const body = await response.json();

    if (!response.ok) {
      renderStationResults([]);
      setStatus(body.error || "Station search failed", "error");
      return;
    }

    setStatus("", "");
    renderStationResults(body.stations);
  } catch (error) {
    if (error.name !== "AbortError") {
      renderStationResults([]);
      setStatus("Station search failed", "error");
    }
  }
}

function renderSavedFavourites(favourites) {
  savedList.replaceChildren();

  if (favourites.length === 0) {
    return;
  }

  for (const favourite of favourites) {
    const item = document.createElement("div");
    const label = document.createElement("strong");
    const station = document.createElement("span");
    item.className = "saved-item";
    label.textContent = favourite.label;
    station.textContent = favourite.station_name + " (" + favourite.station_id + ")";
    item.append(label, station);
    savedList.append(item);
  }
}

async function loadFavourites() {
  const apiKey = getApiKey();

  if (!apiKey) {
    setStatus("API key is required", "error");
    return;
  }

  try {
    const response = await fetch("/api/favourites", {
      headers: { authorization: "Bearer " + apiKey },
    });
    const body = await response.json();

    if (!response.ok) {
      setStatus(body.error || "Could not load favourites", "error");
      return;
    }

    renderSavedFavourites(body.favourites);
    setStatus("Loaded " + body.favourites.length + " favourite(s)", "success");
  } catch {
    setStatus("Could not load favourites", "error");
  }
}

stationQueryInput.addEventListener("input", () => {
  window.clearTimeout(searchTimeout);
  searchTimeout = window.setTimeout(searchStations, 180);
});

loadFavouritesButton.addEventListener("click", loadFavourites);

generateKeyButton.addEventListener("click", () => {
  const apiKey = window.crypto.randomUUID();
  generatedKeyInput.value = apiKey;
  apiKeyInput.value = apiKey;
  window.alert(apiKey);
});

favouriteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const apiKey = getApiKey();
  const label = labelInput.value.trim();

  if (!apiKey) {
    setStatus("API key is required", "error");
    return;
  }

  if (!label) {
    setStatus("Favourite name is required", "error");
    return;
  }

  if (!selectedStationRecord) {
    setStatus("Select a station", "error");
    return;
  }

  try {
    const response = await fetch("/api/favourites", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        label,
        station_id: selectedStationRecord.station_id,
      }),
    });
    const body = await response.json();

    if (!response.ok) {
      const detail = Array.isArray(body.details) ? ": " + body.details.join(", ") : "";
      setStatus((body.error || "Could not save favourite") + detail, "error");
      return;
    }

    setStatus("Saved " + body.favourite.label, "success");
    await loadFavourites();
  } catch {
    setStatus("Could not save favourite", "error");
  }
});

