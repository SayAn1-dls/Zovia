import { MAX_RESULT_CARDS, type AssistantPropertyCard } from "./schemas";

/**
 * Keeps only the ids a tool actually returned in this turn (in the model's order, without
 * duplicates, capped) and maps them to the database rows those tools saw. Anything else the
 * model names (made-up, mistyped or from an earlier turn) is dropped.
 */
export function selectPresentedCards(
  presentedIds: readonly string[],
  seen: ReadonlyMap<string, AssistantPropertyCard>,
  max: number = MAX_RESULT_CARDS,
): { cards: AssistantPropertyCard[]; dropped: string[] } {
  const cards: AssistantPropertyCard[] = [];
  const dropped: string[] = [];
  const used = new Set<string>();
  for (const raw of presentedIds) {
    const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!id || used.has(id)) continue;
    const card = seen.get(id);
    if (!card) {
      dropped.push(raw);
      continue;
    }
    used.add(id);
    if (cards.length < max) cards.push(card);
  }
  return { cards, dropped };
}
