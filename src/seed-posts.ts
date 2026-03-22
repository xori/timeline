import db, { createPost } from "./db";

const args = process.argv.slice(2);
const count = Number(args[0]) || 120;

// Get all users for the most recent timeline
const timeline = db.query("SELECT * FROM timelines ORDER BY id DESC LIMIT 1").get() as any;
if (!timeline) {
  console.error("No timelines found. Run seed.ts first.");
  process.exit(1);
}

const users = db.query("SELECT * FROM users WHERE timeline_id = ?").all(timeline.id) as any[];
if (users.length === 0) {
  console.error("No users found.");
  process.exit(1);
}

const bodies = [
  "Just got back from the most amazing hike! The views were unreal.",
  "Has anyone tried that new coffee place on 5th? Highly recommend the cold brew.",
  "Finally finished reading that book everyone's been talking about. It lived up to the hype.",
  "Working from home today. The cat keeps walking across my keyboard.",
  "Made homemade pasta for the first time. It was easier than I expected!",
  "The sunset tonight was absolutely beautiful. Wish I had my camera.",
  "Anyone else feel like this week has been about 3 weeks long?",
  "Just deployed a huge update to production. Fingers crossed!",
  "Took the kids to the park today. They found the muddiest puddle possible, of course.",
  "Trying to learn guitar. My fingers are not happy with me right now.",
  "Movie night! Any recommendations? We're in the mood for something funny.",
  "The traffic today was unbelievable. What should be a 20 minute drive took over an hour.",
  "Started a new workout routine this morning. Feeling motivated!",
  "Can't believe it's already March. Where did the first few months go?",
  "Had the best tacos I've ever eaten for lunch today.",
  "Power went out for 3 hours. Rediscovered the joy of board games.",
  "Just saw the funniest dog at the dog park. It was wearing tiny boots.",
  "Spent the whole afternoon debugging one missing semicolon. Classic.",
  "Planning a road trip for next month. Suggestions for stops along the coast?",
  "The cherry blossoms are starting to bloom! Spring is finally here.",
  "Tried a new recipe and somehow made it actually taste good on the first try.",
  "Rainy day = perfect excuse to stay in and binge watch that show.",
  "Volunteered at the food bank today. Really rewarding experience.",
  "My neighbor's kid is learning drums. Pray for me.",
  "Found an old photo album while cleaning. So many memories!",
  "The garden is really coming along this year. Tomatoes are looking great.",
  "Just finished a 5K! Not my best time but I finished and that's what counts.",
  "Anyone know a good plumber? Asking for... my very wet kitchen floor.",
  "Team lunch today was so good. Love working with this crew.",
  "Late night coding session. The code is flowing tonight.",
  "Saw a double rainbow on my way to work. Had to pull over to take a pic.",
  "First camping trip of the season! The stars out here are incredible.",
  "Accidentally made way too much chili. Anyone want some?",
  "The new album from that band is an absolute banger. On repeat all day.",
  "Teaching my grandma how to video call. She's doing great!",
  "Pulled an all-nighter to meet the deadline. Time for a very long nap.",
  "Beach day! The water is still freezing but we're here for it.",
  "Just adopted a rescue dog. She's already taken over the couch.",
  "The farmer's market had the best peaches I've ever tasted.",
  "Rearranged the living room today. It feels like a whole new space.",
];

// Generate posts with staggered timestamps
const baseDate = new Date("2026-03-01T10:00:00Z");

for (let i = 0; i < count; i++) {
  const user = users[i % users.length];
  const body = bodies[i % bodies.length];
  const postDate = new Date(baseDate.getTime() + i * 2 * 60 * 60 * 1000); // 2 hours apart
  const timestamp = postDate.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

  db.query(
    "INSERT INTO posts (user_id, timeline_id, body, created_at) VALUES (?, ?, ?, ?)"
  ).run(user.id, timeline.id, body, timestamp);
}

console.log(`Created ${count} posts on timeline "${timeline.name}"`);
console.log(`View at: /t/${timeline.view_token}`);
