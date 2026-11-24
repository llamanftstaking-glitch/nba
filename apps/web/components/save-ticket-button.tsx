"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type SaveTicketBody } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** Saves a virtual-unit paper ticket. No real-money action exists anywhere in this app. */
export function SaveTicketButton({ body, disabled, size = "sm" }: { body: SaveTicketBody; disabled?: boolean; size?: "sm" | "md" }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.saveTicket(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tickets"] });
      void qc.invalidateQueries({ queryKey: ["exposure"] });
      void qc.invalidateQueries({ queryKey: ["results"] });
    },
  });
  const errorText =
    m.error instanceof ApiError
      ? m.error.status === 409
        ? `Not saved: ${m.error.message}`
        : `Save failed: ${m.error.message}`
      : m.error
        ? "Save failed."
        : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid="save-ticket">
      <Button size={size} variant="outline" disabled={disabled || m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? "Saving…" : "Save to paper ledger"}
      </Button>
      {m.isSuccess && (
        <span role="status" className="num text-xs text-accent" data-testid="save-ticket-ok">
          Saved as paper ticket #{m.data.id}
        </span>
      )}
      {errorText && (
        <span role="alert" className="text-xs text-bad">
          {errorText}
        </span>
      )}
    </span>
  );
}
