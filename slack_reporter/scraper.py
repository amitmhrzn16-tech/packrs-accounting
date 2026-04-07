"""
scraper.py — Logs into Packrs Courier DMS and scrapes data for the full report.

DMS endpoints and their table structures (verified live):

  POST /account/userLogin  — login (CSRF: csrf_test_name)

  GET /dashboard — system-wide status counts
      Values in <span data-stat="..."> elements inside .circle-tile-content divs.
      Labels in .circle-tile-description elements.
      Values load via inline JS, present in initial HTML.

  GET /package — all packages (date-filterable)
      th: [checkbox] Branch | PackageID | Vendor | Customer | Mobile | Address | Amount | PkgType | CreatedDate | Status | Actions
      td:   0          1        2          3         4         5        6         7         8          9            10       (11=Actions)
      Total row in tfoot.

  GET /package/warehouse — warehouse packages (date-filterable)
      th: [checkbox] SN | Branch | PackageNumber | Vendor | Customer | Address | Mobile | Amount | PkgType | Status | Action
      td:   0         1     2          3             4         5         6        7        8         9        10       11
      Total row in tfoot.

  GET /package/ready-to-pick — VENDOR-level (NOT package-level!)
      th: SN | Branch | VendorName | StreetAddress | PhoneNo | MobileNo
      td:  0     1         2            3              4         5

  GET /package/pick-up — VENDOR-level (same as ready-to-pick)
      th: S.no | Branch | VendorName | StreetAddress | PhoneNo | MobileNo
      td:  0       1         2            3              4         5

  GET /package/receive — VENDOR-level (same structure)
      th: S.no | Branch | VendorName | StreetAddress | PhoneNo | MobileNo
      td:  0       1         2            3              4         5

  GET /package/deliveries — deliveries with rider/courier info
      th: [checkbox] SN | Branch | PkgNumber | Vendor | Customer | Mobile | Address | CreatedDate | Amount | PkgType | DeliveryDate | Rider/Courier | Status | Actions
      td:   0         1     2         3          4         5         6        7           8           9        10          11             12             13
      (14 cells per row, headers may show extra NCM columns)

  GET /invoice — proforma invoices
      th: [checkbox] Branch | ProformaInvoiceID | TotalPackage | DateOfIssue | VendorName | PackageCharge | PickUpCharge | RiderCharge | CourierCharge | Status | Action
      td:   0          1           2                 3             4              5             6               7              8             9            10       11
"""

import logging
import re
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from datetime import datetime
import pytz

logger = logging.getLogger(__name__)

NPT = pytz.timezone("Asia/Kathmandu")
HISTORY_START = "2025-01-01"
REQUEST_TIMEOUT = 180  # 3 minutes — the DMS server can be very slow

# ---------------------------------------------------------------------------
# Column maps (0-based index of <td> elements in each table row)
# ---------------------------------------------------------------------------

# /package table (0=checkbox)
PKG_COLS = {
    "branch": 1, "package_id": 2, "vendor": 3, "customer": 4,
    "mobile": 5, "address": 6, "amount": 7, "pkg_type": 8,
    "created_date": 9, "status": 10,
}

# /package/warehouse table (0=checkbox, 1=SN)
WAREHOUSE_COLS = {
    "sn": 1, "branch": 2, "package_id": 3, "vendor": 4, "customer": 5,
    "address": 6, "mobile": 7, "amount": 8, "pkg_type": 9, "status": 10,
}

# /package/ready-to-pick, /package/pick-up, /package/receive — VENDOR-level
VENDOR_COLS = {
    "sn": 0, "branch": 1, "vendor": 2, "address": 3, "phone": 4, "mobile": 5,
}

# /package/deliveries table (0=checkbox, 1=SN)
DELIVERY_COLS = {
    "sn": 1, "branch": 2, "package_id": 3, "vendor": 4, "customer": 5,
    "mobile": 6, "address": 7, "created_date": 8, "amount": 9,
    "pkg_type": 10, "delivery_date": 11, "rider_courier": 12, "status": 13,
}

# /invoice table (0=checkbox)
INVOICE_COLS = {
    "branch": 1, "invoice_id": 2, "total_package": 3, "date_of_issue": 4,
    "vendor": 5, "package_charge": 6, "pickup_charge": 7,
    "rider_charge": 8, "courier_charge": 9, "invoice_status": 10,
}


class DMSScraper:
    """Session-based scraper for Packrs Courier DMS."""

    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        })
        # Retry up to 3 times on connection/read errors with backoff
        retry_strategy = Retry(
            total=3,
            backoff_factor=2,  # waits 2s, 4s, 8s between retries
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------
    def login(self) -> bool:
        login_page_url = f"{self.base_url}"
        logger.info("Fetching login page: %s", login_page_url)
        resp = self.session.get(login_page_url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        csrf_input = soup.find("input", {"name": "csrf_test_name"})
        post_url = f"{self.base_url}/account/userLogin"
        payload = {"username": self.username, "password": self.password}
        if csrf_input:
            payload["csrf_test_name"] = csrf_input["value"]

        logger.info("Posting login to: %s", post_url)
        resp = self.session.post(post_url, data=payload, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        resp.raise_for_status()

        if "dashboard" in resp.url.lower() or "logout" in resp.text.lower():
            logger.info("Login successful")
            return True

        dash = self.session.get(f"{self.base_url}/dashboard", timeout=REQUEST_TIMEOUT)
        if "dashboard" in dash.url.lower():
            return True
        logger.error("Login failed. Final URL: %s", resp.url)
        return False

    # ------------------------------------------------------------------
    # Dashboard stats via JSON API
    # ------------------------------------------------------------------
    def scrape_dashboard(self) -> dict:
        """
        Fetch dashboard stats from the JSON API endpoint.
        The dashboard HTML loads values via JS from /dashboard/stats.
        """
        url = f"{self.base_url}/dashboard/stats"
        logger.info("Fetching dashboard stats from: %s", url)

        resp = self.session.get(url, timeout=REQUEST_TIMEOUT, headers={
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json",
        })
        resp.raise_for_status()

        stat_map = {
            "totalPackages": "Total Number of Packages",
            "totalDelivered": "Delivered",
            "totalOnlinePay": "Online Pay",
            "totalOnlinePayVendor": "Online Pay Vendor",
            "totalCallNotReceived": "Call Not Received",
            "totalPostponed": "Postponed",
            "totalCancelled": "Cancelled",
            "totalReadyToDeliver": "Ready to Deliver",
            "totalInTransit": "In Transit",
            "totalWarehouse": "Warehouse",
            "totalVerified": "Verified",
            "totalInvoiced": "Invoiced",
            "totalReadyToPick": "Ready To Pick",
            "totalPickUp": "Pick Up",
            "totalPicked": "Picked",
            "totalReceive": "Receive",
        }

        stats = {}
        try:
            data = resp.json()
            for api_key, label in stat_map.items():
                val = data.get(api_key)
                if val is not None:
                    try:
                        stats[label] = int(val)
                    except (ValueError, TypeError):
                        pass
        except Exception as e:
            logger.warning("Failed to parse dashboard JSON: %s", e)
            # Fallback: parse HTML page text
            page_resp = self.session.get(f"{self.base_url}/dashboard", timeout=REQUEST_TIMEOUT)
            soup = BeautifulSoup(page_resp.text, "lxml")
            all_text = soup.get_text("\n", strip=True)
            segments = [s.strip() for s in all_text.split("\n") if s.strip()]
            for i in range(len(segments) - 1):
                label = segments[i]
                value_str = segments[i + 1].replace(",", "")
                if re.match(r"^\d+$", value_str):
                    stats[label] = int(value_str)
            wanted = set(stat_map.values())
            stats = {k: v for k, v in stats.items() if k in wanted}

        logger.info("Dashboard: %d stats collected", len(stats))
        return stats

    # ------------------------------------------------------------------
    # Table helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_table(soup: BeautifulSoup, col_map: dict,
                     id_field: str = "package_id") -> list[dict]:
        """Parse a table using 0-based column indices."""
        rows = []
        table = soup.find("table")
        if not table:
            return rows
        tbody = table.find("tbody") or table
        for tr in tbody.find_all("tr"):
            cells = tr.find_all("td")
            if not cells or len(cells) < 2:
                continue
            # Skip "No Package Found" rows
            if len(cells) == 1:
                continue
            first_text = cells[0].get_text(strip=True).lower()
            if "no package" in first_text or "no data" in first_text or "total" in first_text:
                continue
            row = {}
            for name, idx in col_map.items():
                if idx < len(cells):
                    row[name] = cells[idx].get_text(strip=True)
                else:
                    row[name] = ""
            # Skip rows without the ID field
            if id_field and not row.get(id_field, "").strip():
                continue
            rows.append(row)
        return rows

    @staticmethod
    def _parse_table_total(soup: BeautifulSoup) -> int:
        """Extract the Total amount from the table footer/last row."""
        table = soup.find("table")
        if not table:
            return 0
        # Check tfoot first
        tfoot = table.find("tfoot")
        search_area = tfoot if tfoot else table
        for tr in search_area.find_all("tr"):
            text = tr.get_text(" ", strip=True)
            if "Total" in text:
                nums = re.findall(r"[\d,]+", text.replace("Total", "").replace("No. of", ""))
                if nums:
                    return int(nums[-1].replace(",", ""))
        return 0

    @staticmethod
    def _today() -> str:
        return datetime.now(NPT).strftime("%Y-%m-%d")

    def _fetch_all_pages(self, path: str, col_map: dict,
                         from_date: str = None, to_date: str = None,
                         limit: int = 300, id_field: str = "package_id") -> list[dict]:
        today = self._today()
        from_date = from_date or today
        to_date = to_date or today
        all_rows = []
        page = 1
        while True:
            url = (
                f"{self.base_url}/{path.lstrip('/')}"
                f"?from_date={from_date}&to_date={to_date}"
                f"&action=search&page={page}&limit={limit}"
            )
            logger.info("Fetching: %s (page %d)", path, page)
            resp = self.session.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            if "login" in resp.url.lower() and "package" not in resp.url.lower():
                logger.error("Session expired — redirected to login")
                break
            soup = BeautifulSoup(resp.text, "lxml")
            rows = self._parse_table(soup, col_map, id_field=id_field)
            if not rows:
                break
            all_rows.extend(rows)
            logger.info("  page %d: %d rows (total: %d)", page, len(rows), len(all_rows))
            has_next = False
            for a in soup.select(".pagination a"):
                t = a.get_text(strip=True)
                if "›" in t or "»" in t or "Next" in t:
                    has_next = True
                    break
            if not has_next or page > 500:
                break
            page += 1
            time.sleep(1)  # small delay to avoid overwhelming the server
        return all_rows

    def _fetch_summary(self, path: str, col_map: dict,
                       from_date: str = None, to_date: str = None,
                       limit: int = 300, id_field: str = "package_id") -> dict:
        """Fetch all rows AND the total amount from a status page."""
        today = self._today()
        from_date = from_date or today
        to_date = to_date or today
        all_rows = []
        total_amount = 0
        page = 1
        while True:
            url = (
                f"{self.base_url}/{path.lstrip('/')}"
                f"?from_date={from_date}&to_date={to_date}"
                f"&action=search&page={page}&limit={limit}"
            )
            logger.info("Fetching summary: %s (page %d)", path, page)
            resp = self.session.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            if "login" in resp.url.lower() and "package" not in resp.url.lower():
                break
            soup = BeautifulSoup(resp.text, "lxml")
            rows = self._parse_table(soup, col_map, id_field=id_field)
            if page == 1:
                total_amount = self._parse_table_total(soup)
            if not rows:
                break
            all_rows.extend(rows)
            has_next = any("›" in a.get_text() or "»" in a.get_text()
                           for a in soup.select(".pagination a"))
            if not has_next or page > 500:
                break
            page += 1
            time.sleep(1)
        return {"rows": all_rows, "total_amount": total_amount, "total_packages": len(all_rows)}

    # ------------------------------------------------------------------
    # Individual status sections
    # ------------------------------------------------------------------
    def scrape_all_packages_today(self) -> list[dict]:
        """All packages for today from /package."""
        today = self._today()
        return self._fetch_all_pages("/package", PKG_COLS, today, today)

    def scrape_ready_to_pick(self) -> dict:
        """Ready to Pick — vendor-level data (no package details)."""
        today = self._today()
        rows = self._fetch_all_pages(
            "/package/ready-to-pick", VENDOR_COLS, today, today,
            id_field="vendor"
        )
        return {"rows": rows, "total_vendors": len(rows)}

    def scrape_pickup(self) -> dict:
        """Pick Up — vendor-level data."""
        today = self._today()
        rows = self._fetch_all_pages(
            "/package/pick-up", VENDOR_COLS, today, today,
            id_field="vendor"
        )
        return {"rows": rows, "total_vendors": len(rows)}

    def scrape_receive(self) -> dict:
        """Receive — vendor-level data."""
        today = self._today()
        rows = self._fetch_all_pages(
            "/package/receive", VENDOR_COLS, today, today,
            id_field="vendor"
        )
        return {"rows": rows, "total_vendors": len(rows)}

    def scrape_warehouse(self) -> dict:
        """Warehouse packages from 2025-01-01 to today."""
        return self._fetch_summary(
            "/package/warehouse", WAREHOUSE_COLS, HISTORY_START, self._today()
        )

    def scrape_deliveries_history(self) -> dict:
        """Deliveries from 2025-01-01 to today — includes rider/courier."""
        return self._fetch_summary(
            "/package/deliveries", DELIVERY_COLS, HISTORY_START, self._today()
        )

    def scrape_invoices(self) -> dict:
        """All invoices — vendor breakdown with charges."""
        today = self._today()
        all_rows = []
        page = 1
        while True:
            url = (
                f"{self.base_url}/invoice"
                f"?from_date={HISTORY_START}&to_date={today}"
                f"&action=search&page={page}&limit=300"
            )
            logger.info("Fetching invoices page %d", page)
            resp = self.session.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")
            rows = self._parse_table(soup, INVOICE_COLS, id_field="invoice_id")
            if not rows:
                break
            all_rows.extend(rows)
            has_next = any("›" in a.get_text() or "»" in a.get_text()
                           for a in soup.select(".pagination a"))
            if not has_next or page > 200:
                break
            page += 1
            time.sleep(1)
        return {"rows": all_rows, "total_invoices": len(all_rows)}

    # ------------------------------------------------------------------
    # Master collection
    # ------------------------------------------------------------------
    def collect_full_report_data(self) -> dict:
        """Collect ALL data needed for the comprehensive PDF report."""
        if not self.login():
            raise RuntimeError("Failed to log in to DMS")

        today = self._today()
        logger.info("Collecting full report data for %s", today)

        data = {"report_date": today}

        # Fetch each section with a small delay between them
        # to avoid overwhelming the DMS server
        sections = [
            ("dashboard", self.scrape_dashboard),
            ("all_packages_today", self.scrape_all_packages_today),
            ("ready_to_pick", self.scrape_ready_to_pick),
            ("pickup", self.scrape_pickup),
            ("receive", self.scrape_receive),
            ("warehouse", self.scrape_warehouse),
            ("deliveries", self.scrape_deliveries_history),
            ("invoices", self.scrape_invoices),
        ]
        for name, func in sections:
            logger.info("Fetching section: %s ...", name)
            try:
                data[name] = func()
            except Exception as e:
                logger.error("Failed to fetch %s: %s", name, e)
                # Provide safe defaults so the report can still generate
                if name == "dashboard":
                    data[name] = {}
                elif name == "all_packages_today":
                    data[name] = []
                elif name in ("ready_to_pick", "pickup", "receive"):
                    data[name] = {"rows": [], "total_vendors": 0}
                elif name in ("warehouse", "deliveries"):
                    data[name] = {"rows": [], "total_amount": 0, "total_packages": 0}
                elif name == "invoices":
                    data[name] = {"rows": [], "total_invoices": 0}
            time.sleep(2)  # 2 second pause between sections

        # Separate inside/outside valley from today's packages
        all_pkgs = data["all_packages_today"]
        data["inside_valley_today"] = [
            p for p in all_pkgs if "inside" in p.get("pkg_type", "").lower()
        ]
        data["outside_valley_today"] = [
            p for p in all_pkgs if "outside" in p.get("pkg_type", "").lower()
        ]

        logger.info(
            "Data collected: %d packages today (%d IV, %d OV), "
            "%d warehouse, %d deliveries, %d invoices",
            len(all_pkgs),
            len(data["inside_valley_today"]),
            len(data["outside_valley_today"]),
            data["warehouse"]["total_packages"],
            data["deliveries"]["total_packages"],
            data["invoices"]["total_invoices"],
        )
        return data
