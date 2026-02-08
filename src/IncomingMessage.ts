import http from "http";
import querystring from "querystring";
import EventEmitter from "events";
import { URL } from "url";
import { Socket } from "./Socket";
import { request } from "express";

export class IncomingMessage extends EventEmitter {
  public url: string;
  public originalUrl: string; // used by express router
  public method: string;
  public headers: http.IncomingHttpHeaders = {};
  public body: any;
  public complete: boolean = false;

  private _baseUrl: string = "";
  private _rawquery: string;
  private _query: querystring.ParsedUrlQuery;
  private _params: {[name: string]: string};
  private _rawbody?: Buffer;
  private _dataEventRegistered = false;
  private _readableState: any = { pipes: [], endEmitted: false, readable: true };

  public aborted: boolean;

  // @ts-ignore
  public socket = new Socket(false, true);

  // Own-property methods (survive Object.setPrototypeOf in Express 5's handle)
  public get: (name: string) => string | undefined;
  public header: (name: string) => string | undefined;
  public accepts: (...args: any[]) => string | false;
  public resume: () => this;
  public unpipe: () => this;

  constructor(
    private req: Request,
    private __url: URL,
    private app: any,
  ) {
    super();

    this.url = __url.pathname;
    this.headers = req.headers.toJSON();
    this.method = req.method.toUpperCase();

    this._rawquery = __url.search.length > 1 ? __url.search.substring(1) : "";

    // workaround: also consider 'referrer'
    if (this.headers['referer']) {
      this.headers['referrer'] = this.headers['referer'];
    }

    if (this.__url.search.length > 0) {
      this.url += this.__url.search;
    }

    // All methods and getters are defined as own properties to survive
    // Express 5's Object.setPrototypeOf(req, this.request) in handle(),
    // which replaces the entire prototype chain.

    this.get = (name: string) => {
      return this.header(name);
    };

    this.header = (name: string) => {
      name = name.toLowerCase();
      return this.headers[name] as string || undefined;
    };

    this.accepts = (...args: any[]): string | false => {
      return request.accepts.apply(this, args);
    };

    this.resume = () => {
      // When resume() is called (e.g., by finalhandler to drain the request),
      // emit 'end' and 'close' events if the body has been fully consumed.
      // This allows on-finished callbacks to fire, which in turn lets
      // the finalhandler send 404/error responses.
      if (this.complete) {
        setImmediate(() => {
          EventEmitter.prototype.emit.call(this, 'end');
          EventEmitter.prototype.emit.call(this, 'close');
        });
      }
      return this as any;
    };

    this.unpipe = () => {
      return this as any;
    };

    Object.defineProperty(this, 'ip', {
      get: () => {
        // Bun's Request doesn't expose remote address directly.
        // The server object would be needed, which we don't have here.
        return "127.0.0.1";
      },
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(this, 'params', {
      get: (): { [name: string]: string } => {
        if (!this._params) { this._params = {}; }
        return this._params;
      },
      set: (value) => {
        this._params = value;
      },
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(this, 'query', {
      get: (): querystring.ParsedUrlQuery => {
        if (!this._query) { this._query = querystring.parse(this._rawquery); }
        return this._query;
      },
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(this, 'baseUrl', {
      get: () => {
        return this._baseUrl;
      },
      set: (baseUrl) => {
        this._baseUrl = baseUrl;
      },
      enumerable: true,
      configurable: true
    });

    Object.defineProperty(this, 'path', {
      get: (): string => {
        const path = this.__url.pathname.replace(this._baseUrl, "");
        return (!path.startsWith("/"))
          ? `/${path}`
          : path;
      },
      enumerable: true,
      configurable: true
    });

    // Define 'on' as an own property to prevent Express 5 from shadowing it.
    Object.defineProperty(this, 'on', {
      value: (event: string | symbol, listener: (...args: any[]) => void) => {
        if (this._rawbody !== undefined) {
          /**
           * req.body is read synchronously before any middleware runs.
           * Here we mimic triggering 'data' + 'end' + 'close' right when the event is registered.
           *
           * Note: When body-parser rejects due to content-length exceeding limit,
           * it may only register 'end' listener (without 'data'), so we need to handle both cases.
           */
          if (event === 'data') {
            // Mark that 'data' was registered - this tells 'end' handler not to trigger separately
            this._dataEventRegistered = true;
            setImmediate(() => {
              listener(this._rawbody);
              EventEmitter.prototype.emit.call(this, 'end');
              EventEmitter.prototype.emit.call(this, 'close');
              // Mark request as finished AFTER emitting events, so body-parser can read first
              this.complete = true;
              this._readableState.endEmitted = true;
            });
          } else if (event === 'end') {
            // Register the 'end' listener normally so it can be called by emit('end')
            EventEmitter.prototype.on.call(this, event, listener);
            // After a tick, check if 'data' was registered
            // If not (e.g., body-parser rejecting due to size limit), we need to trigger 'end' manually
            // Only do this if there's actual body content - if body is empty (Content-Length: 0),
            // raw-body returns early without registering listeners, so we shouldn't emit either
            setImmediate(() => {
              if (!this._dataEventRegistered && this._rawbody && this._rawbody.length > 0) {
                EventEmitter.prototype.emit.call(this, 'end');
                EventEmitter.prototype.emit.call(this, 'close');
                // Mark request as finished AFTER emitting events
                this.complete = true;
                this._readableState.endEmitted = true;
              }
            });
          } else {
            EventEmitter.prototype.on.call(this, event, listener);
          }
        } else {
          EventEmitter.prototype.on.call(this, event, listener);
        }
        return this;
      },
      writable: true,
      enumerable: false,
      configurable: true
    });
  }

  protected async readBody() {
    const rawText = await Bun.readableStreamToText(this.req.body);
    this._rawbody = Buffer.from(rawText, 'utf8');
    this.body = rawText;

    // For empty bodies (GET, HEAD, etc.), mark as finished immediately
    // since no middleware will try to read them
    if (this._rawbody.length === 0) {
      this.complete = true;
      this._readableState.endEmitted = true;
    }
  }

}
