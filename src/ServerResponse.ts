import { OutgoingMessage } from "http";
import EventEmitter from "events";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { response } from "express";

// Pre-collect Express response methods for mixin
const expressMethods: Record<string, Function> = {};
for (const key of Object.getOwnPropertyNames(response)) {
  if (typeof response[key] === 'function') {
    expressMethods[key] = response[key];
  }
}

const kOutHeaders = Symbol.for('kOutHeaders');

export class ServerResponse extends OutgoingMessage {
  public statusCode: number = 200;
  public aborted: boolean;
  public locals: any = {};

  protected _headerSent?: boolean;
  protected outputData: any[] = [];
  protected outputSize?: number;

  private _body: string = "";

  // This will be set in the constructor as an own property
  public getBunResponse: () => Promise<Response>;

  constructor(
    public req: any,
    public app: any,
  ) {
    super();
    EventEmitter.call(this);

    // Bind Express 5 response methods onto this instance.
    // Only copy functions, skip properties that we override below.
    const skipKeys = new Set([
      'constructor', 'end', 'write', 'writeHead',
      'setHeader', 'getHeader', 'hasHeader', 'removeHeader',
    ]);

    for (const key in expressMethods) {
      if (skipKeys.has(key)) continue;
      this[key] = expressMethods[key].bind(this);
    }

    // Override write to buffer data for Bun Response
    this.write = (data: any) => {
      this.outputData.push({ data, encoding: 'utf-8', callback: () => { } });
      this.outputSize += data.length;
      return true;
    }

    // Override end to finalize the buffered response
    // @ts-ignore
    this.end = (chunk?: string, encoding?: BufferEncoding) => {
      if (this.writableEnded) { return; }

      if (chunk !== undefined && chunk !== null) {
        this.outputData.push({ data: chunk, encoding: encoding || 'utf-8', callback: () => { } });
      }

      this._body = (encoding && chunk)
        ? Buffer.from(chunk, encoding).toString()
        : this.outputData.map(d => {
            if (typeof d.data === 'string') return d.data;
            if (Buffer.isBuffer(d.data)) return d.data.toString();
            return String(d.data);
          }).join("");

      this.finished = true;
      this.emit('finish');

      return this;
    }

    // Override setHeader to work with kOutHeaders and lowercase storage
    this.setHeader = (name: string, value: string | string[]) => {
      let headers = this[kOutHeaders];

      if (!headers) {
        this[kOutHeaders] = headers = { __proto__: null };
      }

      // Skip Content-Length - Bun will set it automatically based on body size
      if (name.toLowerCase() === 'content-length') {
        return this;
      }

      headers[name.toLowerCase()] = value;

      return this;
    }

    // Override hasHeader to work with our lowercase header storage
    this.hasHeader = (name: string) => {
      const headers = this[kOutHeaders];
      if (!headers) return false;
      return name.toLowerCase() in headers;
    }

    // Override getHeader to work with our lowercase header storage
    this.getHeader = (name: string) => {
      const headers = this[kOutHeaders];
      if (!headers) return undefined;
      return headers[name.toLowerCase()];
    }

    // Override removeHeader to work with our lowercase header storage
    this.removeHeader = (name: string) => {
      const headers = this[kOutHeaders];
      if (!headers) return;
      delete headers[name.toLowerCase()];
    }

    // @ts-ignore
    this.writeHead = (code: number, headers: { [name: string]: string | string[] } = this[kOutHeaders]) => {
      if (this._headerSent) {
        console.warn("writeHead: headers were already sent.")
        return;
      }

      this.statusCode = code;

      // Merge provided headers into kOutHeaders
      if (headers) {
        let outHeaders = this[kOutHeaders];
        if (!outHeaders) {
          this[kOutHeaders] = outHeaders = { __proto__: null };
        }
        for (const name in headers) {
          outHeaders[name.toLowerCase()] = headers[name];
        }
      }

      this._headerSent = true;
    };

    // Define getBunResponse as an own property to ensure it survives any
    // prototype manipulation by Express 5
    this.getBunResponse = async () => {
      if (!this.finished) {
        await new Promise<void>((resolve, reject) => {
          this.on('finish', () => resolve());

          // TODO: add rejection timeout...
        });
      }

      // this call is required for express-session
      // @ts-ignore
      this.writeHead(this.statusCode, this[kOutHeaders]);

      // compute headers from kOutHeaders
      const outHeaders = this[kOutHeaders] || {};
      const headers: { [name: string]: string } = {};
      for (const name in outHeaders) {
        if (outHeaders[name] === undefined || outHeaders[name] === null) continue;
        headers[name] = (Array.isArray(outHeaders[name]))
          ? (outHeaders[name] as string[]).join(", ")
          : outHeaders[name].toString();
      }

      return new Response(this._body, {
        status: this.statusCode,
        statusText: ReasonPhrases[StatusCodes[this.statusCode]],
        headers,
      });
    };
  }

}
