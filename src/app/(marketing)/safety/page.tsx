import type { Metadata } from "next";
import Link from "next/link";

import { routes } from "@/lib/navigation";

import { LegalPage } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Safety guidelines",
  description:
    "Community rules, roommate safety, and how reporting and appeals work on Zovia.",
  alternates: { canonical: "/safety" },
};

const contents = [
  ["community", "Community rules"],
  ["roommates", "Meeting a roommate"],
  ["homes", "Visiting a home"],
  ["reporting", "Reporting"],
  ["appeals", "Appeals"],
  ["emergency", "In an emergency"],
] as const;

export default function SafetyPage() {
  return (
    <LegalPage
      eyebrow="Safety"
      title="Safety guidelines"
      summary="The rules everyone on Zovia agrees to, and what happens when you report something."
      lastUpdated="11 November 2026"
      contents={contents}
    >
      <h2 id="community">Community rules</h2>
      <ul>
        <li><strong>Be who you say you are.</strong> Real name, real photos, real listings. No duplicates.</li>
        <li><strong>Be respectful.</strong> No harassment, hate speech, threats or sexual content.</li>
        <li><strong>No money before a visit.</strong> Never ask for, or send, a deposit or token amount before seeing the place in person.</li>
        <li><strong>No spam or brokerage.</strong> No advertising, mass messages or broker solicitation.</li>
      </ul>

      <h2 id="roommates">Meeting a roommate</h2>
      <ul>
        <li>Keep the conversation in Zovia at first, and swap numbers in person once you are comfortable.</li>
        <li>Meet somewhere public the first time, and tell a friend where you are going.</li>
        <li>See the place together, in daylight, and meet the owner or the current flatmates.</li>
        <li>Agree rent share, deposit, notice period and house rules in writing before anyone pays.</li>
      </ul>
      <p>
        <strong>Why a message may not send.</strong> In roommate chat, messages containing phone
        numbers, e-mail addresses or social handles are not delivered, and you will see a warning.
        Repeated attempts within 30 days can lead to a temporary messaging restriction, which you
        can appeal. Chats with property owners about an enquiry are not affected.
      </p>

      <h2 id="homes">Visiting a home</h2>
      <ul>
        <li>Read the verification badges. A listing shows only the ones it has earned.</li>
        <li>Check the full monthly cost: rent plus maintenance, electricity, water, food and other mandatory charges.</li>
        <li>Bed availability is shown separately from the property&apos;s own availability. Confirm the exact bed or room with the owner.</li>
        <li>Pay only after a visit, and ask for a receipt.</li>
      </ul>

      <h2 id="reporting">Reporting</h2>
      <ol>
        <li><strong>Report.</strong> Use Report on any profile, listing, review or message, and pick a reason. Reporting a message keeps a snapshot of it for review.</li>
        <li><strong>Review.</strong> A moderator on our team looks at the report in context.</li>
        <li><strong>Action.</strong> Outcomes range from no action to a warning, removed content, a feature restriction or a suspension. Suspensions are always decided by a person.</li>
      </ol>
      <p>You can also block anyone at any time. Blocking takes effect immediately.</p>

      <h2 id="appeals">Appeals</h2>
      <p>
        If your account is restricted or suspended, you are shown the reason and can appeal from
        your account. A suspended account can still sign in to read the reason and submit an
        appeal. You can appeal each decision once. A member of our team reviews it and replies
        with a decision.
      </p>

      <h2 id="emergency">In an emergency</h2>
      <p>
        If you are in danger, call 112 first. Then <Link href={routes.contact}>tell us</Link> so
        we can act on the account involved.
      </p>
    </LegalPage>
  );
}
