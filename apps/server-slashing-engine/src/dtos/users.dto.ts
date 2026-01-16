import { z } from 'zod';

// Email schema - matches Entity validation rules
export const emailSchema = z
  .string()
  .min(1, { message: 'Email is required' })
  .max(254, { message: 'Email is too long (max 254 characters)' })
  .email({ message: 'Invalid email format' })
  .transform((email) => email.toLowerCase().trim());

// Password schema - matches Entity validation rules
export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters long' })
  .max(128, { message: 'Password is too long (max 128 characters)' })
  .refine((password) => /\d/.test(password) && /[a-zA-Z]/.test(password), {
    message: 'Password must contain at least one letter and one number',
  });

// Signup/Login DTO
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

// Login DTO (same as create but explicitly separated)
export const loginUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Password is required' }), // Skip existing password validation at login
});

export type LoginUserDto = z.infer<typeof loginUserSchema>;

// Update DTO (all fields optional)
export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
