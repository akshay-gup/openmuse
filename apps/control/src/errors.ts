/** An error with an HTTP status and a message that is safe to show the person who asked. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
