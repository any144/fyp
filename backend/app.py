from flask import Flask, request, jsonify
import pandas as pd
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

actuals = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/actuals.csv")
xgb_scenarios = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/xgb_scenarios.csv")
xgb_continuous = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/xgb_all.csv")
tcn_continuous = pd.read_csv("/Users/anisa/OneDrive/Desktop/fyp/backend/exports/tcn_continuous.csv")

print(tcn_continuous.tail(20))
print(tcn_continuous.isna().sum())


import pandas as pd

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
    # --- FIX: Clean NaNs before JSON ---
    df["series_id"] = df["series_id"].astype(str)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["is_forecast"] = df["is_forecast"].fillna(True)

    df = df.replace({float("nan"): None, "nan": None, "NaN": None})

    return jsonify(df.to_dict(orient="records"))


@app.route("/scenario-table")
def get_scenario_table():
    series_id = request.args.get("series_id")
    model = request.args.get("model")

    if series_id is None or model is None:
        return jsonify({"error": "series_id and model are needed"}), 400
    
    if model == "xgb":
         df = xgb_scenarios[xgb_scenarios["series_id"] == series_id].copy() 
         df = df[["date", "baseline", "minus20", "plus20"]] 
         df["date"] = df["date"].dt.strftime("%Y-%m-%d") 
         return jsonify(df.to_dict(orient="records")) 
    
    if model == "tcn":
         df = tcn_continuous[tcn_continuous["series_id"] == series_id].copy() 
         df = df[df["is_forecast"] == True]
         df = df[["date", "value", "is_forecast", "model"]]
         df["date"] = df["date"].dt.strftime("%Y-%m-%d") 
         return jsonify(df.to_dict(orient="records")) 
    


if __name__ == "__main__":
    app.run(debug=True)
    
    