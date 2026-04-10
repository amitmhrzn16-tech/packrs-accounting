/**
 * DMS Client - Handles authentication and data fetching from
 * dms.packrscourier.com.np/dmsadmin
 *
 * The DMS is a server-rendered (Laravel) application with no REST API.
 * We use session-based auth + HTML scraping to pull accounting data.
 */

export interface DmsTransaction {
  type: "income" | "expense";
  branch: string;
  date: string; // YYYY-MM-DD
  account: string; // e.g. "Petty Cash", "Laxmi bank"
  category: string; // e.g. "NCM COD", "Petroleum"
  particulars: string;
  amount: number;
}

export interface DmsFetchResult {
  transactions: DmsTransaction[];
  totalFetched: number;
  errors: string[];
}

export interface DmsLoginResult {
  success: boolean;
  cookies: string;
  error?: string;
}

/**
 * Login to DMS and return session cookies
 */
/**
 * Collect all Set-Cookie headers from a response and merge into cookie string
 */
function collectCookies(res: Response, existingCookies: string): string {
  const cookieMap = new Map<string, string>();

  // Parse existing cookies
  existingCookies.split("; ").filter(Boolean).forEach((c) => {
    const eqIdx = c.indexOf("=");
    if (eqIdx > 0) cookieMap.set(c.substring(0, eqIdx), c);
  });

  // Try getSetCookie (Node 18.14+)
  const newCookies = res.headers.getSetCookie?.() || [];
  newCookies.forEach((c: string) => {
    const pair = c.split(";")[0];
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) cookieMap.set(pair.substring(0, eqIdx), pair);
  });

  // Fallback: parse raw set-cookie header
  if (newCookies.length === 0) {
    const raw = res.headers.get("set-cookie") || "";
    if (raw) {
      // May contain multiple cookies separated by comma + date patterns
      // Simple split by comma where next part starts with a cookie name=value
      raw.split(/,(?=[^ ]+=)/).forEach((c) => {
        const pair = c.trim().split(";")[0];
        const eqIdx = pair.indexOf("=");
        if (eqIdx > 0) cookieMap.set(pair.substring(0, eqIdx), pair);
      });
    }
  }

  return Array.from(cookieMap.values()).join("; ");
}

export async function dmsLogin(
  baseUrl: string,
  username: string,
  password: string
): Promise<DmsLoginResult> {
  try {
    let cookies = "";

    // Step 1: GET the login page to retrieve CSRF token and session cookie
    const loginPageRes = await fetch(`${baseUrl}/login`, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PackrsAccounting/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    cookies = collectCookies(loginPageRes, cookies);
    console.log("[DMS] Login page status:", loginPageRes.status, "cookies:", cookies.substring(0, 100));

    // If redirected to dashboard, already logged in
    if (loginPageRes.status === 302) {
      const loc = loginPageRes.headers.get("location") || "";
      if (loc.includes("dashboard")) {
        return { success: true, cookies };
      }
    }

    const loginHtml = await loginPageRes.text();

    // Parse CSRF token - DMS uses "csrf_test_name" (CodeIgniter)
    const csrfMatch =
      loginHtml.match(/name="csrf_test_name"[^>]*value="([^"]+)"/) ||
      loginHtml.match(/value="([^"]+)"[^>]*name="csrf_test_name"/) ||
      loginHtml.match(/name="_token"[^>]*value="([^"]+)"/);

    const csrfToken = csrfMatch?.[1] || "";

    // Detect the form action URL
    const actionMatch = loginHtml.match(/<form[^>]*action="([^"]+)"/);
    const formAction = actionMatch?.[1] || `${baseUrl}/account/userLogin`;

    console.log("[DMS] CSRF:", csrfToken ? "found" : "missing", "Action:", formAction);

    // Step 2: POST login credentials
    const formData: Record<string, string> = {
      username: username,
      password: password,
    };
    if (csrfToken) formData.csrf_test_name = csrfToken;

    const loginRes = await fetch(formAction, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PackrsAccounting/1.0)",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        Accept: "text/html,application/xhtml+xml",
        Referer: `${baseUrl}/login`,
      },
      body: new URLSearchParams(formData).toString(),
    });

    cookies = collectCookies(loginRes, cookies);
    const status = loginRes.status;
    const location = loginRes.headers.get("location") || "";

    console.log("[DMS] Login POST status:", status, "location:", location, "cookies:", cookies.substring(0, 100));

    // Helper — verify an authenticated session by hitting common landing pages.
    // We accept success if ANY of these return 200 AND don't render the login form.
    const verifySession = async (): Promise<{ ok: boolean; reason: string }> => {
      const candidates = [
        "/dashboard",
        "/account/dashboard",
        "/home",
        "/account/home",
        "/",
      ];
      for (const path of candidates) {
        try {
          const url = `${baseUrl}${path}`;
          const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; PackrsAccounting/1.0)",
              Cookie: cookies,
              Accept: "text/html,application/xhtml+xml",
            },
          });
          cookies = collectCookies(res, cookies);

          // If server redirects us back to /login — not authenticated
          if (res.status === 302 || res.status === 301) {
            const loc = (res.headers.get("location") || "").toLowerCase();
            if (loc.includes("login") || loc.includes("signin")) {
              continue;
            }
            // Redirect to something else — likely success, follow once
            const next = loc.startsWith("http")
              ? loc
              : `${baseUrl}${loc.startsWith("/") ? "" : "/"}${loc}`;
            const res2 = await fetch(next, {
              method: "GET",
              redirect: "manual",
              headers: { Cookie: cookies, Accept: "text/html" },
            });
            cookies = collectCookies(res2, cookies);
            if (res2.status === 200) {
              const html2 = await res2.text();
              if (!looksLikeLoginPage(html2)) {
                return { ok: true, reason: `verified via redirect from ${path}` };
              }
            }
            continue;
          }

          if (res.status === 200) {
            const html = await res.text();
            if (!looksLikeLoginPage(html)) {
              return { ok: true, reason: `verified via ${path}` };
            }
          }
        } catch {}
      }
      return { ok: false, reason: "no authenticated landing page reachable" };
    };

    // Follow redirect chain to collect all cookies
    if (status === 302 || status === 301) {
      const loc = location.toLowerCase();
      // If the POST redirects us straight back to the login page → bad creds
      if (loc.includes("login") || loc.includes("signin")) {
        return {
          success: false,
          cookies: "",
          error: "Invalid credentials (server redirected back to login)",
        };
      }

      const redirectUrl = location.startsWith("http")
        ? location
        : `${baseUrl}${location.startsWith("/") ? "" : "/"}${location}`;

      const redirectRes = await fetch(redirectUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PackrsAccounting/1.0)",
          Cookie: cookies,
          Accept: "text/html",
        },
      });

      cookies = collectCookies(redirectRes, cookies);
      console.log("[DMS] Redirect status:", redirectRes.status, "cookies now:", cookies.substring(0, 100));

      // Even after following the redirect, verify the session is usable
      const verified = await verifySession();
      if (verified.ok) {
        console.log("[DMS] Login success —", verified.reason);
        return { success: true, cookies };
      }
      return {
        success: false,
        cookies: "",
        error: `Login redirected to ${location} but session not authenticated`,
      };
    }

    // If 200 response, the server most likely re-rendered the login page on
    // failure, OR rendered the dashboard directly. Inspect the body to decide.
    if (status === 200) {
      const body = await loginRes.text();

      if (looksLikeLoginPage(body)) {
        // Look for an inline error message so we can give the user something useful
        const errMsg = extractLoginError(body);
        return {
          success: false,
          cookies: "",
          error: errMsg
            ? `Login failed: ${errMsg}`
            : "Login failed — server returned login page (check username/password)",
        };
      }

      // Body doesn't look like the login form — probably already on an authenticated
      // page. Double-check by actually hitting a protected route.
      const verified = await verifySession();
      if (verified.ok) {
        console.log("[DMS] Login success —", verified.reason);
        return { success: true, cookies };
      }

      return {
        success: false,
        cookies: "",
        error:
          "Login returned 200 but session could not be verified against any dashboard route",
      };
    }

    return {
      success: false,
      cookies: "",
      error: `Login failed with HTTP ${status}`,
    };
  } catch (error: any) {
    return {
      success: false,
      cookies: "",
      error: `Login error: ${error?.message || "Unknown error"}`,
    };
  }
}

/**
 * Heuristic: does this HTML look like the DMS login page?
 * We check for multiple independent signals because a single keyword
 * (e.g. "login") can appear on any page.
 */
function looksLikeLoginPage(html: string): boolean {
  if (!html) return false;
  const lower = html.toLowerCase();

  // Strong signal: a <form> that POSTs to a login endpoint
  const hasLoginForm =
    /<form[^>]*action="[^"]*(login|signin|userlogin)[^"]*"/i.test(html);

  // Strong signal: a password input + a username/email input in the same page
  const hasPasswordField = /<input[^>]*type=["']?password["']?/i.test(html);
  const hasUserField =
    /<input[^>]*name=["']?(username|email|user|login)["']?/i.test(html);
  const hasCreds = hasPasswordField && hasUserField;

  // Weak signal: obvious "sign in" title/button
  const hasSignInText =
    lower.includes("sign in") ||
    lower.includes("signin") ||
    lower.includes("please login") ||
    lower.includes("login to continue");

  // Page is a login page if it has a login form OR both credential fields
  return hasLoginForm || hasCreds || (hasPasswordField && hasSignInText);
}

/**
 * Best-effort extraction of a server-rendered error message from a failed
 * login response (so we can surface "Invalid credentials" etc. to the user).
 */
function extractLoginError(html: string): string | null {
  // Common patterns: <div class="alert alert-danger">...</div>, flash messages, etc.
  const patterns = [
    /<div[^>]*class="[^"]*(?:alert-danger|error|invalid-feedback|text-danger)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<span[^>]*class="[^"]*(?:error|text-danger)[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    /<p[^>]*class="[^"]*(?:error|text-danger)[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const text = m[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 0 && text.length < 200) return text;
    }
  }
  return null;
}

/**
 * Fetch income or expense data from DMS for a given date range
 */
export async function dmsFetchTransactions(
  baseUrl: string,
  cookies: string,
  type: "income" | "expense",
  fromDate: string, // YYYY-MM-DD
  toDate: string, // YYYY-MM-DD
  branchId: string = "1"
): Promise<DmsFetchResult> {
  const transactions: DmsTransaction[] = [];
  const errors: string[] = [];

  try {
    const endpoint = type === "income" ? "income" : "expense";
    // DMS uses different date parameter names for income vs expense
    const fromParam = type === "income" ? "from_income_date" : "from_exp_date";
    const toParam = type === "income" ? "to_income_date" : "to_exp_date";
    const url = `${baseUrl}/${endpoint}?${fromParam}=${fromDate}&${toParam}=${toDate}&branch_id=${branchId}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "PackrsAccounting/1.0",
        Cookie: cookies,
        Accept: "text/html",
      },
    });

    if (res.status !== 200) {
      errors.push(`Failed to fetch ${type} data: HTTP ${res.status}`);
      return { transactions, totalFetched: 0, errors };
    }

    const html = await res.text();

    // Check if we were redirected to login (session expired)
    // Be specific: look for an actual login FORM, not just "/login" in any context
    // (the DMS theme has "/login.html" in a comment on every page)
    const isLoginPage =
      (html.includes('name="password"') && html.includes('name="username"')) ||
      html.includes('action="/dmsadmin/account/userLogin"') ||
      (html.includes('<form') && html.includes('/login') && html.includes('name="csrf_test_name"'));

    if (isLoginPage) {
      errors.push("Session expired - need to re-login");
      return { transactions, totalFetched: 0, errors };
    }

    // Parse the HTML table
    const parsed = parseTransactionTable(html, type);
    transactions.push(...parsed);

    // Check for pagination - fetch all pages
    let page = 2;
    let hasNextPage = html.includes("page=2") || html.includes('rel="next"');

    while (hasNextPage && page <= 100) {
      // Safety limit: max 100 pages
      try {
        const pageUrl = `${url}&page=${page}`;
        const pageRes = await fetch(pageUrl, {
          method: "GET",
          headers: {
            "User-Agent": "PackrsAccounting/1.0",
            Cookie: cookies,
            Accept: "text/html",
          },
        });

        if (pageRes.status !== 200) break;

        const pageHtml = await pageRes.text();
        const pageRows = parseTransactionTable(pageHtml, type);

        if (pageRows.length === 0) break;

        transactions.push(...pageRows);

        hasNextPage = pageHtml.includes(`page=${page + 1}`) || pageHtml.includes('rel="next"');
        page++;
      } catch {
        break;
      }
    }
  } catch (error: any) {
    errors.push(`Fetch error for ${type}: ${error?.message || "Unknown error"}`);
  }

  return { transactions, totalFetched: transactions.length, errors };
}

/**
 * Parse HTML table rows into DmsTransaction objects.
 * Table structure:
 *   S.NO. | BRANCH | DATE | ACCOUNT | CATEGORY | PARTICULARS | AMOUNT | ACTIONS
 */
function parseTransactionTable(
  html: string,
  type: "income" | "expense"
): DmsTransaction[] {
  const transactions: DmsTransaction[] = [];

  // Extract table body content
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return transactions;

  const tbody = tbodyMatch[1];

  // Extract each row
  const rowMatches = tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];

    // Extract cell contents
    const cells: string[] = [];
    const cellMatches = rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);

    for (const cellMatch of cellMatches) {
      // Strip HTML tags and trim whitespace
      const text = cellMatch[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      cells.push(text);
    }

    // Expected: [sno, branch, date, account, category, particulars, amount, actions]
    if (cells.length >= 7) {
      const date = cells[2]; // Already YYYY-MM-DD format
      const amount = parseFloat(cells[6].replace(/,/g, ""));

      if (date && !isNaN(amount) && amount > 0) {
        transactions.push({
          type,
          branch: cells[1],
          date,
          account: cells[3],
          category: cells[4] || "",
          particulars: cells[5] || "",
          amount,
        });
      }
    }
  }

  return transactions;
}

/**
 * Fetch all accounting data (income + expense) for a date range
 */
export async function dmsFetchAllData(
  baseUrl: string,
  cookies: string,
  fromDate: string,
  toDate: string,
  branchId: string = "1"
): Promise<{
  income: DmsFetchResult;
  expense: DmsFetchResult;
}> {
  const [income, expense] = await Promise.all([
    dmsFetchTransactions(baseUrl, cookies, "income", fromDate, toDate, branchId),
    dmsFetchTransactions(baseUrl, cookies, "expense", fromDate, toDate, branchId),
  ]);

  return { income, expense };
}
