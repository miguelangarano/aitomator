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

## npm authentication

The workflow currently supports an npm automation token through the GitHub environment secret `NPM_TOKEN`. Create a GitHub environment named `npm`, optionally add required reviewers, then add `NPM_TOKEN` to that environment.

After the first package publication, the preferred setup is npm Trusted Publishing:

1. Open the `aitomator` package settings on npmjs.com.
2. Add a GitHub Actions trusted publisher for `miguelangarano/aitomator`.
3. Enter `publish.yml` as the workflow filename and `npm` as the environment.
4. Allow `npm publish`.
5. Remove the `NPM_TOKEN` environment secret. The workflow already grants `id-token: write` and uses a compatible npm CLI, so npm will authenticate through OIDC and generate provenance automatically.

The initial publication normally requires the token because trusted-publisher settings are attached to an existing npm package.
