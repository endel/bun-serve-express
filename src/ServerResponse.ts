// import uWS, { RecognizedString } from "uWebSockets.js";

import fs from "fs";
import mime from "mime";
import EventEmitter from "events";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { response, CookieOptions } from "express";
import http from "http";
import merge from "utils-merge";
import cookie from "cookie";
import { sign } from 'cookie-signature';

export class ServerResponse extends http.OutgoingMessage {
  private _headers: { [name: string]: string | string[] } = {};
  private _writes: any[] = [];
  private _body: string = "";

  public statusCode: number = 200;
  // public socket = new Socket(true, false);
  public headersSent: boolean = false;
  public finished: boolean = false;
  public aborted: boolean;
  public locals: any = {};

  public writableEnded = false;

  constructor(
    private req: any,
    private app: any,
  ) {
    super();
    EventEmitter.call(this);
    // http.OutgoingMessage.call(this);
  }

  render(view: string, options?: any, callback?: (err: Error, html: string) => void): void
  render(view: string, callback?: (err: Error, html: string) => void): void {
    response.render.apply(this, arguments);
  }

  // @ts-ignore
  end(chunk?: string, encoding?: BufferEncoding) {
    if (this.finished) { return; }

    this._writes.push(chunk);

    this._body = (encoding)
      ? Buffer.from(chunk, encoding).toString()
      : this._writes.join("");

    if (!this.writableEnded) {
      // // write status + headers

      // // dequeue writes
      // this._writes.forEach((chunk) => this.res.write(chunk));

      // // write response
      // this.res.cork(() => {
      //   this.res.end(body);
      // });
    }

    // this.writableEnded = true;

    this.finished = true;
    this.emit('finish');

    return this;
  }

  get(name: string) {
    return this._headers[name.toLowerCase()];
  }

  hasHeader(name: string) {
    return (this._headers[name.toLowerCase()] !== undefined);
  }

  getHeader(name: string) {
    return this.get(name);
  }

  setHeader(name: string, value: string | string[]) {
    this.set(name, value);
    return this;
  }

  removeHeader(name: string) {
    delete this._headers[name.toLowerCase()];
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  sendStatus(statusCode: number) {
    this.status(statusCode);
    return this;
  }

  vary (field: string) {
    let append = "";

    if (!this._headers['vary']) {
      this._headers['vary'] = "";
      append = field;

    } else {
      append = `, ${field}`;
    }

    this._headers['vary'] += append;
  }

  sendFile(path: string, fn?: (err: Error) => void): void {
    this.type(path);
    fs.readFile(path, (err, contents) => {
      if (err) return fn(err);
      this.send(contents);
    });
  }

  send(chunk?: any) {
    switch (typeof chunk) {
      // string defaulting to html
      case 'string':
        if (!this.get('Content-Type')) {
          this.type('html');
        }
        break;
      case 'boolean':
      case 'number':
      case 'object':
        if (chunk === null) {
          chunk = '';
        } else if (Buffer.isBuffer(chunk)) {
          if (!this.get('Content-Type')) {
            this.type('bin');
          }
        } else {
          return this.json(chunk);
        }
        break;
    }

    return this.end(chunk as string);
  }

  // enqueue to write during .end()
  write(chunk: any) {
    this._writes.push(chunk);
    return !this.writableEnded;
  }

  type(type: string) {
    this.set('Content-Type', mime.getType(type) || type);
    return this;
  }

  json(body: any) {
    this.type('json').end(JSON.stringify(body));
  }

  jsonp(body: any) {
    this.set('Content-Type', "application/javascript");
    this.end(`callback(${JSON.stringify(body)})`);
  }

  location(url: string) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Location
    return response.location.apply(this, arguments);
  }

  redirect(path: string)
  redirect(code: number, path: string)
  redirect(codeOrPath: number | string, path?: string) {
    return response.redirect.apply(this, arguments);
  }

  format(obj: any) {
    return response.format.apply(this, arguments);
  }

  set(nameOrDict: string | object, value?: string | string[]) {
    if (typeof(nameOrDict) === "string") {
      nameOrDict = nameOrDict.toLowerCase();
      if (nameOrDict !== 'content-length') {
        this._headers[nameOrDict] = value;
      }

    } else {
      for (let originalName in nameOrDict) {
        const name = originalName.toLowerCase();
        if (name !== 'content-length') {
          this._headers[name] = nameOrDict[originalName];
        }
      }
    }
    return this;
  }

  append(name: string, val: string | string[]) {
    const prev = this.get(name);
    let value = val;

    if (prev) {
      // concat the new and prev vals
      value = (Array.isArray(prev))
        ? prev.concat(val)
        : (Array.isArray(val))
          ? [prev].concat(val)
          : [prev, val];
    }

    return this.set(name, value);
  }

  // alias to "set"
  header(name: string | object, value?: string | string[]) {
    return this.set(name, value);
  }

  writeHead(code: number, headers: { [name: string]: string | string[] } = this._headers) {
    if (this.headersSent) {
      console.warn("writeHead: headers were already sent.")
      return;
    }

    this.statusCode = code;

    // // write status
    // const reason = ReasonPhrases[StatusCodes[code]];
    // this.res.cork(() => {
    //   this.res.writeStatus(`${code} ${reason}`);

    //   // write headers
    //   for (const name in headers) {
    //     if(Array.isArray(headers[name])) {
    //       for(const headerValue of headers[name]) {
    //         this.res.writeHeader(name, headerValue?.toString());
    //       }
    //     } else {
    //       this.res.writeHeader(name, headers[name]?.toString());
    //     }
    //   }
    // });

    this.headersSent = true;
  }

  cookie(name: string, value: string | Record<string, unknown>, options: CookieOptions) {
    const opts = merge({}, options) as CookieOptions;
    const secret = this.req.secret || null;
    const signed = opts.signed || false;

    if (signed && !secret) {
      throw new Error('cookieParser("secret") required for signed cookies');
    }

    let val = typeof value === 'object'
      ? 'j:' + JSON.stringify(value)
      : String(value);

    if (signed) {
      val = 's:' + sign(val, secret);
    }

    if ('maxAge' in opts) {
      opts.expires = new Date(Date.now() + opts.maxAge);
      opts.maxAge /= 1000;
    }

    if (opts.path == null) {
      opts.path = '/';
    }

    return this.append('set-cookie', cookie.serialize(name, String(val), opts));
  }

  clearCookie(name: string, options: Record<string, string | number>) {
    const opts = merge({ expires: new Date(1), path: '/' }, options);
    return this.cookie(name, '', opts);
  }

  // express-session [??]
  private _implicitHeader () {
    // const code = StatusCodes.OK;
    // const reason = ReasonPhrases[StatusCodes[code]];
    // this.res.cork(() => {
    //   this.res.writeStatus(`${code} ${reason}`);
    // });
  }

  protected async getBunResponse() {
    if (!this.finished) {
      await new Promise((resolve, reject) => {
        this.on('finish', resolve);

        // TODO: add rejection timeout...
      });
    }

    // this call is required for express-session
    this.writeHead(this.statusCode, this._headers);

    // compute headers
    const headers: { [name: string]: string } = {};
    for (const name in this._headers) {
      headers[name] = (Array.isArray(this._headers[name]))
        ? (this._headers[name] as string[]).join(", ")
        : this._headers[name].toString();
    }

    return new Response(this._body, {
      status: this.statusCode,
      statusText: ReasonPhrases[StatusCodes[this.statusCode]],
      headers,
    });
  }

}
