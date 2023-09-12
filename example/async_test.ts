import express from "../src";
// import express from "express";

// import promisified timers
import { setTimeout } from "timers/promises";

const PORT = 8080;
const app = express();

app.get('/', (req, res) => {
  console.log("GET /", { req, res });
  res.header("Cache-Control", "no-cache, no-store, must-revalidate");

  res.header("Content-Type", "application/json");
  res.write(JSON.stringify({ hello: "world" }));
  res.end();
});

app.get('/async', async (req, res) => {
  console.log("ASYNC...");
  res.header("Cache-Control", "no-cache, no-store, must-revalidate");
  await setTimeout(1000);

  res.header("Content-Type", "application/json");
  res.write(JSON.stringify({ hello: "world" }));
  res.end();
  console.log("END OF ASYNC...");
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));