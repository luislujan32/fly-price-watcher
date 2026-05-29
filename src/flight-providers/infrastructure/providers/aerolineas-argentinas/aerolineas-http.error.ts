export class AerolineasHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'AerolineasHttpError';
  }
}
