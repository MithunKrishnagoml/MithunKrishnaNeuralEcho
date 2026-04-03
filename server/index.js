// Render runtime shim: service start command runs `node server/index.js` from repo root.
(async () => {
  await import('../backend/index.js');
})().catch((error) => {
  console.error('Failed to start backend from server shim:', error);
  process.exit(1);
});
