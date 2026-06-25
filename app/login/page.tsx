export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#16181F", color: "white", fontFamily: "sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "12px" }}>Zyntask</h1>
        <p style={{ color: "#9AA1B1", marginBottom: "20px" }}>Please sign in from the homepage.</p>
        <a href="/" style={{ color: "#5B4BFF", textDecoration: "underline" }}>Go to homepage</a>
      </div>
    </main>
  );
}