/**
 * An error with an HTTP status code. Throw it from any controller or middleware;
 * the central error handler turns it into a JSON response.
 */
export class ApiError extends Error {
  constructor(statusCode, message, errors = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }

  static badRequest(message, errors) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Please log in to continue.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to do that.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'The requested item was not found.') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static validation(errors, message = 'Please correct the highlighted fields.') {
    return new ApiError(422, message, errors);
  }
}
