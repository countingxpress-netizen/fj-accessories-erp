import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (!user && !pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // role='customer_pi_only' — শুধু নির্দিষ্ট কাস্টমারের Proforma Invoice দেখা/এডিট করতে
  // পারবে (নতুন PI তৈরি না, বাকি কোনো মডিউল না)। মেনু লুকানোই যথেষ্ট না — সরাসরি URL
  // দিয়ে ঢোকার চেষ্টা এখানেই আটকাতে হবে, নাহলে data leak হয়ে যাবে।
  if (user && !pathname.startsWith("/login")) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (appUser?.role === "customer_pi_only") {
      const isAllowed =
        pathname === "/dashboard/settings/change-password" ||
        (pathname.startsWith("/dashboard/lc-export/proforma") &&
          !pathname.startsWith("/dashboard/lc-export/proforma/new"));
      if (!isAllowed) {
        return NextResponse.redirect(new URL("/dashboard/lc-export/proforma", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};