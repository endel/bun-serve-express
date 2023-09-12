import Bun from "bun";
import { Application } from "./Application";

export default function<T=any> (app: Partial<Bun.Serve<T>> = {}) {
  return new Application<T>(app);
}

export { Application };
export { IncomingMessage } from "./IncomingMessage";
export { ServerResponse } from "./ServerResponse";
export { Socket } from "./Socket";
