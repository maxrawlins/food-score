import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

DATA = Path("ml/data/off_nova.parquet")
OUT_DIR = Path("public/ml")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# --- Simple ingredient text flags ---
PATTERNS = {
    "has_emulsifier": r"\bemulsif|lecithin|mono-?glycer|di-?glycer\b",
    "has_sweetener": r"\baspartame|sucralose|acesulfame|stevia|saccharin\b",
    "has_flavoring": r"\bflavour|flavor|aroma\b",
    "has_palm_oil": r"\bpalm\b",
    "has_syrup": r"\bsyrup|glucose|fructose\b",
    "has_modified_starch": r"\bmodified starch\b",
}

NUMERIC_COLS = [
    "additivesCount",
    "ingredientCount",
    "sugars_100g",
    "salt_100g",
    "saturated_fat_100g",
    "fiber_100g",
    "proteins_100g",
]


# ---------------------------
# Helper functions
# ---------------------------

def text_flags(ingredients: str) -> dict:
    s = (ingredients or "").lower()
    return {k: int(bool(re.search(p, s))) for k, p in PATTERNS.items()}


def estimate_ingredient_count(text: str) -> float:
    if not text:
        return np.nan
    parts = [x.strip() for x in re.split(r"[,;•]", text) if len(x.strip()) >= 2]
    return float(len(parts)) if parts else np.nan


def median_impute(train: pd.Series, test: pd.Series):
    med = np.nanmedian(train.to_numpy(dtype=float))
    return train.fillna(med), test.fillna(med), float(med)


# ---------------------------
# Main
# ---------------------------

def main():
    if not DATA.exists():
        raise SystemExit("Missing ml/data/off_nova.parquet. Run extract step first.")

    print("Loading parquet...")
    df = pd.read_parquet(DATA)

    # Keep only labelled rows
    df = df[df["nova_group"].isin([1, 2, 3, 4])].copy()

    # ---------------------------
    # 🔥 CRITICAL FIX: Clip numeric outliers
    # ---------------------------
    CLIP_RANGES = {
        "sugars_100g": (0, 100),
        "salt_100g": (0, 10),
        "saturated_fat_100g": (0, 50),
        "fiber_100g": (0, 50),
        "proteins_100g": (0, 50),
    }

    for col, (lo, hi) in CLIP_RANGES.items():
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            df[col] = df[col].clip(lower=lo, upper=hi)

    # Drop rows where ALL nutrition fields are missing
    df = df.dropna(
        subset=[
            "sugars_100g",
            "salt_100g",
            "saturated_fat_100g",
            "fiber_100g",
            "proteins_100g",
        ],
        how="all",
    )

    # ---------------------------
    # Derive ingredientCount + flags
    # ---------------------------
    df["ingredientsText"] = df["ingredientsText"].fillna("")
    df["ingredientCount"] = df["ingredientsText"].apply(estimate_ingredient_count)

    flags = df["ingredientsText"].apply(text_flags).apply(pd.Series)
    df = pd.concat([df, flags], axis=1)

    feature_cols = NUMERIC_COLS + list(PATTERNS.keys())

    X = df[feature_cols].copy()
    y = df["nova_group"].astype(int).to_numpy()

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=y
    )

    # ---------------------------
    # Median imputation (numeric)
    # ---------------------------
    medians = {}
    for c in NUMERIC_COLS:
        X_train[c], X_test[c], med = median_impute(X_train[c], X_test[c])
        medians[c] = med

    # Flags → fill missing with 0
    for c in PATTERNS.keys():
        X_train[c] = X_train[c].fillna(0).astype(int)
        X_test[c] = X_test[c].fillna(0).astype(int)

    # ---------------------------
    # Standardize
    # ---------------------------
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train.to_numpy(dtype=float))
    X_test_s = scaler.transform(X_test.to_numpy(dtype=float))

    print("\nScaler means (sanity check):")
    for name, val in zip(feature_cols, scaler.mean_):
        print(f"{name:25} {val:.4f}")

    # ---------------------------
    # Train logistic regression
    # ---------------------------
    clf = LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
    )
    clf.fit(X_train_s, y_train)

    preds = clf.predict(X_test_s)
    print("\nClassification report:\n")
    print(classification_report(y_test, preds))

    # ---------------------------
    # Export browser-friendly model
    # ---------------------------
    export = {
        "type": "multiclass_logreg",
        "version": "nova-ml-v2-cleaned",
        "classes": [int(x) for x in clf.classes_.tolist()],
        "features": feature_cols,
        "medians": medians,
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "coef": clf.coef_.tolist(),
        "intercept": clf.intercept_.tolist(),
        "text_flags": PATTERNS,
        "notes": "Clipped nutrition outliers. Cleaned training set.",
    }

    out_path = OUT_DIR / "nova_model.json"
    out_path.write_text(json.dumps(export))
    print(f"\n✅ Saved browser model to: {out_path}")


if __name__ == "__main__":
    main()