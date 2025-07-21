import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { validateEmail, validatePassword } from '@/lib/validation';
import { registerRateLimiter } from '@/lib/rate-limit';
import { DatabaseService } from '@/lib/database';

export async function POST(req: Request) {
  try {
    // Get client IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    
    // Check rate limiting
    if (!registerRateLimiter.isAllowed(ip)) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }
    
    const { email, password } = await req.json();

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.message },
        { status: 400 }
      );
    }
    
    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // Check if user already exists in database
    console.log('Debug: Checking if user exists with email:', email);
    try {
      const existingUsers = await DatabaseService.getRecords('users', {
        filter: { email },
        limit: 1
      });
      
      console.log('Debug: Existing users query result:', existingUsers);
      
      if (existingUsers.length > 0) {
        console.log('Debug: User already exists');
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 409 }
        );
      }
      
      console.log('Debug: No existing user found, proceeding with registration');
    } catch (error) {
      console.error('Debug: Error checking existing user:', error);
      console.error('Debug: Error details:', error instanceof Error ? error.message : error);
      // Continue with registration if database check fails
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user in Supabase database
    const userData = {
      email,
      password_hash: passwordHash,
      role: 'user'
    };

    console.log('Debug: Attempting to create user with data:', userData);
    
    let newUser;
    try {
      newUser = await DatabaseService.insertRecord('users', userData);
      console.log('Debug: User successfully created:', newUser);
      console.log(`User created in database: ${email}`);
    } catch (createError) {
      console.error('Debug: Error creating user:', createError);
      console.error('Debug: Create error details:', createError instanceof Error ? createError.message : createError);
      throw createError;
    }

    // Return success without sensitive data
    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role
      },
      message: 'Registration successful. You can now log in.'
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to register user' },
      { status: 500 }
    );
  }
} 