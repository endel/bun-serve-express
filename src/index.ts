import { Application as ExpressApplication } from "express";
import { Application, ApplicationOptions } from "./Application";

export default function<T=any> (app: ApplicationOptions<T> = {}): ExpressApplication {
  // @ts-ignore
  return new Application<T>(app);
}

export { Application };
export { IncomingMessage } from "./IncomingMessage";
export { ServerResponse } from "./ServerResponse";
export { Socket } from "./Socket";
