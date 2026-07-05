# Contributing

This repo is a **curated map**, not a link dump. Its only value is that every entry is worth your time. That means the bar is high and **most submissions are refined or declined, not merged as-is** — please don't take it personally, it's the whole point.

There are three ways to help:

1. **Suggest a resource** for an existing section.
2. **Improve a reference implementation** (or propose a new one).
3. **Propose a new section** (rare — the stack is deliberately small).

The fastest path is opening an **[Add a resource](https://github.com/TheSeydiCharyyev/build-your-own-agent/issues/new?template=add-a-resource.yml)** issue. PRs that edit `README.md` directly are welcome too.

---

## Inclusion criteria for links

A resource gets in only if it clears **all** of these:

- **From scratch.** It builds the concept by hand — you could reimplement it after reading. A framework quickstart ("`pip install langchain`, call `.run()`") does **not** qualify.
- **Freely accessible.** No paywall, no "sign up to read the rest," no gated PDF.
- **On-topic and resolving.** The link works today and actually teaches *that section's* component.
- **High quality and reasonably current.** Agent-era (prefer 2024+) unless it's a genuine classic. Credible author or repo.
- **Adds something.** If a section already has three strong picks, a fourth must be *better* than one of them — say which it replaces and why. Quality over count.

### What gets declined

- Framework/SDK quickstarts and "getting started" docs.
- Product pages, launch posts, or marketing dressed as a tutorial.
- Paywalled or sign-up-walled content.
- SEO filler and "top 10 AI agent tools" listicles.
- A near-duplicate of an existing pick that isn't clearly better.
- Dead links or content that has drifted off-topic.

## Format

Each entry is one line, exactly:

```
- [Title](https://url) — Author · one-line reason it's the best from-scratch pick.
```

Keep the reason terse and concrete — what it builds by hand that others don't. Aim for **at most 3 entries per section.**

## Reference implementations

The `reference/NN-*/` directories hold original, minimal code for the components where no good from-scratch resource exists. If you contribute one, it must:

- **Run with `node <file>.mjs`** and print something meaningful.
- Be **dependency-free** (Node built-ins only) unless there's a strong reason.
- **Teach by hand** — readable top-to-bottom, comments explain the *why*, not the syntax.
- Ship its own short `README.md` (what it teaches · how to run · how to wire a real provider).
- Match the style of the existing `reference/` folders.

If a section is well-covered by external tutorials, it does **not** need our own implementation — a curated link is the right answer.

## Submitting

- **Issue:** use the [Add a resource](https://github.com/TheSeydiCharyyev/build-your-own-agent/issues/new?template=add-a-resource.yml) form. Best for a single link.
- **PR:** keep it small — one section, or one reference implementation, per PR. Edit `README.md` (and add a `reference/` folder if relevant). No need to touch unrelated sections.

The maintainer curates the final wording and ordering. If your link is solid but the blurb changes, that's normal.

## Tone

Be direct and kind. Facts over praise. We're building something people can trust — that's worth being picky about.
