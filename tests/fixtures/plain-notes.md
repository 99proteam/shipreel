Big one! This release focuses on speed and a brand new plugin API.

## ✨ Highlights

- **Plugin API**: extend the bundler with `onResolve` and `onLoad` hooks
- Incremental rebuilds are now up to 4x faster on large monorepos — thanks @devon!
- New `--analyze` flag prints a treemap of your bundle

## 🐛 Fixes

- Source maps point to the right line after minification (fixes #77)
- Windows paths with spaces work again

## 📦 Dependencies

- Bump esbuild to 0.24
