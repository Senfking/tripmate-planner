import { Link } from "react-router-dom";

const Terms = () => (
  <div className="min-h-screen" style={{ backgroundColor: "#F1F5F9" }}>
    <div className="max-w-[600px] mx-auto pt-16 px-8">
      <span
        className="font-bold"
        style={{
          fontSize: 18,
          letterSpacing: "0.18em",
          color: "#0D9488",
        }}
      >
        JUNTO
      </span>
      <h1 className="text-[24px] font-bold text-foreground mt-6">Terms of Service</h1>
      <p className="text-muted-foreground mt-4 leading-[1.6]">
        This page is coming soon. We're working on our terms of service and will publish it here shortly.
        In the meantime, if you have any questions contact us at hello@junto.pro
      </p>
      <Link to="/app/trips" className="inline-block mt-8 text-[#0D9488] font-medium hover:underline">
        ← Back to Junto
      </Link>
    </div>
  </div>
);

export default Terms;
