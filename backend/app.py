from flask import Flask, request, jsonify
import pandas as pd
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

data_path = "/Users/anisa/OneDrive/Desktop/fyp/backend/tuneddata"

actuals = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/notebooks/datab.csv")
xgb_all = pd.read_csv(f"{data_path}xgb_all.csv")
lgbm_all = pd.read_csv(f"{data_path}lgbm_all.csv")
gru_all = pd.read_csv(f"{data_path}gru_all.csv")
lstm_all = pd.read_csv(f"{data_path}lstm_all.csv")
naive_seasonal = pd.read_csv(f"{data_path}naive_seasonal_all.csv")
naive_drift = pd.read_csv(f"{data_path}naive_drift_all.csv")
sarima = pd.read_csv(f"{data_path}sarima_all.csv")

actuals = actuals[["date", "series_id", "resistance_pct"]].rename(columns={"resistance_pct": "value"})

model_map = {
    "xgb": xgb_all,
    "lgbm": lgbm_all,
    "gru": gru_all,
    "lstm": lstm_all,
    "naive_seasonal": naive_seasonal,
    "naive_drift": naive_drift,
    "sarima": sarima,
}

for df in [actuals, *model_map.values()]:
    df["date"] = pd.to_datetime(df["date"])


@app.route("/pathogens")
def get_pathogens():
    pathogens = set()
    for sid in actuals["series_id"].unique():
        parts = sid.split("__")
        if len(parts) >= 1:
            pathogens.add(parts[0])
    return jsonify(sorted(list(pathogens)))


@app.route("/antibiotics")
def get_antibiotics():
    pathogen    = request.args.get("pathogen")
    antibiotics = set()
    for sid in actuals["series_id"].unique():
        parts = sid.split("__")
        if len(parts) >= 2 and parts[0] == pathogen:
            antibiotics.add(parts[1])
    return jsonify(sorted(list(antibiotics)))


@app.route("/regions")
def get_regions():
    pathogen   = request.args.get("pathogen")
    antibiotic = request.args.get("antibiotic")
    regions    = set()
    for sid in actuals["series_id"].unique():
        parts = sid.split("__")
        if len(parts) >= 3 and parts[0] == pathogen and parts[1] == antibiotic:
            regions.add(parts[2])
    return jsonify(sorted(list(regions)))


@app.route("/metrics")
def get_metrics():
    return jsonify({
        "horizon": "6 months",
        "fc_range": "Jul 2025 - Dec 2025",
        "best_ml": "LightGBM",
        "best_ml_mae": 0.138,
        "best_dl":"GRU",
        "best_dl_mae": 0.158,
    })


@app.route("/forecast")
def get_forecast():
    series_id = request.args.get("series_id")
    model = request.args.get("model", "xgb")

    if not series_id:
        return jsonify({"series_id is required"}), 400
    if model not in model_map:
        return jsonify({"invalid model"}), 400

    df_act = actuals[actuals["series_id"] == series_id].copy()
    df_act["is_forecast"] = False

    df_fc = model_map[model]
    df_fc = df_fc[(df_fc["series_id"] == series_id) & (df_fc["is_forecast"] == True)].copy()

    df = pd.concat([
        df_act[["date", "value", "is_forecast", "series_id"]],
        df_fc[["date", "value", "is_forecast", "series_id"]]
    ], ignore_index=True)

    df = df.sort_values("date")
    df["date"] = df["date"].astype(str)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["is_forecast"] = df["is_forecast"].fillna(False)
    df = df.replace({float("nan"): None})

    return jsonify(df.to_dict(orient="records"))


@app.route("/forecast-table")
def get_forecast_table():
    series_id = request.args.get("series_id")
    model = request.args.get("model", "xgb")

    if not series_id:
        return jsonify({"series_id is required"}), 400
    if model not in model_map:
        return jsonify({"invalid model"}), 400

    df = model_map[model]
    df_fc = df[(df["series_id"] == series_id) & (df["is_forecast"] == True)].copy()
    df_fc = df_fc.sort_values("date")
    df_fc["date"]  = df_fc["date"].astype(str)
    df_fc["value"] = pd.to_numeric(df_fc["value"], errors="coerce").round(3)

    return jsonify(df_fc[["date", "value"]].to_dict(orient="records"))


@app.route("/compare")
def compare_models():
    series_id = request.args.get("series_id")
    if not series_id:
        return jsonify({"series_id is required"}), 400
    result = {}
    for model, df in model_map.items():
        df_fc = df[(df["series_id"] == series_id) & (df["is_forecast"] == True)].copy()
        df_fc = df_fc.sort_values("date")
        df_fc["date"]  = df_fc["date"].astype(str)
        df_fc["value"] = pd.to_numeric(df_fc["value"], errors="coerce").round(3)
        result[model]  = df_fc[["date", "value"]].to_dict(orient="records")

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
    