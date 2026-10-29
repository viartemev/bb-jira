# Contributing

Bug reports and focused pull requests are welcome. For a bug, include the BB
version, Jira deployment type (Cloud or Data Center), reproduction steps, and
sanitized error output. Never include tokens, private ticket contents or logs
that contain credentials.

## Local development

Use Node.js 24 and a BB installation compatible with `package.json`.

```sh
npm ci --include=dev
npm run typecheck
npm test
bb plugin build
bb plugin install .
```

After installation, `bb plugin dev` rebuilds and reloads changes. The automated
tests use fake Jira responses; validate changes to Jira API behavior against
your deployment as well. Document which deployment and version you checked.

Keep credentials in BB secret settings, validate inputs at API boundaries,
keep agent output bounded, and use only public BB Plugin SDK interfaces.
Update README.md, PLUGIN_OVERVIEW.md and CHANGELOG.md when behavior changes.

GitHub Actions runs TypeScript checks and tests. The frontend/backend bundle
build is verified separately with the installed BB CLI before a release.
