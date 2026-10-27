"use client";

// Sentinel shell - the display-unit switch: how amounts are shown on every page. Nothing stored changes.

import { DISPLAY_UNITS, useDisplayUnit } from "../displayUnit";
import { T } from "../theme";

export function DisplayUnitControl() {
  const { unit, setUnit } = useDisplayUnit();
  return (
    <div role="radiogroup" aria-label="Display unit" title="How amounts are shown. Nothing stored changes." style={{ display: "inline-flex", border: `1px solid ${T.rule}`, borderRadius: 3, overflow: "hidden" }}>
      {DISPLAY_UNITS.map((u) => {
        const active = unit === u.value;
        return (
          <button
            key={u.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setUnit(u.value)}
            className="sn-unit-btn"
            style={{
              fontFamily: "inherit",
              fontSize: "0.74rem",
              fontWeight: active ? 600 : 400,
              padding: "0.32rem 0.6rem",
              border: "none",
              borderRight: `1px solid ${T.rule}`,
              background: active ? T.ink : T.card,
              color: active ? T.background : T.inkSoft,
              cursor: "pointer",
            }}
          >
            {u.short}
          </button>
        );
      })}
    </div>
  );
}
