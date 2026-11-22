export class HttpError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const notFound = (message = "Not found.") => new HttpError(404, message);
