import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import * as productsService from '../services/products.service';

export const productsRouter = Router();

productsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(0, parseInt((req.query.page as string) ?? '0', 10));
    const size = Math.min(100, Math.max(1, parseInt((req.query.size as string) ?? '20', 10)));
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const result = await productsService.listProducts({ page, size, status, category });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

productsRouter.post('/', requireRole('SELLER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sellerId = req.userRole === 'ADMIN' ? null : req.userId!;

    const product = await productsService.createProduct(req.body, sellerId);

    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

productsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productsService.getProductById(req.params.id!);

    res.json(product);
  } catch (err) {
    next(err);
  }
});

productsRouter.put('/:id', requireRole('SELLER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await productsService.updateProduct(req.params.id!, req.body, req.userId!, req.userRole!);

    res.json(product);
  } catch (err) {
    next(err);
  }
});

productsRouter.delete('/:id', requireRole('SELLER', 'ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await productsService.archiveProduct(req.params.id!, req.userId!, req.userRole!);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
