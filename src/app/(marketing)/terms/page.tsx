import type { Metadata } from "next";
import Link from "next/link";

import { routes } from "@/lib/navigation";
import { ContactLine } from "../_components/contact-details";
import { LegalPage } from "../_components/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using ZUVIO as a seeker, a roommate or an owner.",
  alternates: { canonical: "/terms" },
};

const contents = [
  ["what-zuvio-is", "What ZUVIO is"],
  ["your-account", "Your account"],
  ["seekers", "Finding a home"],
  ["roommates", "Finding a roommate"],
  ["owners", "Listing a property"],
  ["verification", "What verification means"],
  ["content", "Your content and reviews"],
  ["not-allowed", "What is not allowed"],
  ["enforcement", "Enforcement and appeals"],
  ["leaving", "Leaving ZUVIO"],
  ["liability", "Our responsibility"],
  ["changes", "Changes and contact"],
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of use"
      summary="ZUVIO introduces people to homes and to each other. Here is what you can expect from us, and what we expect from you."
      lastUpdated="11 November 2026"
      draft
      contents={contents}
    >
      <h2 id="what-zuvio-is">What ZUVIO is</h2>
      <p>
        ZUVIO is a discovery platform. It helps people find accommodation (PGs, hostels, co-living
        spaces, rooms and flats), find compatible roommates, and helps owners list and manage their
        properties.
      </p>
      <p>
        <strong>ZUVIO is not a broker, landlord or booking service.</strong> We do not take
        payments or deposits and we do not hold a room for you. An enquiry or a roommate match is
        an introduction, never a booking. Any rental agreement is between you and the owner or
        your roommate.
      </p>

      <h2 id="your-account">Your account</h2>
      <ul>
        <li>You must be at least 18 years old.</li>
        <li>Use your real details and verify your e-mail address.</li>
        <li>Keep your password to yourself. You are responsible for what happens in your account.</li>
        <li>One person, one account.</li>
      </ul>

      <h2 id="seekers">Finding a home</h2>
      <ul>
        <li>Listings are written by owners. We review listings before they are published, but we cannot guarantee every detail.</li>
        <li>Prices, availability and bed counts are stated by the owner. The &quot;estimated monthly expense&quot; is an estimate built from what the owner entered.</li>
        <li>Distances are straight-line unless they are labelled otherwise.</li>
        <li>Visit the property and confirm the terms in writing before you pay anyone.</li>
      </ul>

      <h2 id="roommates">Finding a roommate</h2>
      <ul>
        <li>Compatibility scores are calculated from the answers both people gave. They are a guide, not a guarantee.</li>
        <li>Chat opens only after a mutual like. Either person can unmatch or block at any time.</li>
        <li>Contact details cannot be shared in roommate chat. Messages containing phone numbers, e-mail addresses or social handles are not delivered, and repeated attempts can lead to a temporary messaging restriction.</li>
        <li>Meet in a public place first and follow the <Link href={routes.safety}>safety guidelines</Link>.</li>
      </ul>

      <h2 id="owners">Listing a property</h2>
      <ul>
        <li>List only properties you own or are authorised to let.</li>
        <li>Keep details, photos, pricing and availability accurate and current. We will ask you to reconfirm your listing regularly.</li>
        <li>Every listing is reviewed before it is published. We can reject, pause or remove a listing that is inaccurate, duplicated or breaks these terms.</li>
        <li>Reply to enquiries honestly, and do not use seekers&apos; details for anything other than their enquiry.</li>
      </ul>

      <h2 id="verification">What verification means</h2>
      <p>ZUVIO shows three separate signals. Each one means only what it says:</p>
      <ul>
        <li><strong>Owner verified:</strong> our team reviewed the owner&apos;s identity documents.</li>
        <li><strong>Authorisation verified:</strong> our team checked that the lister has the right to let that property.</li>
        <li><strong>Recently confirmed:</strong> the owner confirmed within the last 30 days that the listing is still accurate.</li>
      </ul>
      <p>
        A verified phone number is not proof of ownership. None of these signals is a guarantee
        about a property&apos;s condition or an owner&apos;s conduct.
      </p>

      <h2 id="content">Your content and reviews</h2>
      <ul>
        <li>You keep ownership of what you post. You give ZUVIO permission to store and display it to run the service.</li>
        <li>Post only content you have the right to share.</li>
        <li>You can review a property only after you have sent an enquiry about it, once per property. Reviews must be honest and based on your own experience. Owners can reply publicly.</li>
      </ul>

      <h2 id="not-allowed">What is not allowed</h2>
      <ul>
        <li>Fake, misleading or duplicate listings and profiles.</li>
        <li>Harassment, hate speech, threats, or sexual content.</li>
        <li>Discrimination that is against the law.</li>
        <li>Asking for money before a visit, or any other scam.</li>
        <li>Spam, advertising and brokerage solicitation.</li>
        <li>Trying to get around the contact-sharing rule in roommate chat.</li>
        <li>Scraping, automated access, or attempts to break or probe the service.</li>
      </ul>

      <h2 id="enforcement">Enforcement and appeals</h2>
      <p>
        If you break these terms we may warn you, remove content, restrict a feature (such as
        messaging, matching or listing), or suspend your account. Suspensions are always decided
        by a person on our team. You will be told the reason, and you can appeal a restriction or
        suspension from your account. See the <Link href={routes.safety}>safety guidelines</Link> for details.
      </p>

      <h2 id="leaving">Leaving ZUVIO</h2>
      <p>
        You can delete your account at any time from Settings. Your profile is anonymised, your
        listings and roommate profile are paused and your matches end. The account is permanently
        deleted after 30 days. The <Link href={routes.privacy}>privacy policy</Link> explains what happens to
        your data.
      </p>

      <h2 id="liability">Our responsibility</h2>
      <p>
        We work to keep ZUVIO accurate, available and safe, but the service is provided as it is.
        We are not a party to agreements between users, and we are not responsible for the conduct
        of owners, seekers or roommates, or for the condition of any property. Nothing in these
        terms limits rights you have under Indian law that cannot be limited.
      </p>

      <h2 id="changes">Changes and contact</h2>
      <p>
        We will update these terms as ZUVIO changes and will tell you about significant changes
        before they take effect. <ContactLine prefix="Questions? Contact us" />
      </p>
    </LegalPage>
  );
}
