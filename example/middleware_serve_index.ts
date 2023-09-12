import path from "path";
import express from "express";
import serveIndex from "serve-index";
import bunExpress from "../src";

const PORT = 8080;

const app = bunExpress();
app.use('/', serveIndex(path.join(__dirname, ".."), { icons: true, hidden: true }))
app.use('/', express.static(path.join(__dirname, "..")));

app.listen(PORT, () => console.log("Listening on", PORT));