import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSONFilePreset } from 'lowdb/node';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const db = await JSONFilePreset(path.join(__dirname, 'data', 'db.json'), {
  records: []
});

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const USER_AGENT = 'WeatherAssessment/1.0 (contact: community@pmaccelerator.io)';
const MAX_RANGE_DAYS = 16;

const WMO_LABELS = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start, end) {
  return Math.round((end - start) / 86400000) + 1;
}

function validateDateRange(startDate, endDate) {
  const start = toDate(startDate);
  const end = toDate(endDate);

  if (!start || !end) {
    return { ok: false, message: 'Please provide valid start and end dates.' };
  }

  if (start > end) {
    return { ok: false, message: 'Start date must be before or equal to end date.' };
  }

  const days = daysBetween(start, end);

  if (days < 1 || days > MAX_RANGE_DAYS) {
    return {
      ok: false,
      message: `Please keep the date range between 1 and ${MAX_RANGE_DAYS} days.`
    };
  }

  return { ok: true, start, end, days };
}

function buildOsmEmbedUrl(lat, lon) {
  const delta = 0.08;
  const left = (lon - delta).toFixed(4);
  const right = (lon + delta).toFixed(4);
  const top = (lat + delta).toFixed(4);
  const bottom = (lat - delta).toFixed(4);

  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lon}`;
}

function buildOsmLink(lat, lon) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}`;
}

function getWeatherLabel(code) {
  return WMO_LABELS[code] || 'Unknown';
}

function getWeatherEmoji(code) {
  if (code === 0) return '☀️';
  if ([1, 2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌍';
}

function buildSmartNotes(current, daily) {
  const notes = [];

  if (current.uv_index >= 7) {
    notes.push('High UV: sunscreen, sunglasses, and shade are recommended.');
  }
  if (current.wind_speed_10m >= 30) {
    notes.push('Windy conditions: secure loose items and expect reduced comfort outdoors.');
  }
  if (current.precipitation > 0 || (daily?.precipitation_sum?.[0] ?? 0) > 2) {
    notes.push('Rain risk: pack an umbrella or waterproof layer.');
  }
  if (current.temperature_2m >= 33) {
    notes.push('Heat stress risk: hydrate more often and avoid peak sun if possible.');
  }
  if (current.temperature_2m <= 8) {
    notes.push('Cold-weather comfort may matter more than expected, especially after sunset.');
  }
  if (daily?.sunset?.[0] && daily?.sunrise?.[0]) {
    notes.push(
      `Daylight window: sunrise ${daily.sunrise[0].slice(11, 16)}, sunset ${daily.sunset[0].slice(11, 16)}.`
    );
  }
  if (!notes.length) {
    notes.push('Conditions look generally manageable. Check the forecast before longer travel.');
  }

  return notes;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstream API error (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function geocodeLocation(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const data = await fetchJson(url);
  const first = data?.results?.[0];

  if (!first) return null;

  return {
    name: first.name,
    latitude: first.latitude,
    longitude: first.longitude,
    country: first.country,
    countryCode: first.country_code,
    admin1: first.admin1,
    timezone: first.timezone,
    displayName: [first.name, first.admin1, first.country].filter(Boolean).join(', ')
  };
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
  const data = await fetchJson(url);
  const address = data.address || {};
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.state_district;

  return {
    name: city || data.name || 'Current location',
    latitude: Number(lat),
    longitude: Number(lon),
    country: address.country || '',
    admin1: address.state || address.region || '',
    timezone: null,
    displayName: [city || data.name || 'Current location', address.state || address.region, address.country]
      .filter(Boolean)
      .join(', ')
  };
}

async function getCurrentAndForecast(location) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,uv_index,pressure_msl` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max` +
    `&timezone=auto&forecast_days=5`;

  const data = await fetchJson(url);

  return {
    location: {
      ...location,
      mapEmbedUrl: buildOsmEmbedUrl(location.latitude, location.longitude),
      mapUrl: buildOsmLink(location.latitude, location.longitude)
    },
    current: {
      ...data.current,
      label: getWeatherLabel(data.current.weather_code),
      emoji: getWeatherEmoji(data.current.weather_code)
    },
    forecast: data.daily.time.map((date, index) => ({
      date,
      weatherCode: data.daily.weather_code[index],
      label: getWeatherLabel(data.daily.weather_code[index]),
      emoji: getWeatherEmoji(data.daily.weather_code[index]),
      maxTemp: data.daily.temperature_2m_max[index],
      minTemp: data.daily.temperature_2m_min[index],
      precipitationSum: data.daily.precipitation_sum[index],
      uvIndexMax: data.daily.uv_index_max[index],
      windSpeedMax: data.daily.wind_speed_10m_max[index],
      sunrise: data.daily.sunrise[index],
      sunset: data.daily.sunset[index]
    })),
    smartNotes: buildSmartNotes(data.current, data.daily)
  };
}

async function getRangeTemperatures(location, startDate, endDate) {
  const today = todayIso();
  const entirelyPast = endDate < today;
  const entirelyFutureOrToday = startDate >= today;
  const commonFields = 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum';

  if (entirelyPast) {
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${location.latitude}` +
      `&longitude=${location.longitude}` +
      `&start_date=${startDate}&end_date=${endDate}` +
      `&daily=${commonFields}&timezone=auto`;

    const data = await fetchJson(url);

    return {
      source: 'archive',
      items: data.daily.time.map((date, index) => ({
        date,
        weatherCode: data.daily.weather_code[index],
        label: getWeatherLabel(data.daily.weather_code[index]),
        emoji: getWeatherEmoji(data.daily.weather_code[index]),
        maxTemp: data.daily.temperature_2m_max[index],
        minTemp: data.daily.temperature_2m_min[index],
        precipitationSum: data.daily.precipitation_sum[index]
      }))
    };
  }

  if (entirelyFutureOrToday) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}` +
      `&longitude=${location.longitude}` +
      `&start_date=${startDate}&end_date=${endDate}` +
      `&daily=${commonFields}&timezone=auto`;

    const data = await fetchJson(url);

    return {
      source: 'forecast',
      items: data.daily.time.map((date, index) => ({
        date,
        weatherCode: data.daily.weather_code[index],
        label: getWeatherLabel(data.daily.weather_code[index]),
        emoji: getWeatherEmoji(data.daily.weather_code[index]),
        maxTemp: data.daily.temperature_2m_max[index],
        minTemp: data.daily.temperature_2m_min[index],
        precipitationSum: data.daily.precipitation_sum[index]
      }))
    };
  }

  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&start_date=${startDate}&end_date=${yesterdayIso}` +
    `&daily=${commonFields}&timezone=auto`;

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&start_date=${today}&end_date=${endDate}` +
    `&daily=${commonFields}&timezone=auto`;

  const [archiveData, forecastData] = await Promise.all([
    fetchJson(archiveUrl),
    fetchJson(forecastUrl)
  ]);

  const archiveItems = archiveData.daily.time.map((date, index) => ({
    date,
    weatherCode: archiveData.daily.weather_code[index],
    label: getWeatherLabel(archiveData.daily.weather_code[index]),
    emoji: getWeatherEmoji(archiveData.daily.weather_code[index]),
    maxTemp: archiveData.daily.temperature_2m_max[index],
    minTemp: archiveData.daily.temperature_2m_min[index],
    precipitationSum: archiveData.daily.precipitation_sum[index]
  }));

  const forecastItems = forecastData.daily.time.map((date, index) => ({
    date,
    weatherCode: forecastData.daily.weather_code[index],
    label: getWeatherLabel(forecastData.daily.weather_code[index]),
    emoji: getWeatherEmoji(forecastData.daily.weather_code[index]),
    maxTemp: forecastData.daily.temperature_2m_max[index],
    minTemp: forecastData.daily.temperature_2m_min[index],
    precipitationSum: forecastData.daily.precipitation_sum[index]
  }));

  return {
    source: 'archive+forecast',
    items: [...archiveItems, ...forecastItems]
  };
}

function recordToCsv(records) {
  const header = [
    'id',
    'locationQuery',
    'resolvedLocation',
    'country',
    'admin1',
    'latitude',
    'longitude',
    'startDate',
    'endDate',
    'source',
    'createdAt'
  ];

  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

  const rows = records.map((record) => [
    record.id,
    record.locationQuery,
    record.location.displayName,
    record.location.country,
    record.location.admin1,
    record.location.latitude,
    record.location.longitude,
    record.startDate,
    record.endDate,
    record.source,
    record.createdAt
  ]);

  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

function recordToMarkdown(records) {
  const lines = [
    '# Saved Weather Requests',
    '',
    '| ID | Location | Range | Source | Created |',
    '| --- | --- | --- | --- | --- |'
  ];

  for (const record of records) {
    lines.push(
      `| ${record.id} | ${record.location.displayName} | ${record.startDate} → ${record.endDate} | ${record.source} | ${record.createdAt} |`
    );
  }

  return lines.join('\n');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/weather/current', async (req, res) => {
  try {
    const { query, lat, lon } = req.query;
    let location;

    if (query) {
      location = await geocodeLocation(String(query).trim());
    } else if (lat && lon) {
      location = await reverseGeocode(Number(lat), Number(lon));
    } else {
      return res.status(400).json({
        error: 'Provide a location query or latitude/longitude.'
      });
    }

    if (!location) {
      return res.status(404).json({
        error: 'Location not found. Try a city, landmark, postal code, or coordinates.'
      });
    }

    const payload = await getCurrentAndForecast(location);
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Unable to retrieve weather information.'
    });
  }
});

app.get('/api/records', (_req, res) => {
  const sorted = [...db.data.records].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  res.json(sorted);
});

app.get('/api/records/export', (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  const records = [...db.data.records].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  if (format === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename="weather-records.json"');
    return res.json(records);
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="weather-records.csv"');
    return res.send(recordToCsv(records));
  }

  if (format === 'md' || format === 'markdown') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="weather-records.md"');
    return res.send(recordToMarkdown(records));
  }

  return res.status(400).json({
    error: 'Unsupported export format. Use json, csv, or markdown.'
  });
});

app.get('/api/records/:id', (req, res) => {
  const record = db.data.records.find((item) => item.id === req.params.id);

  if (!record) {
    return res.status(404).json({ error: 'Record not found.' });
  }

  res.json(record);
});

app.post('/api/records', async (req, res) => {
  try {
    const locationQuery = String(req.body.locationQuery || '').trim();
    const startDate = String(req.body.startDate || '').trim();
    const endDate = String(req.body.endDate || '').trim();

    if (!locationQuery) {
      return res.status(400).json({ error: 'Location is required.' });
    }

    const validation = validateDateRange(startDate, endDate);

    if (!validation.ok) {
      return res.status(400).json({ error: validation.message });
    }

    const location = await geocodeLocation(locationQuery);

    if (!location) {
      return res.status(404).json({
        error: 'The location could not be validated.'
      });
    }

    const range = await getRangeTemperatures(location, startDate, endDate);

    const record = {
      id: crypto.randomUUID(),
      locationQuery,
      location: {
        ...location,
        mapEmbedUrl: buildOsmEmbedUrl(location.latitude, location.longitude),
        mapUrl: buildOsmLink(location.latitude, location.longitude)
      },
      startDate,
      endDate,
      source: range.source,
      dailyWeather: range.items,
      createdAt: new Date().toISOString()
    };

    db.data.records.push(record);
    await db.write();

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Unable to create record.'
    });
  }
});

app.put('/api/records/:id', async (req, res) => {
  try {
    const record = db.data.records.find((item) => item.id === req.params.id);

    if (!record) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    const locationQuery = String(req.body.locationQuery || record.locationQuery).trim();
    const startDate = String(req.body.startDate || record.startDate).trim();
    const endDate = String(req.body.endDate || record.endDate).trim();

    const validation = validateDateRange(startDate, endDate);

    if (!validation.ok) {
      return res.status(400).json({ error: validation.message });
    }

    const location = await geocodeLocation(locationQuery);

    if (!location) {
      return res.status(404).json({
        error: 'The updated location could not be validated.'
      });
    }

    const range = await getRangeTemperatures(location, startDate, endDate);

    record.locationQuery = locationQuery;
    record.location = {
      ...location,
      mapEmbedUrl: buildOsmEmbedUrl(location.latitude, location.longitude),
      mapUrl: buildOsmLink(location.latitude, location.longitude)
    };
    record.startDate = startDate;
    record.endDate = endDate;
    record.source = range.source;
    record.dailyWeather = range.items;
    record.updatedAt = new Date().toISOString();

    await db.write();
    res.json(record);
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Unable to update record.'
    });
  }
});

app.delete('/api/records/:id', async (req, res) => {
  const index = db.data.records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Record not found.' });
  }

  const [deleted] = db.data.records.splice(index, 1);
  await db.write();

  res.json({ ok: true, deletedId: deleted.id });
});

app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Weather assessment app running on http://localhost:${PORT}`);
});