import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 no captura los rechazos de los handlers `async`. Si dentro de una
// ruta falla una consulta a Prisma, la promesa queda rechazada sin manejar y
// Node cierra el proceso entero. Este envoltorio reenvia el error a Express
// con next(), que lo entrega al middleware de errores de index.ts.
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
