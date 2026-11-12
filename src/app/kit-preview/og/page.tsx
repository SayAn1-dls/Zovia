// TEMPORARY: source for the static Open Graph PNG (screenshotted at 1200x630 with the real fonts).
import { Logo } from "@/components/brand/logo";
export default function Page() {
  return (
    <div id="og" className="fixed inset-0 z-50 flex h-[630px] w-[1200px] flex-col justify-between bg-paper p-[72px] text-ink">
      <Logo size="lg" />
      <p className="font-heading text-[92px] leading-[1.14] font-extrabold tracking-[-0.035em]">
        Find your space.
        <br />
        Find your <span className="mark-lime">people.</span>
      </p>
      <div className="h-0.5 bg-ink" />
    </div>
  );
}
