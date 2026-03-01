const API_BASE = "http://127.0.0.1:5000";

let activeModel = "xgb";
let activeView  = "single";

const MODEL_COLORS = {
    xgb:  { actual: "#3b82f6", forecast: "#ef4444" },
    lgbm: { actual: "#3b82f6", forecast: "#f97316" },
    gru:  { actual: "#3b82f6", forecast: "#8b5cf6" },
    tcn:  { actual: "#3b82f6", forecast: "#10b981" },
    lstm: { actual: "#3b82f6", forecast: "#ec4899" },
};

const MODEL_LABELS = {
    xgb:  "XGBoost",
    lgbm: "LightGBM",
    gru:  "GRU",
    tcn:  "TCN",
    lstm: "LSTM",
};

async function loadSeries() {
    try {
        const res    = await fetch(`${API_BASE}/series`);
        const series = await res.json();

        const select = document.getElementById("seriesSelect");
        select.innerHTML = "";
        series.forEach(sid => {
            const opt       = document.createElement("option");
            opt.value       = sid;
            opt.textContent = sid;
            select.appendChild(opt);
        });

        if (series.length > 0) await updateForecast();
    } catch (err) {
        console.error("Error loading series:", err);
    }
}
async function loadMetrics() {
    try {
        const res  = await fetch(`${API_BASE}/metrics`);
        const data = await res.json();

        document.getElementById("statHorizon").textContent  = data.horizon;
        document.getElementById("statFcRange").textContent  = data.fc_range;
        document.getElementById("statBestML").textContent   = data.best_ml;
        document.getElementById("statMLMae").textContent    = `MAE ${data.best_ml_mae} · ${data.best_ml_type}`;
        document.getElementById("statBestDL").textContent   = data.best_dl;
        document.getElementById("statDLMae").textContent    = `MAE ${data.best_dl_mae} · ${data.best_dl_type}`;
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
    document.getElementById("modelGroup").style.display   = view === "compare" ? "none" : "block";
    document.getElementById("tableTitle").textContent     = view === "compare" ? "All Models Comparison" : "Forecast Values";

    if (view === "compare") updateCompare();
    else updateForecast();
}

async function updateForecast() {
    const sid = document.getElementById("seriesSelect").value;
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
    const sid = document.getElementById("seriesSelect").value;
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

// Only attach listener to elements that actually exist in the HTML
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("seriesSelect").addEventListener("change", () => {
        if (activeView === "compare") updateCompare();
        else updateForecast();
    });
    loadSeries();
    loadMetrics();
});