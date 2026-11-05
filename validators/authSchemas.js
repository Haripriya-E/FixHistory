import { z } from 'zod';

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(120, 'Email is too long')
  .pipe(z.email({ error: 'Enter a valid email address' }));

const newPassword = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

const name = z
  .string({ error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(60, 'Name must be 60 characters or fewer');

export const registerSchema = z.object({ name, email, password: newPassword });

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

export const profileSchema = z.object({ name });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: 'Current password is required' }).min(1, 'Current password is required'),
    newPassword,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });
