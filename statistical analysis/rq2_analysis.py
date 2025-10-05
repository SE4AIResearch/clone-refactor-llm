import os
import pandas as pd
from statsmodels.stats.contingency_tables import mcnemar

FOLDER = "RQ2"

TARGET_COLUMNS = [
    "Free from compilation error?",
    "Pass the test cases?",
    "Can GPT-4o refactor it?"
]

results = []

for file in os.listdir(FOLDER):
    if not (file.endswith(".csv") or file.endswith(".xlsx")):
        continue

    filepath = os.path.join(FOLDER, file)

    if file.endswith(".csv"):
        df = pd.read_csv(filepath)
    else:
        df = pd.read_excel(filepath)
    print(file)
    df["JDeodorant"] = df["JDeodorant"].apply(
        lambda x: 1 if str(x).strip().lower() == "yes" or str(x).strip() == "1" else 0)

    for col in TARGET_COLUMNS:
        if col not in df.columns:
            continue

        df[col] = df[col].apply(
            lambda x: 1 if str(x).strip().lower() == "yes" or str(x).strip() == "1" else (0 if pd.notna(x) else None))

  
        sub = df[[col, "JDeodorant"]].dropna()

        if sub.empty:
            continue

        b00 = len(sub[(sub[col] == 0) & (sub["JDeodorant"] == 0)])
        b01 = len(sub[(sub[col] == 0) & (sub["JDeodorant"] == 1)])
        b10 = len(sub[(sub[col] == 1) & (sub["JDeodorant"] == 0)])
        b11 = len(sub[(sub[col] == 1) & (sub["JDeodorant"] == 1)])

        table = [[b00, b01], [b10, b11]]

        # McNemar’s test
        result = mcnemar(table, exact=False, correction=True)

        results.append({
            "file": file,
            "metric": col,
            "b00": b00, "b01": b01, "b10": b10, "b11": b11,
            "chi2": result.statistic,
            "p": result.pvalue
        })

results_df = pd.DataFrame(results)
results_df.to_csv("RQ2_Res/mcnemar_summary.csv", index=False)
print("✅ Done! Results saved to mcnemar_summary.csv")
print(results_df)