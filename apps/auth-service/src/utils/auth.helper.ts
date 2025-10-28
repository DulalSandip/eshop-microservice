import crypto from 'crypto';
import { ValidationError } from '@packages/error-handler';
import { sendEmail } from './SendMail';
import redis from '@packages/libs/redis';
import { NextFunction, Request, Response } from 'express';
import prisma from '@packages/libs/prisma';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validRegistrationData = (
  data: any,
  userType: 'user' | 'seller'
) => {
  const { name, email, password, phone_number, country } = data;

  if (
    !name ||
    !email ||
    !password ||
    (userType === 'seller' && (!phone_number || !country))
  ) {
    throw new ValidationError('All fields are required');
  }

  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format!');
  }
};

export const checkOtpRestrictions = async (
  email: string,
  next: NextFunction
) => {
  if (await redis.get(`otp_lock:${email}`)) {
    throw new ValidationError(
      'Account locked due to multiple failed attempts! Try again after 30 minutes. '
    );
  }

  if (await redis.get(`otp_spam_lock:${email}`)) {
    throw new ValidationError(
      'You have requested too many OTPs in a short time. Please wait 1 hour before requesting again.'
    );
  }

  if (await redis.get(`otp_cooldown:$email`)) {
    throw new ValidationError(
      'You must wait at least 1 minute before requesting another OTP.'
    );
  }
};

export const trackOtpRequests = async (email: string, next: NextFunction) => {
  const otpRequestkey = `otp_request_count:${email}`;
  let otpRequests = parseInt((await redis.get(otpRequestkey)) || '0');

  if (otpRequests >= 2) {
    await redis.set(`otp_spam_lock:${email}`, 'locked', 'EX', 3600); // Lock for 1 hour
    throw new ValidationError(
      'Too many OTP requests. Please wait 1 hour before requesting again.'
    );
  }

  await redis.set(otpRequestkey, otpRequests + 1, 'EX', 3600); // Reset count after 1 hour
};

export const sendOtp = async (
  name: string,
  email: string,
  template: string
) => {
  const otp = crypto.randomInt(100000, 999999).toString();
  await sendEmail(email, 'Verify your Email', template, { name, otp });
  await redis.set(`otp:${email}`, otp, 'EX', 120); // Store OTP in Redis with a 2-minute expiration
  await redis.set(`otp_cooldown:${email}`, 'true', 'EX', 60); //user must wait at least 1 minute before they can request another OTP.
};

export const verifyOtp = async (
  email: string,
  otp: string,
  next: NextFunction
) => {
  //  Check if locked due to failed attempts
  const isLocked = await redis.get(`otp_lock:${email}`);
  if (isLocked) {
    throw new ValidationError(
      'Too many failed attempts. Your account is locked for 30 minutes.'
    );
  }

  const storedOtp = await redis.get(`otp:${email}`);
  if (!storedOtp) {
    throw new ValidationError(
      'Invalid or expired OTP! Please request a new one.'
    );
  }

  const failedAttemptsKey = `otp_attempts:${email}`;
  const failedAttempts = parseInt((await redis.get(failedAttemptsKey)) || '0');
  if (storedOtp !== otp) {
    if (failedAttempts >= 2) {
      await redis.set(`otp_lock:${email}`, 'locked', 'EX', 1800); // Lock for 30 minutes
      await redis.del(`otp:${email}`, failedAttemptsKey);

      throw new ValidationError(
        'Too many failed attempts. Your account is locked for 30 minutes.'
      );
    }
    await redis.set(failedAttemptsKey, failedAttempts + 1, 'EX', 300); // Increment failed attempts count and set expiration to 5 minutes
    throw new ValidationError(
      `Incorrect OTP! You have ${2 - failedAttempts} attempts left.`
    );
  }
  await redis.del(`otp:${email}`, failedAttemptsKey);
};

export const handleForgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
  userType: 'user' | 'seller'
) => {
  try {
    const { email } = req.body;

    if (!email) throw new ValidationError('Email is required!');

    //Find user/seller by email in DB
    const user =
      userType === 'user' &&
      (await prisma.user.findUnique({
        where: { email },
      }));

    if (!user) throw new ValidationError(`${userType} not found!`);

    //check otp restrictions
    await checkOtpRestrictions(email, next);
    await trackOtpRequests(email, next);

    //Generate OTP and send mail
    //forgot-password-user-mail is email template name
    await sendOtp(user.name, email, 'forgot-password-user-mail');
    res.status(200).json({
      success: true,
      message:
        'OTP sent successfully! Please check your email to reset your password.',
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyForgotPasswordOtp = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      throw new ValidationError('Email and OTP are required!');
    }
    await verifyOtp(email, otp, next);
    res.status(200).json({
      status: true,
      message: 'OTP verified successfully! You can now reset your password.',
    });
  } catch (error) {
    next(error);
  }
};
