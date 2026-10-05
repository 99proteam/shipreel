# Changelog

## [4.0.0](https://github.com/cloudkit/sdk-js/compare/v3.6.0...v4.0.0) (2026-10-01)


### ⚠ BREAKING CHANGES

* **auth:** remove deprecated `login()` in favor of `signIn()` ([#902](https://github.com/cloudkit/sdk-js/issues/902))

### Features

* **storage:** signed URLs with custom expiry ([#899](https://github.com/cloudkit/sdk-js/issues/899)) ([1a2b3c4](https://github.com/cloudkit/sdk-js/commit/1a2b3c4))
* **realtime:** automatic reconnection with exponential backoff and offline queue so clients never lose events when the network drops for a while ([#895](https://github.com/cloudkit/sdk-js/issues/895)) ([5d6e7f8](https://github.com/cloudkit/sdk-js/commit/5d6e7f8))


### Bug Fixes

* **auth:** refresh token race condition ([#901](https://github.com/cloudkit/sdk-js/issues/901)) ([9a8b7c6](https://github.com/cloudkit/sdk-js/commit/9a8b7c6))


### Documentation

* migration guide for v4 ([e5d4c3b](https://github.com/cloudkit/sdk-js/commit/e5d4c3b))
