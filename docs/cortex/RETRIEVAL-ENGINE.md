# CORTEX — retrieval engine

## What runs today
PostgreSQL full-text search over each record's title, slug, summary, body, formula, limitations and department name
(`cortex.search`, GIN index on `to_tsvector('english', search_text)`).
1. Strict pass: every meaningful word must match (`websearch_to_tsquery`).
2. If nothing matches: any word may match, and weak stray-word matches are dropped.
3. Ranking: text rank, plus a boost when the query appears in the title or slug, plus a smaller boost per query word in the title.
4. Filler words and bare numbers are removed from the query first, so a full question works as a query.
5. Filters: department, kind. Results are short records; the full record is fetched by slug.
6. Every search is logged (`cortex_retrieval_log`: query, filters, returned slugs, method, duration, caller).

JARVIS retrieves only what it asks for; the library is never placed in the prompt. Current information (injuries,
lineups, live scores) comes from the data tools, never from the library, so a knowledge record cannot override a
current verified record. Library records describe general basketball and carry a ruleset and season note where rules apply.

## How retrieval is evaluated
`gizer cortex-eval` (free, no model): for every benchmark question that names an expected record, is one of them in
the top five results for the question text? Results are stored as a benchmark run and shown under Evaluations.

## Embeddings: evaluated, not adopted
| Option | Finding |
|---|---|
| Local embedding model on Server M | Not practical now: the server has 3.8 GB shared with other projects and runs in swap. A small sentence-embedding model needs roughly 0.5 to 1 GB resident plus a new dependency stack. Revisit after memory is freed. |
| pgvector | The current database image (`postgres:16.6-alpine`) does not include the extension; adopting it means changing the database image, which is an infrastructure change needing owner approval and a backup first. |
| External embedding API | Anthropic does not offer one. Any other provider is a new paid service and a new place our text is sent: needs owner approval with cost and data-handling reviewed. |
| Keyword search (adopted) | No cost, no new infrastructure, adequate for a few hundred curated records with distinctive titles. Its weakness is paraphrase ("big man sags back" will not find "drop coverage" unless the record says so). |

The search function is the only place that would change: tools and API are independent of the method.
