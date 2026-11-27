"use client";

import { ArrowLeft } from "lucide-react";
import { useParams } from "next/navigation";
import { KalshiDetailLoader } from "@/components/kalshi";
import { textLink } from "@/components/ui/button";
import { DLink } from "@/lib/date";

export default function KalshiMarketPage() {
  const { ticker } = useParams<{ ticker: string }>();
  return (
    <div>
      <div className="mb-3">
        <DLink href="/kalshi-intelligence" className={textLink}>
          <ArrowLeft className="h-3 w-3" aria-hidden /> Kalshi market watch
        </DLink>
      </div>
      <h1 className="sr-only">Kalshi market detail</h1>
      <div className="mx-auto max-w-4xl blk p-4 md:p-6">
        <KalshiDetailLoader ticker={decodeURIComponent(ticker)} />
      </div>
    </div>
  );
}
