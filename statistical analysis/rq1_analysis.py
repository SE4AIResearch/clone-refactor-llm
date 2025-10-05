import pandas as pd
import numpy as np
import math
import sys
from pathlib import Path

# === Batch configuration (edit as needed) ===
INPUT_DIR = Path("./RQ1")
OUTPUT_DIR = Path("./RQ1_Res")
SAVE_OUTPUTS = True
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def find_col_ci(df, target_names):
    lower_map = {c.lower(): c for c in df.columns}
    for name in target_names:
        key = name.lower()
        if key in lower_map:
            return lower_map[key]
    for c in df.columns:
        for name in target_names:
            if name.lower() in c.lower():
                return c
    raise KeyError(f"Cannot find any of {target_names} in columns: {list(df.columns)}")

def to_binary(series):
    s = series.copy()
    if np.issubdtype(s.dtype, np.number):
        return s.fillna(0).astype(int).clip(0, 1)
    s = s.astype(str).str.strip().str.lower()
    true_vals = {"1", "yes", "true", "y", "t"}
    return s.apply(lambda x: 1 if x in true_vals else 0).astype(int)

def mcnemar_cc(b10, b01):
    denom = b10 + b01
    if denom == 0:
        return 0.0, 1.0
    chi2 = (abs(b10 - b01) - 1) ** 2 / denom
    p = math.erfc(math.sqrt(chi2 / 2.0))
    return chi2, p

def analyze_csv(csv_path, gpt_col_candidates=("GPT-4o", "gpt4o", "gpt_4o", "gpt4-o"),
                jdeodorant_col_candidates=("JDeodorant", "JDdeodorant", "jdeodorant", "j-deodorant"),
                save_outputs=False, out_dir=".", prefix="gpt4o_vs_jdeodorant"):
    df = pd.read_csv(csv_path)

    gpt_col = find_col_ci(df, gpt_col_candidates)
    jde_col = find_col_ci(df, jdeodorant_col_candidates)

    A = to_binary(df[gpt_col]).rename("GPT-4o")
    B = to_binary(df[jde_col]).rename("JDeodorant")

    b10 = int(((A == 1) & (B == 0)).sum())  # A=1, B=0
    b01 = int(((A == 0) & (B == 1)).sum())  # A=0, B=1
    b11 = int(((A == 1) & (B == 1)).sum())
    b00 = int(((A == 0) & (B == 0)).sum())

    contingency = pd.DataFrame(
        [[b00, b01],
         [b10, b11]],
        index=["GPT-4o=0", "GPT-4o=1"],
        columns=["JDeodorant=0", "JDeodorant=1"]
    )

    # McNemar
    chi2, p = mcnemar_cc(b10, b01)

    print("McNemar Test (GPT-4o vs JDeodorant)")
    print(f"File: {csv_path}")
    print(f"Using columns: GPT-4o='{gpt_col}', JDeodorant='{jde_col}'\n")
    print("2x2 Contingency (rows=GPT-4o, cols=JDeodorant):")
    print(contingency.to_string())
    print(f"\nDiscordant pairs: b10(1,0)={b10}, b01(0,1)={b01}")
    print(f"chi2 (continuity-corrected) = {chi2:.4f}, p = {p:.6g}  (df=1)")
    if p < 0.05:
        print("=> Significant difference (p < 0.05)")
    else:
        print("=> Not significant (p >= 0.05)")

    if save_outputs:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        contingency.to_csv(out_dir / f"{prefix}_contingency.csv")
        with open(out_dir / f"{prefix}_summary.txt", "w", encoding="utf-8") as f:
            f.write("McNemar Test (GPT-4o vs JDeodorant)\n")
            f.write(f"File: {csv_path}\n")
            f.write(f"Columns: GPT-4o='{gpt_col}', JDeodorant='{jde_col}'\n\n")
            f.write("2x2 Contingency (rows=GPT-4o, cols=JDeodorant):\n")
            f.write(contingency.to_string()+"\n\n")
            f.write(f"Discordant pairs: b10(1,0)={b10}, b01(0,1)={b01}\n")
            f.write(f"chi2 (with continuity correction) = {chi2:.4f}\n")
            f.write(f"p-value (df=1) = {p:.6g}\n")
            f.write("Interpretation: p < 0.05 => significant difference.\n")

def run_batch(input_dir: Path = INPUT_DIR, output_dir: Path = OUTPUT_DIR, save_each: bool = SAVE_OUTPUTS):
    results = []
    for csv_path in sorted(input_dir.glob("*.csv")):
        prefix = csv_path.stem
        try:
            print(f"\n=== Analyzing: {csv_path} ===")
            gpt_col_candidates = ("GPT-4o", "gpt4o", "gpt_4o", "gpt4-o")
            jdeodorant_col_candidates = ("JDeodorant", "JDdeodorant", "jdeodorant", "j-deodorant")

            df = pd.read_csv(csv_path)
            gpt_col = find_col_ci(df, gpt_col_candidates)
            jde_col = find_col_ci(df, jdeodorant_col_candidates)
            A = to_binary(df[gpt_col]).rename("GPT-4o")
            B = to_binary(df[jde_col]).rename("JDeodorant")

            b10 = int(((A == 1) & (B == 0)).sum())
            b01 = int(((A == 0) & (B == 1)).sum())
            b11 = int(((A == 1) & (B == 1)).sum())
            b00 = int(((A == 0) & (B == 0)).sum())

            chi2, p = mcnemar_cc(b10, b01)

            print(f"Discordant: b10(1,0)={b10}, b01(0,1)={b01} | chi2={chi2:.4f}, p={p:.6g}")

            if save_each:
                analyze_csv(
                    csv_path,
                    save_outputs=True,
                    out_dir=output_dir,
                    prefix=prefix
                )

            results.append({
                "file": csv_path.name,
                "gpt_col": gpt_col,
                "jdeodorant_col": jde_col,
                "b00": b00, "b01": b01, "b10": b10, "b11": b11,
                "chi2": chi2, "p": p
            })
        except Exception as e:
            print(f"[ERROR] {csv_path.name}: {e}")
            results.append({
                "file": csv_path.name,
                "gpt_col": None,
                "jdeodorant_col": None,
                "b00": None, "b01": None, "b10": None, "b11": None,
                "chi2": None, "p": None,
                "error": str(e)
            })

    summary_df = pd.DataFrame(results)
    summary_path = output_dir / "batch_mcnemar_summary.csv"
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_df.to_csv(summary_path, index=False)
    print(f"\nBatch summary saved to: {summary_path}")

if __name__ == "__main__":
    run_batch(INPUT_DIR, OUTPUT_DIR, SAVE_OUTPUTS)