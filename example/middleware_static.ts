import path from "path";
import express from "express";
import bunExpress from "../src";

const PORT = 8080;

const app = bunExpress();
app.use('/', express.static(path.join(__dirname, "static")));

app.listen(PORT, () => console.log("Listening on", PORT));