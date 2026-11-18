
import { describe, it, expect } from "vitest";

import {
    normalizeSubmission,
    validateSubmission,
    type ContactSubmission
} from "../functions/lib/contact-validation";

function createValidSubmission(
    overrides: Partial<ContactSubmission> = {}
): ContactSubmission {
    return {
        name: "Camden",
        email: "camden@example.com",
        subject: "Employment opportunity",
        message: "Hello from the contact form.",
        ...overrides
    };
}

// ============================================================
// NORMALIZATION
// ============================================================

describe("normalizeSubmission", () => {

    it("trims surrounding whitespace from every field", () => {
        const input = createValidSubmission({
            name: "  Camden  ",
            email: "  camden@example.com  ",
            subject: "  Employment opportunity  ",
            message: "  Hello from the contact form.  "
        });

        const result = normalizeSubmission(input);

        expect(result).toEqual(createValidSubmission());
    });

    it("preserves internal message line breaks", () => {
        const input = createValidSubmission({
            message: "  First line\nSecond line\nThird line  "
        });

        const result = normalizeSubmission(input);

        expect(result.message).toBe(
            "First line\nSecond line\nThird line"
        );
    });

    it("preserves internal spaces in names", () => {
        const input = createValidSubmission({
            name: "  Camden Roberts-Hurd  "
        });

        const result = normalizeSubmission(input);

        expect(result.name).toBe("Camden Roberts-Hurd");
    });

    it("returns a new object without mutating the input", () => {
        const input = createValidSubmission({
            name: "  Camden  ",
            email: "  camden@example.com  "
        });

        const original = { ...input };
        const result = normalizeSubmission(input);

        expect(result).not.toBe(input);
        expect(input).toEqual(original);
        expect(result.name).toBe("Camden");
    });

});

// ============================================================
// STRUCTURAL VALIDATION
// ============================================================

describe("validateSubmission - structure", () => {

    it("accepts a valid submission", () => {
        expect(
            validateSubmission(createValidSubmission())
        ).toBe(true);
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["number", 42],
        ["boolean", true],
        ["string", "hello"],
        ["empty object", {}],
        ["array", []]
    ])("rejects %s input", (_label, value) => {
        expect(validateSubmission(value)).toBe(false);
    });

    it.each([
        "name",
        "email",
        "subject",
        "message"
    ] as const)("rejects a missing %s property", (field) => {
        const input: Record<string, unknown> = {
            ...createValidSubmission()
        };

        delete input[field];

        expect(validateSubmission(input)).toBe(false);
    });

    it.each([
        null,
        42,
        true,
        [],
        {},
        undefined
    ])("rejects non-string fields: %j", (value) => {
        for (const field of [
            "name", "email", "subject", "message"
        ] as const) {
            const input = {
                ...createValidSubmission(),
                [field]: value
            };

            expect(validateSubmission(input)).toBe(false);
        }
    });

});

// ============================================================
// TEXT FIELD VALIDATION
// ============================================================

describe("validateSubmission - text fields", () => {

    const cases: Array<{
        field: "name" | "subject" | "message";
        label: string;
        value: string;
        valid: boolean;
    }> = [
        { field: "name", label: "1 character", value: "A", valid: false },
        { field: "name", label: "2 characters", value: "AB", valid: true },
        { field: "name", label: "100 characters", value: "A".repeat(100), valid: true },
        { field: "name", label: "101 characters", value: "A".repeat(101), valid: false },
        { field: "name", label: "empty", value: "", valid: false },
        { field: "name", label: "whitespace", value: "   ", valid: false },

        { field: "subject", label: "2 characters", value: "AB", valid: false },
        { field: "subject", label: "3 characters", value: "ABC", valid: true },
        { field: "subject", label: "150 characters", value: "S".repeat(150), valid: true },
        { field: "subject", label: "151 characters", value: "S".repeat(151), valid: false },
        { field: "subject", label: "whitespace", value: "   ", valid: false },

        { field: "message", label: "9 characters", value: "M".repeat(9), valid: false },
        { field: "message", label: "10 characters", value: "M".repeat(10), valid: true },
        { field: "message", label: "4999 characters", value: "M".repeat(4999), valid: true },
        { field: "message", label: "5000 characters", value: "M".repeat(5000), valid: true },
        { field: "message", label: "5001 characters", value: "M".repeat(5001), valid: false },
        { field: "message", label: "whitespace", value: "          ", valid: false }
    ];

    it.each(cases)(
        "$field: $label => $valid",
        ({ field, value, valid }) => {
            const input = createValidSubmission({
                [field]: value
            });

            expect(validateSubmission(input)).toBe(valid);
        }
    );

    it("accepts surrounding whitespace around valid text", () => {
        const input = createValidSubmission({
            name: "  Camden  ",
            subject: "  Employment opportunity  ",
            message: "  Hello from the contact form.  "
        });

        expect(validateSubmission(input)).toBe(true);
    });

});

// ============================================================
// EMAIL VALIDATION
// ============================================================

describe("validateSubmission - email", () => {

    const validEmails = [
        "camden@example.com",
        "camden+jobs@example.com",
        "camden@sub.example.com",
        "camden@example.co.uk",
        "Camden@Example.COM",
        "  camden@example.com  ",
        "camden%@example.com",
        `${"a".repeat(64)}@example.com`,
        `camden@${"a".repeat(63)}.com`
    ];

    const invalidEmails = [
        "",
        " ",
        "camdenexample.com",
        "camden@@example.com",
        "@example.com",
        "camden@",
        "camden@example",
        "camden@.com",
        "camden@example.",
        "camden@example..com",
        "camden@-example.com",
        "camden@example-.com",
        "camden@exam!ple.com",
        "cam den@example.com",
        "camden\t@example.com",
        `${"a".repeat(65)}@example.com`,
        `camden@${"a".repeat(64)}.com`
    ];

    it.each(validEmails)(
        "accepts valid email: %s",
        (email) => {
            const input = createValidSubmission({ email });
            expect(validateSubmission(input)).toBe(true);
        }
    );

    it.each(invalidEmails)(
        "rejects invalid email: %s",
        (email) => {
            const input = createValidSubmission({ email });
            expect(validateSubmission(input)).toBe(false);
        }
    );

});
