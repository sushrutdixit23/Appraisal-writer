import { NextResponse } from "next/server";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export const runtime = "nodejs";

type StructuredResume = {
  name: string;
  title: string;
  contact: { phone: string; email: string; location: string; linkedin: string };
  summary: string;
  skills: { category: string; items: string }[];
  experience: { title: string; company: string; dates: string; bullets: string[] }[];
  education: { degree: string; institution: string; dates: string }[];
  certifications: string[];
  additional: string[];
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a2e" },
  name: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 11, color: "#5B4BFF", marginBottom: 6 },
  contact: { fontSize: 9, color: "#555555", marginBottom: 14 },
  sectionTitle: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: "#dddddd", paddingBottom: 3 },
  section: { marginBottom: 14 },
  paragraph: { fontSize: 10, lineHeight: 1.5 },
  skillLine: { fontSize: 10, lineHeight: 1.5, marginBottom: 2 },
  expBlock: { marginBottom: 10 },
  expHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  expTitleCompany: { fontSize: 10.5, fontWeight: 700 },
  expDates: { fontSize: 9, color: "#777777" },
  bulletRow: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 10, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.5 },
  eduRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
});

function ResumePdfDoc({ r }: { r: StructuredResume }) {
  const contactLine = [r.contact?.phone, r.contact?.email, r.contact?.location, r.contact?.linkedin].filter(Boolean).join("   |   ");
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.name}>{r.name}</Text>
          {r.title ? <Text style={styles.title}>{r.title}</Text> : null}
          {contactLine ? <Text style={styles.contact}>{contactLine}</Text> : null}
        </View>

        {r.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.paragraph}>{r.summary}</Text>
          </View>
        ) : null}

        {r.skills?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {r.skills.map((s, i) => (
              <Text key={i} style={styles.skillLine}>
                {s.category ? `${s.category}: ` : ""}{s.items}
              </Text>
            ))}
          </View>
        ) : null}

        {r.experience?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {r.experience.map((e, i) => (
              <View key={i} style={styles.expBlock}>
                <View style={styles.expHeaderRow}>
                  <Text style={styles.expTitleCompany}>{e.title} - {e.company}</Text>
                  <Text style={styles.expDates}>{e.dates}</Text>
                </View>
                {e.bullets.map((b, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>-</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {r.education?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {r.education.map((ed, i) => (
              <View key={i} style={styles.eduRow}>
                <Text style={{ fontSize: 10 }}>{ed.degree} - {ed.institution}</Text>
                <Text style={{ fontSize: 9, color: "#777777" }}>{ed.dates}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {r.certifications?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            <Text style={styles.paragraph}>{r.certifications.join(", ")}</Text>
          </View>
        ) : null}

        {r.additional?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional</Text>
            {r.additional.map((a, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>-</Text>
                <Text style={styles.bulletText}>{a}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function POST(req: Request) {
  try {
    const { resume } = await req.json();
    if (!resume?.name) {
      return NextResponse.json({ error: "No resume data provided." }, { status: 400 });
    }

    const buffer = await renderToBuffer(<ResumePdfDoc r={resume} />);
    const filename = (resume.name || "resume").replace(/[^a-zA-Z0-9]+/g, "_") + "_resume.pdf";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("Resume PDF generation failed:", err?.message || err);
    return NextResponse.json({ error: "Could not generate PDF. Please try again." }, { status: 500 });
  }
}
