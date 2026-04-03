const flask_api = "http://127.0.0.1:5000"
let activeModel = "xgb";
let activeView  = "single";

const model_colours = {
    xgb:            "#ef4444",
    lgbm:           "#f97316",
    gru:            "#8b5cf6",
    lstm:           "#ec4899",
    naive_seasonal: "#94a3b8",
    naive_drift:    "#64748b",
    sarima:         "#fbbf24",
};

const model_labels = {
    xgb:            "XGBoost",
    lgbm:           "LightGBM",
    gru:            "GRU",
    lstm:           "LSTM",
    naive_seasonal: "Seasonal Naïve",
    naive_drift:    "Naïve Drift",
    sarima:         "SARIMA",
};


// populate dropdowns

async function loadPathogens() {
    const res       = await fetch(`${flask_api}/pathogens`);
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
    const pathogen    = document.getElementById("pathogenSelect").value;
    const res         = await fetch(`${flask_api}/antibiotics?pathogen=${encodeURIComponent(pathogen)}`);
    const antibiotics = await res.json();
    const sel         = document.getElementById("antibioticSelect");
    sel.innerHTML     = "";
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
    const res        = await fetch(`${flask_api}/regions?pathogen=${encodeURIComponent(pathogen)}&antibiotic=${encodeURIComponent(antibiotic)}`);
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


// view switching

function setView(view) {
    activeView = view;
    document.getElementById("btnSingle").classList.toggle("active",  view === "single");
    document.getElementById("btnCompare").classList.toggle("active", view === "compare");
    document.getElementById("modelGroup").style.display = view === "compare" ? "none" : "block";
    triggerUpdate();
}

function triggerUpdate() {
    if (activeView === "compare")
         updateCompare();
    else 
        updateForecast();
}

// model selection

function selectModel(model) {
    activeModel = model;
    document.querySelectorAll(".pill").forEach(p => {
        p.classList.toggle("active", p.dataset.model === model);
    });
    updateForecast();
}

// single model forecast

async function updateForecast() {
    const series_id = getSeriesId();
    if (!series_id) return;

    setLoading(true);
    try {
        const res= await fetch(`${flask_api}/forecast?series_id=${encodeURIComponent(series_id)}&model=${activeModel}`);
        const forecastData = await res.json();

        const tableRes = await fetch(`${flask_api}/forecast-table?series_id=${encodeURIComponent(series_id)}&model=${activeModel}`);
        const tableData = await tableRes.json();

        plotForecast(forecastData, activeModel);
        renderForecastTable(tableData, activeModel);
    } catch (err) {
        console.error("error fetching forecast:", err);
    } finally {
        setLoading(false);
    }
}

function plotForecast(data, model) {
    if (!data || data.length === 0) {
        Plotly.newPlot("chart", [], { title: "no data available" });
        return;
    }

    const actual   = data.filter(d => !d.is_forecast);
    const forecast = data.filter(d =>  d.is_forecast);
    const anchor   = actual.length > 0 ? [actual[actual.length - 1]] : [];
    const color    = model_colours[model] || "#999";
    const label    = model_labels[model] || model;

    const traces = [
        {
            x: actual.map(d => d.date),
            y: actual.map(d => d.value),
            mode: "lines",
            name: "Actual",
            line: { color: "#3b82f6", width: 2 }
        },
        {
           x: anchor.map(d => d.date).concat(forecast.map(d => d.date)),
           y: anchor.map(d => d.value).concat(forecast.map(d => d.value)),
            mode: "lines",
            name: `${label} Forecast`,
            line: { color: color, width: 2, dash: "dash" }
        }
    ];

    Plotly.newPlot("chart", traces, {
        title: `${label} — AMR Resistance Forecast`,
        xaxis: { title: "Date", type: "date", tickformat: "%b %Y" },
        yaxis: { title: "Resistance (%)" },
        hovermode: "x unified",
        template: "plotly_white",
        legend: { orientation: "h", y: -0.2 }
    });
}

function renderForecastTable(rows, model) {
    const label    = model_labels[model] || model;
    const tableDiv = document.getElementById("forecastTable");

    if (!rows || rows.length === 0) {
        tableDiv.innerHTML = "<p>no forecast data available</p>";
        return;
    }

    let html = `<table><thead><tr><th>Date</th><th>${label} Forecast (%)</th></tr></thead><tbody>`;
    rows.forEach(r => {
        html += `<tr><td>${r.date}</td><td>${Number(r.value).toFixed(3)}</td></tr>`;
    });
    html += "</tbody></table>";
    tableDiv.innerHTML = html;
}

async function updateCompare() {
    const sid = getSeriesId();
    if (!sid) return;

    setLoading(true);
    try {
        const baseRes    = await fetch(`${flask_api}/forecast?series_id=${encodeURIComponent(sid)}&model=xgb`);
        const baseData   = await baseRes.json();
        const actual     = baseData.filter(d => !d.is_forecast);

        const compareRes  = await fetch(`${flask_api}/compare?series_id=${encodeURIComponent(sid)}`);
        const compareData = await compareRes.json();

        plotCompare(actual, compareData);
        renderCompareTable(compareData);
    } catch (err) {
        console.error("error fetching compare:", err);
    } finally {
        setLoading(false);
    }
}

function plotCompare(actual, compareData) {
    const anchor = actual.length > 0 ? actual[actual.length - 1] : null;

    const traces = [
        {
            x: actual.map(d => d.date),
            y: actual.map(d => d.value),
            mode: "lines",
            name: "Actual",
            line: { color: "#3b82f6", width: 2.5 }
        }
    ];

    Object.entries(compareData).forEach(([model, rows]) => {
        const color = model_colours[model] || "#999";
        const label = model_labels[model] || model;
        let x = rows.map(r => r.date);
        let y = rows.map(r => r.value);
        if (anchor) {
            x = [anchor.date].concat(x);
            y = [anchor.value].concat(y);
        }

        traces.push({
            x, y,
            mode: "lines",
            name: `${label} Forecast`,
            line: { color: color, width: 2, dash: "dash" }
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

function renderCompareTable(compareData) {
    const tableDiv = document.getElementById("forecastTable");
    const models   = Object.keys(compareData);

    if (models.length === 0) {
        tableDiv.innerHTML = "<p>no comparison data available</p>";
        return;
    }

    const dates = compareData[models[0]].map(r => r.date);

    let html = `<table><thead><tr><th>Date</th>`;
    models.forEach(m => { html += `<th>${model_labels[m] || m} (%)</th>`; });
    html += `</tr></thead><tbody>`;

    dates.forEach((date, i) => {
        html += `<tr><td>${date}</td>`;
        models.forEach(m => {
            let val = null;
            if (compareData[m][i]) {
                val = compareData[m][i].value;
            }
            html += "<td>" + (val !== null ? Number(val).toFixed(3) : "-") + "</td>";
        });
        html += "</tr>";
    });

    html += "</tbody></table>";
    tableDiv.innerHTML = html;
}

// metrics sidebar
async function loadMetrics() {
    try {
        const res  = await fetch(`${flask_api}/metrics`);
        const data = await res.json();
        document.getElementById("statHorizon").textContent = data.horizon;
        document.getElementById("statFcRange").textContent = data.fc_range;
        document.getElementById("statBestML").textContent  = data.best_ml;
        document.getElementById("statMLMae").textContent   = `MAE ${data.best_ml_mae}`;
        document.getElementById("statBestDL").textContent  = data.best_dl;
        document.getElementById("statDLMae").textContent   = `MAE ${data.best_dl_mae}`;
    } catch (err) {
        console.error("error loading metrics:", err);
    }
}

// loading indicator
function setLoading(on) {
    const el = document.getElementById("loadingIndicator");
    if (el) el.style.display = on ? "block" : "none";
}

// init
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pathogenSelect").addEventListener("change",   loadAntibiotics);
    document.getElementById("antibioticSelect").addEventListener("change", loadRegions);
    document.getElementById("regionSelect").addEventListener("change",     triggerUpdate);
    loadPathogens();
    loadMetrics();
});