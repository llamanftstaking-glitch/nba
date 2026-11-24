export const DISCLAIMER = "Research and paper testing only. No outcome is guaranteed. No real-money execution.";

export function DisclaimerText({ className }: { className?: string }) {
  return (
    <p className={className} data-testid="disclaimer">
      {DISCLAIMER}
    </p>
  );
}
