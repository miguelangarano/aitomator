# Releasing AItomator

The workflow at `.github/workflows/publish.yml` publishes only after a pull request from a `release/*` branch is merged into `main`.

## Release branch

Create a branch whose name starts with `release/`, set the version in `package.json`, and push it:

```bash
npm version 0.2.0 --no-git-tag-version
bun install
git add package.json bun.lock
git commit -m "Release 0.2.0"
git push -u origin release/0.2.0
```

Open a pull request against `main` and merge it after review:

```bash
gh pr create --base main --head release/0.2.0 --title "Release 0.2.0"
```

Closing the pull request without merging, merging a branch that does not start with `release/`, and pushing directly to either `main` or a release branch do not publish. npm versions are immutable, so the workflow rejects a version that is already published.

## npm Trusted Publishing

The workflow is OIDC-only. It does not use or accept a long-lived `NPM_TOKEN`. It grants `id-token: write`, runs on a GitHub-hosted runner, and uses an OIDC-capable npm CLI.

### Configure the trusted publisher

1. Open the `aitomator` package settings on npmjs.com.
2. Add a **GitHub Actions** trusted publisher.
3. Set organization or user to `miguelangarano`.
4. Set repository to `aitomator`.
5. Set workflow filename to `publish.yml` (filename only).
6. Set environment to `npm`.
7. Allow `npm publish`.

In the GitHub repository, create an environment named `npm`. No npm secret is required. You may add required reviewers to make production releases require approval.

Merging a release pull request then publishes through short-lived OIDC credentials and generates provenance automatically.
