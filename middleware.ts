import { NextResponse } from "next/server";

export function middleware(request: { url: string | URL; headers: HeadersInit }) {
  const requestHeaders = new Headers(request.headers);

  const response = NextResponse.next();
  response.headers.delete('X-Frame-Options');
  response.headers.set('Content-Security-Policy', 'frame-ancestors https://bimwerxfea.com'); // Adjust as needed

  return response;
}

export const config = {
  matcher: '/:path*',
};
