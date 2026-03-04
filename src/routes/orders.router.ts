import { NextFunction, Request, Response, Router } from 'express';
import { requireRole } from '../middleware/auth.middleware';
import * as ordersService from '../services/orders.service';

export const ordersRouter = Router();

ordersRouter.post('/', requireRole('USER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.createOrder(req.userId!, req.body.items, req.body.promo_code ?? null);

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

ordersRouter.get('/:id', requireRole('USER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.getOrder(req.params.id!, req.userId!, req.userRole!);

    res.json(order);
  } catch (err) {
    next(err);
  }
});

ordersRouter.put('/:id', requireRole('USER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.updateOrder(req.params.id!, req.body.items, req.userId!, req.userRole!);

    res.json(order);
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/:id/cancel', requireRole('USER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await ordersService.cancelOrder(req.params.id!, req.userId!, req.userRole!);

    res.json(order);
  } catch (err) {
    next(err);
  }
});
