export class HttpError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, message: string, code = "APP_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return new HttpError(400, message, code);
}

export function unauthorized(message = "No autorizado", code = "UNAUTHORIZED") {
  return new HttpError(401, message, code);
}

export function paymentRequired(
  message = "Se requiere una suscripcion activa",
  code = "PAYMENT_REQUIRED",
) {
  return new HttpError(402, message, code);
}

export function forbidden(message = "No permitido", code = "FORBIDDEN") {
  return new HttpError(403, message, code);
}

export function notFound(message = "No encontrado", code = "NOT_FOUND") {
  return new HttpError(404, message, code);
}

export function tooManyRequests(
  message = "Demasiadas solicitudes",
  code = "TOO_MANY_REQUESTS",
) {
  return new HttpError(429, message, code);
}

export function conflict(message = "Conflicto", code = "CONFLICT") {
  return new HttpError(409, message, code);
}
