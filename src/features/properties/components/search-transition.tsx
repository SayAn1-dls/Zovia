"use client";

import { createContext, type ReactNode, type TransitionStartFunction, useContext, useTransition } from "react";

type SearchTransition = { isPending: boolean; startTransition: TransitionStartFunction };

const SearchTransitionContext = createContext<SearchTransition | null>(null);

/**
 * Shares one transition between the filters (which change the URL) and the results (which dim
 * while the server renders the new page), so old results stay visible instead of a blank state.
 */
export function SearchTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return <SearchTransitionContext value={{ isPending, startTransition }}>{children}</SearchTransitionContext>;
}

export function useSearchTransition(): SearchTransition {
  const value = useContext(SearchTransitionContext);
  if (!value) throw new Error("useSearchTransition must be used inside SearchTransitionProvider");
  return value;
}
