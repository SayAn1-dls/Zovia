import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/features/account/components/native-select";

import { DIRECTORY_PATH, type DirectoryQuery } from "../directory";
import type { City } from "../schemas";

/**
 * City and availability filters as a plain GET form: it works before (and without) JavaScript and
 * keeps the directory server-rendered. Submitting resets to page 1.
 */
export function DirectoryFilters({ query, cities }: { query: DirectoryQuery; cities: City[] }) {
  const filtered = query.city !== null || query.available !== null;
  return (
    <form
      action={DIRECTORY_PATH}
      method="get"
      role="search"
      aria-label="Filter roommates"
      className="grid grid-cols-1 gap-3 rounded-3xl bg-card p-4 ring-1 ring-border sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5"
    >
      <div className="min-w-0 space-y-1.5">
        <label htmlFor="directory-city" className="text-sm font-semibold">
          City
        </label>
        <NativeSelect id="directory-city" name="city" defaultValue={query.city ?? ""}>
          <option value="">All cities</option>
          {cities.map((city) => (
            <option key={city.slug} value={city.name}>
              {city.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="min-w-0 space-y-1.5">
        <label htmlFor="directory-available" className="text-sm font-semibold">
          Availability
        </label>
        <NativeSelect
          id="directory-available"
          name="available"
          defaultValue={query.available === null ? "" : query.available ? "yes" : "no"}
        >
          <option value="">Everyone</option>
          <option value="yes">Available</option>
          <option value="no">Not available</option>
        </NativeSelect>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg">
          <SlidersHorizontal data-icon="inline-start" aria-hidden /> Apply
        </Button>
        {filtered ? (
          <Link href={DIRECTORY_PATH} className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
