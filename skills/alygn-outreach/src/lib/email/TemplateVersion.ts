/**
 * TemplateVersion — F-071
 * Semantic versioning for email templates.
 *
 * Format: major.minor.patch (semver)
 * - Same major version = compatible
 * - Comparison operations are synchronous
 * - Immutable value objects — bump methods return new instances
 */

export class TemplateVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;

  constructor(major: number, minor: number, patch: number) {
    if (!Number.isInteger(major) || major < 0) {
      throw new Error(`Invalid major version: ${major}`);
    }
    if (!Number.isInteger(minor) || minor < 0) {
      throw new Error(`Invalid minor version: ${minor}`);
    }
    if (!Number.isInteger(patch) || patch < 0) {
      throw new Error(`Invalid patch version: ${patch}`);
    }
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  /**
   * Parse a semver string like "1.2.3" into a TemplateVersion.
   * Throws on invalid format.
   */
  static parse(version: string): TemplateVersion {
    const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) {
      throw new Error(`Invalid version string: "${version}". Expected format: major.minor.patch (e.g. "1.2.3")`);
    }
    return new TemplateVersion(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
    );
  }

  /**
   * Safe parse that returns null instead of throwing.
   */
  static tryParse(version: string): TemplateVersion | null {
    try {
      return TemplateVersion.parse(version);
    } catch {
      return null;
    }
  }

  /**
   * The initial version: 0.1.0
   */
  static initial(): TemplateVersion {
    return new TemplateVersion(0, 1, 0);
  }

  /** Bump major version (breaking change). Resets minor and patch. */
  bumpMajor(): TemplateVersion {
    return new TemplateVersion(this.major + 1, 0, 0);
  }

  /** Bump minor version (new feature, backward compatible). Resets patch. */
  bumpMinor(): TemplateVersion {
    return new TemplateVersion(this.major, this.minor + 1, 0);
  }

  /** Bump patch version (bug fix). */
  bumpPatch(): TemplateVersion {
    return new TemplateVersion(this.major, this.minor, this.patch + 1);
  }

  /**
   * Two versions are compatible if they share the same major version.
   * Per semver: major version changes indicate breaking changes.
   */
  isCompatible(other: TemplateVersion): boolean {
    return this.major === other.major;
  }

  /**
   * True if this version is newer than the other.
   * Compares major → minor → patch.
   */
  isNewerThan(other: TemplateVersion): boolean {
    if (this.major !== other.major) return this.major > other.major;
    if (this.minor !== other.minor) return this.minor > other.minor;
    return this.patch > other.patch;
  }

  /**
   * True if this version is older than the other.
   */
  isOlderThan(other: TemplateVersion): boolean {
    return other.isNewerThan(this);
  }

  /**
   * True if this version equals the other.
   */
  equals(other: TemplateVersion): boolean {
    return this.major === other.major && this.minor === other.minor && this.patch === other.patch;
  }

  /**
   * String representation: "major.minor.patch"
   */
  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  /**
   * JSON-serializable representation.
   */
  toJSON(): string {
    return this.toString();
  }

  /**
   * ValueOf for JSON.parse reviver or direct reconstruction.
   */
  static fromJSON(json: string): TemplateVersion {
    return TemplateVersion.parse(json);
  }
}

export default TemplateVersion;