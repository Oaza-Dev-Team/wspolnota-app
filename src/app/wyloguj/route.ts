import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/requireUser';

export async function POST(request: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/logowanie', request.url), { status: 303 });
}
