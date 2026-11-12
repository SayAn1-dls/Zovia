import type { Metadata } from "next";
import Link from "next/link";

import { routes } from "@/lib/navigation";
import { ContactLine } from "../_components/contact-details";
import { LegalPage } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What ZUVIO collects, why, who can see it, and how to delete your account.",
  alternates: { canonical: "/privacy" },
};

const contents = [
  ["what-we-collect", "What we collect"],
  ["how-we-use-it", "How we use it"],
  ["who-sees-what", "Who can see what"],
  ["roommate-chat", "Roommate chat and contact details"],
  ["moderation", "Moderation and safety"],
  ["cookies", "Cookies and analytics"],
  ["service-providers", "Service providers"],
  ["retention", "Retention and deletion"],
  ["your-choices", "Your choices"],
  ["contact", "Contact"],
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      summary="We collect what we need to help you find a home or a roommate, and we keep contact details private by default."
      lastUpdated="11 November 2026"
      draft
      contents={contents}
    >
      <h2 id="what-we-collect">What we collect</h2>
      <h3>Account</h3>
      <ul>
        <li>Your e-mail address and a password (stored only as a hash by our authentication provider).</li>
        <li>Optionally a phone number, if you choose to add or verify one, and your date of birth if you provide it.</li>
        <li>What you came for (finding a home, finding a roommate, or listing a property) so we can show the right screens.</li>
      </ul>
      <h3>Profile and preferences</h3>
      <ul>
        <li>Display name, photo, gender, occupation, and study or work details you choose to add.</li>
        <li>Search preferences such as city, localities, budget and move-in date.</li>
      </ul>
      <h3>Roommate matching</h3>
      <ul>
        <li>Your roommate profile and photos, and your answers to lifestyle questions (for example food habits, sleep schedule, cleanliness, guests, smoking and drinking).</li>
        <li>Your deal-breakers, and who you liked or passed on.</li>
      </ul>
      <h3>Listings (owners)</h3>
      <ul>
        <li>Property details, photos, rooms, beds, pricing and availability.</li>
        <li>Business contact details, and documents you upload for owner or property verification.</li>
      </ul>
      <h3>Activity</h3>
      <ul>
        <li>Messages and images you send, enquiries, saved listings, reviews, reports and appeals.</li>
        <li>Searches you run while signed in, and questions you ask the assistant.</li>
        <li>Basic technical data needed to run and protect the service, such as request logs and rate-limit counters.</li>
      </ul>

      <h2 id="how-we-use-it">How we use it</h2>
      <ul>
        <li>To run your account and show you relevant homes and roommates.</li>
        <li>To calculate roommate compatibility from the answers you both gave.</li>
        <li>To deliver messages, enquiries and notifications.</li>
        <li>To verify owners and listings, moderate content and investigate reports.</li>
        <li>To send service e-mails. Marketing e-mail is sent only if you opt in, and you can opt out at any time.</li>
      </ul>
      <p>We do not sell your personal data, and we do not pass your phone number to brokers.</p>

      <h2 id="who-sees-what">Who can see what</h2>
      <ul>
        <li><strong>Everyone</strong> can see published listings, an owner&apos;s public card (name or business name, owner type, verification status) and published reviews with the reviewer&apos;s display name and photo.</li>
        <li><strong>Signed-in people with an active roommate profile</strong> can see other active roommate profiles in their candidate pool.</li>
        <li><strong>People you share a conversation with</strong> can see your profile details.</li>
        <li><strong>Owner contact details</strong> are not shown publicly. They are released to a signed-in person who asks to see them or sends an enquiry, and we record that request.</li>
        <li><strong>Your e-mail address, phone number and date of birth</strong> are visible only to you and to ZUVIO staff who need them to support or moderate the service.</li>
        <li><strong>Verification documents</strong> are stored privately and are visible only to you and to staff reviewing them.</li>
      </ul>

      <h2 id="roommate-chat">Roommate chat and contact details</h2>
      <p>
        Roommate chat opens only after two people like each other. To protect both sides, messages
        in roommate chat that contain contact details are not delivered. That covers phone numbers,
        e-mail addresses and links or handles for WhatsApp, Telegram, Instagram and Snapchat. The
        check is automatic. The sender sees a warning and we keep a record of the attempt.
        Repeated attempts within 30 days can lead to a temporary messaging restriction, which you
        can appeal.
      </p>
      <p>
        This restriction does not apply to conversations with property owners about an enquiry.
      </p>

      <h2 id="moderation">Moderation and safety</h2>
      <p>
        When someone reports a message, we keep a snapshot of it so a moderator can review it in
        context. Staff can review reported profiles, listings, reviews and messages, and every
        staff action is recorded in an audit log. See the <Link href={routes.safety}>safety guidelines</Link>{" "}
        for how reporting and appeals work.
      </p>

      <h2 id="cookies">Cookies and analytics</h2>
      <ul>
        <li><strong>Essential:</strong> a session cookie keeps you signed in. Your cookie choice is stored in your browser.</li>
        <li><strong>Analytics:</strong> off by default. Analytics loads only if you choose &quot;Allow&quot; on the cookie prompt, and you can change your mind from &quot;Cookie settings&quot; in the footer.</li>
      </ul>

      <h2 id="service-providers">Service providers</h2>
      <p>We use a small number of providers to run ZUVIO. They process data on our behalf:</p>
      <ul>
        <li>Database, authentication and file storage.</li>
        <li>Web hosting.</li>
        <li>Transactional e-mail delivery, where enabled.</li>
        <li>Maps and place search, where enabled. Location searches you make are sent to the maps provider.</li>
        <li>An AI model provider for the assistant, where enabled. Your questions to the assistant are sent to it. Recommendations are built only from listings in our database.</li>
        <li>Analytics, only with your consent.</li>
      </ul>

      <h2 id="retention">Retention and deletion</h2>
      <p>You can delete your account from Settings. When you do:</p>
      <ul>
        <li>Your profile is anonymised straight away, your listings and roommate profile are paused, and your matches end.</li>
        <li>You can no longer sign in.</li>
        <li>After 30 days your account is permanently deleted.</li>
      </ul>
      <p>
        Some records are kept for longer where we need them to keep the service safe, such as
        moderation decisions and audit logs.
      </p>

      <h2 id="your-choices">Your choices</h2>
      <ul>
        <li>View and edit your profile, preferences and roommate answers at any time.</li>
        <li>Pause your roommate profile or your listings.</li>
        <li>Block another user, or unmatch.</li>
        <li>Turn e-mail notifications and marketing e-mail on or off.</li>
        <li>Delete your account.</li>
      </ul>

      <h2 id="contact">Contact</h2>
      <p>
        <ContactLine prefix="Questions about your data? Contact us" />
      </p>
    </LegalPage>
  );
}
