import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth.service';

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name || null,
      },
    });
  } catch (error: unknown) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Gagal mengambil data pengguna' },
      { status: 500 }
    );
  }
} 