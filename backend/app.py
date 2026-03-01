from flask import Flask, request, jsonify
import pandas as pd
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- Load all model CSVs ---
DATA_PATH = "/Users/anisa/OneDrive/Desktop/fyp/data/"

actuals     = pd.read_csv(f"{DATA_PATH}datab.csv")
xgb_all     = pd.read_csv(f"{DATA_PATH}xgb_all.csv")
lgbm_all    = pd.read_csv(f"{DATA_PATH}lgbm_all.csv")
gru_all     = pd.read_csv(f"{DATA_PATH}gru_all.csv")
tcn_all     = pd.read_csv(f"{DATA_PATH}tcn_all.csv")
lstm_all    = pd.read_csv(f"{DATA_PATH}lstm_all.csv")
actuals = actuals[["date", "series_id", "resistance_pct"]].rename(columns={"resistance_pct": "value"})
actuals["date"] = pd.to_datetime(actuals["date"])
ml_metrics = pd.read_csv(f"{DATA_PATH}ml_model_comparison_metrics.csv", index_col=0)
dl_metrics = pd.read_csv(f"{DATA_PATH}model_comparison_metrics.csv",    index_col=0)

# Map model name → dataframe
MODEL_MAP = {
    "xgb":  xgb_all,
    "lgbm": lgbm_all,
    "gru":  gru_all,
    "tcn":  tcn_all,
    "lstm": lstm_all,
}

# Parse dates
for df in [actuals, *MODEL_MAP.values()]:
    df["date"] = pd.to_datetime(df["date"])

print("All CSVs loaded OK")
for name, df in MODEL_MAP.items():
    print(f"  {name}: {len(df)} rows, forecast rows: {df['is_forecast'].sum()}")


# ----------------------------
# /series — list all series
# ----------------------------
@app.route("/series")
def get_series():
    series_ids = sorted(actuals["series_id"].unique().tolist())
    return jsonify(series_ids)


@app.route("/metrics")
def get_metrics():
    # Best ML model
    best_ml     = ml_metrics["mae"].idxmin()
    best_ml_mae = round(ml_metrics.loc[best_ml, "mae"], 3)

    # Best DL model
    best_dl     = dl_metrics["mae"].idxmin()
    best_dl_mae = round(dl_metrics.loc[best_dl, "mae"], 3)

    # Forecast date range — derive from any model CSV
    fc_dates = xgb_all[xgb_all["is_forecast"] == True]["date"]
    fc_start = fc_dates.min().strftime("%b %Y")
    fc_end   = fc_dates.max().strftime("%b %Y")
    horizon  = len(fc_dates.dt.to_period("M").unique())

    return jsonify({
        "horizon":      f"{horizon} months",
        "fc_range":     f"{fc_start} – {fc_end}",
        "best_ml":      best_ml.replace("-Direct","").replace("-Recursive",""),
        "best_ml_mae":  best_ml_mae,
        "best_ml_type": "Recursive" if "Recursive" in best_ml else "Direct",
        "best_dl":      best_dl.replace("-Direct","").replace("-Recursive",""),
        "best_dl_mae":  best_dl_mae,
        "best_dl_type": "Recursive" if "Recursive" in best_dl else "Direct",
    })



@app.route("/models")
def get_models():
    return jsonify([
        {"value": "xgb",  "label": "XGBoost (ML)"},
        {"value": "lgbm", "label": "LightGBM (ML)"},
        {"value": "gru",  "label": "GRU (Deep Learning)"},
        {"value": "tcn",  "label": "TCN (Deep Learning)"},
        {"value": "lstm", "label": "LSTM (Deep Learning)"},
    ])


# ----------------------------
# /forecast — main forecast endpoint
# ----------------------------
@app.route("/forecast")
def get_forecast():
    series_id = request.args.get("series_id")
    model     = request.args.get("model", "xgb")

    if not series_id:
        return jsonify({"error": "series_id is required"}), 400

    if model not in MODEL_MAP:
        return jsonify({"error": f"Invalid model"}), 400

    # Full actuals from raw data
    df_act = actuals[actuals["series_id"] == series_id].copy()
    df_act["is_forecast"] = False

    # Only forecast rows from model CSV
    df_model = MODEL_MAP[model]
    df_fc = df_model[
        (df_model["series_id"] == series_id) &
        (df_model["is_forecast"] == True)
    ].copy()

    df = pd.concat([
        df_act[["date", "value", "is_forecast", "series_id"]],
        df_fc[["date",  "value", "is_forecast", "series_id"]]
    ], ignore_index=True)

    df = df.sort_values("date")
    df["date"]        = df["date"].dt.strftime("%Y-%m-%d")
    df["value"]       = pd.to_numeric(df["value"], errors="coerce")
    df["is_forecast"] = df["is_forecast"].fillna(False)
    df = df.replace({float("nan"): None})

    return jsonify(df.to_dict(orient="records"))


# ----------------------------
# /forecast-table — forecast-only rows for the table
# ----------------------------
@app.route("/forecast-table")
def get_forecast_table():
    series_id = request.args.get("series_id")
    model     = request.args.get("model", "xgb")

    if not series_id:
        return jsonify({"error": "series_id is required"}), 400

    if model not in MODEL_MAP:
        return jsonify({"error": f"Invalid model"}), 400

    df = MODEL_MAP[model]
    df_fc = df[(df["series_id"] == series_id) & (df["is_forecast"] == True)].copy()
    df_fc = df_fc.sort_values("date")
    df_fc["date"] = df_fc["date"].dt.strftime("%Y-%m-%d")
    df_fc["value"] = pd.to_numeric(df_fc["value"], errors="coerce").round(3)

    return jsonify(df_fc[["date", "value"]].to_dict(orient="records"))


# ----------------------------
# /compare — get multiple models for same series (overlay)
# ----------------------------
@app.route("/compare")
def compare_models():
    series_id = request.args.get("series_id")
    models    = request.args.getlist("models")  # e.g. ?models=xgb&models=lgbm

    if not series_id:
        return jsonify({"error": "series_id is required"}), 400

    if not models:
        models = list(MODEL_MAP.keys())

    result = {}
    for model in models:
        if model not in MODEL_MAP:
            continue
        df = MODEL_MAP[model]
        df_fc = df[(df["series_id"] == series_id) & (df["is_forecast"] == True)].copy()
        df_fc = df_fc.sort_values("date")
        df_fc["date"] = df_fc["date"].dt.strftime("%Y-%m-%d")
        df_fc["value"] = pd.to_numeric(df_fc["value"], errors="coerce").round(3)
        result[model] = df_fc[["date", "value"]].to_dict(orient="records")

    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
    