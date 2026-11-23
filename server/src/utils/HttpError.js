// Throw this from anywhere in a request handler; the error middleware turns it
// into a JSON response with the given status.
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
