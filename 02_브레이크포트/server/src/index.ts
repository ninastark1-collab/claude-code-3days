import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { BattleRoom } from "./rooms/BattleRoom";

const port = Number(process.env.PORT ?? 2567);
// Built web client (npm run build). When present, the game and the battle server share one URL,
// which is what the hosted deployment and the installable web app use.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const serveClient = fs.existsSync(path.join(clientDist, "index.html"));
// Android app built by client/scripts/build-apk.mjs (if present): offered at /app.apk for sideloading
const apkFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../apk/monster-class.apk");

const server = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.get("/healthz", (_req, res) => { res.send("ok"); });
    app.get("/app.apk", (_req, res) => {
      if (!fs.existsSync(apkFile)) { res.status(404).send("APK not built yet"); return; }
      res.download(apkFile, "monster-class.apk", { headers: { "Content-Type": "application/vnd.android.package-archive" } });
    });
    if (!serveClient) return;
    app.use(express.static(clientDist, {
      setHeaders: (res, file) => {
        // the service worker and the page must always be fresh; hashed assets can be cached
        if (file.endsWith("sw.js") || file.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
      },
    }));
  },
});
server.define("battle", BattleRoom);
await server.listen(port);
console.log(`Break Fort server listening on port ${port}${serveClient ? " (serving web client)" : ""}`);
