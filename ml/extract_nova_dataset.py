import duckdb
from pathlib import Path

DATA = Path("ml/data/openfoodfacts-products.jsonl.gz")
OUT = Path("ml/data/off_nova.parquet")
OUT.parent.mkdir(parents=True, exist_ok=True)

con = duckdb.connect()

print("Reading JSONL as a single 'json' column and extracting fields...")

# 1) Build a table by extracting fields out of the json column
con.execute(f"""
CREATE OR REPLACE TABLE off AS
SELECT
  json_extract_string(json, '$.code') AS barcode,
  TRY_CAST(json_extract_string(json, '$.nova_group') AS INTEGER) AS nova_group,

  json_extract_string(json, '$.ingredients_text') AS ingredientsText,
  json_extract_string(json, '$.product_name') AS product_name,
  json_extract_string(json, '$.brands') AS brands,

  COALESCE(
    json_array_length(json_extract(json, '$.additives_tags')),
    0
  ) AS additivesCount,

  TRY_CAST(json_extract_string(json, '$.nutriments.sugars_100g') AS DOUBLE) AS sugars_100g,
  TRY_CAST(json_extract_string(json, '$.nutriments.salt_100g') AS DOUBLE) AS salt_100g,
  TRY_CAST(json_extract_string(json, '$.nutriments.saturated-fat_100g') AS DOUBLE) AS saturated_fat_100g,
  TRY_CAST(json_extract_string(json, '$.nutriments.fiber_100g') AS DOUBLE) AS fiber_100g,
  TRY_CAST(json_extract_string(json, '$.nutriments.proteins_100g') AS DOUBLE) AS proteins_100g

FROM read_json_auto('{DATA}', format='newline_delimited');
""")

print("Filtering NOVA 1-4 and writing parquet...")

# 2) Export only labeled rows
con.execute(f"""
COPY (
  SELECT *
  FROM off
  WHERE nova_group IN (1,2,3,4)
    AND barcode IS NOT NULL
) TO '{OUT}' (FORMAT PARQUET);
""")

print(f"✅ Saved {OUT}")