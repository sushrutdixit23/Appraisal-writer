// Sentinel — MIS Pack PDF document (Phase 1 of the Export Engine).
// Pure presentational component: every number arrives already computed
// and formatted by the API route (using the same engine.ts/health.ts/
// benchmark.ts functions the app itself uses to render the KPI
// Dashboard, Business Health card, Financial Statements, and
// Investigation Queue), so this file has no business logic of its own
// and can never compute a figure differently from what the app shows
// on screen.

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export type MisPackKpi = { label: string; value: string; note: string | null };

export type MisPackHealthCategory = { label: string; status: string; detail: string | null };
export type MisPackHealth = { overall: string; categories: MisPackHealthCategory[] };

export type MisPackStatementRow = { label: string; values: (string | null)[]; bold?: boolean };

export type MisPackInvestigation = {
  periodLabel: string;
  status: string;
  confidenceScore: number | null;
  namedPeer: string | null;
  verdict: string | null;
  narrative: string;
};

export type MisPackData = {
  companyName: string;
  sectorLabel: string;
  periodLabel: string;
  basis: string;
  generatedAt: string;
  kpis: MisPackKpi[];
  health: MisPackHealth | null;
  periodLabels: string[];
  statementRows: MisPackStatementRow[];
  investigations: MisPackInvestigation[];
};

// Locked Sentinel palette (Black + Sandstone).
const INK = "#161616";
const INK_SOFT = "#5C5850";
const RULE = "#DCD5C7";
const CARD = "#FFFFFF";
const BACKGROUND = "#F7F3EB";
const ACCENT = "#A47551";

const HEALTH_TEXT: Record<string, string> = {
  healthy: "#2F5233",
  watch: "#8A6416",
  concern: "#9A4A1F",
  critical: "#8C2A2A",
  no_data: INK_SOFT,
};
const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  concern: "Concern",
  critical: "Critical",
  no_data: "No data",
};

// Every border below is written as explicit borderWidth/Color/Style
// properties rather than a CSS shorthand string - react-pdf's layout
// engine (Yoga) reliably supports the explicit form across versions,
// where shorthand support has varied.
const styles = StyleSheet.create({
  page: {
    backgroundColor: BACKGROUND,
    padding: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: INK,
  },
  coverTitle: { fontSize: 26, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  coverSubtitle: { fontSize: 11, color: INK_SOFT, marginBottom: 24 },
  coverMetaRow: { flexDirection: "row", marginBottom: 4 },
  coverMetaLabel: {
    width: 100,
    color: INK_SOFT,
    fontSize: 9,
    textTransform: "uppercase",
  },
  coverMetaValue: { fontSize: 10 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
    borderBottomStyle: "solid",
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap" },
  kpiCard: {
    width: "24%",
    backgroundColor: CARD,
    padding: 8,
    marginRight: "1%",
    marginBottom: 6,
  },
  kpiLabel: { fontSize: 7, color: INK_SOFT, textTransform: "uppercase", marginBottom: 3 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  kpiNote: { fontSize: 6.5, color: INK_SOFT },
  healthOverallRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  healthOverallLabel: { fontSize: 10, color: INK_SOFT, marginRight: 8, textTransform: "uppercase" },
  healthOverallPill: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  healthGrid: { flexDirection: "row", flexWrap: "wrap" },
  healthChip: {
    width: "23%",
    backgroundColor: CARD,
    padding: 7,
    marginRight: "2%",
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: RULE,
    borderLeftStyle: "solid",
  },
  healthChipLabel: { fontSize: 7, color: INK_SOFT, textTransform: "uppercase", marginBottom: 2 },
  healthChipStatus: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  table: { width: "100%" },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    borderBottomStyle: "solid",
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    borderBottomStyle: "solid",
    paddingBottom: 3,
    marginBottom: 2,
  },
  tableLabelCell: { width: "34%", fontSize: 8.5, paddingTop: 3, paddingBottom: 3 },
  tableValueCell: { flex: 1, fontSize: 8.5, textAlign: "right", paddingTop: 3, paddingBottom: 3 },
  tableHeaderLabelCell: { width: "34%", fontSize: 7.5, color: INK_SOFT, textTransform: "uppercase" },
  tableHeaderValueCell: {
    flex: 1,
    fontSize: 7.5,
    color: INK_SOFT,
    textTransform: "uppercase",
    textAlign: "right",
  },
  investigationCard: {
    backgroundColor: CARD,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    borderLeftStyle: "solid",
  },
  investigationHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  investigationPeriod: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  investigationStatus: { fontSize: 7.5, color: INK_SOFT, textTransform: "uppercase" },
  investigationVerdict: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 4 },
  investigationNarrative: { fontSize: 8.5, lineHeight: 1.5, marginBottom: 4 },
  investigationMeta: { fontSize: 7.5, color: INK_SOFT },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 7,
    color: INK_SOFT,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    borderTopStyle: "solid",
    paddingTop: 6,
  },
});

function KpiGrid({ kpis }: { kpis: MisPackKpi[] }) {
  return (
    <View style={styles.kpiGrid}>
      {kpis.map((k) => (
        <View key={k.label} style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{k.label}</Text>
          <Text style={styles.kpiValue}>{k.value}</Text>
          {k.note && <Text style={styles.kpiNote}>{k.note}</Text>}
        </View>
      ))}
    </View>
  );
}

function HealthSection({ health }: { health: MisPackHealth }) {
  return (
    <View>
      <View style={styles.healthOverallRow}>
        <Text style={styles.healthOverallLabel}>Overall</Text>
        <Text style={{ ...styles.healthOverallPill, color: HEALTH_TEXT[health.overall] ?? INK_SOFT }}>
          {HEALTH_LABEL[health.overall] ?? health.overall}
        </Text>
      </View>
      <View style={styles.healthGrid}>
        {health.categories.map((c) => (
          <View
            key={c.label}
            style={{ ...styles.healthChip, borderLeftColor: HEALTH_TEXT[c.status] ?? RULE }}
          >
            <Text style={styles.healthChipLabel}>{c.label}</Text>
            <Text style={{ ...styles.healthChipStatus, color: HEALTH_TEXT[c.status] ?? INK_SOFT }}>
              {HEALTH_LABEL[c.status] ?? c.status}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatementTable({ periodLabels, rows }: { periodLabels: string[]; rows: MisPackStatementRow[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        <Text style={styles.tableHeaderLabelCell}>Line Item</Text>
        {periodLabels.map((p) => (
          <Text key={p} style={styles.tableHeaderValueCell}>
            {p}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.tableRow}>
          <Text
            style={{
              ...styles.tableLabelCell,
              ...(row.bold ? { fontFamily: "Helvetica-Bold" } : {}),
            }}
          >
            {row.label}
          </Text>
          {row.values.map((v, i) => (
            <Text
              key={i}
              style={{
                ...styles.tableValueCell,
                ...(row.bold ? { fontFamily: "Helvetica-Bold" } : {}),
              }}
            >
              {v ?? "—"}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function InvestigationsSection({ investigations }: { investigations: MisPackInvestigation[] }) {
  return (
    <View>
      {investigations.map((inv, i) => (
        <View key={i} style={styles.investigationCard} wrap={false}>
          <View style={styles.investigationHeader}>
            <Text style={styles.investigationPeriod}>{inv.periodLabel}</Text>
            <Text style={styles.investigationStatus}>{inv.status}</Text>
          </View>
          {inv.verdict && <Text style={styles.investigationVerdict}>{inv.verdict}</Text>}
          <Text style={styles.investigationNarrative}>{inv.narrative}</Text>
          <Text style={styles.investigationMeta}>
            {inv.confidenceScore != null ? `Confidence: ${inv.confidenceScore}%` : "Confidence: —"}
            {inv.namedPeer ? `  ·  Closest peer: ${inv.namedPeer}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MisPackDocument({ data }: { data: MisPackData }) {
  return (
    <Document title={`${data.companyName} — MIS Pack — ${data.periodLabel}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.coverTitle}>{data.companyName}</Text>
        <Text style={styles.coverSubtitle}>Financial Intelligence Workspace — MIS Pack</Text>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Period</Text>
          <Text style={styles.coverMetaValue}>
            {data.periodLabel} ({data.basis})
          </Text>
        </View>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Sector</Text>
          <Text style={styles.coverMetaValue}>{data.sectorLabel}</Text>
        </View>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Generated</Text>
          <Text style={styles.coverMetaValue}>{data.generatedAt}</Text>
        </View>

        <Text style={styles.sectionTitle}>KPI Summary</Text>
        <KpiGrid kpis={data.kpis} />

        {data.health && (
          <>
            <Text style={styles.sectionTitle}>Business Health</Text>
            <HealthSection health={data.health} />
          </>
        )}

        <Text style={styles.sectionTitle}>Income Statement</Text>
        <StatementTable periodLabels={data.periodLabels} rows={data.statementRows} />

        {data.investigations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Key Investigations</Text>
            <InvestigationsSection investigations={data.investigations} />
          </>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Sentinel — computed, not guessed · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
