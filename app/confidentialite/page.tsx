export default function ConfidentialitePage() {
  return (
    <main
      style={{
        backgroundColor: "#FDF8F2",
        minHeight: "100vh",
        padding: "32px 16px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#4A3F5C",
            marginBottom: 16,
          }}
        >
          Politique de confidentialité
        </h1>
        <p style={{ fontSize: 14, color: "#8B7FA0", lineHeight: 1.6 }}>
          Mon Bébébou traite vos données de suivi uniquement pour vous aider
          dans le quotidien avec votre bébé. Vos événements sont associés à
          votre compte et ne sont pas revendus à des tiers.
        </p>
      </div>
    </main>
  );
}
