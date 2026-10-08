import Foundation
import FoundationModels

// The model's job is to label what each printed row means. Every number it
// returns is re-derived from the OCR text and receipt arithmetic on the
// TypeScript side (packages/shared receipt-reconcile), so the schema asks for
// values "as printed" and never for computed figures.

@Generable(description: "Structured data read from a single retail, grocery, or restaurant receipt. Money values are plain decimal amounts copied exactly as printed (write 1508.66 for \"1,508.66\"), never cents.")
public struct ReceiptExtraction {
  @Guide(description: "Name of the store or restaurant as printed at the top of the receipt. Null when no business name is printed. Never use 'Official Receipt', 'Sales Invoice', 'Bill', 'Bill Slip', a payment brand, or the POS provider/software vendor as the merchant.")
  public var merchant: String?

  @Guide(description: "Transaction date exactly as printed (e.g. 03/22/26 or 2026-03-22). Null if no date is printed.")
  public var date: String?

  @Guide(description: "ISO 4217 currency code. Use PHP for Philippine peso (₱, P, PHP). Null if unknown.")
  public var currency: String?

  @Guide(description: "Purchased line items in printed order, one per priced row. Exclude subtotal, VAT, service charge, discount, tip, total, payment, and change rows.", .maximumCount(60))
  public var items: [ReceiptItem]

  @Guide(description: "Sum of the items before service charge, discount, and tip, as printed. Labels: Subtotal, Sub Total, Complete Subtotal, Gross Sales, or 'Total Amount' when a later 'Total Due' exists. Null if not printed.")
  public var subtotal: Double?

  @Guide(description: "VAT or sales tax amount as printed (e.g. 'Add: 12% VAT', 'VAT Amount', 'VAT: 116.79'). Null if not printed.")
  public var tax: Double?

  @Guide(description: "Service charge amount as printed on the service charge row. Null if the row has no amount or there is no service charge.")
  public var serviceCharge: Double?

  @Guide(description: "Total discount as a positive number (promo, senior citizen/SC, PWD, voucher). Parentheses on a receipt mean a deduction. Null if none.")
  public var discount: Double?

  @Guide(description: "Tip or gratuity amount as printed. Null if none.")
  public var tip: Double?

  @Guide(description: "Final amount the customer pays, copied from the last of: TOTAL AMOUNT, Total Due, Total Amt Due, Amount Due, Grand Total, Balance Due. When several totals are printed, take the one that includes service charge and discounts. Null only if no total is printed.")
  public var total: Double?
}

@Generable(description: "One purchased line on a receipt")
public struct ReceiptItem {
  @Guide(description: "Item description as printed, without quantity or price")
  public var name: String
  @Guide(description: "Quantity only when a quantity is printed on the row (e.g. '2 @' or '2 x'); otherwise 1.")
  public var quantity: Double?
  @Guide(description: "Unit price when printed. Null if not printed.")
  public var unitPrice: Double?
  @Guide(description: "The line's amount exactly as printed on that row")
  public var totalPrice: Double?
}

public enum ReceiptPrompts {
  public static let instructions = """
  You extract structured data from receipts issued in the Philippines and elsewhere.
  Read only what is printed. Copy every amount exactly as printed on its row; never compute, scale, or infer amounts or quantities.
  Use null for anything not printed.
  Philippine conventions:
  - Totals are labelled TOTAL AMOUNT, Total Due, Total Amt Due, Amount Due, Grand Total, or Balance Due. When a receipt prints "Total" and later "TOTAL AMOUNT" or "Total Due", the later one is the total.
  - "Add: 12% VAT", "VAT Amount", "VAT: 116.79", "EVAT" are the tax. "VATable Sales", "VAT Exempt Sales", "Zero-Rated Sales", "NET" are informational breakdowns, not items and not the total.
  - "Service Charge" or "SC 10%" is the service charge, not an item.
  - "SC DISC", "PWD DISC", "PROMO", "DISCOUNT", or an amount in parentheses is a discount.
  - TIN, Accred. No., PTU No., Slip, Table, Staff, Server, Guests, POS Provider rows are metadata, not the merchant and not items.
  - "Official Receipt", "Sales Invoice", "Bill", "Bill Slip" are document types, not the merchant. Card or wallet brands (BDO, Amex, Visa, GCash) are not the merchant.
  An item row has a description and its amount; "2 @ 570.00 1140.00" means quantity 2, unit price 570.00, line amount 1140.00. A row with one amount is quantity 1.
  """

  public static let ocrTextPrompt = "Extract the receipt data from this OCR text. Each line is one printed row, top to bottom; columns of a row are separated by two spaces.\n\n"
}
