# WeatherScope AI

A full-stack weather app submission for the **AI Engineer Intern Technical Assessment**.

This project completes **both** assessment tracks in one app:
- **Tech Assessment #1 (Frontend)**: live weather, current location, 5-day forecast, responsive UI, icons, graceful error handling.
- **Tech Assessment #2 (Backend)**: CRUD operations, persisted data store, date-range weather lookup, API integrations, and data export.

## Built by
**Shahriyar Hasan**

## Why this is a strong submission
This app is designed around the exact PDF requirements:
- lets users search weather using a location string
- lets users use their **current GPS location**
- shows **current weather clearly**
- shows a **5-day forecast**
- includes **graceful error handling**
- supports **CREATE / READ / UPDATE / DELETE** for saved weather requests
- stores data in a **NoSQL JSON database** using `lowdb`
- validates location and date range before saving
- includes **map context** as an additional API integration
- supports **exporting stored data** to **JSON**, **CSV**, and **Markdown**
- includes the candidate name and a short **PM Accelerator** informational section in the UI

## Tech stack
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js, Express
- **Persistence:** lowdb (JSON-based NoSQL database)
- **APIs:**
  - Open-Meteo Geocoding API
  - Open-Meteo Forecast API
  - Open-Meteo Archive API
  - OpenStreetMap / Nominatim Reverse Geocoding

## Features mapped to the assessment

### Frontend requirements
- Enter a location and retrieve live weather
- Use current device location
- Display weather clearly with icons/emojis and useful metrics
- 5-day forecast
- Responsive design for desktop, tablet, and mobile
- Error states for invalid input, failed API calls, or location mismatch

### Backend requirements
- **CREATE**: save a location + date range lookup into the database
- **READ**: view all saved records or one record
- **UPDATE**: edit saved location/date range and refresh stored weather
- **DELETE**: remove a saved record
- **Export**: JSON, CSV, Markdown
- **Validation**:
  - location must resolve through geocoding
  - start date must be before or equal to end date
  - range must stay within the allowed window

## Additional user-centered touches
The app adds a **Smart Travel Notes** section that gives users practical hints that are easy to overlook, such as:
- UV exposure
- rain risk
- strong wind
- heat stress / cold comfort
- sunrise and sunset timing

This helps demonstrate product thinking beyond simply showing raw weather data.

## Responsive design techniques used
- CSS Grid for page layout and cards
- Flexbox for button groups and forecast cards
- `clamp()` for scalable heading sizes
- media queries for tablet and mobile layouts
- fluid width containers and adaptive wrapping controls

## Run locally

### Requirements
- Node.js 18+
- npm

### Install and start
```bash
npm install
npm start
```

Then open:
```bash
http://localhost:3000
```

## Project structure
```text
weather-assessment/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── data
│   ├── db.json
├── package.json
├── README.md
└── server.js
```

## API notes / known limitations
- Date-range lookup is limited to a short range for predictable API behavior.
- Historical and future data are retrieved from different Open-Meteo endpoints depending on the requested range.
- If geolocation permission is blocked by the browser, the app falls back to manual search.
- OpenStreetMap is used instead of Google Maps so the project remains free to run without API keys.
