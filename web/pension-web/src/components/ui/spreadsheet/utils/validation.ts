/**
 * Cell Validation Utilities
 * Handles cell validation using Zod schemas and custom validation rules.
 *
 * Messages are never hard-coded here: every function takes a
 * `ValidationTranslator` that resolves a message key (namespace
 * `spreadsheet.validation`) to translated text. The Spreadsheet component
 * installs a next-intl backed translator in the store on mount.
 */

import { z } from "zod";
import type {
  CellAddress,
  CellValidation,
  ValidationResult,
  ValidationTranslator,
} from "../types";
import { addressKey } from "./cell-address";

/** Used only until a real translator is installed: returns the message key. */
export const keyOnlyTranslator: ValidationTranslator = (key) => key;

const isBlank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === "" ||
  (typeof value === "string" && value.trim() === "");

/**
 * Validate a cell value against its validation rules
 * @param value - Value to validate
 * @param validation - Validation rules
 * @param translate - Resolves message keys to text
 * @returns Validation result
 */
export function validateCellValue(
  value: unknown,
  validation: CellValidation | undefined,
  translate: ValidationTranslator = keyOnlyTranslator,
): ValidationResult {
  if (!validation) {
    return { valid: true };
  }

  switch (validation.type) {
    case "dropdown":
      return validateDropdown(value, validation, translate);
    case "multi-dropdown":
      return validateMultiDropdown(value, validation, translate);
    case "required":
      return validateRequired(value, validation, translate);
    case "range":
      return validateRange(value, validation, translate);
    case "date":
      return validateDate(value, validation, translate);
    case "regex":
      return validateRegex(value, validation, translate);
    default:
      return { valid: true };
  }
}

function validateDropdown(
  value: unknown,
  validation: CellValidation,
  translate: ValidationTranslator,
): ValidationResult {
  if (isBlank(value)) {
    return { valid: true }; // Empty is allowed unless combined with required
  }

  const options = validation.options ?? [];
  const stringValue = String(value);

  if (!options.includes(stringValue)) {
    return {
      valid: false,
      error:
        validation.message ||
        translate("oneOf", { options: options.join(", ") }),
    };
  }

  return { valid: true };
}

function validateMultiDropdown(
  value: unknown,
  validation: CellValidation,
  translate: ValidationTranslator,
): ValidationResult {
  if (isBlank(value)) {
    return { valid: true };
  }

  const options = validation.options ?? [];
  const values = String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const invalid = values.filter((v) => !options.includes(v));
  if (invalid.length > 0) {
    return {
      valid: false,
      error:
        validation.message ||
        translate("invalidValues", {
          values: invalid.join(", "),
          options: options.join(", "),
        }),
    };
  }

  return { valid: true };
}

function validateRequired(
  value: unknown,
  validation: CellValidation,
  translate: ValidationTranslator,
): ValidationResult {
  if (isBlank(value)) {
    return {
      valid: false,
      error: validation.message || translate("required"),
    };
  }
  return { valid: true };
}

function validateRange(
  value: unknown,
  validation: CellValidation,
  translate: ValidationTranslator,
): ValidationResult {
  if (isBlank(value)) {
    return { valid: true }; // Empty is allowed unless combined with required
  }

  const num = typeof value === "number" ? value : Number(value);

  if (Number.isNaN(num)) {
    return {
      valid: false,
      error: validation.message || translate("notNumber"),
    };
  }

  const { min, max } = validation;

  if (min !== undefined && num < min) {
    return {
      valid: false,
      error: validation.message || translate("min", { min }),
    };
  }

  if (max !== undefined && num > max) {
    return {
      valid: false,
      error: validation.message || translate("max", { max }),
    };
  }

  return { valid: true };
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

function validateDate(
  value: unknown,
  validation: CellValidation,
  translate: ValidationTranslator,
): ValidationResult {
  if (isBlank(value)) {
    return { valid: true }; // Empty is allowed unless combined with required
  }

  let date: Date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  } else {
    return {
      valid: false,
      error: validation.message || translate("invalidDate"),
    };
  }

  if (Number.isNaN(date.getTime())) {
    return {
      valid: false,
      error: validation.message || translate("invalidDate"),
    };
  }

  const { minDate, maxDate } = validation;

  if (minDate && date < minDate) {
    return {
      valid: false,
      error: validation.message || translate("minDate", { date: isoDate(minDate) }),
    };
  }

  if (maxDate && date > maxDate) {
    return {
      valid: false,
      error: validation.message || translate("maxDate", { date: isoDate(maxDate) }),
    };
  }

  return { valid: true };
}

function validateRegex(
  value: unknown,
  validation: CellValidation,
  translate: ValidationTranslator,
): ValidationResult {
  if (isBlank(value)) {
    return { valid: true }; // Empty is allowed unless combined with required
  }

  const pattern = validation.pattern;
  if (!pattern) {
    return { valid: true };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    // Invalid regex pattern (a developer error): treat as valid to avoid blocking the user
    return { valid: true };
  }

  if (!regex.test(String(value))) {
    return {
      valid: false,
      error: validation.message || translate("pattern"),
    };
  }

  return { valid: true };
}

/**
 * Create a Zod schema from CellValidation
 * @param validation - Cell validation rules
 * @param translate - Resolves message keys to text
 * @returns Zod schema
 */
export function createZodSchema(
  validation: CellValidation,
  translate: ValidationTranslator = keyOnlyTranslator,
): z.ZodType {
  switch (validation.type) {
    case "dropdown": {
      const [first, ...rest] = validation.options ?? [];
      if (first !== undefined) {
        return z.enum([first, ...rest]);
      }
      return z.string();
    }

    case "required":
      return z.string().min(1, validation.message || translate("required"));

    case "range": {
      let schema = z.number();
      if (validation.min !== undefined) {
        schema = schema.min(
          validation.min,
          validation.message || translate("min", { min: validation.min }),
        );
      }
      if (validation.max !== undefined) {
        schema = schema.max(
          validation.max,
          validation.message || translate("max", { max: validation.max }),
        );
      }
      return schema;
    }

    case "date":
      return z.date();

    case "regex":
      if (validation.pattern) {
        return z
          .string()
          .regex(
            new RegExp(validation.pattern),
            validation.message || translate("pattern"),
          );
      }
      return z.string();

    default:
      return z.unknown();
  }
}

/**
 * Validation Manager class for managing cell validations
 */
export class ValidationManager {
  private validations: Map<string, CellValidation> = new Map();
  private errors: Map<string, string> = new Map();

  constructor(private translate: ValidationTranslator = keyOnlyTranslator) {}

  /** Set validation for a cell */
  setValidation(address: CellAddress, validation: CellValidation): void {
    this.validations.set(addressKey(address), validation);
  }

  /** Clear validation for a cell */
  clearValidation(address: CellAddress): void {
    const key = addressKey(address);
    this.validations.delete(key);
    this.errors.delete(key);
  }

  /** Get validation for a cell */
  getValidation(address: CellAddress): CellValidation | undefined {
    return this.validations.get(addressKey(address));
  }

  /** Validate a cell value */
  validateCell(address: CellAddress, value: unknown): ValidationResult {
    const validation = this.getValidation(address);
    const result = validateCellValue(value, validation, this.translate);
    const key = addressKey(address);

    if (result.valid) {
      this.errors.delete(key);
    } else if (result.error) {
      this.errors.set(key, result.error);
    }

    return result;
  }

  /** Get all validation errors */
  getValidationErrors(): Map<string, string> {
    return new Map(this.errors);
  }

  /** Check if a cell has an error */
  hasError(address: CellAddress): boolean {
    return this.errors.has(addressKey(address));
  }

  /** Get error for a cell */
  getError(address: CellAddress): string | undefined {
    return this.errors.get(addressKey(address));
  }

  /** Clear all validations and errors */
  clear(): void {
    this.validations.clear();
    this.errors.clear();
  }
}
