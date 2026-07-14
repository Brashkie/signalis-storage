/**
 * Error types for `@brashkie/signalis-storage`.
 *
 * These are intentionally self-contained (they do NOT import from
 * `@brashkie/signalis`) so that this package has zero dependency on the
 * crypto core — keeping the dependency graph acyclic.
 *
 * @module errors
 */

/**
 * Base class for all storage errors. Carries an optional structured
 * `context` bag for debugging.
 */
export class StorageError extends Error {
  public readonly context?: Readonly<Record<string, unknown>>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'StorageError';
    this.context = context;
    // Restore prototype chain (TS + extending built-ins)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a value fails validation (bad rootDir, negative id, etc.).
 */
export class StorageValidationError extends StorageError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'StorageValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when serialization/deserialization of a stored object fails
 * (malformed JSON on disk, wrong shape, etc.).
 */
export class SerializationError extends StorageError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'SerializationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
