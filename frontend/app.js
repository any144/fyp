const API_BASE = "http://127.0.0.1:5000";

let activeModel = "xgb";
let activeView  = "single";
let activeMapType = "actual";

const MODEL_COLORS = {
    xgb:  { actual: "#3b82f6", forecast: "#ef4444" },
    lgbm: { actual: "#3b82f6", forecast: "#f97316" },
    gru:  { actual: "#3b82f6", forecast: "#8b5cf6" },
    tcn:  { actual: "#3b82f6", forecast: "#10b981" },
    lstm: { actual: "#3b82f6", forecast: "#ec4899" },
    naive_seasonal: { actual: "#3b82f6", forecast: "#94a3b8" },
    naive_drift:{ actual: "#3b82f6", forecast: "#64748b" },
    sarima:{ actual: "#3b82f6", forecast: "#fbbf24" },
};

const MODEL_LABELS = {
    xgb:  "XGBoost",
    lgbm: "LightGBM",
    gru:  "GRU",
    tcn:  "TCN",
    lstm: "LSTM",
    naive_seasonal:"Seasonal Naïve",
    naive_drift: "Naïve Drift",
    sarima:"SARIMA",
};

async function loadPathogens() {
    const res       = await fetch(`${API_BASE}/pathogens`);
    const pathogens = await res.json();
    const sel       = document.getElementById("pathogenSelect");
    sel.innerHTML   = "";
    pathogens.forEach(p => {
        const opt       = document.createElement("option");
        opt.value       = p;
        opt.textContent = p;
        sel.appendChild(opt);
    });
    await loadAntibiotics();
}

async function loadAntibiotics() {
    const pathogen  = document.getElementById("pathogenSelect").value;
    const res       = await fetch(`${API_BASE}/antibiotics?pathogen=${encodeURIComponent(pathogen)}`);
    const antibiotics = await res.json();
    const sel       = document.getElementById("antibioticSelect");
    sel.innerHTML   = "";
    antibiotics.forEach(a => {
        const opt       = document.createElement("option");
        opt.value       = a;
        opt.textContent = a;
        sel.appendChild(opt);
    });
    await loadRegions();
}

async function loadRegions() {
    const pathogen   = document.getElementById("pathogenSelect").value;
    const antibiotic = document.getElementById("antibioticSelect").value;
    const res        = await fetch(`${API_BASE}/regions?pathogen=${encodeURIComponent(pathogen)}&antibiotic=${encodeURIComponent(antibiotic)}`);
    const regions    = await res.json();
    const sel        = document.getElementById("regionSelect");
    sel.innerHTML    = "";
    regions.forEach(r => {
        const opt       = document.createElement("option");
        opt.value       = r;
        opt.textContent = r;
        sel.appendChild(opt);
    });
    triggerUpdate();
}

function getSeriesId() {
    const pathogen   = document.getElementById("pathogenSelect").value;
    const antibiotic = document.getElementById("antibioticSelect").value;
    const region     = document.getElementById("regionSelect").value;
    return `${pathogen}__${antibiotic}__${region}`;
}

function triggerUpdate() {
    if      (activeView === "compare") updateCompare();
    else if (activeView === "map")     updateMap();
    else                               updateForecast();
}
async function loadMetrics() {
    try {
        const res  = await fetch(`${API_BASE}/metrics`);
        const data = await res.json();

        document.getElementById("statHorizon").textContent  = data.horizon;
        document.getElementById("statFcRange").textContent  = data.fc_range;
        document.getElementById("statBestML").textContent   = data.best_ml;
        document.getElementById("statMLMae").textContent = `MAE ${data.best_ml_mae}`;
        document.getElementById("statBestDL").textContent   = data.best_dl;
        document.getElementById("statDLMae").textContent = `MAE ${data.best_dl_mae}`;
    } catch (err) {
        console.error("Error loading metrics:", err);
    }
}

function selectModel(model) {
    activeModel = model;
    document.querySelectorAll(".pill").forEach(p => {
        p.classList.toggle("active", p.dataset.model === model);
    });
    updateForecast();
}

function setView(view) {
    activeView = view;
    document.getElementById("btnSingle").classList.toggle("active",  view === "single");
    document.getElementById("btnCompare").classList.toggle("active", view === "compare");
    document.getElementById("btnMap").classList.toggle("active",     view === "map");
    document.getElementById("modelGroup").style.display   = view === "compare" || view === "map" ? "none" : "block";
    document.getElementById("regionGroup").style.display  = view === "map" ? "none" : "block";
    document.getElementById("mapControls").style.display  = view === "map" ? "flex" : "none";
    const titles = { single: "Forecast Values", compare: "All Models Comparison", map: "Regional Resistance (%)" };
    document.getElementById("tableTitle").textContent = titles[view];
    if      (view === "map")     updateMap();
    else if (view === "compare") updateCompare();
    else                         updateForecast();
}

async function updateForecast() {
    const sid = getSeriesId();

    if (!sid) return;

    setLoading(true);
    try {
        const [forecastRes, tableRes] = await Promise.all([
            fetch(`${API_BASE}/forecast?series_id=${encodeURIComponent(sid)}&model=${activeModel}`),
            fetch(`${API_BASE}/forecast-table?series_id=${encodeURIComponent(sid)}&model=${activeModel}`)
        ]);

        const forecastData = await forecastRes.json();
        const tableData    = await tableRes.json();

        plotForecast(forecastData, activeModel);
        renderForecastTable(tableData, activeModel);
    } catch (err) {
        console.error("Error fetching forecast:", err);
    } finally {
        setLoading(false);
    }
}

async function updateCompare() {
    const sid = getSeriesId();
    if (!sid) return;

    setLoading(true);
    try {
        const [baseRes, compareRes] = await Promise.all([
            fetch(`${API_BASE}/forecast?series_id=${encodeURIComponent(sid)}&model=xgb`),
            fetch(`${API_BASE}/compare?series_id=${encodeURIComponent(sid)}`)
        ]);

        const baseData    = await baseRes.json();
        const compareData = await compareRes.json();
        const actual      = baseData.filter(d => !d.is_forecast);

        plotCompare(actual, compareData);
        renderCompareTable(compareData);
    } catch (err) {
        console.error("Error fetching compare:", err);
    } finally {
        setLoading(false);
    }
}
function setMapType(type) {
    activeMapType = type;
    document.getElementById("btnActual").classList.toggle("active",   type === "actual");
    document.getElementById("btnForecast").classList.toggle("active", type === "forecast");
    updateMap();
}

async function updateMap() {
    const pathogen   = document.getElementById("pathogenSelect").value;
    const antibiotic = document.getElementById("antibioticSelect").value;
    if (!pathogen || !antibiotic) return;

    setLoading(true);
    try {
        const [geoRes, dataRes] = await Promise.all([
            fetch("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Regions_December_2022_EN_BGC/FeatureServer/0/query?where=1%3D1&outFields=RGN22NM&f=geojson&outSR=4326"),
            fetch(`${API_BASE}/map-data?pathogen=${encodeURIComponent(pathogen)}&antibiotic=${encodeURIComponent(antibiotic)}&map_type=${activeMapType}`)
        ]);
        const geojson    = await geoRes.json();
        const regionData = await dataRes.json();



        const valueLookup = {};
        regionData.forEach(r => { valueLookup[r.region] = r.value; });

        const names = [];
        const mappedNames = [];
        const values = [];
        geojson.features.forEach(f => {
            const rawName  = f.properties.RGN22NM || "";
            const dataName = rawName === "Yorkshire and The Humber"
                ? "Yorkshire and Humber"
                : rawName.replace(" (England)", "");
            names.push(rawName);
            mappedNames.push(dataName);
            values.push(valueLookup[dataName] ?? null);
        });
        console.log("GeoJSON feature properties:", geojson.features.map(f => f.properties));

        plotChoropleth(geojson, names, values, pathogen, antibiotic);
        renderMapTable(regionData);
    } catch (err) {
        console.error("Error rendering map:", err);
    } finally {
        setLoading(false);
    }
}

function plotChoropleth(geojson, names, values, pathogen, antibiotic) {
    const validValues = values.filter(v => v !== null);
    const zmin = Math.floor(Math.min(...validValues));
    const zmax = Math.ceil(Math.max(...validValues));

    const hoverText = names.map((n, i) =>
        values[i] !== null ? `<b>${n}</b><br>${values[i].toFixed(1)}%` : `<b>${n}</b><br>No data`
    );

    Plotly.newPlot("chart", [{
        type: "choroplethmapbox",
        geojson: geojson,
        locations: names,
        z: values.map(v => v ?? zmin),
        featureidkey: "properties.RGN22NM",
        colorscale: [[0, "#022c1a"], [0.25, "#065f35"], [0.5, "#16a34a"], [0.75, "#fbbf24"], [1, "#ef4444"]],
        zmin: zmin,
        zmax: zmax,
        marker: { opacity: 0.85, line: { color: "#0a3d24", width: 1 } },
        colorbar: { title: { text: "Resistance %", font: { color: "#99ddbb", size: 11 } }, tickfont: { color: "#99ddbb" }, thickness: 14 },
        text: hoverText,
        hoverinfo: "text",
    }], {
        mapbox: { style: "white-bg", center: { lon: -1.5, lat: 52.8 }, zoom: 5.2 },
        margin: { t: 30, b: 10, l: 10, r: 10 },
        paper_bgcolor: "#010d0a",
        title: { text: `${pathogen} — ${antibiotic} · GRU Forecast (%)`, font: { size: 13, color: "#ccffe8" }, x: 0.01 },
    }, { responsive: true });
}

function renderMapTable(regionData) {
    const tableDiv = document.getElementById("forecastTable");
    if (!regionData || regionData.length === 0) {
        tableDiv.innerHTML = "<p style='color:var(--muted)'>No data available.</p>";
        return;
    }
    const sorted = [...regionData].sort((a, b) => b.value - a.value);
    let html = `<table><thead><tr><th>Region</th><th>GRU Forecast (%)</th></tr></thead><tbody>`;
    sorted.forEach(r => {
        html += `<tr><td>${r.region}</td><td>${r.value.toFixed(1)}%</td></tr>`;
    });
    html += "</tbody></table>";
    tableDiv.innerHTML = html;
}

function plotForecast(data, model) {
    if (!Array.isArray(data) || data.length === 0) {
        Plotly.newPlot("chart", [], { title: "No data available" });
        return;
    }

    const colors   = MODEL_COLORS[model] || MODEL_COLORS.xgb;
    const label    = MODEL_LABELS[model] || model.toUpperCase();
    const actual   = data.filter(d => !d.is_forecast);
    const forecast = data.filter(d =>  d.is_forecast);
    const anchor   = actual.length > 0 ? [actual[actual.length - 1]] : [];

    const traces = [];

    if (actual.length > 0) {
        traces.push({
            x: actual.map(d => d.date),
            y: actual.map(d => d.value),
            mode: "lines",
            name: "Actual",
            line: { color: colors.actual, width: 2 }
        });
    }

    if (forecast.length > 0) {
        traces.push({
            x: [...anchor.map(d => d.date), ...forecast.map(d => d.date)],
            y: [...anchor.map(d => d.value), ...forecast.map(d => d.value)],
            mode: "lines",
            name: `${label} Forecast`,
            line: { color: colors.forecast, width: 2, dash: "dash" }
        });
    }

    Plotly.newPlot("chart", traces, {
        title: `${label} — AMR Resistance Forecast`,
        xaxis: { title: "Date", type: "date", tickformat: "%b %Y" },
        yaxis: { title: "Resistance (%)" },
        hovermode: "x unified",
        template: "plotly_white",
        legend: { orientation: "h", y: -0.2 }
    });
}

function plotCompare(actual, compareData) {
    const traces = [];
    const anchor = actual.length > 0 ? actual[actual.length - 1] : null;

    if (actual.length > 0) {
        traces.push({
            x: actual.map(d => d.date),
            y: actual.map(d => d.value),
            mode: "lines",
            name: "Actual",
            line: { color: "#3b82f6", width: 2.5 }
        });
    }

    Object.entries(compareData).forEach(([model, rows]) => {
        const colors = MODEL_COLORS[model] || { forecast: "#999" };
        const label  = MODEL_LABELS[model] || model.toUpperCase();
        const xVals  = anchor ? [anchor.date,  ...rows.map(r => r.date)]  : rows.map(r => r.date);
        const yVals  = anchor ? [anchor.value, ...rows.map(r => r.value)] : rows.map(r => r.value);

        traces.push({
            x: xVals, y: yVals,
            mode: "lines",
            name: `${label} Forecast`,
            line: { color: colors.forecast, width: 2, dash: "dash" }
        });
    });

    Plotly.newPlot("chart", traces, {
        title: "All Models — AMR Resistance Forecast Comparison",
        xaxis: { title: "Date", type: "date", tickformat: "%b %Y" },
        yaxis: { title: "Resistance (%)" },
        hovermode: "x unified",
        template: "plotly_white",
        legend: { orientation: "h", y: -0.25 }
    });
}

function renderForecastTable(rows, model) {
    const tableDiv = document.getElementById("forecastTable");
    const label    = MODEL_LABELS[model] || model.toUpperCase();

    if (!rows || rows.length === 0) {
        tableDiv.innerHTML = "<p>No forecast data available.</p>";
        return;
    }

    let html = `<table><thead><tr><th>Date</th><th>${label} Forecast (%)</th></tr></thead><tbody>`;
    rows.forEach(r => {
        html += `<tr><td>${r.date}</td><td>${Number(r.value).toFixed(3)}</td></tr>`;
    });
    html += "</tbody></table>";
    tableDiv.innerHTML = html;
}

function renderCompareTable(compareData) {
    const tableDiv = document.getElementById("forecastTable");
    const models   = Object.keys(compareData);

    if (models.length === 0) {
        tableDiv.innerHTML = "<p>No comparison data available.</p>";
        return;
    }

    const dates = compareData[models[0]].map(r => r.date);

    let html = `<table><thead><tr><th>Date</th>`;
    models.forEach(m => { html += `<th>${MODEL_LABELS[m] || m.toUpperCase()} (%)</th>`; });
    html += `</tr></thead><tbody>`;

    dates.forEach((date, i) => {
        html += `<tr><td>${date}</td>`;
        models.forEach(m => {
            const val = compareData[m][i]?.value;
            html += `<td>${val != null ? Number(val).toFixed(3) : "—"}</td>`;
        });
        html += "</tr>";
    });

    html += "</tbody></table>";
    tableDiv.innerHTML = html;
}

function setLoading(on) {
    const el = document.getElementById("loadingIndicator");
    if (el) el.style.display = on ? "block" : "none";
}


document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pathogenSelect").addEventListener("change",   loadAntibiotics);
    document.getElementById("antibioticSelect").addEventListener("change", loadRegions);
    document.getElementById("regionSelect").addEventListener("change",     triggerUpdate);
    loadPathogens();
    loadMetrics();
});