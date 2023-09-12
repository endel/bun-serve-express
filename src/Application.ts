/// <reference types="bun-types" />
import Bun from "bun";

import EventEmitter from "events";
import express, { NextFunction, application } from "express";

import { IncomingMessage } from "./IncomingMessage";
import { ServerResponse } from "./ServerResponse";

function onAbort(req: IncomingMessage, res: ServerResponse) {
  req.socket.readable = false;
  res.finished = true;
  res.aborted = true;
}

type RequestHandler = (req: IncomingMessage, res: ServerResponse, next?: NextFunction) => void;

export type RenderCallback = (e: any, rendered?: string) => void;
type EngineCallback = (path: string, options: object, callback: RenderCallback) => void;

export class Application<T=any> extends EventEmitter {
  protected bunServer: Bun.Server;

  protected request = express.request;
  protected response = express.response;

  private _router: any;

  constructor(protected bunServeOptions: Partial<Bun.Serve<T>>) {
    super();

    this.init();
  }

  protected init() {
    // perform original express initialization
    application.init.apply(this, arguments);
  }

  protected handle(req, res, callback?) {
    (express.application as any).handle.call(this, req, res, callback);
  }

  protected lazyrouter() {
    // DISCARDED: original lazyrouter auto-initializes "expressInit", which
    // overrides the prototype of request/response, which we can't let happen
    // (express.application as any).lazyrouter.apply(this, arguments);

    if (!this._router) {
      this._router = express.Router({
        caseSensitive: this.enabled('case sensitive routing'),
        strict: this.enabled('strict routing')
      });

      this._router.use(express.query(this.get('query parser fn')));

      const app = this;
      this._router.use(function expressInit(req, res, next) {
        if (app.enabled('x-powered-by')) res.setHeader('X-Powered-By', 'Express');
        req.res = res;
        res.req = req;
        req.next = next;

        // setPrototypeOf(req, app.request)
        // setPrototypeOf(res, app.response)

        res.locals = res.locals || Object.create(null);

        next();
      });
    }

    return ;
  }

  public engine(ext: string, fn: EngineCallback) {
    application.engine.apply(this, arguments);
  }

  public set(setting, val) {
    return application.set.apply(this, arguments);
  }

  public enable(setting: string) {
    return application.enable.call(this, setting);
  }

  public enabled(setting: string) {
    return application.enabled.call(this, setting);
  }

  public render(name: string, options: any, callback: RenderCallback) {
    return application.render.apply(this, arguments);
  }

  public use(handler: RequestHandler)
  public use(path: string, handler: RequestHandler)
  public use(path: string, router: express.Router)
  public use(path: string, ...handlers: Array<express.Router | RequestHandler>)
  public use(path: string, any: any)
  public use(any: any)
  public use(pathOrHandler: string | RequestHandler, ...handlersOrRouters: Array<RequestHandler | express.Router>) {
    express.application.use.apply(this, arguments);
    return this;
  }

  public get(path: string, ...handlers: RequestHandler[]) {
    return express.application.get.apply(this, arguments);
  }

  public post(path: string, ...handlers: RequestHandler[]) {
    express.application.post.apply(this, arguments);
    return this;
  }

  public patch(path: string, ...handlers: RequestHandler[]) {
    express.application.patch.apply(this, arguments);
    return this;
  }

  public options(path: string, ...handlers: RequestHandler[]) {
    express.application.options.apply(this, arguments);
    return this;
  }

  public put(path: string, ...handlers: RequestHandler[]) {
    express.application.put.apply(this, arguments);
    return this;
  }

  /**
   * @deprecated
   */
  public del(path: string, ...handlers: RequestHandler[]) {
    return this.delete.apply(this, arguments);
  }

  public delete(path: string, ...handlers: RequestHandler[]) {
    express.application.delete.apply(this, arguments);
    return this;
  }

  public head(path: string, ...handlers: RequestHandler[]) {
    express.application.head.apply(this, arguments);
    return this;
  }

  public all(path: string, ...handlers: RequestHandler[]) {
    express.application.all.apply(this, arguments);
    return this;
  }

  public listen(port?: number, cb?: () => void) {
    const self = this;

    this.bunServer = Bun.serve({
      // ...this.bunServeOptions,
      port: port,

      async fetch(req, server) {
        const url = new URL(req.url);

        if (req.headers.get("upgrade")) {
          server.upgrade(req, { data: { url } });
          return undefined;
        }

        const request = new IncomingMessage(req, url, self);
        const response = new ServerResponse(request, self);

        // read body data!
        if (request.headers['content-length']) {
          try {
            await request['readBody']();
          } catch (e) {
            console.warn("bun-express: failed reading request body at", url);
          }
        }

        self.handle(request, response);
        const res = await response['getBunResponse']();

        return res;
      }
    });

    cb?.();

    return {
      close() {
        self.bunServer.stop(true);
      }
    };
  }

  protected defaultConfiguration() {
    application.defaultConfiguration.apply(this);
  }

}

