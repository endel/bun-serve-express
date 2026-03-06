import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import { StatusCodes } from "http-status-codes";
import http from "axios";
import rawHttp from 'http';
import url from 'url';
import timers from "timers/promises";
import bunExpress from "../src";

const BASE_PORT = 9999;
let currentPort = BASE_PORT;

describe("Express 5 API Compatibility", () => {
  let app: ReturnType<typeof bunExpress>;
  let server: ReturnType<ReturnType<typeof bunExpress>['listen']>;
  let currentURL: string;

  beforeEach(async () => {
    // Use a different port for each test to avoid conflicts
    const port = currentPort++;
    currentURL = `http://localhost:${port}`;

    app = bunExpress();

    // Wait for server to be ready before proceeding
    await new Promise<void>((resolve) => {
      server = app.listen(port, () => {
        resolve();
      });
    });
  });

  afterEach(async () => {
    server.close();
    // Give the server time to fully close before the next test
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe("response", () => {
    it("respond to fallback route", async () => {
      const response = await http.get(`${currentURL}/not_found`, { validateStatus: null });
      expect(response.status).toBe(StatusCodes.NOT_FOUND);
      expect(response.data).toContain("Cannot GET /not_found");

      const response2 = await http.post(`${currentURL}/not_found2`, {}, { validateStatus: null });
      expect(response2.status).toBe(StatusCodes.NOT_FOUND);
      expect(response2.data).toContain("Cannot POST /not_found2");
    });

    it("status()", async () => {
      app.get("/status", (req, res) => {
        res.status(StatusCodes.CREATED).end();
      });

      const response = await http.get(`${currentURL}/status`);
      expect(response.status).toBe(StatusCodes.CREATED);
    });

    it("end()", async () => {
      app.get("/end", (req, res) => {
        res.end("Hello world!");
      });

      const response = await http.get(`${currentURL}/end`);
      expect(response.data).toBe("Hello world!");
    });

    it("hasHeader() / removeHeader() / set()", async () => {
      app.get("/headers", (req, res) => {
        expect(res.hasHeader("something")).toBe(false);

        res.set("something", "yes!");
        expect(res.hasHeader("something")).toBe(true);

        res.removeHeader("something");
        res.set("definitely", "yes!");

        res.end();
      });

      const response = await http.get(`${currentURL}/headers`);
      expect(response.headers['definitely']).toBe("yes!");
      expect(response.headers['something']).toBeUndefined();
    });

    it("set() object", async () => {
      app.get("/headers", (req, res) => {
        res.set({
          One: "1",
          Two: "2",
          Three: "3"
        });
        res.end();
      });

      const response = await http.get(`${currentURL}/headers`);
      expect(response.headers['one']).toBe("1");
      expect(response.headers['two']).toBe("2");
      expect(response.headers['three']).toBe("3");
    });

    it("json()", async () => {
      app.get("/json", (req, res) => {
        res.json({ hello: "world" });
      });

      const response = await http.get(`${currentURL}/json`);
      expect(response.headers['content-type']).toContain("application/json");
      expect(response.data).toEqual({ hello: "world" });
    });

    it("redirect()", async () => {
      app.get("/redirected", (req, res) => {
        res.end("final");
      });

      app.get("/redirect", (req, res) => {
        res.redirect("/redirected");
      });

      const response = await http.get(`${currentURL}/redirect`);
      expect(response.data).toBe("final");
    });

    it("append()", async () => {
      app.get("/append", (req, res) => {
        res.append("my-cookie", "hello");
        res.append("my-cookie", "world");
        res.end();
      });

      const response = (await http.get(`${currentURL}/append`)).headers;
      expect(response['my-cookie']).toBe("hello, world");
    })

    it("cookie()", async () => {
      app.get("/cookie", (req, res) => {
        res.cookie("my-cookie", "hello world", {});
        res.end();
      });

      const response = (await http.get(`${currentURL}/cookie`)).headers;
      expect(response['set-cookie']!.length).toBe(1);
      expect(response["set-cookie"]![0]).toMatch(/^\s?my-cookie/);
    })

    it("clearCookie()", async () => {
      app.get("/clearcookie", (req, res) => {
        res.clearCookie("my-cookie", {});
        res.end();
      });

      const response = (await http.get(`${currentURL}/clearcookie`)).headers;
      expect(response['set-cookie']!.length).toBe(1);
      expect(response["set-cookie"]![0]).toMatch(/^\s?my-cookie=\;/);
    })

    it("set() Content-Type header with res.end()", async () => {
      app.get("/content-type", (req, res) => {
        res.set("Content-Type", "image/png");
        res.end("fake-image-data");
      });

      const response = await http.get(`${currentURL}/content-type`, { responseType: 'text' });
      expect(response.headers['content-type']).toBe("image/png");
      expect(response.data).toBe("fake-image-data");
    });

    it("set() Content-Type before sending binary Buffer", async () => {
      app.get("/binary", (req, res) => {
        const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        res.set("Content-Type", "image/png");
        res.end(buffer);
      });

      const response = await http.get(`${currentURL}/binary`, { responseType: 'arraybuffer' });
      expect(response.headers['content-type']).toBe("image/png");
      const bytes = new Uint8Array(response.data);
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
    });

    it("setHeader() directly", async () => {
      app.get("/setheader", (req, res) => {
        res.setHeader("X-Custom", "custom-value");
        res.setHeader("Content-Type", "text/plain");
        res.end("hello");
      });

      const response = await http.get(`${currentURL}/setheader`);
      expect(response.headers['x-custom']).toBe("custom-value");
      expect(response.headers['content-type']).toBe("text/plain");
    });

    it("writeHead() with status and headers", async () => {
      app.get("/writehead", (req, res) => {
        res.writeHead(201, { "X-Custom": "value", "Content-Type": "text/plain" });
        res.end("created");
      });

      const response = await http.get(`${currentURL}/writehead`);
      expect(response.status).toBe(201);
      expect(response.headers['x-custom']).toBe("value");
      expect(response.headers['content-type']).toBe("text/plain");
    });

    it("header() alias for set()", async () => {
      app.get("/header-alias", (req, res) => {
        res.header("X-Via-Header", "yes");
        res.end("ok");
      });

      const response = await http.get(`${currentURL}/header-alias`);
      expect(response.headers['x-via-header']).toBe("yes");
    });

    it("render()", async () => {
      app.set('views', path.join(__dirname, 'views'));
      app.set('view engine', 'html');
      app.engine('html', function render (path: any, options: any, fn: any) {
        fs.readFile(path, 'utf8', function (err, str) {
          if (err) return fn(err);
          str = str.replace('{{title}}', options.title);
          str = str.replace('{{message}}', options.message);
          fn(null, str);
        });
      });

      app.get("/render", (req, res) => {
        res.locals.title = "ABC";
        res.locals.message = "It works!";
        res.render('render', { title: "Rendering" });
      });

      const body = (await http.get(`${currentURL}/render`)).data;
      expect(body).toBe("RenderingIt works!");
    });

  });

  describe("request", () => {
    it("app.head()", async () => {
      app.head("/params/:one/:two", (req, res) => {
        res.set("field1", "1");
        res.set("field2", "2");
        res.end();
      });

      const headers = (await http.head(`${currentURL}/params/one/two`)).headers;
      expect(headers.field1).toBe("1");
      expect(headers.field2).toBe("2");
    });

    it("params", async () => {
      app.get("/params/:one/:two", (req, res) => {
        res.json({
          one: req.params['one'],
          two: req.params['two'],
        });
      });

      expect((await http.get(`${currentURL}/params/one/two`)).data).toEqual({
        one: "one",
        two: "two"
      });

      expect((await http.get(`${currentURL}/params/another/1`)).data).toEqual({
        one: "another",
        two: "1"
      });
    });

    it("query", async () => {
      app.get("/query", (req, res) => {
        res.json(req.query);
      });

      const response = await http.get(`${currentURL}/query?one=1&two=2&three=3&four=4`);
      expect(response.data).toEqual({
        one: "1",
        two: "2",
        three: "3",
        four: "4"
      });
    });

    it("headers", async() => {
      app.get("/headers", (req, res) => {
        res.json(req.headers);
      });

      const response = await http.get(`${currentURL}/headers`, {
        headers: {
          one: "1",
          cookie: "mycookie",
          TheyAreAllConvertedToLowerCase: "ok"
        }
      });

      expect(response.data.one).toBe("1");
      expect(response.data.cookie).toBe("mycookie");
      expect(response.data.theyareallconvertedtolowercase).toBe("ok");
    });

    it("method / path / url", async () => {
      app.get("/properties", (req, res) => {
        res.json({
          method: req.method,
          path: req.path,
          url: req.url,
        });
      });

      const { data } = (await http.get(`${currentURL}/properties?something=true`));
      expect(data).toEqual({
        method: "GET",
        path: "/properties",
        url: "/properties?something=true",
      });
    });

    it("parse small request body", async () => {
      app.use(express.text());
      app.post("/small_body", (req, res) => res.end(req.body));

      const { data } = (await http.post(`${currentURL}/small_body`, "small body", {
        headers: { "Content-Type": 'text/plain', },
      }));
      expect(data).toBe("small body");
    })

    it("multibyte character body", async () => {
      app.use(express.json());
      app.post("/multibyte_body", (req, res) => res.end(req.body?.str));

      const { data } = (await http.post(`${currentURL}/multibyte_body`, { str: "multibyte 世界 body" }));
      expect(data).toBe("multibyte 世界 body");
    })

    it("parse large request body", async () => {
      app.use(express.text());
      app.post("/large_body", (req, res) => res.end(req.body));

      let largeBody: string = "";
      for (let i = 0; i < 100; i++) {
        largeBody += "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*(),./;'[]<>?:{}-=_+\"`~";
      }

      const { data } = (await http.post(`${currentURL}/large_body`, largeBody, {
        headers: { "Content-Type": 'text/plain', },
      }));
      expect(data).toBe(largeBody);
    })

    it("should support aborting the request", async () => {
      app.use(express.json());
      app.post("/will_abort", async (req, res) => {
        setTimeout(() => {
          res.json(req.body);
        }, 500);
      });

      const cancelTokenSource = http.CancelToken.source();
      const request = http.post(`${currentURL}/will_abort`, { hello: "world" }, {
        cancelToken: cancelTokenSource.token
      });
      await timers.setTimeout(350);

      cancelTokenSource.cancel("cancelled");

      try {
        await request;
      } catch (e) {
        expect(e.message).toBe("cancelled");
      }

      expect(true).toBe(true); // should not have thrown an exception
    });

    it("asynchronously getting header while aborted", async () => {
      app.get("/async_header/:one/:two", async (req, res) => {
        await timers.setTimeout(200);
        const existing = req.header("existing");
        const nonexisting = req.header("non-existing");
        const useragent = (req.header("user-agent")! as string).split("/")[0];
        res.json({ existing, nonexisting, useragent });
      });

      const response = (await http.get(`${currentURL}/async_header/param1/param2`, { headers: { existing: "one" } })).data;
      expect(response.existing).toBe("one");
      expect(response.useragent).toBe("axios");
    });

  });

  describe("express.Router compatibility", () => {
    it("should rebuild routes with proper methods", async () => {
      const routes = express.Router();
      routes.get("/one/:param1", (req, res) => res.json({ one: req.params.param1 }));
      routes.post("/two", (req, res) => res.json({ two: "two" }));
      routes.delete("/three", (req, res) => res.json({ three: "three" }));
      routes.put("/four", (req, res) => res.json({ four: "four" }));
      app.use("/routes", routes);

      expect((await http.get(`${currentURL}/routes/one/param1`)).data).toEqual({ one: "param1" });
      expect((await http.post(`${currentURL}/routes/two`)).data).toEqual({ two: "two" });
      expect((await http.delete(`${currentURL}/routes/three`)).data).toEqual({ three: "three" });
      expect((await http.put(`${currentURL}/routes/four`)).data).toEqual({ four: "four" });
    });

    it("should support nested routes", async () => {
      const root = express.Router();

      const branch1 = express.Router();
      branch1.get("/one", (req, res) => res.json({ one: 1 }));

      const branch2 = express.Router();
      branch2.get("/two", (req, res) => res.json({ two: 2 }));

      const deep = express.Router();
      deep.get("/three", (req, res) => res.json({ deep: true }));
      branch2.use("/deep", deep);

      root.use("/branch1", branch1);
      root.use("/branch2", branch2);

      app.use("/root", root);
      expect((await http.get(`${currentURL}/root/branch1/one`)).data).toEqual({ one: 1 });
      expect((await http.get(`${currentURL}/root/branch2/two`)).data).toEqual({ two: 2 });
      expect((await http.get(`${currentURL}/root/branch2/deep/three`)).data).toEqual({ deep: true });
    });

    it("should attach middleware + handler", async () => {
      const router = express.Router();

      router.get("/with_middleware", (req, res, next) => {
        req['something'] = true;
        next();

      }, (req, res) => {
        res.json({ something: req['something'] });
      })

      app.use("/router", router);

      expect((await http.get(`${currentURL}/router/with_middleware`)).data).toEqual({ something: true });
    });

    it("should accept Router as last argument for .get()", async () => {
      const router = express.Router();

      router.get("/router", (req, res, next) => {
        req['something'] = true;
        next();

      }, (req, res) => {
        res.json({
          first_middleware: req['first_middleware'],
          something: req['something']
        });
      })

      const middleware = (req, res, next) => {
        req['first_middleware'] = 1;
        next()
      };

      app.use("/router", middleware, router);

      expect((await http.get(`${currentURL}/router/router`)).data).toEqual({
        first_middleware: 1,
        something: true,
      });
    });

    it("should use middlewares on basePath of router", async () => {
      const router = express.Router();
      router.use(express.static(path.resolve(__dirname, "static")));
      router.get("/api", (req, res) => {
        res.json({ response: true });
      })
      app.use("/router", router);

      expect((await http.get(`${currentURL}/router/api`)).data).toEqual({ response: true });
      expect((await http.get(`${currentURL}/router/index.html`)).data).toBe("Hello world");
    });

    it("urls should always start with /", async () => {
      app.use(express.static(path.resolve(__dirname, "static")));

      const router = express.Router();
      router.get("/", (req, res) => {
        res.json({
          path: req.path,
          url: req.url,
          originalUrl: req.originalUrl,
        });
      })
      app.use("/auth", router);

      expect((await http.get(`${currentURL}/auth?token=xxx`)).data).toEqual({
        path: "/",
        url: "/?token=xxx",
        originalUrl: "/auth?token=xxx",
      });
    });

  });

  describe("Middlewares", () => {
    it("should support router-level middleware", async () => {
      const root = express.Router();

      root.use(function (req, res, next) {
        res.set("catch-all", "all");
        next();
      });
      root.get("/hello", (req, res) => res.end("hello"));

      app.use("/root", root);

      const response = await http.get(`${currentURL}/root/hello`);
      expect(response.data).toBe("hello");
      expect(response.headers['catch-all']).toBe("all");
    });

    it("should run at every request", async () => {
      app.use((req, res, next) => {
        res.set("header1", "one");
        next!();
      });

      app.use((req, res, next) => {
        res.set("header2", "two");
        next!();
      });

      app.get("/hey", (req, res) => res.end("done"));

      const response = await http.get(`${currentURL}/hey`);
      expect(response.data).toBe("done");
      expect(response.headers['header1']).toBe("one");
      expect(response.headers['header2']).toBe("two");
    });

    it("should support middlewares at specific segments", async () => {
      app.use((req, res, next) => {
        res.set("catch-all", "all");
        next!();
      });

      app.use("/users/:id", (req, res, next) => {
        res.set("token", req.params['id']);
        next!();
      });

      app.use("/teams", (req, res, next) => {
        res.set("team", "team");
        next!();
      });

      app.get("/users/:id", (req, res) => res.json({ user: req.params.id }));

      const response = await http.get(`${currentURL}/users/10`);
      expect(response.data).toEqual({ user: "10" });
      expect(response.headers['catch-all']).toBe("all");
      expect(response.headers['token']).toBe("10");
      expect(response.headers['team']).toBeUndefined();
    });

    it("should support cors()", async () => {
      app.use(cors());

      app.get("/cors", (req, res) => {
        res.json(req.body);
      });

      const response = await http.options(`${currentURL}/cors`);
      expect(response.headers['access-control-allow-origin']).toBe('*');
    })

    it("should support express.json()", async () => {
      app.use(express.json());
      app.post("/json", (req, res) => res.json(req.body));

      const response = await http.post(`${currentURL}/json`, { hello: "world" });
      expect(response.data).toEqual({ hello: "world" });
    })

    it("should reject request with body larger than limit", async () => {
      app.use(express.json({ limit: "1kb" }));
      app.post("/json_limit", (req, res) => res.json(req.body));

      try {
        await http.post(`${currentURL}/json_limit`, { big_json: "f".repeat(4096) });
        expect(true).toBe(false); // should not reach here
      } catch (e) {
        expect(e.response.status).toBe(413);
      }
    })

    it("should read body as plain text", async () => {
      app.use(express.text());
      app.post("/plain_json", (req, res) => res.json(req.body));

      const response = await http.post(`${currentURL}/plain_json`, JSON.stringify({ hello: "world" }), {
        headers: { "Content-Type": 'text/plain', },
      });

      expect(response.data).toBe('{"hello":"world"}');
    })

    it("should support urlencoded()", async () => {
      app.use(express.urlencoded());
      app.post("/post_urlencoded", (req, res) => res.json(req.body));

      const response = await http.post(`${currentURL}/post_urlencoded`, "hello=world&foo=bar", {
        headers: {
          "Content-Type": 'application/x-www-form-urlencoded',
        }
      });

      expect(response.data).toEqual({
        hello: "world",
        foo: "bar",
      });
    })

    it("should support json + urlencoded", async () => {
      app.use(express.json());
      app.use(express.urlencoded({ extended: true, limit: "10kb" }));

      app.post("/json_urlencoded", (req, res) => {
        res.json(req.body);
      });

      const response = await http.post(`${currentURL}/json_urlencoded`, { hello: "world" }, {
        headers: {
          "Content-Type": 'application/json',
        }
      });

      expect(response.data).toEqual({ hello: "world" });
    });

    it("should support attaching middleware + route ", async () => {
      app.use(express.json());

      app.get("/one", (req, res, next) => {
        req['something'] = true;
        next!();

      }, (req, res) => {
        // @ts-ignore
        res.json({ something: req['something'] });
      });

      const response = await http.get(`${currentURL}/one`);

      expect(response.data).toEqual({
        something: true,
      });

    })

  });

  describe("Edge cases", () => {

    it("should handle content-length mismatch gracefully", async () => {
      // Bun reads the actual body regardless of Content-Length header,
      // so the body is fully available even when Content-Length is 0.
      // This differs from uWebSockets.js which respects Content-Length.
      app.use(express.json());
      app.post("/content_length", (req, res) => res.json({ receivedBody: req.body }));

      const result = await new Promise<string>((resolve) => {
        const opts = url.parse(`${currentURL}/content_length`);
        const data = { email: "mymail@gmail.com", password: "test" };

        // @ts-ignore
        opts.method = "POST";
        // @ts-ignore
        opts.headers = {};
        // @ts-ignore
        opts.headers['Content-Type'] = 'application/json';
        // @ts-ignore
        opts.headers['Content-Length'] = '0';

        rawHttp.request(opts, function (res) {
          res.on("data", (chunk) => {
            resolve(chunk.toString());
          });
        }).end(JSON.stringify(data));
      });

      const parsed = JSON.parse(result);
      // Bun reads the full body despite Content-Length: 0
      expect(parsed.receivedBody).toBeDefined();
    });

    it("should reach final route", async () => {
      app.use(cors());
      app.use(express.json());

      app.get('/metrics', async (req, res) => res.send("/metrics"));
      app.get('/metrics/ccu', async (req, res) => res.send("/metrics/ccu"));

      const router = express.Router();
      router.get("/", (req, res) => res.send("OK"));
      router.get("/room", (req, res) => res.send("room"));
      router.get("/room/call", (req, res) => res.send("room/call"));

      const root = express.Router();
      root.use(express.static(path.resolve(__dirname, "static")));
      root.use("/api", router);

      app.use('/colyseus', root);

      const result = await new Promise<string>((resolve) => {
        const opts = url.parse(`${currentURL}/colyseus/api`);
        // @ts-ignore
        opts.method = "GET";

        rawHttp.request(opts, function (res) {
          res.on("data", (chunk) => {
            resolve(chunk.toString());
          });
          res.read();
        }).end();
      });

      expect(result).toBe("OK");
    });

  });

});
