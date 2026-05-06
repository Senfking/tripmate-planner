import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useCanonical } from "@/hooks/useCanonical";

const Terms = () => {
  const back = useSmartBack("/");
  useCanonical("/terms");
  return (
  <div className="min-h-dvh bg-background">
    <div className="max-w-[680px] mx-auto pt-10 pb-20 px-6 md:px-8">
      {/* Header */}
      <button
        type="button"
        onClick={back}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <span
        className="block font-bold"
        style={{ fontSize: 18, letterSpacing: "0.18em", color: "#0D9488" }}
      >
        JUNTO
      </span>

      <h1 className="text-2xl font-bold text-foreground mt-4 mb-1">Terms and Conditions</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 9, 2026</p>

      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed space-y-6">
        <p>
          These Terms and Conditions ("Terms") govern your use of Junto ("we", "us", "our"), a group trip planning application accessible at junto.pro. By accessing or using Junto, you agree to these Terms. If you do not agree, do not use Junto.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">1. About Junto</h2>
        <p>
          Junto is a group trip planning tool that helps you organise itineraries, track shared expenses, make group decisions, and coordinate travel logistics with other people.
        </p>
        <p>Junto is operated from Dubai, United Arab Emirates. For enquiries, contact us at <a href="mailto:privacy@junto.pro" className="text-primary hover:underline">privacy@junto.pro</a>.</p>
        <p>
          Junto is <strong>not</strong> a travel agency, tour operator, booking platform, payment processor, or financial service. We do not sell travel products, process payments between users, arrange travel on your behalf, or guarantee the accuracy of any information displayed within the app.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">2. Beta and Early Access</h2>
        <p>
          Junto is currently in early access. Features may be incomplete, may change materially, or may contain errors. We may add, modify, or remove features at any time. You use the service at your own risk and acknowledge that it may not perform as expected in all circumstances.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">3. Eligibility</h2>
        <p>You must be at least 18 years old to use Junto. By creating an account, you represent and warrant that you are at least 18 years of age.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">4. Accounts</h2>
        <p>
          You are responsible for maintaining the security of your account and for all activity that occurs under it. You agree to provide accurate information when creating your account and to keep it up to date. You are responsible for safeguarding your login credentials and for any activity on your account, whether or not you authorised it.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use Junto for any illegal purpose or to facilitate illegal activity</li>
          <li>Upload harmful, abusive, defamatory, or obscene content</li>
          <li>Attempt to gain unauthorised access to other users' accounts or data</li>
          <li>Interfere with or disrupt the service, servers, or networks</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code from the application</li>
          <li>Use automated systems (bots, scrapers) to access Junto without our written consent</li>
          <li>Impersonate another person or entity</li>
          <li>Use Junto to harass, threaten, or intimidate other users</li>
        </ul>
        <p>
          We may remove content, suspend or restrict access, investigate suspected misuse, preserve information for legal purposes, and cooperate with lawful requests from authorities where required or appropriate.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">6. User-Generated Content</h2>
        <p>
          You retain ownership of any content you create in Junto, including trip plans, itineraries, expense records, notes, photos, and feedback.
        </p>
        <p>
          By using Junto, you grant us a non-exclusive, royalty-free, worldwide licence to store, display, reproduce, and process your content as reasonably necessary to operate, maintain, and improve the service. This includes making your content available to other members of trips you participate in, and processing your content through third-party infrastructure providers and sub-processors we use to deliver the service.
        </p>
        <p>
          Private trip content - such as expenses, notes, documents, and receipts - is only visible to members of that trip and will not be used for marketing or made publicly visible without your explicit action.
        </p>
        <p>
          If we introduce features that allow you to publish content publicly (such as shared itineraries or reviews), that content will be visible to other users and may be featured within the service. You will be able to unpublish or delete public content at any time.
        </p>
        <p>We do not sell your content to third parties.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">7. Shared Trips and Group Data</h2>
        <p>
          When you create or join a shared trip, certain information becomes visible to other members of that trip, including your display name, avatar, itinerary contributions, expense entries, and poll votes.
        </p>
        <p>
          If you delete your account, content you contributed to shared trips - such as expense entries, itinerary items, or poll votes - may remain visible to other trip members where necessary to preserve the integrity of shared trip records, expense history, and group coordination. Where feasible, your personal identifiers may be removed or anonymised. Some data may persist temporarily in backups.
        </p>
        <p>Trip creators may have additional administrative controls, including the ability to remove members or modify trip settings.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">8. Feedback</h2>
        <p>
          If you submit feedback, suggestions, ideas, or bug reports to us, you grant us an unrestricted, royalty-free, perpetual licence to use, modify, and incorporate that feedback into the service without obligation or compensation to you.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">9. AI-Generated Content</h2>
        <p>
          Junto uses artificial intelligence to provide features such as receipt scanning and activity suggestions. AI-generated content is provided for convenience only and may contain inaccuracies, omissions, or errors.
        </p>
        <p>
          You are solely responsible for reviewing and verifying any AI-generated content before acting on it. Junto does not guarantee the accuracy, completeness, reliability, or suitability of AI-generated content for any purpose.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">10. Expense Tracking</h2>
        <p>
          Junto provides tools for tracking and splitting group expenses. These tools are for informational and organisational purposes only. Junto does not process financial transactions, transfer funds, or act as a payment intermediary.
        </p>
        <p>
          Exchange rates displayed in the app are approximate and sourced from third-party providers. We do not guarantee their accuracy. Balances and settlement amounts shown are estimates to help groups coordinate - they are not financial advice, binding obligations, or verified financial records.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">11. Travel Information Disclaimer</h2>
        <p>
          Junto is a planning and coordination tool. It is not a source of verified travel information. You are solely responsible for independently verifying all trip details, including but not limited to: bookings, dates, times, prices, transport arrangements, visa and entry requirements, local laws and regulations, health and safety conditions, and travel insurance.
        </p>
        <p>
          Junto is not responsible for missed bookings, itinerary conflicts, travel disruptions, financial losses, or any decisions made in reliance on information displayed in the app - whether that information was entered by you, other users, or generated by AI.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">12. Third-Party Services</h2>
        <p>
          Junto integrates with third-party services including Supabase, Anthropic, Google, and Unsplash. Your use of these services through Junto is subject to their respective terms and privacy policies.
        </p>
        <p>
          Third-party services may change, experience outages, become unavailable, or be removed. We are not responsible for the products, services, content, availability, or reliability of any third party.
        </p>
        <p>Junto may display links to third-party booking platforms. We are not responsible for the products or services offered by those platforms.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">13. Availability and Changes</h2>
        <p>
          We strive to keep Junto available and functional, but we do not guarantee uninterrupted or error-free service. We may modify, suspend, or discontinue any part of the service at any time.
        </p>
        <p>
          We may update these Terms from time to time. Material changes will be communicated via the app, email, or by posting on the website. Continued use of Junto after changes are posted constitutes acceptance of the revised Terms.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">14. Intellectual Property</h2>
        <p>
          Junto, including its design, code, branding, and documentation, is our property and protected by applicable intellectual property laws. You may not copy, modify, distribute, or create derivative works from any part of the Junto application without our written consent.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">15. Disclaimer of Warranties</h2>
        <p>
          Junto is provided "as is" and "as available" without warranties of any kind, whether express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, accuracy, and non-infringement.
        </p>
        <p>
          We do not warrant that Junto will meet your requirements, operate without interruption, be secure, be error-free, or that any defects will be corrected.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">16. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by applicable law, Junto and its operator shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, loss of profits, or damages arising from:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your use of or inability to use the service</li>
          <li>Errors or inaccuracies in expense calculations, balances, or AI-generated content</li>
          <li>Unauthorised access to or alteration of your data</li>
          <li>Actions or omissions of other users within your trip groups</li>
          <li>Reliance on travel information displayed in the app</li>
          <li>Third-party services accessed through Junto</li>
          <li>Service outages, interruptions, or data loss</li>
        </ul>
        <p>
          Our total liability for any claim arising from your use of Junto shall not exceed the amount you paid us in the 12 months prior to the claim, or USD $10, whichever is greater.
        </p>
        <p>Nothing in these Terms excludes or limits liability to the extent such liability cannot be excluded or limited under applicable law.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">17. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Junto and its operator from any claims, damages, losses, or expenses (including legal fees) arising from your use of the service, your violation of these Terms, or your violation of any rights of another party.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">18. Termination</h2>
        <p>
          You may stop using Junto and request deletion of your account at any time by contacting us at <a href="mailto:privacy@junto.pro" className="text-primary hover:underline">privacy@junto.pro</a>.
        </p>
        <p>
          We may suspend or terminate your access if we reasonably believe you have violated these Terms, engaged in abusive or harmful behaviour, posed a security risk, or if required by law. Where practical, we will notify you of the reason for suspension or termination.
        </p>
        <p>
          Upon termination, sections of these Terms that by their nature should survive - including intellectual property, limitation of liability, indemnification, and governing law - will remain in effect.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">19. Force Majeure</h2>
        <p>
          We are not liable for any failure or delay in performing our obligations where such failure or delay results from events beyond our reasonable control, including but not limited to: natural disasters, infrastructure or telecommunications failures, cyberattacks, third-party service outages, power failures, government actions, or pandemic-related disruptions.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">20. Electronic Communications</h2>
        <p>
          By using Junto, you agree to receive communications from us electronically, including by email, in-app notification, or notice posted on the website. You agree that such electronic communications satisfy any legal requirement that communications be in writing.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">21. Assignment</h2>
        <p>
          We may assign or transfer these Terms, or any rights or obligations under them, in connection with a merger, acquisition, sale of assets, restructuring, or transfer of the service. Your rights under these Terms are not assignable without our written consent.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">22. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the United Arab Emirates. Any disputes arising from these Terms or your use of Junto shall be subject to the exclusive jurisdiction of the courts of Dubai, UAE.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">23. Severability</h2>
        <p>
          If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">24. Entire Agreement</h2>
        <p>
          These Terms, together with our <Link to="/privacy" className="text-primary hover:underline">Privacy Notice</Link>, constitute the entire agreement between you and Junto regarding your use of the service.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">25. Contact</h2>
        <p>For questions about these Terms, contact us at:</p>
        <p>
          <strong>Junto</strong><br />
          Email: <a href="mailto:privacy@junto.pro" className="text-primary hover:underline">privacy@junto.pro</a><br />
          Web: <a href="https://junto.pro" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">https://junto.pro</a>
        </p>
      </div>
    </div>
  </div>
  );
};

export default Terms;
