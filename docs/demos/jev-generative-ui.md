# Jev generative UI: aquarium school-trip demo

**[Watch the 83-second live Jev web recording](../../assets/demos/2026-09-23/jev-live-web.mp4)**

[![Live Jev reranks the aquarium exhibits in Hive](../../assets/demos/2026-09-23/jev-live-web.png)](../../assets/demos/2026-09-23/jev-live-web.mp4)

The live recording calls TypeSafe Jev for each clarification and comparison decision, visibly labeled `Live Jev · model decisions` in the cards. A scripted agent (CopilotKit AI Mock, which is no longer in the repository) supplied the conversation steps, while Hive ran its normal mailbox, real browser worker, and `present_choices` tool. The mailbox is a fictional local Lincoln Middle School sample. The live comparison details are excerpts of the public aquarium pages read during that turn; Jev decides whether to show the agent's prepared cards and ranks those candidates. The revised hands-on preference moves Rocky Shore to first place in this recorded run.

For a TypeSafe-key-free recording, [watch the 81-second scripted sample](../../assets/demos/2026-09-23/jev-web.mp4). Its cards are labeled `Sample · scripted decisions`; it does not make a live Jev call.

The cards now come from Hive's agent, [OpenCode](../../README.md#configure-the-agent-and-google): `present_choices` is one of the Hive tools it is offered. The recordings show the cards and how they behave, not how a model drives them; with a real model the order of steps and the wording are the model's.

## Try it

You need the agent set up as in [Configure the agent](../../README.md#configure-the-agent-and-google) (`opencode serve` with a model), and the [browser worker](../../README.md#browser-worker) for the exhibit pages. The cards are off by default. Turn them on in the API's environment:

```sh
JEV_MODE=sample   # a scripted scorer: no TypeSafe key, and nothing leaves your machine
JEV_MODE=live     # Jev decides: needs TYPESAFE_API_KEY, kept on the server (see below)
```

Start the API and the app as usual (`pnpm dev`, `pnpm dev:web`). The sample workspace has the fictional school mailbox. In the main chat, mention the agent and follow a sequence like this:

1. Send **@hive Help me get ready for the aquarium trip**. The agent searches the fictional local mailbox, reads the matching thread, and can offer **Complete permission slip**, **Review trip details**, and **Explore exhibits**.
2. Choose **Explore exhibits**. A card pick needs no @hive: it answers the agent's own question. The agent reads the aquarium's Kelp Forest, Open Sea, and Rocky Shore pages with the browser tool, and three sourced comparison cards can appear.
3. Send **@hive Something hands-on**. In sample mode the scorer puts Rocky Shore first because its official page describes a bat-ray touch pool.
4. Choose **Rocky Shore**. The agent acknowledges the preference and can offer to continue planning; no booking, send, or other external action occurs.
5. Reload the page and confirm the historical cards and final choice remain visible. Earlier choice controls should be disabled: saying anything new makes the cards before it stale, whether or not the message mentions the agent.

In `live` mode a sourced comparison is only shown for pages the agent read in that same turn with the browser tool (`browse_web`), and only if their text supports each label, source title, and detail. If the aquarium site or browser worker fails, the agent cannot present a comparison. Public site availability and content can change, and live Jev may choose an ordinary agent response, so the exact card sequence is not guaranteed.

For a recording, show the `Sample · scripted decisions` caption, email card, clarification controls, inline browser progress, all three source links, changed hands-on ordering, and selection acknowledgement. Aim for 60–90 seconds. Verify the visible source pages still support each claim before publishing a new capture. The existing [demo recording guide](../DEMO.md#record-your-own-demo) covers web and simulator capture.

## What the recordings show

The school, sender, recipient, message, and permission-slip document are fictional local workspace data in `apps/server/src/workspace.ts`. The scripted agent in the recordings supplied candidate text that was checked against Monterey Bay Aquarium's own pages on 2026-09-23:

| Candidate | Supported detail | Official source |
| --- | --- | --- |
| Kelp Forest | 28-foot kelp exhibit with sardines and leopard sharks | [Kelp Forest](https://www.montereybayaquarium.org/visit/exhibits/kelp-forest/) |
| Open Sea | Sea turtles, sardines, and tuna at a 90-foot viewing window | [Open Sea](https://www.montereybayaquarium.org/visit/exhibits/open-sea/) |
| Rocky Shore | Bat-ray touch pool | [Rocky Shore](https://www.montereybayaquarium.org/visit/exhibits/rocky-shore) |

A sample recording must not be presented as evidence that live Jev was called.

## What live mode sends to TypeSafe

With `JEV_MODE=live`, each `present_choices` call makes one request from the API server to the TypeSafe System One endpoint, retried once after a timeout, rate limit or server error. Sample mode and `JEV_MODE=off` send nothing. The request contains:

- `userMessage`: the person's latest chat message without the @hive mention, or the server-written continuation after they pick a choice.
- `agentSummary` and `context`: text the agent writes. It can quote email or other private workspace data the agent read during the turn.
- `selectedId`: the option already chosen, if any.
- `options`: every candidate's ID, label, details, and source titles and URLs.
- The question text and the model name, plus `TYPESAFE_API_KEY` as the bearer token.

Hive does not send page text, mail threads, files, or OAuth tokens beyond what the agent put in `context` or the options. Jev returns only a choice between showing the prepared cards or answering in prose, and one fit score per option. It cannot approve, send, book, or run anything. Selections still go through Hive's own checks, and external actions still require a recorded approval. On failure the server logs only the HTTP status and TypeSafe request ID, never the request body. TypeSafe's own terms apply to the data it receives; see its [data handling notes](https://docs.typesafe.ai/models#data-handling).
