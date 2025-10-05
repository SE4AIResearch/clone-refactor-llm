import pandas as pd
import glob
import os
import statsmodels.api as sm
from statsmodels.stats.contingency_tables import mcnemar
from statsmodels.stats.multitest import multipletests
from itertools import combinations

# Read CSV files
path = "./RQ3/"
files = glob.glob(os.path.join(path, "*.csv"))

if not files:
    raise ValueError(f"No CSV files found in {path}")

dfs = []
for file in files:
    df = pd.read_csv(file)
    llm_name = os.path.splitext(os.path.basename(file))[0]

    # Prefer a rich index if Clone type exists; otherwise use Class+Function
    if all(col in df.columns for col in ["Class", "Function", "Clone type"]):
        s = (
            df.set_index(["Class", "Function", "Clone type"])
            ["Refactoring correct?"]
            .astype(int)
            .rename(llm_name)
        )
    else:
        s = (
            df.set_index(["Class", "Function"])
            ["Refactoring correct?"]
            .astype(int)
            .rename(llm_name)
        )
    dfs.append(s)

# Combine all results
all_results = pd.concat(dfs, axis=1).sort_index()

# Handle missing values
if all_results.isna().any().any():
    print("Warning: Missing values detected. Dropping rows with NaN...")
    all_results = all_results.dropna()

print("Combined results:")
print(all_results)
print(f"\nTotal test cases: {len(all_results)}")

# Cochran's Q test
print("\n" + "=" * 80)
print("COCHRAN'S Q TEST")
print("=" * 80)

cq_res = sm.stats.cochrans_q(all_results.to_numpy())
qstat = cq_res.statistic
pval = cq_res.pvalue

print(f"Q = {qstat:.3f}, p = {pval:.4f}")

# Save Cochran's Q result
os.makedirs("RQ3_Res", exist_ok=True)
with open("RQ3_Res/cochran_q.txt", "w") as f:
    f.write(f"Cochran's Q test: Q={qstat:.3f}, p={pval:.4f}\n")

# Pairwise McNemar's tests
print("\n" + "=" * 80)
print("PAIRWISE MCNEMAR'S TESTS")
print("=" * 80)

llms = all_results.columns
rows = []

for a, b in combinations(llms, 2):
    # Build contingency table
    table = pd.crosstab(all_results[a], all_results[b]).reindex(
        index=[0, 1], columns=[0, 1], fill_value=0
    )

    # Get discordant pairs
    b_count = table.iloc[0, 1]  # A wrong, B correct
    c_count = table.iloc[1, 0]  # A correct, B wrong

    # Handle perfect agreement
    if b_count + c_count == 0:
        chi2 = 0.0
        p_value = 1.0
        method = "perfect agreement"
    else:
        # Use exact test for reliability (especially with small samples)
        result = mcnemar(table, exact=True)
        p_value = result.pvalue

        # Calculate chi2 for reference (without continuity correction)
        chi2 = (b_count - c_count) ** 2 / (b_count + c_count)
        method = "exact"

    print(f"{a:20s} vs {b:20s}: χ²={chi2:6.3f}, p={p_value:.4f} "
          f"(b={b_count}, c={c_count})")

    rows.append({
        "LLM_A": a,
        "LLM_B": b,
        "chi2": chi2,
        "p_value": p_value,
        "discordant_b": b_count,
        "discordant_c": c_count,
        "method": method
    })

# Bonferroni correction
p_values = [r['p_value'] for r in rows]
rejected, p_adjusted, _, _ = multipletests(
    p_values, alpha=0.05, method='bonferroni'
)

for i, r in enumerate(rows):
    r['p_adjusted'] = p_adjusted[i]
    r['significant'] = rejected[i]

# Save results
results_df = pd.DataFrame(rows)
results_df.to_csv("RQ3_Res/mcnemar_results.csv", index=False)

# Print summary
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
sig_count = sum(rejected)
print(f"Significant pairs (Bonferroni α=0.05): {sig_count}/{len(rows)}")

if sig_count > 0:
    print("\nSignificant differences:")
    for r in rows:
        if r['significant']:
            print(f"  {r['LLM_A']} vs {r['LLM_B']}: p_adj={r['p_adjusted']:.4f}")

# Write report
with open("RQ3_Res/stats_results.txt", "w") as f:
    f.write(f"Cochran's Q test: Q={qstat:.3f}, p={pval:.4f}\n\n")
    f.write("Pairwise McNemar's tests (exact):\n")
    f.write("-" * 80 + "\n")
    for r in rows:
        sig = " *" if r['significant'] else ""
        f.write(
            f"{r['LLM_A']:20s} vs {r['LLM_B']:20s}: "
            f"χ²={r['chi2']:6.3f}, p={r['p_value']:.4f}, "
            f"p_adj={r['p_adjusted']:.4f}{sig}\n"
        )
    f.write(f"\n* Significant after Bonferroni correction\n")

print(f"\nResults saved to RQ3_Res/")