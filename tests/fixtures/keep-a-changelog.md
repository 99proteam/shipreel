# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Experimental `<DataGrid>` virtualization behind a flag.

## [2.4.0] - 2026-09-30

### Added

- Command palette component with fuzzy search and keyboard navigation ([#812](https://github.com/acme/acme-ui/pull/812))
- `useToast()` hook with stacking, swipe-to-dismiss and promise helpers (#798)
- Dark mode tokens for every component, generated from a single brand color
  so themes stay consistent across products.
- RTL support for `Tabs`, `Menu` and `Breadcrumbs` by @lena-k

### Changed

- `Button` now forwards refs to the underlying element.
- Bumped minimum React version to 18.2.

### Fixed

- `Select` no longer closes when scrolling inside the dropdown on iOS Safari (#820)
- Focus ring is visible again in Firefox high contrast mode.
- `Tooltip` position is recalculated when the window is resized.
- Fixed memory leak in `Popover` when unmounted while open. (abc1234)
- `DatePicker` respects `minDate` when typing a date manually.
- Typo in `Dialog` aria label.

### Security

- Sanitize `href` in `Link` to prevent `javascript:` URLs.

## [2.3.1] - 2026-08-14

### Fixed

- `Checkbox` indeterminate state is announced by screen readers.

## [2.3.0] - 2026-07-02

### Added

- `Slider` component with range mode.

### Removed

- Deprecated `Modal` alias for `Dialog`.

[Unreleased]: https://github.com/acme/acme-ui/compare/v2.4.0...HEAD
[2.4.0]: https://github.com/acme/acme-ui/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/acme/acme-ui/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/acme/acme-ui/releases/tag/v2.3.0
