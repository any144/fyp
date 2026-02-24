const API_BASE = "http://127.0.0.1:5000";

// -----------------------------
// Load series on page load
// -----------------------------

console.log("app.js loaded");

async function loadSeries() {
    try {
        const res = await fetch(`${API_BASE}/series`);
        const series = await res.json();

        const select = document.getElementById("seriesSelect");
        select.innerHTML = "";

        series.forEach(sid => {
            const opt = document.createElement("option");
            opt.value = sid;
            opt.textContent = sid;
            select.appendChild(opt);
        });

        if (series.length > 0) {
            await updateForecast();
        }
    } catch (err) {
        console.error("Error loading series:", err);
    }
}

// -----------------------------
// Fetch forecast + plot
// -----------------------------
async function updateForecast() {
    const sid = document.getElementById("seriesSelect").value;
    const model = document.getElementById("modelSelect").value;
    const scenario = document.getElementById("scenarioSelect").value;

    // Disable scenario dropdown for TCN
    document.getElementById("scenarioSelect").disabled = (model === "tcn");

    if (!sid || !model) return;

    let url = `${API_BASE}/forecast?series_id=${encodeURIComponent(sid)}&model=${model}`;
    if (model === "xgb" && scenario) {
        url += `&scenario=${scenario}`;
    }

    try {
        const res = await fetch(url);
        const data = await res.json();

        plotForecast(data);
        await updateScenarioTable();
    } catch (err) {
        console.error("Error fetching forecast:", err);
    }
}

// -----------------------------
// Plot using Plotly
// -----------------------------
function plotForecast(data) {
    if (!Array.isArray(data) || data.length === 0) {
        Plotly.newPlot("chart", [], {
            title: "No data available",
            xaxis: { title: "Date" },
            yaxis: { title: "Resistance (%)" }
        });
        return;
    }

    const actual = data.filter(d => !d.is_forecast);
    const forecast = data.filter(d => d.is_forecast);

    const traces = [];

    if (actual.length > 0) {
        traces.push({
            x: actual.map(d => d.date),
            y: actual.map(d => d.value),
            mode: "lines",
            name: "Actual",
            line: { color: "blue" }
        });
    }

    if (forecast.length > 0) {
        traces.push({
            x: forecast.map(d => d.date),
            y: forecast.map(d => d.value),
            mode: "lines",
            name: "Forecast",
            line: { color: "red", dash: "dash" }
        });
    }

    Plotly.newPlot("chart", traces, {
        title: "AMR Forecast",
        xaxis: { title: "Date" },
        yaxis: { title: "Resistance (%)" },
        hovermode: "x unified"
    });
}

// -----------------------------
// Scenario table (XGB only)
// -----------------------------
async function updateScenarioTable() {
    const sid = document.getElementById("seriesSelect").value;
    const model = document.getElementById("modelSelect").value;
    const tableDiv = document.getElementById("scenarioTable");

    if (!sid) {
        tableDiv.innerHTML = "<p>No series selected.</p>";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/scenario-table?series_id=${encodeURIComponent(sid)}&model=${model}`);
        const rows = await res.json();

        // -------------------------
        // TCN TABLE
        // -------------------------
        if (model === "tcn") {
            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Value</th>
                            <th>Forecast</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            rows.forEach(r => {
                html += `
                    <tr>
                        <td>${r.date}</td>
                        <td>${Number(r.value).toFixed(3)}</td>
                        <td>${r.is_forecast}</td>
                    </tr>
                `;
            });

            html += "</tbody></table>";
            tableDiv.innerHTML = html;
            return;
        }

        // -------------------------
        // XGB TABLE
        // -------------------------
        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Baseline</th>
                        <th>-20%</th>
                        <th>+20%</th>
                    </tr>
                </thead>
                <tbody>
        `;

        rows.forEach(r => {
            html += `
                <tr>
                    <td>${r.date}</td>
                    <td>${Number(r.baseline).toFixed(3)}</td>
                    <td>${Number(r.minus20).toFixed(3)}</td>
                    <td>${Number(r.plus20).toFixed(3)}</td>
                </tr>
            `;
        });

        html += "</tbody></table>";
        tableDiv.innerHTML = html;

    } catch (err) {
        console.error("Error fetching scenario table:", err);
        tableDiv.innerHTML = "<p>Error loading scenario table.</p>";
    }
}


// -----------------------------
// Event listeners
// -----------------------------
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("seriesSelect").addEventListener("change", updateForecast);
    document.getElementById("modelSelect").addEventListener("change", updateForecast);
    document.getElementById("scenarioSelect").addEventListener("change", updateForecast);

    loadSeries();
});
