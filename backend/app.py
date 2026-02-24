from flask import Flask, request, jsonify
import pandas as pd

app = Flask(__name__)

actuals = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/actuals.csv")
xgb_scenarios = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/xgb_scenarios.csv")
xgb_continuous = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/xgb_continuous.csv")
tcn_continuous = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/tcn_continuous.csv")

for df in [actuals, xgb_scenarios, xgb_continuous, tcn_continuous]:
    df["date"] = pd.to_datetime(df["date"])

@app.route("/series")
def get_series():
    series_ids = sorted(actuals["series_id"].unique().tolist())
    return jsonify(series_ids)

@app.route("/forecast")
def get_forecast():
    series_id = request.args.get("series_id")
    model = request.args.get("model")
    scenario = request.args.get("scenario") #for xgb only

    if series_id is None or model is None:
        return jsonify({"error": "series_id and model are needed"})
    
    df_act = actuals[actuals["series_id"] == series_id].copy()
    df_act["is_forecast"] = False

    if model == "xgb":
        if scenario is not None:
            scen_col = scenario
            if scen_col not in ["baseline", "minus20", "plus20"]:
                return jsonify({"error": "Invalid scenario. Must be one of baseline, minus20, plus20"}), 400
            

            df_scen = xgb_scenarios[xgb_scenarios["series_id"] == series_id][["date", scen_col]].copy()
            df_scen.rename(columns={scen_col: "value"}, inplace=True)
            df_scen["is_forecast"] = True
            df = pd.concat([df_act, df_scen], ignore_index=True)

        else:
            df = xgb_continuous[xgb_continuous["series_id"] == series_id].copy()
    elif model == "tcn":
        df = tcn_continuous[tcn_continuous["series_id"] == series_id].copy()
    else:
        return jsonify({"error": "Invalid model"}), 400
    
    df = df.sort_values("date")
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    return jsonify(df.to_dict(orient="records"))

@app.route("/scenario-table")
def get_scenario_table():
    series_id = request.args.get("series_id")
    model = request.args.get("model")

    if series_id is None or model is None:
        return jsonify({"error": "series_id and model are needed"}), 400
    
    if model != "xgb":
        return jsonify({"error": "Scenario table only available for xgb model"}), 400
    
    df = xgb_scenarios[xgb_scenarios["series_id"] == series_id].copy()
    df = df[["date", "baseline", "minus20", "plus20"]]
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")
    return jsonify(df.to_dict(orient="records"))

if __name__ == "__main__":
    app.run(debug=True)
    
    