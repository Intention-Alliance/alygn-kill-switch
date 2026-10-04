import { HttpException } from '@exceptions/httpException'
import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny } from 'zod'

export function ValidationMiddleware(schema: ZodTypeAny) {
	return (req: Request, res: Response, next: NextFunction) => {
		const result = schema.safeParse(req.body)
		if (!result.success) {
			const message = result.error.issues.map((e) => e.message).join(', ')
			return next(new HttpException(400, message))
		}
		req.body = result.data
		next()
	}
}
