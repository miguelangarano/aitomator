# Releasing AItomator

The workflow at `.github/workflows/publish.yml` supports two release paths.

## Release branch

Set the version in `package.json`, create or update a branch whose name starts with `release/`, and push it:

```bash
npm version 0.2.0 --no-git-tag-version
bun install
git add package.json bun.lock
git commit -m "Release 0.2.0"
git push -u origin release/0.2.0
```

Every push to `release/**` runs validation and attempts to publish the version currently stored in `package.json`. npm versions are immutable, so another push with the same version fails before publishing.

## Manual release

Open **GitHub → Actions → Publish to npm → Run workflow**, select a ref, and enter the required semantic version. The workflow applies that version to the package inside the runner and publishes it. It does not commit the version change back to the repository.

You can also dispatch it with GitHub CLI:

```bash
gh workflow run publish.yml --ref main -f version=0.2.0
```

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

You can then publish through **Actions → Publish to npm → Run workflow** using a new version. npm authenticates through short-lived OIDC credentials and generates provenance automatically.
