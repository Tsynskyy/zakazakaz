import { NextFunction, Request, Response, Router } from 'express';
import { requireRole } from '../middleware/auth.middleware';
import * as promoCodesService from '../services/promo-codes.service';

export const promocodesRouter = Router();

promocodesRouter.post('/', requireRole('SELLER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = await promoCodesService.createPromoCode(req.body);

    res.status(201).json(code);
  } catch (err) {
    next(err);
  }
});
