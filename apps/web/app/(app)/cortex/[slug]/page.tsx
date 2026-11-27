"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Eye, EyeOff } from "lucide-react";
import { useParams } from "next/navigation";
import { ConceptChips, FormulaBlock, PlainList } from "@/components/cortex/common";
import { JarvisMark } from "@/components/jarvis/mark";
import { useJarvisPanel } from "@/components/jarvis/panel";
import { SlashMark } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { asList, cortex, type Concept } from "@/lib/cortex";
import { DLink } from "@/lib/date";
import { fmtDateTimeET } from "@/lib/format";

function Block({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId}>
      <h2 className="mb-1.5 font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Record({ c }: { c: Concept }) {
  const { open } = useJarvisPanel();
  const paragraphs = c.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const responsibilities = asList(c.player_responsibilities);
  const responses = asList(c.common_responses);
  return (
    <article className="mx-auto max-w-[920px] space-y-6" data-testid="concept" data-slug={c.slug}>
      <header>
        <p className="text-xs text-muted">
          Department {c.department} · {c.department_name}
        </p>
        <h1 className="mt-1 flex items-start gap-2.5 font-display text-[30px] font-bold leading-8 text-ink md:text-[34px] md:leading-9">
          <SlashMark className="mt-1.5 h-5 w-7 md:h-6 md:w-8" />
          <span className="min-w-0 break-words">{c.title}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <ConceptChips c={c} />
          <span className="num text-xs text-muted">
            version {c.version}
            {c.updated_at ? ` · updated ${fmtDateTimeET(c.updated_at)}` : ""}
          </span>
        </div>
        <p className="mt-3 break-words text-lg leading-7 text-ink" data-testid="concept-summary">{c.summary}</p>
        <button
          type="button"
          onClick={() => open({ page: `/cortex/${c.slug}` }, `Explain ${c.title} and how it applies to tonight's slate`)}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-bg2 px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-line md:min-h-0 md:h-8 md:text-xs"
          data-testid="ask-jarvis-concept"
        >
          <JarvisMark className="h-4 w-4" />
          Ask JARVIS about this
        </button>
      </header>

      <section className="space-y-3" data-testid="concept-body">
        {paragraphs.map((p, i) => (
          <p key={i} className="break-words text-base leading-7 text-soft">{p}</p>
        ))}
      </section>

      {c.formula && (
        <Block title="Formula">
          <FormulaBlock formula={c.formula} />
        </Block>
      )}
      {c.season_note && (
        <p className="border-l-2 border-line py-1 pl-3 text-sm text-soft" data-testid="season-note">
          <span className="font-semibold text-ink">Season note. </span>
          {c.season_note}
        </p>
      )}

      {responsibilities.length > 0 && (
        <Block title="Player responsibilities" testId="concept-responsibilities">
          {responsibilities.length === 1 ? <p className="break-words text-sm leading-6 text-soft">{responsibilities[0]}</p> : <PlainList items={responsibilities} />}
        </Block>
      )}
      {responses.length > 0 && (
        <Block title="Common responses" testId="concept-responses">
          {responses.length === 1 ? <p className="break-words text-sm leading-6 text-soft">{responses[0]}</p> : <PlainList items={responses} />}
        </Block>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="blk p-4" data-testid="concept-limitations">
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">Limitations</h2>
          {c.limitations.length ? <PlainList items={c.limitations} tone="warn" /> : <p className="text-sm text-muted">None recorded.</p>}
        </section>
        <section className="blk p-4" data-testid="concept-when-not">
          <h2 className="mb-2 font-display text-lg font-semibold text-ink">When not to use</h2>
          {c.when_not_to_use ? <p className="break-words text-sm leading-6 text-soft">{c.when_not_to_use}</p> : <p className="text-sm text-muted">None recorded.</p>}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2" data-testid="concept-data">
        <section className="border-t-2 border-ink pt-3" data-testid="concept-observable">
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Eye className="h-[18px] w-[18px] text-accent" aria-hidden /> What our data can show
          </h2>
          {c.observable_in_our_data.length ? <PlainList items={c.observable_in_our_data} /> : <p className="text-sm text-muted">Nothing is listed: our data shows nothing for this topic.</p>}
        </section>
        <section className="border-t-2 border-warn pt-3" data-testid="concept-gaps">
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <EyeOff className="h-[18px] w-[18px] text-warn" aria-hidden /> What we cannot see
          </h2>
          {c.data_gaps.length ? <PlainList items={c.data_gaps} tone="warn" /> : <p className="text-sm text-muted">No gap is listed for this record.</p>}
        </section>
      </div>

      {c.evaluation_questions.length > 0 && (
        <Block title="Evaluation questions" testId="concept-questions">
          <PlainList items={c.evaluation_questions} />
        </Block>
      )}

      {c.related.length > 0 && (
        <Block title="Related records" testId="concept-related">
          <ul className="flex flex-wrap gap-2">
            {c.related.map((r) => (
              <li key={r.slug}>
                <DLink href={`/cortex/${encodeURIComponent(r.slug)}`} className="inline-flex min-h-[44px] items-center rounded-md bg-raised/60 px-3 text-sm font-medium text-ink hover:bg-raised md:min-h-0 md:h-8">
                  {r.title}
                </DLink>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Sources" testId="concept-sources">
        {c.sources.length === 0 ? (
          <p className="text-sm text-soft" data-testid="concept-no-sources">No source is cited for this record.</p>
        ) : (
          <ul className="divide-y divide-line blk">
            {c.sources.map((s) => (
              <li key={s.key} className="px-4 py-3" data-testid="concept-source">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 break-words text-sm font-semibold text-ink hover:link">
                    <span className="min-w-0 break-words">{s.title}</span>
                    <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted" aria-hidden />
                  </a>
                ) : (
                  <span className="text-sm font-semibold text-ink">{s.title}</span>
                )}
                {s.note && <p className="mt-0.5 break-words text-sm text-soft">{s.note}</p>}
              </li>
            ))}
          </ul>
        )}
        {c.verification !== "checked_against_source" && <p className="mt-2 text-xs font-medium text-warn" data-testid="concept-unchecked-note">This record was authored without being checked against a source.</p>}
      </Block>
    </article>
  );
}

export default function ConceptPage() {
  const { slug: raw } = useParams<{ slug: string }>();
  const slug = decodeURIComponent(raw);
  const q = useQuery({ queryKey: ["cortex", "concept", slug], queryFn: () => cortex.concept(slug), retry: false });
  return (
    <div className="space-y-9">
      <DLink href="/cortex?tab=encyclopedia" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium link md:min-h-0" data-testid="concept-back">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Encyclopedia
      </DLink>
      {q.isPending ? (
        <>
          <h1 className="sr-only">Knowledge record</h1>
          <LoadingState rows={8} />
        </>
      ) : q.isError && q.error instanceof ApiError && q.error.status === 404 ? (
        <>
          <h1 className="sr-only">Knowledge record</h1>
          <div data-testid="concept-missing">
            <EmptyState title="This knowledge record does not exist.">{q.error.message} It may have been renamed; search the Encyclopedia for it.</EmptyState>
          </div>
        </>
      ) : q.isError ? (
        <>
          <h1 className="sr-only">Knowledge record</h1>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </>
      ) : (
        <Record c={q.data} />
      )}
    </div>
  );
}
