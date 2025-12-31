// Minimal theme preview cache module (stub) to satisfy build-time imports.
// It exposes the same runtime API used by renderer.js as a fallback.
window.themePreviewCache = {
  getCachedPreviewData: function() {
    return null;
  },
  preloadThemePreviews: async function(themes) {
    return new Map();
  }
};

export default window.themePreviewCache;


