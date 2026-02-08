/// <reference types="bun-types" />
import Bun, { ServeOptions, TLSServeOptions, TLSWebSocketServeOptions, UnixServeOptions, UnixTLSServeOptions, UnixTLSWebSocketServeOptions, UnixWebSocketServeOptions, WebSocketServeOptions } from "bun";

import EventEmitter from "events";
import express, { application } from "express";

import { IncomingMessage } from "./IncomingMessage";
import { ServerResponse } from "./ServerResponse";
import { mixin } from "./utils";

export type RenderCallback = (e: any, rendered?: string) => void;

export type ApplicationOptions<T> = Partial<
  ServeOptions
  & TLSServeOptions
  & UnixServeOptions
  & UnixTLSServeOptions
  & WebSocketServeOptions<T>
  & TLSWebSocketServeOptions<T>
  & UnixWebSocketServeOptions<T>
  & UnixTLSWebSocketServeOptions<T>
>;

export class Application<T=any> extends EventEmitter implements express.Application {
  protected bunServer: Bun.Server;

  protected request = express.request;
  protected response = express.response;

  constructor(protected bunServeOptions: ApplicationOptions<T>) {
    super();

    // Copy all Express 5 application methods onto this instance.
    // This includes: get, post, put, delete, use, set, enable, enabled,
    // engine, render, route, param, all, etc.
    mixin(this, application);

    // Perform original Express 5 initialization.
    // This sets up settings, cache, engines, and creates a lazy router getter.
    application.init.apply(this, arguments);
  }

  // Note: Express 5's init() creates this.router as a lazy getter via
  // Object.defineProperty. Express 5's handle() uses this.router directly
  // and handles expressInit (x-powered-by, req/res cross-refs, prototype
  // setup) inline. No lazyrouter() override is needed.

  protected handle(req: any, res: any, callback?: any) {
    (express.application as any).handle.call(this, req, res, callback);
  }

  // @ts-ignore
  public listen(port?: number, cb?: () => void) {
    const self = this;

    this.bunServer = Bun.serve({
      port,
      ...this.bunServeOptions,
      async fetch(req, server) {
        const url = new URL(req.url);

        if (req.headers.get("upgrade")) {
          server.upgrade(req, { data: { url, headers: req.headers, } });
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

        // Mark request as complete so that on-finished/finalhandler
        // knows the request body has been fully consumed.
        request.complete = true;

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

}
