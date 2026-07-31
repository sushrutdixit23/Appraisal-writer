import pathlib

path = pathlib.Path("app/sentinel/lib/config.ts")
text = path.read_text(encoding="utf-8")

anchor = '''    derived_ratios: DERIVED_RATIOS,
  },
  general: {'''

count = text.count(anchor)
assert count == 1, f"Expected 1 match, found {count} — aborting, file may have changed"

insert = '''    derived_ratios: DERIVED_RATIOS,
  },
  fmcg: {
    sector_id: "fmcg",
    display_name: "FMCG / Consumer Staples",
    anomaly_thresholds: {
      peer_relative_zscore: 2.0,
      yoy_swing_pct: 12.0,
      exceptional_item_pct_of_pbt: 20.0,
      current_ratio_min: 1.0,
      debt_equity_max: 1.0,
      inventory_days_max: 60,
      receivable_days_max: 30,
    },
    narrative_context:
      "FMCG companies are exposed to commodity input cost cycles (milk, wheat, " +
      "sugar, edible oils) that can move margins independent of volume growth. " +
      "Distinguish price-led growth from volume-led growth, and watch for " +
      "seasonal demand patterns. Strong distribution/brand moats mean revenue " +
      "swings are more often company-specific than sector-wide - be cautious " +
      "about attributing a single company's move to a sector effect without " +
      "peer confirmation. Starting thresholds below are unvalidated assumptions, " +
      "not calibrated against real FMCG filings yet.",
    derived_ratios: DERIVED_RATIOS,
  },
  general: {'''

text = text.replace(anchor, insert)
path.write_text(text, encoding="utf-8")
print(f"OK — wrote {len(text.encode('utf-8'))} bytes")