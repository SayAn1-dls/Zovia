/**
 * Page-level transition for public pages: a short fade and rise in CSS
 * (`animate-page-in`), which the reduced-motion rule in globals.css disables.
 */
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-page-in">{children}</div>;
}
