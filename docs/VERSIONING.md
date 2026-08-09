# Versioning

SINAMGPT uses **semantic versioning**: `MAJOR.MINOR.PATCH`.

| Change type | Bump | Example |
|-------------|------|---------|
| Breaking change for users/admins | **MAJOR** | `1.0.0` → `2.0.0` |
| New feature, backward compatible | **MINOR** | `1.0.0` → `1.1.0` |
| Bug fix or small docs/chore | **PATCH** | `1.0.0` → `1.0.1` |

## Source of truth

| File | Role |
|------|------|
| `package.json` → `version` | App version string |
| `CHANGELOG.md` | Human-readable release notes |
| Git tag `vX.Y.Z` | Immutable release marker on GitHub |

Keep `package.json`, `package-lock.json` (root `version`), README **Current version**, and the latest changelog section in sync.

**Current release:** `1.2.0` (see [CHANGELOG.md](../CHANGELOG.md)).

## Release checklist

1. Move items from **Unreleased** into a new `## [X.Y.Z] — YYYY-MM-DD` section in `CHANGELOG.md`.
2. Set `"version": "X.Y.Z"` in `package.json` (and root entry in `package-lock.json`).
3. Update README **Current version** and any roadmap “shipped in” notes if needed.
4. Commit: `chore(release): vX.Y.Z`
5. Tag: `git tag -a vX.Y.Z -m "SINAMGPT vX.Y.Z"`
6. Push: `git push origin main --tags`

## Changelog style

- Group under **Added**, **Changed**, **Fixed**, **Security**, **Removed** as needed.
- Write for operators and admins, not only developers.
- Link compare URLs at the bottom of `CHANGELOG.md` when tags exist.
