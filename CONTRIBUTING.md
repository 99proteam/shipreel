# Contributing to shipreel

Thanks for helping! Bug reports, new changelog formats, templates, docs and ideas are all welcome.

## Development setup

```bash
git clone https://github.com/99proteam/shipreel.git
cd shipreel
npm install
npx playwright install chromium   # once, for rendering

npm run lint        # eslint
npm run typecheck   # tsc --noEmit (strict)
npm test            # unit tests (vitest)
npm run test:e2e    # renders real videos and checks them with ffprobe
npm run build       # tsup -> dist/
npm run sample      # render a sample video from tests/fixtures into ./videos
```

Try your changes against any changelog:

```bash
npm run build
node dist/cli.js --changelog path/to/CHANGELOG.md --dry-run   # highlights + timing as JSON
node dist/cli.js preview --changelog path/to/CHANGELOG.md     # interactive preview
```

## Project layout

```
src/
  parse/changelog.ts   markdown → releases → items (Keep a Changelog, conventional, changesets, GitHub bodies)
  select.ts            cleanup (links, hashes, mentions) and highlight selection
  config.ts            shipreel.config.json / package.json loading and validation
  timing.ts            scene durations in whole frames
  plan.ts              release + config → VideoPlan
  render/              templates, scene documents, Chromium frame capture, ffmpeg encoding
  server.ts            local server for scenes, template assets and the preview UI
  preview/             preview UI
  action/main.ts       GitHub Action entry point
  cli.ts               CLI
templates/             built-in templates (minimal, terminal, bold)
tests/                 unit tests, fixtures and the e2e render test
```

## Adding a changelog format

1. Add a real-world sample (shortened) to `tests/fixtures/`.
2. Add expectations to `tests/parse.test.ts` and, if the bullets need cleanup, `tests/select.test.ts`.
3. Make them pass in `src/parse/changelog.ts` / `src/select.ts`.

## Contributing a template

Templates are folders of HTML + CSS. Read [docs/templates.md](docs/templates.md) first.

1. Build it as a custom template and iterate with `npx shipreel preview --template ./my-template`.
2. Make sure it works at **all three sizes**, with short and long project names, 1–5 highlights, long highlight text, and with or without a logo.
3. Only use local assets and Google Fonts. Animate only with CSS animations / Web Animations (no timers or `requestAnimationFrame`).
4. Move it to `templates/<name>/`, add the name to `BUILTIN_TEMPLATES` in `src/render/template.ts`, and add a screenshot shot to `scripts/gallery.mjs`.
5. Open a PR with a short screen recording or the rendered MP4 (the CI e2e job also uploads a sample video artifact).

Not every template needs to be built in. Sharing yours in a repo and linking it in an issue or discussion is great too.

## Pull requests

- Keep PRs focused. Add or update tests for behavior changes.
- `npm run lint && npm run typecheck && npm test` must pass.
- Add a line to `CHANGELOG.md` under **Unreleased**.

## Releasing (maintainers)

1. Move the **Unreleased** entries in `CHANGELOG.md` to a new version and commit.
2. Create a GitHub release `vX.Y.Z` with notes.
3. The release workflow publishes to npm (version taken from the tag), moves the `vX` tag for the Action, and attaches the announcement video rendered by shipreel itself.

## Code of conduct

Be kind and constructive. Harassment of any kind is not tolerated.
