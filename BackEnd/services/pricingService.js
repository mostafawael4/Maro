import Packages from "../models/Package.js";

const parsePriceValue = (price) => {
  if (typeof price === "number" && Number.isFinite(price)) {
    return price;
  }
  if (!price) {
    return 0;
  }
  const numeric = parseFloat(price.toString().replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const PROMO_CODES = {
  sunset: 1000,
  harmony: 2000,
  celebration: 3000,
};

const fetchPackagesMaps = async () => {
  const packagesFromDb = await Packages.find({}).lean();
  const packageMapById = new Map();
  const packageMapByName = new Map();

  packagesFromDb.forEach((pkg) => {
    if (!pkg) return;
    const id = pkg._id?.toString();
    if (id) packageMapById.set(id, pkg);
    if (pkg.packageName) packageMapByName.set(pkg.packageName, pkg);
  });

  return { packageMapById, packageMapByName };
};

const resolvePackage = (selection, packageMapById, packageMapByName) => {
  if (!selection) return null;
  if (selection.packageId && packageMapById.has(selection.packageId.toString())) {
    return packageMapById.get(selection.packageId.toString());
  }
  if (selection.packageName && packageMapByName.has(selection.packageName)) {
    return packageMapByName.get(selection.packageName);
  }
  return null;
};

const appendPackage = (pkg, packagesMap) => {
  const key = pkg._id?.toString();
  if (!key || packagesMap.has(key)) return;
  packagesMap.set(key, {
    packageId: pkg._id,
    packageName: pkg.packageName,
    packageDisplayName: pkg.displayName,
  });
};

/**
 * Resolve the stored price value for an item given the order's currency.
 *
 * - EGP / USD: use item.price (EGP string from DB) — existing unchanged behavior.
 *   For USD orders the frontend handles conversion display; backend always stores EGP values.
 * - AED: use item.priceAED if set (exact AED price); otherwise return 0 so
 *   admins are prompted to set priceAED on the package.
 */
const resolvePriceForCurrency = (item, currency) => {
  if (currency === 'AED') {
    if (item.priceAED) {
      return parsePriceValue(item.priceAED);
    }
    // No priceAED set — return 0 (admin needs to configure priceAED)
    return 0;
  }
  // EGP or USD: use existing EGP price (unchanged behavior)
  return parsePriceValue(item.price);
};

const resolvePriceLabelForCurrency = (item, currency, priceValue) => {
  if (currency === 'AED') {
    return item.priceAED ? `AED ${priceValue}` : 'AED —';
  }
  // EGP/USD: keep existing label (the original price string from DB)
  return item.price || String(priceValue);
};

const processCollections = (collectionSelections, resolve, append, currency) => {
  const collections = [];
  let collectionsSubtotal = 0;
  if (Array.isArray(collectionSelections)) {
    collectionSelections.forEach((selection) => {
      const pkg = resolve(selection);
      if (!pkg) return;
      const collectionMatch = (pkg.collections || []).find((col) =>
        (selection.collectionId && col._id && col._id.toString() === selection.collectionId.toString())
        || (selection.collectionName && col.collectionName === selection.collectionName)
      );
      if (!collectionMatch) return;
      const priceValue = resolvePriceForCurrency(collectionMatch, currency);
      collectionsSubtotal += priceValue;
      append(pkg);
      collections.push({
        packageId: pkg._id,
        packageName: pkg.packageName,
        packageDisplayName: pkg.displayName,
        collectionId: collectionMatch._id,
        collectionName: collectionMatch.collectionName,
        priceLabel: resolvePriceLabelForCurrency(collectionMatch, currency, priceValue),
        priceValue,
      });
    });
  }
  return { collections, collectionsSubtotal };
};

const processExtras = (extraSelections, resolve, append, currency) => {
  const extras = [];
  let extrasSubtotal = 0;
  if (Array.isArray(extraSelections)) {
    extraSelections.forEach((selection) => {
      const pkg = resolve(selection);
      if (!pkg) return;
      const extraMatch = (pkg.extras || []).find((extra) =>
        (selection.extraId && extra._id && extra._id.toString() === selection.extraId.toString())
        || (selection.extraName && extra.name === selection.extraName)
      );
      if (!extraMatch) return;
      const priceValue = resolvePriceForCurrency(extraMatch, currency);
      extrasSubtotal += priceValue;
      append(pkg);
      extras.push({
        packageId: pkg._id,
        packageName: pkg.packageName,
        packageDisplayName: pkg.displayName,
        extraId: extraMatch._id,
        extraName: extraMatch.name,
        priceLabel: resolvePriceLabelForCurrency(extraMatch, currency, priceValue),
        priceValue,
      });
    });
  }
  return { extras, extrasSubtotal };
};

const processPackages = (packageSelections, resolve, append) => {
  if (Array.isArray(packageSelections)) {
    packageSelections.forEach((selection) => {
      const pkg = resolve(selection);
      if (pkg) append(pkg);
    });
  }
};

const handlePromoCode = (code, subtotal) => {
  let promoCode, discount = 0;
  if (code) {
    const normalizedCode = code.toString().trim().toLowerCase();
    const numericValue = parseFloat(normalizedCode);
    if (!isNaN(numericValue) && numericValue > 0) {
      promoCode = normalizedCode;
      discount = numericValue;
    } else {
      const promoValue = PROMO_CODES[normalizedCode];
      if (promoValue) {
        promoCode = normalizedCode;
        discount = promoValue;
      }
    }
  }
  return { promoCode, discount };
};

const computeTotals = (pricingInput, subtotal, discount) => {
  const rawDeposit = parsePriceValue(pricingInput.depositPaid);
  let depositPaid = rawDeposit > 0 ? rawDeposit : 0;
  let total = subtotal - discount;
  if (!Number.isFinite(total) || total < 0) total = 0;
  if (total === 0 && pricingInput.total !== undefined && pricingInput.total !== null) {
    const providedTotal = parsePriceValue(pricingInput.total);
    if (Number.isFinite(providedTotal) && providedTotal > 0) {
      total = providedTotal;
    }
  }
  if (depositPaid > total) depositPaid = total;
  const remainingBalance = Math.max(total - depositPaid, 0);
  return { total, depositPaid, remainingBalance };
};

const hasPricingNumbers = (subtotal, discount, total, depositPaid, pricingInput) => {
  return (
    subtotal > 0 ||
    discount > 0 ||
    total > 0 ||
    depositPaid > 0 ||
    (pricingInput.remainingBalance !== undefined && pricingInput.remainingBalance !== null)
  );
};

/**
 * Normalize and validate a pricing payload from the request body.
 *
 * @param {object} pricingInput  - Raw pricing data from the request body
 * @param {string} [currency]    - 'EGP' | 'AED' | 'USD' (default: 'EGP')
 *   For order creation: pass the currency detected from the user's IP.
 *   For order updates:  pass the currency already stored on the order (NOT the admin's location).
 */
const normalizePricingSelections = async (pricingInput = {}, currency = 'EGP') => {
  if (!pricingInput || typeof pricingInput !== "object") return undefined;

  // Prefer explicit param; fall back to whatever is stored in the payload
  const resolvedCurrency = ((currency || pricingInput.currency || 'EGP') + '')
    .trim().toUpperCase();

  const { packageMapById, packageMapByName } = await fetchPackagesMaps();
  if (!packageMapById.size && !packageMapByName.size) return undefined;

  const packagesMap = new Map();
  const resolve = (selection) => resolvePackage(selection, packageMapById, packageMapByName);
  const append = (pkg) => appendPackage(pkg, packagesMap);

  processPackages(pricingInput.packages, resolve, append);

  const { collections, collectionsSubtotal } = processCollections(
    pricingInput.collections, resolve, append, resolvedCurrency
  );
  const { extras, extrasSubtotal } = processExtras(
    pricingInput.extras, resolve, append, resolvedCurrency
  );

  let subtotal = (collectionsSubtotal || 0) + (extrasSubtotal || 0);
  const { promoCode, discount } = handlePromoCode(pricingInput.promoCode, subtotal);
  const { total, depositPaid, remainingBalance } = computeTotals(pricingInput, subtotal, discount);

  const hasNumbers = hasPricingNumbers(subtotal, discount, total, depositPaid, pricingInput);
  if (
    packagesMap.size === 0 &&
    (!collections || !collections.length) &&
    (!extras || !extras.length) &&
    !promoCode &&
    !hasNumbers
  ) {
    return undefined;
  }

  const normalized = {};
  // Always persist the currency so the order knows its original pricing currency
  normalized.currency = resolvedCurrency;
  const packagesArray = Array.from(packagesMap.values());
  if (packagesArray.length) normalized.packages = packagesArray;
  if (collections && collections.length) normalized.collections = collections;
  if (extras && extras.length) normalized.extras = extras;
  if (promoCode) normalized.promoCode = promoCode;
  if (subtotal >= 0 || discount > 0 || total >= 0) {
    normalized.subtotal = subtotal;
    normalized.discount = discount;
    normalized.total = total;
  }
  if (depositPaid > 0) {
    normalized.depositPaid = depositPaid;
    normalized.remainingBalance = remainingBalance;
  } else if (total > 0 && remainingBalance >= 0) {
    normalized.remainingBalance = remainingBalance;
  }

  return normalized;
};

export { normalizePricingSelections };