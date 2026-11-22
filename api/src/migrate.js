// Apply the schema without starting the server: npm run migrate
import { assertConfig } from "./config.js";
import { migrate, pool } from "./db.js";

assertConfig();
await migrate();
await pool.end();
console.log("Schema is up to date.");
