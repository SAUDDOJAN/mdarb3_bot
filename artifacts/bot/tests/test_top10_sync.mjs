process.env.DATABASE_URL = "postgresql://postgres.kngauevofizifippnokf:v%3F%26s2LH5eR%2FFm6T@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

import assert from "assert";

console.log("=== TESTING TOP 10 ACTIVE ROLE SYNC ===");

const { syncTop10ActiveRole, ACTIVE_TOP10_ROLE_ID } = await import("../src/modules/leveling.js");

assert.strictEqual(ACTIVE_TOP10_ROLE_ID, "1564911366761087006");
console.log("✔ Role ID verified:", ACTIVE_TOP10_ROLE_ID);

// Dry-run with mock guild
let addedRoles = [];
let removedRoles = [];

const mockRole = {
  id: ACTIVE_TOP10_ROLE_ID,
  members: new Map([
    ["old_user_1", { user: { tag: "OldUser#1" }, roles: { remove: async (r) => { removedRoles.push({ user: "old_user_1", role: r }); } } }]
  ])
};

const mockGuild = {
  id: "861355983975874601",
  roles: {
    cache: new Map([[ACTIVE_TOP10_ROLE_ID, mockRole]]),
    fetch: async () => mockRole
  },
  members: {
    fetch: async () => {},
    cache: new Map([
      ["388733258638295040", { user: { tag: "xk1kx#0001" }, roles: { cache: new Map(), add: async (r) => { addedRoles.push({ user: "388733258638295040", role: r }); } } }]
    ])
  }
};

await syncTop10ActiveRole(mockGuild);

console.log("Removed roles count:", removedRoles.length);
console.log("Added roles count:", addedRoles.length);

assert.ok(removedRoles.some(x => x.user === "old_user_1"), "Expected old_user_1 to be removed from Top 10");
assert.ok(addedRoles.some(x => x.user === "388733258638295040"), "Expected xk1kx to be added to Top 10");

console.log("\nALL TOP 10 SYNC UNIT TESTS PASSED! 🎯");
process.exit(0);
