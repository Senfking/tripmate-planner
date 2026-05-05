import { ArrowLeft } from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";

const Privacy = () => {
  const back = useSmartBack("/");
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

      <h1 className="text-2xl font-bold text-foreground mt-4 mb-1">Privacy Notice</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: April 9, 2026</p>

      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed space-y-6">
        <p>
          This Privacy Notice explains how Junto ("we", "us", "our") collects, uses, stores, and protects your personal data when you use our group trip planning application at junto.pro.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">1. Who We Are</h2>
        <p>
          Junto is a group trip planning tool operated from Dubai, United Arab Emirates. We determine the purposes and means of processing personal data collected through the service.
        </p>
        <p>
          Certain third-party providers process data on our behalf to provide infrastructure, hosting, AI features, and other functionality. Details are set out in Section 5.
        </p>
        <p>For privacy enquiries, contact us at <a href="mailto:privacy@junto.pro" className="text-primary hover:underline">privacy@junto.pro</a>.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">2. Data We Collect</h2>

        <h3 className="text-base font-medium text-foreground mt-4">Information you provide</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account data:</strong> email address, display name, profile photo, and authentication credentials (or third-party login via Google)</li>
          <li><strong>Trip data:</strong> trip names, destinations, dates, itinerary items, bookings, documents, packing lists, and notes</li>
          <li><strong>Expense data:</strong> expense descriptions, amounts, currencies, categories, receipt images, and split allocations</li>
          <li><strong>Decision data:</strong> poll responses, votes, and vibe board preferences</li>
          <li><strong>Communications:</strong> feedback submissions and any messages you send us</li>
        </ul>

        <h3 className="text-base font-medium text-foreground mt-4">Information collected automatically</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Usage data:</strong> pages visited, features used, timestamps, and interaction patterns</li>
          <li><strong>Device data:</strong> browser type, operating system, and screen size</li>
          <li><strong>Push notification tokens:</strong> endpoint URLs and encryption keys required to deliver push notifications to your device, collected only when you opt in</li>
        </ul>

        <h3 className="text-base font-medium text-foreground mt-4">Information we do not collect</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>We do not collect payment card or bank account information</li>
          <li>We do not track your activity outside of Junto</li>
          <li>We do not use advertising trackers or sell your data</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground mt-8">3. How We Use Your Data</h2>
        <p>We use your data to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide and operate the Junto service</li>
          <li>Enable trip collaboration with other group members</li>
          <li>Calculate and display expense splits and balances</li>
          <li>Send push notifications you have opted in to receive</li>
          <li>Process content you submit to AI-powered features such as receipt scanning and activity suggestions</li>
          <li>Analyse aggregated usage patterns to improve the service</li>
          <li>Respond to your feedback and support requests</li>
          <li>Detect and prevent abuse, fraud, or violations of our Terms</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground mt-8">4. Lawful Basis for Processing</h2>
        <p>If you are in the European Economic Area (EEA), UK, or a jurisdiction that requires a lawful basis for processing personal data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Contract performance:</strong> processing necessary to provide you with the Junto service, including account creation, trip collaboration, expense tracking, and features you actively use such as AI-powered receipt scanning and activity suggestions</li>
          <li><strong>Legitimate interests:</strong> usage analytics to improve the service, fraud and abuse prevention, security, and enforcement of our Terms</li>
          <li><strong>Consent:</strong> push notifications and any other processing that depends on your optional opt-in, which you may withdraw at any time</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground mt-8">5. Data Sharing</h2>
        <p>We do not sell your personal data. We do not share your data with advertisers.</p>
        <p>We share data with the following categories of service providers, solely to operate Junto:</p>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium text-foreground">Provider</th>
                <th className="text-left py-2 px-2 font-medium text-foreground">Purpose</th>
                <th className="text-left py-2 px-2 font-medium text-foreground">Data shared</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border/50">
                <td className="py-2 px-2 font-medium text-foreground">Supabase</td>
                <td className="py-2 px-2">Database, authentication, file storage, serverless functions</td>
                <td className="py-2 px-2">Account data, trip data, expense data, and other app data necessary to provide the service</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 px-2 font-medium text-foreground">Anthropic</td>
                <td className="py-2 px-2">AI-powered features (receipt scanning, activity suggestions, feedback analysis)</td>
                <td className="py-2 px-2">Only the content you submit to or that is required for the specific AI feature being used</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 px-2 font-medium text-foreground">Google</td>
                <td className="py-2 px-2">Authentication, location search</td>
                <td className="py-2 px-2">Email address (for sign-in), location search queries</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 px-2 font-medium text-foreground">Unsplash</td>
                <td className="py-2 px-2">Trip destination photos</td>
                <td className="py-2 px-2">Search queries (destination names only)</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 px-2 font-medium text-foreground">Apple / Google Push Services</td>
                <td className="py-2 px-2">Push notification delivery</td>
                <td className="py-2 px-2">Notification content and device push tokens</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>We may also disclose data if required by law, court order, or to protect the rights, safety, or property of Junto or its users.</p>

        <h3 className="text-base font-medium text-foreground mt-4">Data shared within trip groups</h3>
        <p>
          When you join a trip, other members of that trip can see your display name, avatar, itinerary contributions, expense entries, poll votes, and attendance status. This is essential to how Junto works as a collaborative planning tool.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">6. Data Storage and Security</h2>
        <p>
          Primary application data is stored on Supabase infrastructure configured in the EU. Some data may be processed in other regions by our service providers or their sub-processors as part of delivering the service.
        </p>
        <p>
          We use industry-standard security measures including encryption in transit and at rest, and implement Row Level Security (RLS) policies to ensure users can only access data they are authorised to see.
        </p>
        <p>Receipt images are stored in a private storage bucket with signed URL access - they are not publicly accessible.</p>
        <p>No system is completely secure. You are also responsible for protecting your login credentials, securing your devices, and managing access to shared trips appropriately.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">7. Data Retention</h2>
        <p>We retain your data for as long as your account is active and as needed to provide the service.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account data:</strong> retained until you delete your account</li>
          <li><strong>Trip data:</strong> retained for the lifetime of the trip; deleted when the trip is deleted by its creator</li>
          <li><strong>Expense data and receipts:</strong> retained with the associated trip</li>
          <li><strong>Usage analytics:</strong> retained for up to 24 months, then aggregated or deleted</li>
          <li><strong>Feedback:</strong> retained for up to 24 months</li>
        </ul>
        <p>
          When you delete your account, we will delete or anonymise your personal data within a reasonable timeframe. Some data may be retained for a limited period in backups, logs, or where reasonably necessary for legal compliance, security, fraud prevention, dispute resolution, or enforcement of our Terms.
        </p>
        <p>
          Content you contributed to shared trips - such as expense entries, itinerary items, or poll votes - may remain visible to other trip members where necessary to preserve the integrity of shared trip records and group coordination. Where feasible, your personal identifiers may be removed or anonymised.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">8. Your Rights</h2>
        <p>Depending on your jurisdiction and subject to applicable legal limitations and identity verification, you may have the following rights regarding your personal data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access:</strong> request a copy of the personal data we hold about you</li>
          <li><strong>Rectification:</strong> request correction of inaccurate data</li>
          <li><strong>Erasure:</strong> request deletion of your data</li>
          <li><strong>Portability:</strong> request your data in a structured, machine-readable format</li>
          <li><strong>Restriction:</strong> request that we limit processing of your data</li>
          <li><strong>Objection:</strong> object to processing based on legitimate interests</li>
          <li><strong>Withdraw consent:</strong> withdraw consent for push notifications or other consent-based processing at any time</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at <a href="mailto:privacy@junto.pro" className="text-primary hover:underline">privacy@junto.pro</a>. We will respond within a reasonable timeframe, and no later than required by applicable law.
        </p>
        <p>If you are in the EEA or UK and believe your data protection rights have been violated, you have the right to lodge a complaint with your local data protection supervisory authority.</p>

        <h2 className="text-lg font-semibold text-foreground mt-8">9. Cookies and Local Storage</h2>
        <p>
          Junto uses cookies, local storage, and similar browser technologies to maintain your session and store preferences such as notification opt-in status. We do not use third-party advertising trackers or advertising pixels.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">10. Push Notifications</h2>
        <p>
          Push notifications are opt-in only. You choose whether to enable them and can disable them at any time through your device settings or within Junto's notification preferences.
        </p>
        <p>
          When you enable push notifications, we store a push subscription token (endpoint URL and encryption keys) to deliver notifications to your device. If you disable notifications, we stop sending them.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">11. Age Requirement</h2>
        <p>
          Junto is intended for users aged 18 and older. We do not knowingly collect personal data from anyone under 18. If we become aware that we have collected data from a person under 18, we will take reasonable steps to delete that data and may disable the associated account. If you believe someone under 18 has provided us with personal data, contact us at <a href="mailto:privacy@junto.pro" className="text-primary hover:underline">privacy@junto.pro</a>.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">12. International Data Transfers</h2>
        <p>
          Your data may be processed in countries other than your own, including where our service providers and their sub-processors operate. Where required by applicable law, such transfers are protected by appropriate safeguards, such as contractual protections or other lawful transfer mechanisms used by our service providers.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">13. Changes to This Notice</h2>
        <p>
          We may update this Privacy Notice from time to time. Material changes will be communicated by email, in-app notice, or by posting on the website, as appropriate. Continued use of Junto after changes are posted constitutes acceptance of the updated notice.
        </p>

        <h2 className="text-lg font-semibold text-foreground mt-8">14. Contact</h2>
        <p>For any privacy-related questions or requests, contact us at:</p>
        <p>
          <strong>Junto</strong><br />
          Email: <a href="mailto:privacy@junto.pro" className="text-primary hover:underline">privacy@junto.pro</a><br />
          Web: <a href="https://junto.pro" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">https://junto.pro</a>
        </p>
      </div>
    </div>
  </div>
);

export default Privacy;
