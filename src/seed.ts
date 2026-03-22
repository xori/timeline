import { createTimeline, createUser } from "./db";
import { randomUUIDv7 } from "bun";

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f39c12", "#1abc9c", "#e67e22", "#e91e63"];

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: bun src/seed.ts <timeline-name> <user1> [user2] ...");
  process.exit(1);
}

const [timelineName, ...userNames] = args;

const viewToken = randomUUIDv7();
const timeline = createTimeline(timelineName, viewToken);

console.log(`\nTimeline: ${timelineName}`);
console.log(`View URL: /t/${viewToken}\n`);

userNames.forEach((name, i) => {
  const postToken = randomUUIDv7();
  createUser(timeline.id, name, postToken, COLORS[i % COLORS.length]);
  console.log(`${name}: /p/${postToken}`);
});

console.log("");
