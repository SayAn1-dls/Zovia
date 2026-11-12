"use client";

import { useMutation } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";

import type { AssistantReply, ChatRequest } from "./schemas";

/** One assistant turn (POST /api/v1/assistant/chat). Not retried: each call spends quota. */
export function useAssistantChat() {
  return useMutation({
    mutationFn: (input: ChatRequest) =>
      apiFetch<AssistantReply>("/assistant/chat", { method: "POST", body: input }),
    retry: false,
  });
}
