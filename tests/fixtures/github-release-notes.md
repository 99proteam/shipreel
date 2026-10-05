## What's Changed
### 🚀 Features
* feat: add S3-compatible storage adapter by @marta-dev in https://github.com/octo/uploadr/pull/221
* feat(api)!: rename `upload()` options to camelCase by @jkim in https://github.com/octo/uploadr/pull/230
* Resumable uploads for files larger than 5 GB with automatic chunk retry by @marta-dev in https://github.com/octo/uploadr/pull/226
### 🐛 Bug Fixes
* fix: progress events firing twice on Safari by @ana in https://github.com/octo/uploadr/pull/224
* fix: abort signal ignored during multipart init by @jkim in https://github.com/octo/uploadr/pull/228
### Other Changes
* chore(deps): bump vite from 5.2.0 to 5.4.1 by @dependabot[bot] in https://github.com/octo/uploadr/pull/225
* docs: document retry options by @ana in https://github.com/octo/uploadr/pull/229

## New Contributors
* @ana made their first contribution in https://github.com/octo/uploadr/pull/224

**Full Changelog**: https://github.com/octo/uploadr/compare/v1.7.0...v1.8.0
