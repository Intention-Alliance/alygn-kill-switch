import { HttpException } from '@exceptions/httpException'
import type { RequestHandler } from 'express'

export const NotFoundMiddleware: RequestHandler = (_req, _res, next) => {
	next(new HttpException(404, 'Not Found'))
}
