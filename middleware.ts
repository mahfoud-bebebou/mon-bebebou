import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isHome = pathname === "/";
  const isLogin = pathname.startsWith("/login");
  const isRegister = pathname.startsWith("/register");
  const isOnboarding = pathname.startsWith("/onboarding");
  const isProfil = pathname.startsWith("/profil");
  const isSuivi = pathname.startsWith("/suivi");
  const isChat = pathname.startsWith("/chat");
  const isCompte = pathname.startsWith("/compte");

  if (!user && isCompte) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    !user &&
    !isHome &&
    !isLogin &&
    !isRegister &&
    !isProfil &&
    !isSuivi &&
    !isChat
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && (isLogin || isRegister)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user && isOnboarding) {
    const { data: babies } = await supabase.from("babies").select("id").limit(1);

    if (babies && babies.length > 0) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (user && !isLogin && !isOnboarding) {
    const { data: babies } = await supabase.from("babies").select("id").limit(1);

    if (!babies || babies.length === 0) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
