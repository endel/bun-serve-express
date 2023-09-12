import http from "http";
import querystring from "querystring";
import EventEmitter from "events";
import { URL } from "url";
import { Socket } from "./Socket";
import { request } from "express";

const READ_BODY_MAX_TIME = 500;

export class IncomingMessage extends EventEmitter {
  public url: string;
  public originalUrl: string; // used by express router
  public method: string;

  // public query: querystring.ParsedUrlQuery;

  // private _url: string;
  // private _path: string;
  private _baseUrl: string = "";
  private _rawquery: string;
  private _query: querystring.ParsedUrlQuery;
  private _headers: http.IncomingHttpHeaders = {};
  private _params: {[name: string]: string};
  private _bodydata: any;
  private _rawbody: any;
  private _readableState = { pipes: [] };

  public aborted: boolean;

  // @ts-ignore
  public socket = new Socket(false, true);

  constructor(
    private req: Request,
    private __url: URL,
    private app: any,
  ) {
    super();

    this.url = __url.pathname;

    this._headers = req.headers.toJSON();

    this.method = req.method.toUpperCase();

    // this._remoteAddress = this.res.getRemoteAddressAsText();

    if (this.__url.search.length > 0) {
      this.url += this.__url.search;
    }
  }

  get ip () {
    throw new Error(".ip is not implemented yet");
    // return Buffer.from(this._remoteAddress).toString();
  }

  set body (_body: any) {
    this._bodydata = _body;
  }

  get body () {
    return this._bodydata || this._rawbody;
  }

  get headers (): http.IncomingHttpHeaders {
    return this._headers;
  }

  set params (value) {
    this._params = value;
  }

  get params(): { [name: string]: string } {
    if (!this._params) { this._params = {}; }
    return this._params;
  }

  get query (): querystring.ParsedUrlQuery {
    if(!this._query) { this._query = querystring.parse(this.__url.search.substring(1)); }
    return this._query;
  }

  get baseUrl() {
    return this._baseUrl;
  }

  set baseUrl(baseUrl) {
    this._baseUrl = baseUrl;
  }

  get path(): string {
    const path = this.__url.pathname.replace(this._baseUrl, "");
    return (!path.startsWith("/"))
      ? `/${path}`
      : path;
  }

  get(name: string) {
    return this.header(name);
  }

  header(name: string) {
    name = name.toLowerCase();
    return this._headers[name] || undefined;
  }

  accepts(...args: any[]): string | false {
    return request.accepts.apply(this, arguments);
  }

  resume() { return this; }

  on(event: string | symbol, listener: (...args: any[]) => void) {
    if (event === 'data' && this._rawbody !== undefined) {
      /**
       * req.body is synchronously before any middleware runs.
       * here we're mimicking to trigger 'data' + 'end' + 'close' right at the moment the event is registered.
       */
      setImmediate(() => {
        listener(this._rawbody);
        this.emit('end');
        this.emit('close');
      });
    } else {
      super.on(event, listener);
    }
    return this;
  }

  protected async readBody() {
    // //
    // // ensure request is not halted when an invalid content-length is sent by the client
    // // https://github.com/endel/uWebSockets-express/issues/9
    // //
    // const rejectionTimeout = setTimeout(() => {
    //   if (body) {
    //     this._rawbody = body.toString();
    //     this.headers['content-length'] = String(body.length);
    //   }
    //   reject();
    // }, READ_BODY_MAX_TIME);

    this._rawbody = await Bun.readableStreamToText(this.req.body);

      // clearTimeout(rejectionTimeout);
      // this._rawbody = body.toString();
  }

}
