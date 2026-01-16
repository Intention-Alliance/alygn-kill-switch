import { NODE_ENV, SECRET_KEY } from '@config/env';
import { User, type UserCreateData } from '@entities/user.entity';
import { HttpException } from '@exceptions/httpException';
import { DataStoredInToken, TokenData } from '@interfaces/auth.interface';
import type { IUsersRepository } from '@repositories/users.repository';
import { UsersRepository } from '@repositories/users.repository';
import { sign } from 'jsonwebtoken';
import { inject, injectable } from 'tsyringe';

@injectable()
export class AuthService {
  constructor(@inject(UsersRepository) private usersRepository: IUsersRepository) {}

  private createToken(user: User): TokenData {
    if (!SECRET_KEY) throw new Error('SECRET_KEY is not defined');

    if (user.id === undefined) {
      throw new Error('User id is undefined');
    }

    const dataStoredInToken: DataStoredInToken = { id: user.id };
    const expiresIn = 60 * 60; // 1h
    const token = sign(dataStoredInToken, SECRET_KEY as string, { expiresIn });
    return { expiresIn, token };
  }

  private createCookie(tokenData: TokenData): string {
    return `Authorization=${tokenData.token}; HttpOnly; Max-Age=${
      tokenData.expiresIn
    }; Path=/; SameSite=Lax;${NODE_ENV === 'production' ? ' Secure;' : ''}`;
  }

  public async signup(userData: UserCreateData): Promise<User> {
    const findUser = await this.usersRepository.findByEmail(userData.email);
    if (findUser) throw new HttpException(409, `Email is already in use`);

    // Create using Entity class factory method (all validation handled automatically)
    const newUser = await User.create(userData);
    await this.usersRepository.save(newUser);
    return newUser;
  }

  public async login(loginData: {
    email: string;
    password: string;
  }): Promise<{ cookie: string; user: User }> {
    const findUser = await this.usersRepository.findByEmail(loginData.email);
    if (!findUser) throw new HttpException(401, `Invalid email or password.`);

    // Verify password using Entity's domain method
    const isPasswordMatching = await findUser.verifyPassword(loginData.password);
    if (!isPasswordMatching) throw new HttpException(401, 'Password is incorrect');

    const tokenData = this.createToken(findUser);
    const cookie = this.createCookie(tokenData);

    return { cookie, user: findUser };
  }

  public async logout(user: User): Promise<void> {
    // In production, logout can implement session/refresh token blacklisting on server
    // Here, deleting the client cookie is sufficient
    console.log(`User with email ${user.email} logged out.`);

    return;
  }
}
