import type { Metadata } from "next";
import Link from "next/link";

import { routes } from "@/lib/navigation";

import { LegalPage } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Safety guidelines",
  description:
    "Community rules, roommate safety, and how reporting and appeals work on ZUVIO.",
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
      summary="The rules, and what happens when you report."
      lastUpdated="11 November 2026"
      contents={contents}
    >
      <h2 id="community">Community rules</h2>
      <ul>
        <li><strong>Be real.</strong> Real name, photos and listings.</li>
        <li><strong>Be respectful.</strong> No harassment, hate or threats.</li>
        <li><strong>No money before a visit.</strong> Never send a token or deposit unseen.</li>
        <li><strong>No spam or brokers.</strong></li>
      </ul>

      <h2 id="roommates">Meeting a roommate</h2>
      <ul>
        <li>Chat in ZUVIO first; swap numbers in person.</li>
        <li>Meet in public first, and tell a friend.</li>
        <li>Agree rent share, deposit and rules in writing before paying.</li>
        <li>Roommate messages with phone numbers, e-mails or handles are blocked; repeated attempts can restrict messaging (appealable).</li>
      </ul>

      <h2 id="homes">Visiting a home</h2>
      <ul>
        <li>Badges show only what a listing has earned.</li>
        <li>Check the full monthly cost, not just rent.</li>
        <li>Confirm the exact bed or room with the owner.</li>
        <li>Pay only after a visit, and get a receipt.</li>
      </ul>

      <h2 id="reporting">Reporting</h2>
      <ol>
        <li><strong>Report</strong> any profile, listing, review or message.</li>
        <li><strong>Review:</strong> a moderator checks it in context.</li>
        <li><strong>Action:</strong> from none to suspension. Suspensions are always decided by a person.</li>
      </ol>
      <p>You can block anyone, instantly.</p>

      <h2 id="appeals">Appeals</h2>
      <p>Restricted or suspended? You see the reason and can appeal each decision once from your account. A person reviews it.</p>

      <h2 id="emergency">In an emergency</h2>
      <p>
        Call 112 first. Then <Link href={routes.contact}>tell us</Link>.
      </p>
    </LegalPage>
  );
}
