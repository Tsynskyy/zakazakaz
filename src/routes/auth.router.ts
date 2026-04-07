import { NextFunction, Request, Response, Router } from 'express';
import * as authService from '../services/auth.service';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, role } = req.body;

    const tokens = await authService.register(email, password, role);

    res.status(201).json(tokens);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const tokens = await authService.login(email, password);

    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;

    const tokens = await authService.refresh(refresh_token);

    res.json(tokens);
  } catch (err) {
    next(err);
  }
});
