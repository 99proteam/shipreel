# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- GitHub Action no longer fails at the Chromium cache step (`hashFiles` outside the workspace)

## [1.0.0] - 2026-10-05

### Added

- Turn release notes into a 15–30 second announcement video (MP4, H.264)
- GitHub Action that renders a video for every published release and attaches it to the release
- Parse GitHub release bodies, Keep a Changelog, conventional-changelog, release-please and changesets
- Smart highlight selection: features first, max 5, with PR links, hashes and mentions stripped
- Three built-in templates: minimal, terminal and bold
- Export landscape, square and vertical videos in one run
- Branding config: color, logo, Google Font, call to action and background music
- Custom templates made of plain HTML and CSS
- `shipreel preview` to scrub through scenes in the browser before rendering
- Typed library API

[Unreleased]: https://github.com/99proteam/shipreel/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/99proteam/shipreel/releases/tag/v1.0.0
