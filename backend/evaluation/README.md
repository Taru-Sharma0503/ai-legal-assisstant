# RAG citizen question bank

`question_bank.json` is a 225-case, statically reviewed evaluation bank built from the local `backend/data/services/` and `backend/data/legal/` documents and the current chunking/routing behavior. It is intended as input for a future offline or mocked evaluation harness; it is not a report that the live database or Qdrant collections passed these questions.

## Regenerate the JSON and PDF

From the repository root on Windows:

```powershell
node backend/scripts/generateRagQuestionBank.mjs
```

The script validates IDs, normalized duplicate questions, supported language labels, coverage labels, and local source-file references, then writes:

- `backend/evaluation/question_bank.json`
- `docs/rag-question-bank.pdf`

It uses installed Microsoft Edge or Chrome in headless print-to-PDF mode and the local Windows Unicode font stack (`Nirmala UI`/`Nirmala`). No npm package or network access is needed. If Chromium is installed outside its standard Windows location, set `EDGE_PATH` for that invocation, for example:

```powershell
$env:EDGE_PATH = 'D:\Apps\Chrome\Application\chrome.exe'
node backend/scripts/generateRagQuestionBank.mjs
```

The generator uses a temporary browser profile and HTML file under the OS temp directory and removes them after PDF creation.

## JSON fields

Each `test_cases[]` record has a stable `test_id`, exact `question`, `language` (`en`, `hi`, or `hinglish`), domain, category, expected routing, expected escalation, local source filenames and chunk topics, coverage (`supported`, `partially_supported`, or `unavailable`), expected behavior, pass criteria, and a validation rationale. Legal routes name `legal_rights_chunks`; certificate cases name their expected service ID. Follow-up records include their prior user question in `conversation_context`.

`expected_escalation.required` is `true` when the local corpus does not support the requested detail, `false` for a general question directly covered by a chunk, and `null` only when a missing conversational turn prevents a reliable expectation. These are evaluation expectations; runtime outcomes must be checked independently.

## Coverage and safety notes

- “Supported” means an authored chunk in the named local source covers the question, not that every language or runtime route has been integration-tested.
- “Partially supported” means answer only the supported part and explicitly clarify/escalate the missing or individual-case detail.
- “Unavailable” means the assistant must not invent an answer; it should clarify or escalate and avoid unrelated citations.
- The source files are the authority for the listed scope. The bank deliberately marks absent checklist, fee, processing-time, portal, eligibility, and case-specific details as gaps.
- Hindi and Hinglish questions test multilingual query behavior. The source chunks are often English; generation must preserve the supplied legal meaning and cite verified context.
- A detector-only spot check found two intentionally retained routing regressions: `BIRTH_02` was not recognized by the service regex, and `BNSS_01` was not recognized by the legal-topic detector. Their expected routes remain explicit so a future test can catch the behavior. This does not predict whether semantic retrieval would recover a service question; no full Qdrant/PostgreSQL run was made.
- No live Qdrant/PostgreSQL retrieval or Gemini/Groq generation was run to produce this artifact. A detector-only spot check is separate from a full RAG pass.
