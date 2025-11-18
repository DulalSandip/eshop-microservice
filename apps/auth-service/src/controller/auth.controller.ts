import { NextFunction, Request, Response } from 'express';
import {
  checkOtpRestrictions,
  handleForgotPassword,
  sendOtp,
  trackOtpRequests,
  validRegistrationData,
  verifyForgotPasswordOtp,
  verifyOtp,
} from '../utils/auth.helper';
import prisma from '@packages/libs/prisma';
import { AuthenticationError, ValidationError } from '@packages/error-handler';
import bcrypt from 'bcryptjs';
import jwt, { JsonWebTokenError } from 'jsonwebtoken';
import { setCookie } from '../utils/cookies/setCookie';

//Register a new user
export const userRegistration = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    validRegistrationData(req.body, 'user');
    const { name, email } = req.body;

    const existingUser = await prisma.users.findUnique({ where: { email } });

    if (existingUser) {
      return next(new ValidationError('User already exists with this email!'));
    }

    await checkOtpRestrictions(email, next);
    await trackOtpRequests(email, next);
    await sendOtp(name, email, 'user-activation-mail');

    res.status(200).json({
      message:
        'OTP sent successfully! Please check your email to verify your account.',
    });
  } catch (error) {
    console.log(error, 'ERROR');
    return next(error);
  }
};

//verify user with OTP
export const verifyUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, otp, password, name } = req.body;

    if (!email || !otp || !password || !name) {
      return next(new ValidationError('All fields are required!'));
    }

    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser)
      return next(new ValidationError('User already exists with this email!'));

    await verifyOtp(email, otp, next);

    //after successful verification, create the user

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.users.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });
    return res.status(201).json({
      user: newUser,
      success: true,
      messageL: 'User registered successfully!',
    });
  } catch (error) {
    return next(error);
  }
};

// login user

export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ValidationError('Email and Password are required!'));
    }

    const user = await prisma.users.findUnique({
      where: { email },
    });

    if (!user) return next(new AuthenticationError("user doesn't exists"));

    //verify password

    const ispasswordValid = await bcrypt.compare(password, user.password!);

    if (!ispasswordValid) {
      return next(new AuthenticationError('Invalid email or password!'));
    }

    // Generate access and refresh tokens
    const accessToken = jwt.sign(
      { id: user.id, role: 'user' },
      process.env.ACCESS_TOKEN_SECRET as string,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user.id, role: 'user' },
      process.env.REFRESH_TOKEN_SECRET as string,
      { expiresIn: '7d' }
    );

    //store the refresh and access token in an httponly secure cookie
    setCookie(res, 'refresh_token', refreshToken);
    setCookie(res, 'access_token', accessToken);

    return res.status(200).json({
      status: true,
      message: 'Login successful!! ',
      user,
    });
  } catch (error) {
    console.log(error, 'error');
    return next(error);
  }
};

//generate new access token using refresh token
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
      return new ValidationError('Refresh token not found, unauthorized!');
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET as string
    ) as { id: string; role: string };

    if (!decoded || !decoded.id || !decoded.role) {
      return new JsonWebTokenError('Forbidden! Invalid refresh token');
    }

    const user = await prisma.users.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return new AuthenticationError("Forbidden! User doesn't exists");
    }

    const newAccessToken = jwt.sign(
      {
        id: decoded.id,
        role: decoded.role,
      },
      process.env.ACCESS_TOKEN_SECRET as string,
      { expiresIn: '15m' }
    );

    setCookie(res, 'access_token', newAccessToken);
    return res.status(201).json({
      success: true,
      message: 'New access token generated successfully',
      accessToken: newAccessToken,
    });
  } catch (error) {
    return next(error);
  }
};

//get logged in user details
export const getUser = async (req: any, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    res.status(201).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

//user forgot password

export const userForgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  await handleForgotPassword(req, res, next, 'user');
};

//verify user forgot password OTP
export const verifyUserForgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  await verifyForgotPasswordOtp(req, res, next);
};

export const resetUserPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return next(new ValidationError('Email and new password are required!'));
    }
    const user = await prisma.users.findUnique({
      where: { email },
    });
    if (!user) return next(new ValidationError('User not found!'));

    //compare new password with existing password
    const isSamePassword = await bcrypt.compare(newPassword, user.password!);
    if (isSamePassword) {
      return next(
        new ValidationError('New password cannot be same as old password!')
      );
    }
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.users.update({
      where: { email },
      data: {
        password: hashedPassword,
      },
    });

    return res.status(200).json({
      status: true,
      message:
        'Password reset successfully! You can now login with your new password...',
    });
  } catch (eror) {
    return next(eror);
  }
};

//seller registration
export const sellerRegistration = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    validRegistrationData(req.body, 'seller');
    const { name, email } = req.body;

    const existingSeller = await prisma.sellers.findUnique({
      where: { email },
    });

    if (existingSeller) {
      return next(
        new ValidationError('Seller already exists with this email!')
      );
    }

    await checkOtpRestrictions(email, next);
    await trackOtpRequests(email, next);
    await sendOtp(name, email, 'seller-activation-mail');

    res.status(200).json({
      message:
        'OTP sent successfully! Please check your email to verify your account.',
    });
  } catch (error) {
    console.log(error, 'ERROR');
    return next(error);
  }
};

//verify user with OTP
export const verifySeller = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, otp, password, name, country, phone_number } = req.body;

    if (!email || !otp || !password || !name || !country || !phone_number) {
      return next(new ValidationError('All fields are required!'));
    }

    const existingSeller = await prisma.sellers.findUnique({
      where: { email },
    });

    if (existingSeller)
      return next(
        new ValidationError('Seller already exists with this email!')
      );

    await verifyOtp(email, otp, next);

    //after successful verification, create the seller account

    const hashedPassword = await bcrypt.hash(password, 10);
    const newSeller = await prisma.sellers.create({
      data: {
        name,
        email,
        password: hashedPassword,
        country,
        phone_number,
      },
    });
    return res.status(201).json({
      user: newSeller,
      success: true,
      messageL: 'Seller registered successfully!',
    });
  } catch (error) {
    return next(error);
  }
};
