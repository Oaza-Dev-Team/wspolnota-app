import { NextResponse } from 'next/server';
import { usunCookieSesji } from '@/lib/auth/requireUser';

export async function POST(request: Request) {
  await usunCookieSesji();
  return NextResponse.redirect(new URL('/logowanie', request.url), { status: 303 });
}
