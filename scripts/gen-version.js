// Writes public/version.json with the current git commit so the running site
// can display which build it is. Runs at build time on Vercel (where
// VERCEL_GIT_COMMIT_SHA is provided) and locally via `npm start` / `npm run build`.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function git(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch (_) {
    return null;
  }
}

const sha = process.env.VERCEL_GIT_COMMIT_SHA || git("git rev-parse HEAD");
const ref = process.env.VERCEL_GIT_COMMIT_REF || git("git rev-parse --abbrev-ref HEAD") || "";

const version = {
  commit: sha ? sha.slice(0, 7) : "unknown",
  ref,
  builtAt: new Date().toISOString(),
};

const dest = path.join(__dirname, "..", "public", "version.json");
fs.writeFileSync(dest, JSON.stringify(version, null, 2) + "\n");
console.log("gen-version:", JSON.stringify(version));
