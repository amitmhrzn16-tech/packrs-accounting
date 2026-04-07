"""
report_builder.py — Generates a comprehensive PDF report AND a Slack summary
for the Packrs Courier DMS daily report.

Sections in the PDF:
  1. Header + report date/time
  2. Today's Orders (total / inside valley / outside valley)
  3. Status breakdown for today's orders
  4. Live dashboard (system-wide)
  5. Ready to Pick (today) — total amount, total packages
  6. Pick Up (today) — total amount, total packages
  7. Receive (today) — total amount, total packages
  8. Warehouse (2025-01-01 to today) — total amount, total packages
  9. Ready to Deliver, Ready to Dispatch (historical)
 10. In Transit (historical) — with rider/courier name
 11. Call Not Received, Postponed (historical)
 12. Online Pay / Online Pay Vendor (today) — total amount, total packages
 13. Inside Valley packages (today) — full detail table
 14. Outside Valley packages (today) — full detail table
 15. Deliveries — grouped by rider/courier
 16. Invoices — vendor breakdown with charges
"""

import os
import logging
from datetime import datetime
from io import BytesIO

import pytz
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

NPT = pytz.timezone("Asia/Kathmandu")


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
def _get_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "ReportTitle", parent=styles["Title"],
        fontSize=18, spaceAfter=6, textColor=colors.HexColor("#1a237e"),
    ))
    styles.add(ParagraphStyle(
        "SectionHeader", parent=styles["Heading2"],
        fontSize=13, spaceAfter=4, spaceBefore=12,
        textColor=colors.HexColor("#283593"),
        borderWidth=1, borderColor=colors.HexColor("#c5cae9"),
        borderPadding=4,
    ))
    styles.add(ParagraphStyle(
        "SubHeader", parent=styles["Heading3"],
        fontSize=11, spaceAfter=2, spaceBefore=8,
        textColor=colors.HexColor("#37474f"),
    ))
    styles.add(ParagraphStyle(
        "SmallText", parent=styles["Normal"],
        fontSize=7, leading=9,
    ))
    styles.add(ParagraphStyle(
        "CellText", parent=styles["Normal"],
        fontSize=7, leading=9,
    ))
    styles.add(ParagraphStyle(
        "StatLabel", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#616161"),
    ))
    styles.add(ParagraphStyle(
        "StatValue", parent=styles["Normal"],
        fontSize=11, textColor=colors.HexColor("#1a237e"),
    ))
    return styles


# ---------------------------------------------------------------------------
# Table helpers
# ---------------------------------------------------------------------------
def _make_table(headers, rows, col_widths=None):
    """Create a styled ReportLab table."""
    data = [headers] + rows
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#283593")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("FONTSIZE", (0, 1), (-1, -1), 6.5),
        ("LEADING", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0e0e0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ])
    tbl.setStyle(style)
    return tbl


def _summary_card(label, value, unit=""):
    """Create a small summary block."""
    return f"<b>{label}:</b> {value}{' ' + unit if unit else ''}"


def _safe(val, default="-"):
    """Return stripped value or default."""
    if val is None:
        return default
    s = str(val).strip()
    return s if s else default


def _parse_amount(val):
    """Parse an amount string to float."""
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _fmt_amount(val):
    """Format a numeric amount."""
    try:
        return f"Rs.{float(val):,.0f}"
    except (ValueError, TypeError):
        return str(val)


# ---------------------------------------------------------------------------
# PDF Builder
# ---------------------------------------------------------------------------
def build_pdf(data: dict, output_path: str = None) -> str:
    """
    Build a comprehensive PDF report from scraped DMS data.

    Args:
        data: Dict from DMSScraper.collect_full_report_data()
        output_path: Where to save the PDF. Defaults to /tmp/packrs_report_<date>.pdf

    Returns:
        Path to the generated PDF file.
    """
    now = datetime.now(NPT)
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%I:%M %p NPT")
    friendly_date = now.strftime("%A, %B %d, %Y")

    if output_path is None:
        output_path = f"/tmp/packrs_report_{date_str}_{now.strftime('%H%M')}.pdf"

    styles = _get_styles()
    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(A4),
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=15*mm, bottomMargin=15*mm,
        title=f"Packrs Courier Report - {date_str}",
        author="Packrs DMS Reporter",
    )

    story = []
    page_width = landscape(A4)[0] - 30*mm  # usable width

    # ── HEADER ────────────────────────────────────────────────────
    story.append(Paragraph(
        f"Packrs Courier Daily Report", styles["ReportTitle"]
    ))
    story.append(Paragraph(
        f"{friendly_date} | Generated at {time_str}", styles["Normal"]
    ))
    story.append(Spacer(1, 8))

    dashboard = data.get("dashboard", {})
    all_pkgs = data.get("all_packages_today", [])
    inside_pkgs = data.get("inside_valley_today", [])
    outside_pkgs = data.get("outside_valley_today", [])

    # ══════════════════════════════════════════════════════════════
    # SECTION 1: Today's Orders Summary
    # ══════════════════════════════════════════════════════════════
    story.append(Paragraph("Today's Orders Summary", styles["SectionHeader"]))

    summary_data = [
        ["Total Orders", "Inside Valley", "Outside Valley"],
        [str(len(all_pkgs)), str(len(inside_pkgs)), str(len(outside_pkgs))],
    ]
    summary_tbl = Table(summary_data, colWidths=[page_width/3]*3)
    summary_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eaf6")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#1a237e")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#c5cae9")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_tbl)
    story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════════════════════
    # SECTION 2: Status Breakdown (today's packages)
    # ══════════════════════════════════════════════════════════════
    story.append(Paragraph("Today's Status Breakdown", styles["SectionHeader"]))

    status_counts = {}
    for pkg in all_pkgs:
        s = _safe(pkg.get("status", ""), "Unknown")
        status_counts[s] = status_counts.get(s, 0) + 1

    if status_counts:
        status_headers = ["Status", "Count"]
        status_rows = [[s, str(c)] for s, c in sorted(status_counts.items(), key=lambda x: -x[1])]
        story.append(_make_table(status_headers, status_rows, [page_width*0.6, page_width*0.4]))
    else:
        story.append(Paragraph("No packages today.", styles["Normal"]))
    story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════════════════════
    # SECTION 3: Live Dashboard
    # ══════════════════════════════════════════════════════════════
    story.append(Paragraph("Live Dashboard (System-Wide)", styles["SectionHeader"]))

    if dashboard:
        dash_headers = ["Metric", "Value"]
        dash_rows = [[k, f"{v:,}" if isinstance(v, int) else str(v)]
                      for k, v in dashboard.items()]
        story.append(_make_table(dash_headers, dash_rows, [page_width*0.6, page_width*0.4]))
    else:
        story.append(Paragraph("Dashboard data unavailable.", styles["Normal"]))
    story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════════════════════
    # SECTION 4-6: Ready to Pick, Pick Up, Receive (today)
    # These are VENDOR-level tables (not package-level)
    # ══════════════════════════════════════════════════════════════
    for section_key, section_title in [
        ("ready_to_pick", "Ready to Pick (Today)"),
        ("pickup", "Pick Up (Today)"),
        ("receive", "Receive (Today)"),
    ]:
        section_data = data.get(section_key, {})
        total_vendors = section_data.get("total_vendors", 0)
        rows_data = section_data.get("rows", [])

        story.append(Paragraph(section_title, styles["SectionHeader"]))
        story.append(Paragraph(
            f"<b>Total Vendors:</b> {total_vendors}",
            styles["Normal"]
        ))

        if rows_data:
            headers = ["SN", "Branch", "Vendor Name", "Address", "Phone", "Mobile"]
            tbl_rows = []
            for r in rows_data:
                tbl_rows.append([
                    Paragraph(_safe(r.get("sn")), styles["CellText"]),
                    Paragraph(_safe(r.get("branch")), styles["CellText"]),
                    Paragraph(_safe(r.get("vendor")), styles["CellText"]),
                    Paragraph(_safe(r.get("address")), styles["CellText"]),
                    Paragraph(_safe(r.get("phone")), styles["CellText"]),
                    Paragraph(_safe(r.get("mobile")), styles["CellText"]),
                ])
            col_w = [30, 60, 120, 200, 80, 80]
            total_w = sum(col_w)
            scale = page_width / total_w
            col_w = [w * scale for w in col_w]
            story.append(_make_table(headers, tbl_rows, col_w))
        else:
            story.append(Paragraph("No data.", styles["SmallText"]))
        story.append(Spacer(1, 6))

    # ══════════════════════════════════════════════════════════════
    # SECTION 7: Warehouse (historical)
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    wh_data = data.get("warehouse", {})
    story.append(Paragraph("Warehouse (2025-01-01 to Today)", styles["SectionHeader"]))
    story.append(Paragraph(
        f"<b>Total Packages:</b> {wh_data.get('total_packages', 0)} | "
        f"<b>Total Amount:</b> Rs.{wh_data.get('total_amount', 0):,}",
        styles["Normal"]
    ))

    wh_rows = wh_data.get("rows", [])
    if wh_rows:
        headers = ["SN", "Branch", "Package ID", "Vendor", "Customer",
                   "Address", "Mobile", "Amount", "Type", "Status"]
        tbl_rows = []
        for r in wh_rows[:200]:  # limit to avoid huge PDFs
            tbl_rows.append([
                Paragraph(_safe(r.get("sn")), styles["CellText"]),
                Paragraph(_safe(r.get("branch")), styles["CellText"]),
                Paragraph(_safe(r.get("package_id")), styles["CellText"]),
                Paragraph(_safe(r.get("vendor")), styles["CellText"]),
                Paragraph(_safe(r.get("customer")), styles["CellText"]),
                Paragraph(_safe(r.get("address")), styles["CellText"]),
                Paragraph(_safe(r.get("mobile")), styles["CellText"]),
                Paragraph(_safe(r.get("amount")), styles["CellText"]),
                Paragraph(_safe(r.get("pkg_type")), styles["CellText"]),
                Paragraph(_safe(r.get("status")), styles["CellText"]),
            ])
        col_w = [25, 45, 60, 70, 70, 100, 65, 50, 55, 55]
        total_w = sum(col_w)
        scale = page_width / total_w
        col_w = [w * scale for w in col_w]
        story.append(_make_table(headers, tbl_rows, col_w))
        if len(wh_rows) > 200:
            story.append(Paragraph(
                f"<i>Showing 200 of {len(wh_rows)} warehouse packages.</i>",
                styles["SmallText"]
            ))
    story.append(Spacer(1, 6))

    # ══════════════════════════════════════════════════════════════
    # SECTION 8: Deliveries (with rider/courier) — historical
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    del_data = data.get("deliveries", {})
    del_rows = del_data.get("rows", [])

    story.append(Paragraph("Deliveries (2025-01-01 to Today)", styles["SectionHeader"]))
    story.append(Paragraph(
        f"<b>Total Deliveries:</b> {del_data.get('total_packages', 0)} | "
        f"<b>Total Amount:</b> Rs.{del_data.get('total_amount', 0):,}",
        styles["Normal"]
    ))

    # Separate inside and outside valley deliveries
    iv_deliveries = [d for d in del_rows if "inside" in _safe(d.get("pkg_type")).lower()]
    ov_deliveries = [d for d in del_rows if "outside" in _safe(d.get("pkg_type")).lower()]

    for label, delivery_list in [
        ("Inside Valley Deliveries", iv_deliveries),
        ("Outside Valley Deliveries", ov_deliveries),
    ]:
        story.append(Paragraph(f"{label} ({len(delivery_list)})", styles["SubHeader"]))
        if delivery_list:
            # Group by rider/courier
            rider_groups = {}
            for d in delivery_list:
                rider = _safe(d.get("rider_courier"), "Unassigned")
                rider_groups.setdefault(rider, []).append(d)

            for rider, parcels in sorted(rider_groups.items(), key=lambda x: -len(x[1])):
                story.append(Paragraph(
                    f"<b>{rider}</b> - {len(parcels)} packages", styles["SmallText"]
                ))
                headers = ["Pkg ID", "Vendor", "Customer", "Address",
                           "Amount", "Type", "Del. Date", "Status"]
                tbl_rows = []
                for p in parcels[:100]:
                    tbl_rows.append([
                        Paragraph(_safe(p.get("package_id")), styles["CellText"]),
                        Paragraph(_safe(p.get("vendor")), styles["CellText"]),
                        Paragraph(_safe(p.get("customer")), styles["CellText"]),
                        Paragraph(_safe(p.get("address")), styles["CellText"]),
                        Paragraph(_safe(p.get("amount")), styles["CellText"]),
                        Paragraph(_safe(p.get("pkg_type")), styles["CellText"]),
                        Paragraph(_safe(p.get("delivery_date")), styles["CellText"]),
                        Paragraph(_safe(p.get("status")), styles["CellText"]),
                    ])
                col_w = [60, 70, 70, 110, 50, 55, 60, 55]
                total_w = sum(col_w)
                scale = page_width / total_w
                col_w = [w * scale for w in col_w]
                story.append(_make_table(headers, tbl_rows, col_w))
                story.append(Spacer(1, 4))
        else:
            story.append(Paragraph("No deliveries.", styles["SmallText"]))

    # ══════════════════════════════════════════════════════════════
    # SECTION 9: Inside Valley Packages (today) — full detail
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph(
        f"Inside Valley Packages - Today ({len(inside_pkgs)})",
        styles["SectionHeader"]
    ))

    if inside_pkgs:
        # Calculate total amount
        iv_total = sum(_parse_amount(p.get("amount", 0)) for p in inside_pkgs)
        story.append(Paragraph(
            f"<b>Total Packages:</b> {len(inside_pkgs)} | <b>Total Amount:</b> Rs.{iv_total:,.0f}",
            styles["Normal"]
        ))

        headers = ["Pkg ID", "Branch", "Vendor", "Customer", "Mobile",
                   "Address", "Amount", "Created", "Status"]
        tbl_rows = []
        for p in inside_pkgs:
            tbl_rows.append([
                Paragraph(_safe(p.get("package_id")), styles["CellText"]),
                Paragraph(_safe(p.get("branch")), styles["CellText"]),
                Paragraph(_safe(p.get("vendor")), styles["CellText"]),
                Paragraph(_safe(p.get("customer")), styles["CellText"]),
                Paragraph(_safe(p.get("mobile")), styles["CellText"]),
                Paragraph(_safe(p.get("address")), styles["CellText"]),
                Paragraph(_safe(p.get("amount")), styles["CellText"]),
                Paragraph(_safe(p.get("created_date")), styles["CellText"]),
                Paragraph(_safe(p.get("status")), styles["CellText"]),
            ])
        col_w = [55, 45, 70, 70, 60, 110, 50, 55, 55]
        total_w = sum(col_w)
        scale = page_width / total_w
        col_w = [w * scale for w in col_w]
        story.append(_make_table(headers, tbl_rows, col_w))
    else:
        story.append(Paragraph("No inside valley packages today.", styles["Normal"]))
    story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════════════════════
    # SECTION 10: Outside Valley Packages (today) — full detail
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    story.append(Paragraph(
        f"Outside Valley Packages - Today ({len(outside_pkgs)})",
        styles["SectionHeader"]
    ))

    if outside_pkgs:
        ov_total = sum(_parse_amount(p.get("amount", 0)) for p in outside_pkgs)
        story.append(Paragraph(
            f"<b>Total Packages:</b> {len(outside_pkgs)} | <b>Total Amount:</b> Rs.{ov_total:,.0f}",
            styles["Normal"]
        ))

        headers = ["Pkg ID", "Branch", "Vendor", "Customer", "Mobile",
                   "Address", "Amount", "Created", "Status"]
        tbl_rows = []
        for p in outside_pkgs:
            tbl_rows.append([
                Paragraph(_safe(p.get("package_id")), styles["CellText"]),
                Paragraph(_safe(p.get("branch")), styles["CellText"]),
                Paragraph(_safe(p.get("vendor")), styles["CellText"]),
                Paragraph(_safe(p.get("customer")), styles["CellText"]),
                Paragraph(_safe(p.get("mobile")), styles["CellText"]),
                Paragraph(_safe(p.get("address")), styles["CellText"]),
                Paragraph(_safe(p.get("amount")), styles["CellText"]),
                Paragraph(_safe(p.get("created_date")), styles["CellText"]),
                Paragraph(_safe(p.get("status")), styles["CellText"]),
            ])
        col_w = [55, 45, 70, 70, 60, 110, 50, 55, 55]
        total_w = sum(col_w)
        scale = page_width / total_w
        col_w = [w * scale for w in col_w]
        story.append(_make_table(headers, tbl_rows, col_w))
    else:
        story.append(Paragraph("No outside valley packages today.", styles["Normal"]))
    story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════════════════════
    # SECTION 11: Invoices — vendor breakdown
    # ══════════════════════════════════════════════════════════════
    story.append(PageBreak())
    inv_data = data.get("invoices", {})
    inv_rows = inv_data.get("rows", [])

    story.append(Paragraph(
        f"Invoices ({inv_data.get('total_invoices', 0)} total)",
        styles["SectionHeader"]
    ))

    if inv_rows:
        # Group invoices by vendor
        vendor_invoices = {}
        for inv in inv_rows:
            vendor = _safe(inv.get("vendor"), "Unknown")
            vendor_invoices.setdefault(vendor, []).append(inv)

        # Vendor summary table
        summary_headers = ["Vendor", "Total Invoices", "Package Charge",
                           "Pickup Charge", "Rider Charge", "Courier Charge"]
        summary_rows = []
        grand_pkg_charge = 0
        grand_pickup_charge = 0
        grand_rider_charge = 0
        grand_courier_charge = 0

        for vendor, invoices in sorted(vendor_invoices.items()):
            pkg_charge = sum(_parse_amount(i.get("package_charge", 0)) for i in invoices)
            pickup_charge = sum(_parse_amount(i.get("pickup_charge", 0)) for i in invoices)
            rider_charge = sum(_parse_amount(i.get("rider_charge", 0)) for i in invoices)
            courier_charge = sum(_parse_amount(i.get("courier_charge", 0)) for i in invoices)

            grand_pkg_charge += pkg_charge
            grand_pickup_charge += pickup_charge
            grand_rider_charge += rider_charge
            grand_courier_charge += courier_charge

            summary_rows.append([
                Paragraph(vendor, styles["CellText"]),
                Paragraph(str(len(invoices)), styles["CellText"]),
                Paragraph(f"Rs.{pkg_charge:,.0f}", styles["CellText"]),
                Paragraph(f"Rs.{pickup_charge:,.0f}", styles["CellText"]),
                Paragraph(f"Rs.{rider_charge:,.0f}", styles["CellText"]),
                Paragraph(f"Rs.{courier_charge:,.0f}", styles["CellText"]),
            ])

        # Add grand total row
        summary_rows.append([
            Paragraph("<b>TOTAL</b>", styles["CellText"]),
            Paragraph(f"<b>{len(inv_rows)}</b>", styles["CellText"]),
            Paragraph(f"<b>Rs.{grand_pkg_charge:,.0f}</b>", styles["CellText"]),
            Paragraph(f"<b>Rs.{grand_pickup_charge:,.0f}</b>", styles["CellText"]),
            Paragraph(f"<b>Rs.{grand_rider_charge:,.0f}</b>", styles["CellText"]),
            Paragraph(f"<b>Rs.{grand_courier_charge:,.0f}</b>", styles["CellText"]),
        ])

        col_w = [120, 60, 70, 70, 70, 70]
        total_w = sum(col_w)
        scale = page_width / total_w
        col_w = [w * scale for w in col_w]
        tbl = _make_table(summary_headers, summary_rows, col_w)

        # Bold the last (total) row
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, len(summary_rows)), (-1, len(summary_rows)),
             colors.HexColor("#e8eaf6")),
            ("FONTNAME", (0, len(summary_rows)), (-1, len(summary_rows)), "Helvetica-Bold"),
        ]))
        story.append(tbl)
    else:
        story.append(Paragraph("No invoice data.", styles["Normal"]))

    # ── Footer ────────────────────────────────────────────────────
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        f"<i>Report generated by Packrs Courier DMS Reporter | {friendly_date} | {time_str}</i>",
        styles["SmallText"]
    ))

    # ── Build PDF ─────────────────────────────────────────────────
    doc.build(story)
    logger.info("PDF report saved to: %s", output_path)
    return output_path


# ---------------------------------------------------------------------------
# Slack summary builder (short text for webhook)
# ---------------------------------------------------------------------------
def _status_emoji(status: str) -> str:
    mapping = {
        "warehouse": "🏭", "ready to pick": "📋", "pick up": "🚗",
        "receive": "📥", "in transit": "🚚", "ready to deliver": "📦",
        "delivered": "✅", "returned": "↩️", "cancelled": "❌",
        "invoiced": "🧾", "verified": "✔️",
    }
    return mapping.get(status.strip().lower(), "📌")


def _divider():
    return {"type": "divider"}


def _header_block(text):
    return {"type": "header", "text": {"type": "plain_text", "text": text, "emoji": True}}


def _section_md(text):
    return {"type": "section", "text": {"type": "mrkdwn", "text": text}}


def _context_block(texts):
    return {"type": "context", "elements": [{"type": "mrkdwn", "text": t} for t in texts]}


def build_slack_summary(data: dict) -> list[dict]:
    """
    Build a concise Slack Block Kit summary message.
    The detailed data is in the PDF attachment.
    """
    now = datetime.now(NPT)
    date_str = now.strftime("%A, %B %d, %Y")
    time_str = now.strftime("%I:%M %p NPT")

    dashboard = data.get("dashboard", {})
    all_pkgs = data.get("all_packages_today", [])
    inside_pkgs = data.get("inside_valley_today", [])
    outside_pkgs = data.get("outside_valley_today", [])
    wh = data.get("warehouse", {})
    deliveries = data.get("deliveries", {})
    invoices = data.get("invoices", {})

    blocks = []
    blocks.append(_header_block(f"📊 Packrs Courier Report — {date_str}"))
    blocks.append(_context_block([f"Generated at {time_str} | Full PDF attached below"]))
    blocks.append(_divider())

    # Orders summary
    blocks.append(_header_block("🗓️ Today's Orders"))
    blocks.append(_section_md(
        f"*Total Orders:* `{len(all_pkgs)}`\n"
        f"• Inside Valley: `{len(inside_pkgs)}`\n"
        f"• Outside Valley: `{len(outside_pkgs)}`"
    ))
    blocks.append(_divider())

    # Status breakdown
    status_counts = {}
    for pkg in all_pkgs:
        s = pkg.get("status", "Unknown").strip()
        status_counts[s] = status_counts.get(s, 0) + 1

    lines = []
    for s, c in sorted(status_counts.items(), key=lambda x: -x[1]):
        lines.append(f"{_status_emoji(s)}  {s}: `{c}`")

    if lines:
        blocks.append(_header_block("📈 Status Breakdown"))
        blocks.append(_section_md("\n".join(lines)))
        blocks.append(_divider())

    # Key metrics
    blocks.append(_header_block("🖥️ Key Metrics"))
    metrics = []
    if dashboard:
        metrics.append(f"📊 Total Packages (All Time): `{dashboard.get('Total Number of Packages', 'N/A'):,}`")
    metrics.append(f"🏭 Warehouse: `{wh.get('total_packages', 0)}` pkgs | Rs.`{wh.get('total_amount', 0):,}`")
    metrics.append(f"🚚 Deliveries: `{deliveries.get('total_packages', 0)}` | Rs.`{deliveries.get('total_amount', 0):,}`")
    metrics.append(f"🧾 Invoices: `{invoices.get('total_invoices', 0)}`")
    blocks.append(_section_md("\n".join(metrics)))
    blocks.append(_divider())

    blocks.append(_context_block(["📎 Full detailed PDF report attached above"]))
    blocks.append(_context_block([f"🤖 Packrs Courier DMS Reporter | {time_str}"]))

    if len(blocks) > 50:
        blocks = blocks[:49]
        blocks.append(_context_block(["⚠️ Summary truncated."]))

    return blocks
