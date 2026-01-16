import { type UserCreateData } from '@entities/user.entity';
import { RequestWithUser } from '@interfaces/auth.interface';
import { AuthService } from '@services/auth.service';
import { asyncHandler } from '@utils/asyncHandler';
import type { Request, Response } from 'express';
import { inject, injectable } from 'tsyringe';

@injectable()
export class AuthController {
  constructor(@inject(AuthService) private readonly authService: AuthService) {}

  public signUp = asyncHandler(async (req: Request, res: Response) => {
    const userData: UserCreateData = req.body;
    const signUpUserData = await this.authService.signup(userData);

    res.status(201).json({ data: signUpUserData.toResponse(), message: 'signup' });
  });

  public logIn = asyncHandler(async (req: Request, res: Response) => {
    const loginData: { email: string; password: string } = req.body;
    const { cookie, user } = await this.authService.login(loginData);

    res.setHeader('Set-Cookie', [cookie]);
    res.status(200).json({ data: user.toResponse(), message: 'login' });
  });

  public logOut = asyncHandler(async (req: Request, res: Response) => {
    const userReq = req as RequestWithUser;
    const user = userReq.user;
    await this.authService.logout(user);

    res.clearCookie('Authorization', {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      // secure: true, // Only in production with HTTPS
    });
    res.status(200).json({ message: 'logout' });
  });
}
