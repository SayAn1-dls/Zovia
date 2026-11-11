import type { Route } from "next";
import {
  Bell,
  BedDouble,
  Building2,
  ClipboardList,
  FileText,
  Flag,
  Gavel,
  Heart,
  House,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  MessageCircle,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserRound,
  Users,
} from "lucide-react";

/**
 * The single navigation config for ZUVIO (spec section 9).
 *
 * Every route in the product is declared here once, so feature work never has
 * to edit shared chrome (header, footer, tab bar, sidebars).
 *
 * typedRoutes: `next build` type-checks <Link href>. Many routes below are
 * built by other modules and may not exist yet, so a literal href would fail
 * type-checking until they land. `route()` is the one deliberate place where a
 * path is asserted to be a `Route`; all shared chrome links through `routes`,
 * never through string literals. Once every page exists the assertion is a
 * no-op, and a typo here shows up as a 404 in the link checker (tests/e2e).
 */
function route(path: `/${string}`): Route {
  return path as string as Route;
}

export const routes = {
  // Marketing (public, static)
  home: route("/"),
  about: route("/about"),
  contact: route("/contact"),
  privacy: route("/privacy"),
  terms: route("/terms"),
  safety: route("/safety"),
  listYourProperty: route("/list-your-property"),

  // Auth
  signIn: route("/sign-in"),
  signUp: route("/sign-up"),
  verifyEmail: route("/verify-email"),
  forgotPassword: route("/forgot-password"),
  resetPassword: route("/reset-password"),
  onboarding: route("/onboarding"),

  // App
  search: route("/search"),
  saved: route("/saved"),
  roommates: route("/roommates"),
  roommateProfile: route("/roommates/profile"),
  roommateMatches: route("/roommates/matches"),
  messages: route("/messages"),
  assistant: route("/assistant"),
  notifications: route("/notifications"),
  settings: route("/settings"),
  accountSuspended: route("/account/suspended"),

  // Owner portal
  owner: route("/owner"),
  ownerOnboarding: route("/owner/onboarding"),
  ownerProperties: route("/owner/properties"),
  ownerNewProperty: route("/owner/properties/new"),
  ownerInquiries: route("/owner/inquiries"),
  ownerReviews: route("/owner/reviews"),
  ownerVerification: route("/owner/verification"),
  ownerProfile: route("/owner/profile"),

  // Admin dashboard
  admin: route("/admin"),
  adminProperties: route("/admin/properties"),
  adminVerifications: route("/admin/verifications"),
  adminReports: route("/admin/reports"),
  adminMessageReports: route("/admin/message-reports"),
  adminAppeals: route("/admin/appeals"),
  adminUsers: route("/admin/users"),
  adminOwners: route("/admin/owners"),
  adminReviews: route("/admin/reviews"),
  adminContactMessages: route("/admin/contact-messages"),
  adminAuditLogs: route("/admin/audit-logs"),
  adminSettings: route("/admin/settings"),

  // Developer docs
  apiDocs: route("/docs/api"),
} as const;

/** Dynamic routes. */
export const dynamicRoutes = {
  property: (slug: string) => route(`/properties/${encodeURIComponent(slug)}`),
  conversation: (id: string) => route(`/messages/${encodeURIComponent(id)}`),
  ownerProperty: (id: string) =>
    route(`/owner/properties/${encodeURIComponent(id)}`),
} as const;

type QueryValue = string | number | boolean | null | undefined;

/** Appends a query string, skipping empty values: withQuery(routes.search, { city: "pune" }). */
export function withQuery(
  base: Route,
  params: Record<string, QueryValue | readonly (string | number)[]>,
): Route {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return (query ? `${base}?${query}` : base) as Route;
}

/**
 * Deep links into search. Parameter names follow the search API filters
 * (spec section 6.2): `city` is a `cities.slug`, budgets are integer INR.
 */
export function searchHref(filters: {
  city?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
}): Route {
  return withQuery(routes.search, filters);
}

/** Sign-in link that returns to `next` (validated server-side as a same-origin path). */
export function signInHref(next?: string): Route {
  return withQuery(routes.signIn, { next });
}

export type NavItem = {
  label: string;
  href: Route;
  icon: LucideIcon;
  /** Shorter label for cramped places such as the mobile tab bar. */
  shortLabel?: string;
  /** Match only this exact path when highlighting (default: prefix match). */
  exact?: boolean;
};

export type NavGroup = { label: string; items: readonly NavItem[] };

/** The three primary actions. Order is fixed across the product. */
export const primaryActions = [
  {
    label: "Find a Home",
    description: "PGs, hostels, co-living, rooms and flats.",
    href: routes.search,
    icon: House,
  },
  {
    label: "Find a Roommate",
    description: "People who match your budget and habits.",
    href: routes.roommates,
    icon: Users,
  },
  {
    label: "List Your Property",
    description: "Reach verified seekers. Manage vacancies.",
    href: routes.listYourProperty,
    icon: Building2,
  },
] as const satisfies readonly (NavItem & { description: string })[];

/** Marketing header links. */
export const marketingNav = [
  { label: "Find a Home", href: routes.search, icon: House },
  { label: "Find a Roommate", href: routes.roommates, icon: Users },
  {
    label: "List Your Property",
    href: routes.listYourProperty,
    icon: Building2,
  },
  { label: "Safety", href: routes.safety, icon: ShieldCheck },
] as const satisfies readonly NavItem[];

/** App header links (desktop). */
export const appNav = [
  { label: "Homes", href: routes.search, icon: Search },
  { label: "Roommates", href: routes.roommates, icon: Users },
  { label: "Saved", href: routes.saved, icon: Heart },
  { label: "Messages", href: routes.messages, icon: MessageCircle },
  { label: "Assistant", href: routes.assistant, icon: Sparkles },
] as const satisfies readonly NavItem[];

/** Bottom tab bar in the app area on mobile (five items maximum). */
export const mobileTabs = [
  { label: "Homes", href: routes.search, icon: Search },
  { label: "Roommates", shortLabel: "Mates", href: routes.roommates, icon: Users },
  { label: "Saved", href: routes.saved, icon: Heart },
  { label: "Messages", shortLabel: "Chats", href: routes.messages, icon: MessageCircle },
  { label: "Assistant", shortLabel: "Ask", href: routes.assistant, icon: Sparkles },
] as const satisfies readonly NavItem[];

/** Account menu shown to signed-in users. */
export const accountNav = [
  { label: "Notifications", href: routes.notifications, icon: Bell },
  { label: "Roommate profile", href: routes.roommateProfile, icon: UserRound },
  { label: "Settings", href: routes.settings, icon: Settings },
] as const satisfies readonly NavItem[];

/** Owner portal sidebar. */
export const ownerNav = [
  {
    label: "Manage",
    items: [
      { label: "Overview", href: routes.owner, icon: LayoutDashboard, exact: true },
      { label: "Properties", href: routes.ownerProperties, icon: Building2 },
      { label: "Enquiries", href: routes.ownerInquiries, icon: Inbox },
      { label: "Reviews", href: routes.ownerReviews, icon: Star },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Verification", href: routes.ownerVerification, icon: ShieldCheck },
      { label: "Owner profile", href: routes.ownerProfile, icon: UserRound },
    ],
  },
] as const satisfies readonly NavGroup[];

/** Admin dashboard sidebar. */
export const adminNav = [
  {
    label: "Review",
    items: [
      { label: "Overview", href: routes.admin, icon: LayoutDashboard, exact: true },
      { label: "Listings", href: routes.adminProperties, icon: BedDouble },
      { label: "Verifications", href: routes.adminVerifications, icon: ShieldCheck },
    ],
  },
  {
    label: "Moderation",
    items: [
      { label: "Reports", href: routes.adminReports, icon: Flag },
      { label: "Message reports", href: routes.adminMessageReports, icon: MessageCircle },
      { label: "Appeals", href: routes.adminAppeals, icon: Gavel },
      { label: "Reviews", href: routes.adminReviews, icon: Star },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Users", href: routes.adminUsers, icon: Users },
      { label: "Owners", href: routes.adminOwners, icon: Building2 },
      { label: "Contact messages", href: routes.adminContactMessages, icon: Mail },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Audit log", href: routes.adminAuditLogs, icon: ScrollText },
      { label: "Settings", href: routes.adminSettings, icon: SlidersHorizontal },
    ],
  },
] as const satisfies readonly NavGroup[];

/** Footer columns. */
export const footerNav = [
  {
    label: "Explore",
    items: [
      { label: "Find a Home", href: routes.search, icon: House },
      { label: "Find a Roommate", href: routes.roommates, icon: Users },
      { label: "List Your Property", href: routes.listYourProperty, icon: Building2 },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About", href: routes.about, icon: FileText },
      { label: "Safety", href: routes.safety, icon: ShieldCheck },
      { label: "Contact", href: routes.contact, icon: Mail },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy", href: routes.privacy, icon: FileText },
      { label: "Terms", href: routes.terms, icon: ClipboardList },
    ],
  },
] as const satisfies readonly NavGroup[];

/** True when `pathname` is `href` or (unless `exact`) a page beneath it. */
export function isActivePath(
  pathname: string,
  href: string,
  exact = false,
): boolean {
  const target = href.split("?")[0] ?? href;
  if (target === "/" || exact) return pathname === target;
  return pathname === target || pathname.startsWith(`${target}/`);
}
