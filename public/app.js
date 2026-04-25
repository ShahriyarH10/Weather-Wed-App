const weatherForm = document.getElementById('weatherForm');
const locationInput = document.getElementById('locationInput');
const currentLocationBtn = document.getElementById('currentLocationBtn');
const weatherFeedback = document.getElementById('weatherFeedback');
const weatherResult = document.getElementById('weatherResult');

const recordForm = document.getElementById('recordForm');
const recordLocation = document.getElementById('recordLocation');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');
const recordFeedback = document.getElementById('recordFeedback');
const recordsList = document.getElementById('recordsList');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const forecastTemplate = document.getElementById('forecastCardTemplate');
const exportButtons = document.querySelectorAll('.export-btn');

let editingRecordId = null;

function setStatus(element, message, type = 'success') {
  element.textContent = message;
  element.className = `status ${type}`;
  element.classList.remove('hidden');
}

function clearStatus(element) {
  element.textContent = '';
  element.className = 'status hidden';
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCoordinateInput(raw) {
  const match = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return { lat: Number(match[1]), lon: Number(match[2]) };
}

function renderWeather(payload) {
  const current = payload.current;
  const location = payload.location;

  const forecastHtml = payload.forecast
    .map((item) => {
      const node = forecastTemplate.content.firstElementChild.cloneNode(true);
      node.querySelector('.forecast-date').textContent = formatDate(item.date);
      node.querySelector('.forecast-icon').textContent = item.emoji;
      node.querySelector('.forecast-label').textContent = item.label;
      const pills = node.querySelectorAll('.metric-pill');
      pills[0].textContent = `↑ ${item.maxTemp}°C`;
      pills[1].textContent = `↓ ${item.minTemp}°C`;
      pills[2].textContent = `${item.precipitationSum} mm rain`;
      return node.outerHTML;
    })
    .join('');

  weatherResult.innerHTML = `
    <article class="weather-card">
      <div class="current-top">
        <div>
          <p class="section-kicker">Live weather</p>
          <h3>${escapeHtml(location.displayName)}</h3>
          <p class="muted">${escapeHtml(location.timezone || 'Timezone unavailable')}</p>
        </div>
        <div class="current-icon">${current.emoji}</div>
      </div>

      <div class="current-top">
        <div>
          <div class="current-temp">${current.temperature_2m}°C</div>
          <p>${escapeHtml(current.label)}</p>
        </div>
        <div class="muted">
          <div>Feels like ${current.apparent_temperature}°C</div>
          <div>Humidity ${current.relative_humidity_2m}%</div>
          <div>Wind ${current.wind_speed_10m} km/h</div>
        </div>
      </div>

      <div class="weather-summary-grid">
        <div class="metric-pill">UV ${current.uv_index ?? 'N/A'}</div>
        <div class="metric-pill">Rain ${current.precipitation} mm</div>
        <div class="metric-pill">Pressure ${current.pressure_msl} hPa</div>
        <div class="metric-pill">${current.is_day ? 'Daytime' : 'Nighttime'}</div>
      </div>

      <div>
        <p class="section-kicker">Smart travel notes</p>
        <div class="stack-gap">
          ${payload.smartNotes.map((note) => `<div class="metric-pill">${escapeHtml(note)}</div>`).join('')}
        </div>
      </div>

      <div>
        <p class="section-kicker">5-day forecast</p>
        <div class="forecast-grid">${forecastHtml}</div>
      </div>
    </article>
  `;

  weatherResult.classList.remove('hidden');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();

  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Request failed with status ${response.status}: ${rawText || 'No response body'}`
    );
  }

  if (!rawText) {
    return {};
  }

  return data;
}

async function handleWeatherLookup(params) {
  clearStatus(weatherFeedback);
  weatherResult.classList.add('hidden');
  setStatus(weatherFeedback, 'Loading live weather...', 'success');

  try {
    let payload;

    if (params.query) {
      const coordinateInput = parseCoordinateInput(params.query);

      if (coordinateInput) {
        payload = await fetchJson(`/api/weather/current?lat=${coordinateInput.lat}&lon=${coordinateInput.lon}`);
      } else {
        payload = await fetchJson(`/api/weather/current?query=${encodeURIComponent(params.query)}`);
      }
    } else {
      payload = await fetchJson(`/api/weather/current?lat=${params.lat}&lon=${params.lon}`);
    }

    renderWeather(payload);
    setStatus(weatherFeedback, 'Weather loaded successfully.', 'success');
  } catch (error) {
    setStatus(weatherFeedback, error.message, 'error');
  }
}

weatherForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const query = locationInput.value.trim();

  if (!query) {
    setStatus(weatherFeedback, 'Enter a location first.', 'error');
    return;
  }

  await handleWeatherLookup({ query });
});

currentLocationBtn.addEventListener('click', async () => {
  clearStatus(weatherFeedback);

  if (!navigator.geolocation) {
    setStatus(weatherFeedback, 'Geolocation is not supported by this browser.', 'error');
    return;
  }

  setStatus(weatherFeedback, 'Requesting your current location...', 'success');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      await handleWeatherLookup({
        lat: position.coords.latitude,
        lon: position.coords.longitude
      });
    },
    (error) => {
      setStatus(weatherFeedback, `Could not access your location: ${error.message}`, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
});

function renderRecordCard(record) {
  const dailyHtml = record.dailyWeather
    .map(
      (item) => `
        <div class="metric-pill">${escapeHtml(item.emoji)} ${formatDate(item.date)}: ${item.minTemp}°C → ${item.maxTemp}°C</div>
      `
    )
    .join('');

  return `
    <article class="record-card">
      <div class="record-head">
        <div>
          <strong>${escapeHtml(record.location.displayName)}</strong>
          <div class="muted">${escapeHtml(record.startDate)} → ${escapeHtml(record.endDate)} • ${escapeHtml(record.source)}</div>
        </div>
        <span class="metric-pill">Saved ${escapeHtml(formatDateTime(record.createdAt))}</span>
      </div>

      <div>${dailyHtml}</div>

      <div class="record-actions">
        <button class="btn btn-secondary" data-action="edit" data-id="${record.id}">Edit</button>
        <button class="btn btn-secondary" data-action="delete" data-id="${record.id}">Delete</button>
      </div>
    </article>
  `;
}

async function loadRecords() {
  recordsList.innerHTML = '<div class="muted">Loading saved records...</div>';

  try {
    const records = await fetchJson('/api/records');

    if (!records.length) {
      recordsList.innerHTML = '<div class="muted">No saved requests yet. Create one from the form above.</div>';
      return;
    }

    recordsList.innerHTML = records.map(renderRecordCard).join('');
  } catch (error) {
    recordsList.innerHTML = `<div class="status error">${escapeHtml(error.message)}</div>`;
  }
}

recordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearStatus(recordFeedback);

  const payload = {
    locationQuery: recordLocation.value.trim(),
    startDate: startDate.value,
    endDate: endDate.value
  };

  if (!payload.locationQuery || !payload.startDate || !payload.endDate) {
    setStatus(recordFeedback, 'Please complete all fields.', 'error');
    return;
  }

  const method = editingRecordId ? 'PUT' : 'POST';
  const url = editingRecordId ? `/api/records/${editingRecordId}` : '/api/records';

  try {
    await fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setStatus(recordFeedback, editingRecordId ? 'Record updated.' : 'Record created.', 'success');
    recordForm.reset();
    editingRecordId = null;
    cancelEditBtn.classList.add('hidden');
    await loadRecords();
  } catch (error) {
    setStatus(recordFeedback, error.message, 'error');
  }
});

cancelEditBtn.addEventListener('click', () => {
  editingRecordId = null;
  recordForm.reset();
  cancelEditBtn.classList.add('hidden');
  clearStatus(recordFeedback);
});

recordsList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'delete') {
    try {
      await fetchJson(`/api/records/${id}`, { method: 'DELETE' });
      setStatus(recordFeedback, 'Record deleted.', 'success');
      await loadRecords();
    } catch (error) {
      setStatus(recordFeedback, error.message, 'error');
    }
    return;
  }

  try {
    const record = await fetchJson(`/api/records/${id}`);

    if (action === 'edit') {
      editingRecordId = record.id;
      recordLocation.value = record.locationQuery;
      startDate.value = record.startDate;
      endDate.value = record.endDate;
      cancelEditBtn.classList.remove('hidden');
      setStatus(recordFeedback, 'Editing mode enabled.', 'success');
      recordForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    setStatus(recordFeedback, error.message, 'error');
  }
});

exportButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const format = button.dataset.format;
    window.open(`/api/records/export?format=${format}`, '_blank');
  });
});

const today = new Date();
const isoToday = today.toISOString().slice(0, 10);
const isoTomorrow = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

startDate.value = isoToday;
endDate.value = isoTomorrow;

loadRecords();