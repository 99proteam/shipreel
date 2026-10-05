# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [3.2.0](https://github.com/fastq/fastq/compare/v3.1.2...v3.2.0) (2026-09-12)


### Features

* **cli:** add `--watch` mode that re-runs jobs on file changes ([#341](https://github.com/fastq/fastq/issues/341)) ([4f2a9c1](https://github.com/fastq/fastq/commit/4f2a9c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a3f))
* **queue:** support priority lanes with weighted fair scheduling ([9b8c7d6](https://github.com/fastq/fastq/commit/9b8c7d6))
* **workers:** graceful shutdown waits for in-flight jobs, closes [#330](https://github.com/fastq/fastq/issues/330) ([e1f2a3b](https://github.com/fastq/fastq/commit/e1f2a3b))


### Bug Fixes

* **queue:** do not drop jobs when Redis reconnects ([#345](https://github.com/fastq/fastq/issues/345)) ([7c6b5a4](https://github.com/fastq/fastq/commit/7c6b5a4))
* **cli:** exit with code 1 on invalid config ([a1b2c3d](https://github.com/fastq/fastq/commit/a1b2c3d))
* correct retry backoff jitter calculation ([0f9e8d7](https://github.com/fastq/fastq/commit/0f9e8d7))


### Performance Improvements

* **queue:** batch acknowledgements to cut Redis round-trips by 60% ([5e4d3c2](https://github.com/fastq/fastq/commit/5e4d3c2))

### [3.1.2](https://github.com/fastq/fastq/compare/v3.1.1...v3.1.2) (2026-08-20)


### Bug Fixes

* **workers:** handle SIGTERM on Windows ([c3d4e5f](https://github.com/fastq/fastq/commit/c3d4e5f))

# [3.0.0](https://github.com/fastq/fastq/compare/v2.9.0...v3.0.0) (2026-06-01)


### Features

* drop Node 16 support ([b2c3d4e](https://github.com/fastq/fastq/commit/b2c3d4e))


### BREAKING CHANGES

* Node 18 or newer is now required.
