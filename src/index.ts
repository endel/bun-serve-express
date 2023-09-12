import Bun from "bun";
import { Application, ApplicationOptions } from "./Application";

export default function<T=any> (app: ApplicationOptions<T> = {}) {
  return new Application<T>(app);
}

export { Application };
export { IncomingMessage } from "./IncomingMessage";
export { ServerResponse } from "./ServerResponse";
export { Socket } from "./Socket";
